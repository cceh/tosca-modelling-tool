import sinon, {match, SinonStub, stub} from "sinon";
import fs from 'fs';
import * as os from 'os';
import portfinder from "portfinder";
import path from "path";
import child_process, {ChildProcess} from "child_process";
import {Duplex, PassThrough, Writable} from "stream";
import {expect} from "chai";
import {WineryManager} from "../../src/main/wineryManager";
import {LogEntry} from "winston";
import * as fse from "fs-extra";
import {createTestLogger, PORT, wineryApiUrlMatcher} from "./utils";

class MockChildProcess extends ChildProcess {
    constructor(
        public pid: number,
        public stdout: Duplex,
        public stderr: Duplex,
        public exitCode: number | null,
    ) {
        super();
    }
}


describe('Winery Manager Unit Tests', () => {
    let fetchStub: SinonStub;
    let writeFileStub: SinonStub;

    let fakeProcess: MockChildProcess;

    const tmpdirPrefix = path.join(os.tmpdir(), "test-wineryManager-data-")
    let dataPath: string

    beforeEach(() => {
        fakeProcess = new MockChildProcess(12345, new PassThrough(), new PassThrough(), null)

        stub(child_process, 'spawn').returns(fakeProcess);
        stub(portfinder, 'getPortPromise').resolves(PORT);
        writeFileStub = stub(fs, 'writeFileSync');

        fetchStub = stub(global, 'fetch');
        fetchStub
            .withArgs(wineryApiUrlMatcher)
            .resolves(new Response(null, {status: 200, statusText: 'OK'}))


        dataPath = fs.mkdtempSync(tmpdirPrefix)
    });

    afterEach(() => {
        fse.remove(dataPath);
        sinon.restore();
    });

    describe("#start()", () => {
        it('should write the .winery config file, creating the config directory if it does not exist', async () => {
            const backend = new WineryManager(dataPath)
            const wineryConfigPath = path.join(dataPath, ".winery")

            sinon.stub(fs, 'existsSync').returns(false);
            const mkdirSyncStub = sinon.stub(fs, 'mkdirSync');

            await backend.start("/path/to/repo");

            expect(mkdirSyncStub.calledOnceWith(wineryConfigPath)).to.be.true
            expect(writeFileStub.calledOnceWith(path.join(wineryConfigPath, "winery.yml"))).to.be.true
        });

        it('should redirect process process output correctly to the logger', async () => {

            // Create a test logger with a dummy transport to pass to the wineryManager
            const {testTransport, testLogger} = createTestLogger();

            // Returns a Promise that resolves when an entry is received by the logger and checks if the received entry has
            // the expected level and message
            const testOutputRedirect = async (processStream: Writable, expectedLevel: string, message: string) => {
                const entryReceived = new Promise<void>((resolve, reject) => {
                    const entryListener = (entry: LogEntry) => {
                        // Assert that the received entry has the expected level and message
                        expect(entry.level).to.equal(expectedLevel)
                        expect(entry.message).to.equal(message)
                        resolve()
                    }
                    testTransport.once('logged', entryListener)

                    // Timeout to prevent the test from running indefinitely
                    setTimeout(() => {
                        reject(new Error("log entry not received within timeout"));
                    }, 2000);
                })

                setTimeout(() => processStream.emit('data', message + "\n"))
                await entryReceived
            }

            const backend = new WineryManager(dataPath, null, testLogger)
            await backend.start("/path/to/repo");

            // Test if the stdout output is correctly logged as "info" level
            await testOutputRedirect(fakeProcess.stdout, "info", "Test stdout line")
            // Test if the stderr output is correctly logged as "error" level
            await testOutputRedirect(fakeProcess.stderr, "error", "Test stderr line")
        });

        it('should wait until the wineryManager is ready and then resolve', async () => {
            fetchStub
                .onFirstCall().rejects(new Error("Not ready"))
                .onSecondCall().resolves(new Response(null, {status: 200, statusText: 'OK'}));

            const backend = new WineryManager(dataPath);
            await backend.start("/path/to/repo");
            expect(backend.isRunning).to.be.true;
        })

        it('should reject when the process cannot be started', async () => {
            fetchStub
                .withArgs(wineryApiUrlMatcher)
                .rejects(new Error("Not ready"));
            const backend = new WineryManager(dataPath);
            setTimeout(() => fakeProcess.emit('error', new Error("Fake error starting process")), 100);

            try {
                await backend.start("/path/to/repo")
                expect.fail("start() Promise did not reject")
            } catch (_) { /* empty */ }

            expect(backend.isRunning).to.be.false;
        });

        it('should reject when the wineryManager process exits unexpectedly while waiting', async () => {
            fetchStub
                .withArgs(wineryApiUrlMatcher)
                .rejects(new Error("Not ready"));

            // resources.launcherPath = "sfd"

            const backend = new WineryManager(dataPath);
            setTimeout(() => fakeProcess.emit('exit', 1, 'SIGTERM'), 100);
            try {
                await backend.start("/path/to/repo")
                expect.fail()
            } catch (_) { /* empty */ }

            expect(backend.isRunning).to.be.false;

        });
    })

    describe("#stop()", () => {
        let backend: WineryManager

        beforeEach(() => {
            backend = new WineryManager(dataPath)
        })

        it('should stop the wineryManager process if running', async () => {
            // Start the wineryManager and make sure it is running
            await backend.start("/path/to/repo");
            expect(backend.isRunning).to.be.true;

            const shutdownUrl = new URL("/shutdown?token=winery", backend.baseUrl).toString()
            const shutdownUrlMatcher = match((url: URL) => url.toString() === shutdownUrl)

            fetchStub.withArgs(shutdownUrlMatcher, {method: "POST"})
                .resolves(new Response(null, {status: 200, statusText: 'OK'}))

            const stoppedPromise = backend.stop();

            // expect a POST request to the shutdown endpoint
            expect(fetchStub.calledWith(
                shutdownUrlMatcher,
                {method: "POST"})
            ).to.be.true

            // simulate wineryManager process exit
            setTimeout(() => fakeProcess.emit('exit', 1, 'SIGTERM'), 100);

            // wait for the stoppedPromise to resolve
            await stoppedPromise
            expect(backend.isRunning).to.be.false;
        });

        it('should not throw an error when stopping a non-running wineryManager', async () => {
            const backend = new WineryManager(dataPath);

            // Ensure the wineryManager is not running
            expect(backend.isRunning).to.be.false;

            // Try stopping the non-running wineryManager
            try {
                await backend.stop();
            } catch (error) {
                expect.fail("Stopping a non-running wineryManager should not throw an error");
            }
        });

        it('should reject if the wineryManager does not stop during the timeout', async () => {
            // Start the wineryManager and make sure it is running
            await backend.start("/path/to/repo");
            expect(backend.isRunning).to.be.true;

            try {
                // Call stop() and wait with a 1s timeout
                await backend.stop(1000)
                expect.fail("stop promise did not reject after timeout")
            } catch (e) {
                expect(backend.isRunning).to.be.true;
            }
        });
    });

    it('should emit an unexpected-exit event when the wineryManager process exits unexpectedly', async () => {
        const {testTransport, testLogger} = createTestLogger();
        const backend = new WineryManager(dataPath, null, testLogger);
        const fakeErrorWineryLogLine = "ERROR: Catastrophe uncorked. Winery in chaos, must exit."

        const unexpectedExitEventReceived = new Promise<void>((resolve) => {
            backend.once('unexpected-exit', (error: Error) => {
                // the error should contain the last log line of the winery process
                expect(error.message).to.contain(fakeErrorWineryLogLine)
                resolve();
            });
        });


        await backend.start("/path/to/repo");

        // After starting the process, simulate a process exit. The last log line of the exited process
        // should appear in the argument to the emitted unexpected-error event.
        const errLogReceived = new Promise(resolve =>
            testTransport.once('logged', resolve)
        )

        // fake a error log line
        fakeProcess.stderr.emit('data', fakeErrorWineryLogLine + "\n")
        await errLogReceived

        // fake a SIGTERM
        fakeProcess.emit('exit', 1, 'SIGTERM');

        await unexpectedExitEventReceived;
        expect(backend.isRunning).to.be.false;
    });

});