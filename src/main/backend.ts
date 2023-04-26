import {ChildProcess, spawn} from "child_process";
import {getPortPromise} from "portfinder";
import {EventEmitter} from "events";
import {dump as dumpYaml, load as loadYaml} from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import winston, {createLogger, format, transports} from "winston"


import {WineryConfig} from "./winery-repository-configuration";
import * as readline from "readline";
import {pathProvider as defaultPathProvider, PathProvider} from "./resources";

class BackendState {
    readonly process: ChildProcess;
    readonly port: number;
    readonly repositoryPath: string;

    // Allows to differentiate between an intentional shutdown of the backend server and an unexpected exit
    shouldBeRunning: boolean = true;

    constructor(process: ChildProcess, port: number, repositoryPath: string) {
        this.process = process;
        this.port = port;
        this.repositoryPath = repositoryPath;
    }
}

/**
 * Manages the Winery process.
 */
export class Backend extends EventEmitter {
    state: BackendState | null = null

    // the path where winery.yml is read from is hardcoded as {user.home}/.winery in
    // org.eclipse.winery.common/src/main/java/org/eclipse/winery/common/configuration/Environment.java
    readonly wineryConfigPath = path.join(this.dataPath, ".winery")
    readonly wineryConfigFilePath = path.join(this.wineryConfigPath, "winery.yml")

    constructor(
        readonly dataPath: string,
        private logger?: winston.Logger,
        private wineryLogger?: winston.Logger,
        private pathProvider?: PathProvider
        ) {
        super()

        this.logger = logger || createLogger({
            level: 'info',
            transports: [
                new transports.File({filename: path.join(this.dataPath, "backend.log")}),
                new transports.Console({
                    format: format.simple()
                })
            ]
        })

        this.wineryLogger = wineryLogger || createLogger({
                level: 'info',
                transports: [
                    new transports.File({filename: path.join(this.dataPath, "winery.log")})
                ]
        })

        this.pathProvider = pathProvider || defaultPathProvider
    }

    private stderrLastLine: string = null

    get isRunning() {
        return !!this.state && this.state.process.pid != null && this.state.process.exitCode === null
    }
    get port() { return this.state.port }
    get backendUrl() {
        if (!this.isRunning) {
            throw new Error("Backend not running while accessing backend URL!")
        }

        return this.getBackendBaseUrl(this.port)
    }

    getBackendBaseUrl(port: number) { return `http://localhost:${port}`}
    getWineryUrl(port: number) { return `${this.getBackendBaseUrl(port)}/winery`}

    /**
     * Starts the winery process with the specified repository path.
     * @param repositoryPath - The path to the Winery repository. Can be an empty path which the Winery then
     *   will initialize.
     * @returns A Promise that resolves when the Winery process has started successfully and rejects on startup errors.
     */
    async start(repositoryPath: string) {

        if (this.isRunning) {
            throw new Error("Backend already running!")
        }

        const port = await getPortPromise({startPort: 8000})
        this.prepareConfigFile(port, repositoryPath)

        this.logger.info("Starting the Winery...")
        
        // discoverGitSystemConfig             - Exception caught during execution of command '[git, --version]' in '/usr/bin', return code '1', error message 'xcode-select: note: no developer tools were found at '/Applications/Xcode.app', requesting install. Choose an option in the dialog to download the command line developer tools."}
        // https://stackoverflow.com/questions/33804097/prevent-jgit-from-reading-the-native-git-config
        // https://www.npmjs.com/package/which
        const process = spawn(this.pathProvider.getJavaCmdPath(), [
            `-Duser.home=${this.dataPath}`,
            `-Dorg.eclipse.jetty.LEVEL=INFO`,
            `-Dwinerylauncher.port=${port}`,
            `-Dlogback.configurationFile=${this.pathProvider.getLogbackConfigurationPathDefault}`,
            "-jar",
            "-XX:TieredStopAtLevel=1",
            "-noverify",
            this.pathProvider.getLauncherPath()]
            , {
            stdio: "pipe"
        })

        this.configureWineryProcessLogging(process)

        // Handle Winery startup errors and expected or unexpected process exit
        process.once("exit", (code, signal) => {
            this.logger.error(`Winery exited with ${signal} (${code}).`)
            this.handleBackendExit(this.stderrLastLine && new Error(this.stderrLastLine))
        })

        return new Promise<void>((resolve, reject) => {
            process.on("error", error => {
                this.logger.error(`Starting the Winery failed: ${error}`)
                reject(error)
            })
            this.waitForBackendReady(port, process)
                .then(() => {
                    // Winery started successfully
                    this.state = new BackendState(process, port, repositoryPath)
                    resolve()
                })
                .catch(reject)
        })
    }

