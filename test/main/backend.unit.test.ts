import sinon, {match, SinonStub, stub} from "sinon";
import fs from 'fs';
import * as os from 'os';
import portfinder from "portfinder";
import path from "path";
import child_process, {ChildProcess} from "child_process";
import {Duplex, PassThrough, Writable} from "stream";
import {expect} from "chai";
import {Backend} from "../../src/main/backend";
import * as resources from "../../src/main/resources"
import {createLogger, LogEntry, transports} from "winston";
import * as fsextra from "fs-extra";
import {PathProvider} from "../../src/main/resources";

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


// Helper function: create da test dummy logger to listen for "logged" events
const createTestLogger = () => {
    const testTransport = new transports.Stream({stream: new PassThrough()})
    const testLogger = createLogger({
        transports: [testTransport]
    })
    return {testTransport, testLogger};
};

describe('Backend Unit Tests', () => {
    let spawnStub: SinonStub;
    let getPortPromiseStub: SinonStub;
    let fetchStub: SinonStub;
    let writeFileStub: SinonStub;
    let backend: Backend;

    let fakeProcess: MockChildProcess;

    const tmpdirPrefix = path.join(os.tmpdir(), "test-backend-data-")
    let dataPath: string

    beforeEach(() => {
        fakeProcess = new MockChildProcess(12345, new PassThrough(), new PassThrough(), null)

        spawnStub = stub(child_process, 'spawn').returns(fakeProcess);
        getPortPromiseStub = stub(portfinder, 'getPortPromise').resolves(8000);
        writeFileStub = stub(fs, 'writeFileSync');

        fetchStub = stub(global, 'fetch');
        fetchStub
            .withArgs(match(/http:\/\/localhost:8000\/winery/))
            .resolves(new Response(null, {status: 200, statusText: 'OK'}))

        dataPath = fs.mkdtempSync(tmpdirPrefix)
    });

    afterEach(() => {
        fsextra.remove(dataPath);
        sinon.restore();
    });

    describe("#start()", () => {
        it('should write the .winery config file, creating the config directory if it does not exist', async () => {
            backend = new Backend(dataPath)

            const wineryConfigPath = path.join(dataPath, ".winery")

            sinon.stub(fs, 'existsSync').returns(false);
            const mkdirSyncStub = sinon.stub(fs, 'mkdirSync');

            await backend.start("/path/to/repo");

            expect(mkdirSyncStub.calledOnceWith(wineryConfigPath)).to.be.true
            expect(writeFileStub.calledOnceWith(path.join(wineryConfigPath, "winery.yml"))).to.be.true
        });

        it('should redirect process process output correctly to the logger', async () => {

            // Create a test logger with a dummy transport to pass to the backend
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

            const backend = new Backend(dataPath, null, testLogger)
            await backend.start("/path/to/repo");

            // Test if the stdout output is correctly logged as "info" level
            await testOutputRedirect(fakeProcess.stdout, "info", "Test stdout line")
            // Test if the stderr output is correctly logged as "error" level
            await testOutputRedirect(fakeProcess.stderr, "error", "Test stderr line")
        });

        it('should wait until the backend is ready and then resolve', async () => {
            fetchStub
                .onFirstCall().rejects(new Error("Not ready"))
                .onSecondCall().resolves(new Response(null, {status: 200, statusText: 'OK'}));

            const backend = new Backend(dataPath);
            await backend.start("/path/to/repo");
            expect(backend.isRunning).to.be.true;
        })

        it('should reject when the process cannot be started', async () => {
            fetchStub
                .withArgs(match(/http:\/\/localhost:8000\/winery/))
                .rejects(new Error("Not ready"));
            const backend = new Backend(dataPath);
            setTimeout(() => fakeProcess.emit('error', new Error("Fake error starting process")), 100);

            try {
                await backend.start("/path/to/repo")
                expect.fail("start() Promise did not reject")
            } catch (_) {
            }

            expect(backend.isRunning).to.be.false;
        });

        it('should reject when the backend process exits unexpectedly while waiting', async () => {
            fetchStub
                .withArgs(match(/http:\/\/localhost:8000\/winery/))
                .rejects(new Error("Not ready"));

            // resources.launcherPath = "sfd"

            const backend = new Backend(dataPath);
            setTimeout(() => fakeProcess.emit('exit', 1, 'SIGTERM'), 100);
            try {
                await backend.start("/path/to/repo")
                expect.fail()
            } catch (_) {
            }

            expect(backend.isRunning).to.be.false;

        });
    })

    describe("#stop()", () => {
        let backend: Backend

        beforeEach(() => {
            backend = new Backend(dataPath)
        })

        it('should stop the backend process if running', async () => {
            // Start the backend and make sure it is running
            await backend.start("/path/to/repo");
            expect(backend.isRunning).to.be.true;

            const stoppedPromise = backend.stop();

            // expect a POST request to the shutdown endpoint
            expect(fetchStub.calledWith(`${backend.backendUrl}/shutdown?token=winery`, {method: "POST"}))
                .to.be.true

            // simulate backend process exit
            setTimeout(() => fakeProcess.emit('exit', 1, 'SIGTERM'), 100);

            // wait for the stoppedPromise to resolve
            await stoppedPromise
            expect(backend.isRunning).to.be.false;
        });

        it('should not throw an error when stopping a non-running backend', async () => {
            const backend = new Backend(dataPath);

            // Ensure the backend is not running
            expect(backend.isRunning).to.be.false;

            // Try stopping the non-running backend
            try {
                await backend.stop();
            } catch (error) {
                expect.fail("Stopping a non-running backend should not throw an error");
            }
        });

        it('should reject if the backend does not stop during the timeout', async () => {
            // Start the backend and make sure it is running
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

    it('should emit an unexpected-exit event when the backend process exits unexpectedly', async () => {
        const {testTransport, testLogger} = createTestLogger();
        const backend = new Backend(dataPath, null, testLogger);
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