    /**
     * Stops the Winery process if it is running.
     *
     * Sends a shutdown POST request to the winery, then repeatedly polls the winery until it does not respond anymore
     * to determine that the process has stopped.
     *
     * @returns A Promise that resolves when the Winery process has successfully stopped.
    */
    async stop(timeoutMs: number = 180000) {
        if (!this.isRunning) {
            this.logger.error("Winery not running!")
            return this.waitForBackendStopped(timeoutMs)
        }

        this.logger.info("Stopping the Winery...")
        this.state.shouldBeRunning = false
        const res = this.waitForBackendStopped(timeoutMs)
        fetch(`${this.backendUrl}/shutdown?token=winery`, {method: "POST"})
        return res
    }

   private prepareConfigFile(port: number, repositoryPath: string) {
       this.logger.info("Creating default winery.yml config file.")
       fs.mkdirSync(this.wineryConfigPath, {recursive: true})

       const yamlConfig = loadYaml(fs.readFileSync(this.pathProvider.getWineryYamlConfigTemplatePath(), "utf-8")) as WineryConfig
       yamlConfig.repository.repositoryRoot = repositoryPath
       yamlConfig.ui.endpoints.topologymodeler = `${this.getBackendBaseUrl(port)}/winery-topologymodeler`
       yamlConfig.ui.endpoints.repositoryApiUrl = this.getWineryUrl(port)
       yamlConfig.ui.endpoints.repositoryUiUrl = this.getBackendBaseUrl(port)

       fs.writeFileSync(this.wineryConfigFilePath, dumpYaml(yamlConfig))
    }

    private handleBackendExit(error?: Error) {
        if (this.state?.shouldBeRunning) {
            this.emit("unexpected-exit", error)
        }

        this.state = null
    }

    /**
     * Configures the winery process logging and attaches listeners for stdout and stderr,
     * redirecting any output to the winery log file.
     * @param process - The child process for the winery backend.
     */
    private configureWineryProcessLogging(process: ChildProcess) {
        const readlineStdout = readline.createInterface({
            input: process.stdout,
            historySize: 0,
        });

        const readlineStderr = readline.createInterface({
            input: process.stderr,
            historySize: 0,
        });

        this.stderrLastLine = null;
        readlineStdout.on("line", (line) => this.wineryLogger.info(line));
        readlineStderr.on("line", (line) => {
            this.stderrLastLine = line;
            this.wineryLogger.error(line);
        });
    }

    /**
     * Waits for the Winery process to be ready and initialized by periodically sending an HTTP request.
     * @param port - The port on which the Winery process should be running.
     * @param process - The Winery ChildProcess instance
     * @returns A Promise that resolves when the Winery process is ready. Rejects the promise if the process exits unexpectedly.
     */
    private waitForBackendReady(port: number, process: ChildProcess) {
        return new Promise<void>(((resolve, reject) => {
            let exitedWhileWaitingToStart = false

            // register a temporary exit listener on the process to a potential catch unexpected exit
            // during Winery startup (will be de-registered when the process becomes ready to accept connections)
            const exitListener = (code: number, signal: NodeJS.Signals) => {
                reject(new Error(`Winery exited while waiting for it to start with ${signal} (${code}).`))
                process.removeListener("exit", exitListener)
                exitedWhileWaitingToStart = true
            }
            process.once("exit", exitListener)

            // Periodically check whether the Winery process is accepting connections
            const checkBackendRunning = () => {
                if (process.exitCode !== null || exitedWhileWaitingToStart) {
                    return
                }

                const retry = () => {
                    this.logger.info(`Waiting for the Winery to start on port ${port}...`);
                    setTimeout(() => checkBackendRunning(), 200)
                }

                fetch(this.getWineryUrl(port))
                    .then(response => {
                        if (response.ok) {
                            this.logger.info(`Winery started on port ${port}!`);
                            process.removeListener("exit", exitListener)
                            resolve()
                        } else {
                            retry()
                        }
                    })
                    .catch(retry)
            }

            checkBackendRunning()
        }))
    }

    private async waitForBackendStopped(timeoutMs: number): Promise<void> {
        const intervalMs = 200
        let waitedMs = 0

        this.logger.info(`Waiting for the Winery to stop...`);
        while (this.isRunning) {
            if (waitedMs === timeoutMs) {
                throw new Error("Winery process did not exit before timeout")
            }
            await new Promise(resolve => setTimeout(resolve, intervalMs));
            waitedMs += intervalMs
        }
    }
}