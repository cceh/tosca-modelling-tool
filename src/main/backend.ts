import {ChildProcess, spawn} from "child_process";
import {javaCmdPath, launcherPath, logbackConfigurationPathDefault, wineryYamlConfigTemplatePath} from "./resources";
import {getPortPromise} from "portfinder";
import {EventEmitter} from "events";
import {app} from "electron";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import * as stream from "stream";
import fetch from "node-fetch"
import {createLogger, format, transports} from "winston"

import {WineryConfig} from "./winery-repository-configuration";

class Backend {
    private process: ChildProcess | null = null
    private _port: number | null = null
    private _ready: boolean = false
    private _repositoryPath: string | null = null
    private shouldBeRunning = false

    readonly dataPath = app.getPath("userData")
    readonly wineryConfigPath = path.join(this.dataPath, ".winery")
    readonly wineryConfigFilePath = path.join(this.wineryConfigPath, "winery.yml")

    private logger = createLogger({
        level: 'info',
        transports: [
            new transports.File({filename: path.join(this.dataPath, "backend.log")}),
            new transports.Console({
                format: format.simple()
            })
        ]
    })
    private wineryLogger = createLogger({
        level: 'info',
        transports: [
            new transports.File({filename: path.join(this.dataPath, "winery.log")})

        ]
    })

    get running() { return this.process && this.process.exitCode !== null }
    get ready() { return this._ready }
    get port() { return this._port }
    get repositoryPath() { return this._repositoryPath }
    get backendUrl() {
        if (!this.running) {
            throw new Error("Backend not running  accessing backend URL!")
        }

        return this.getBackendBaseUrl(this.port)
    }

    getBackendBaseUrl(port: number) { return `http://localhost:${port}`}
    getWineryUrl(port: number) { return `${this.getBackendBaseUrl(port)}/winery`}

    readonly backendEvents = new EventEmitter()

    async start(repositoryPath: string) {
        this._repositoryPath = repositoryPath

        if (!fs.existsSync(this._repositoryPath)) {
            fs.mkdirSync(this._repositoryPath, {recursive: true})
        }

        if (this.running) {
            throw new Error("Backend already running!")
        }

        const port = await getPortPromise({startPort: 8000})
        this.prepareConfigFile(port)

        this.process = spawn(javaCmdPath, [
            `-Duser.home=${this.dataPath}`,
            `-Dorg.eclipse.jetty.LEVEL=INFO`,
            `-Dwinerylauncher.port=${port}`,
            `-Dlogback.configurationFile=${logbackConfigurationPathDefault}`,
            "-jar",
            "-XX:TieredStopAtLevel=1",
            "-noverify",
            launcherPath]
            , {
            stdio: "pipe"
        })

        this.process.stdout.on("data", (chunk: Buffer) => this.wineryLogger.info(chunk.toString()))
        this.process.stderr.on("data", (chunk: Buffer) => this.wineryLogger.error(chunk.toString()))

        this.process.on("exit", (code, signal) => {
            this.logger.error(`Winery exited with ${signal} (${code}) `)
            this.handleBackendExit()
        })

        return new Promise((resolve, reject) => {
            this.shouldBeRunning = true

            this.process.on("error", error => {
                this.logger.error(`Starting the Winery failed: ${error}`)
                this.handleBackendExit(error)
            })
            this.waitForBackendReady(port).then(resolve).catch(reject)
        })
    }

    async stop() {
        if (!this.running || this.process?.pid == null) {
            this.logger.error("Winery not running!")
        }

        this.logger.info("Stopping the Winery...")
        this.shouldBeRunning = false
        this.process?.kill()
        return this.waitForBackendStopped()
    }

   private prepareConfigFile(port: number) {
        if (!fs.existsSync(this.wineryConfigFilePath)) {
            this.logger.info("Creating default winery.yml config file.")
            fs.mkdirSync(this.wineryConfigPath, {recursive: true})
            fs.copyFileSync(wineryYamlConfigTemplatePath, this.wineryConfigFilePath)
        }

        const yamlConfig = loadYaml(fs.readFileSync(this.wineryConfigFilePath, "utf-8")) as WineryConfig
       yamlConfig.repository.repositoryRoot = this.repositoryPath!
       yamlConfig.ui.endpoints.topologymodeler = `${this.getBackendBaseUrl(port)}/winery-topologymodeler`
       yamlConfig.ui.endpoints.repositoryApiUrl = this.getWineryUrl(port)
       yamlConfig.ui.endpoints.repositoryUiUrl = this.getBackendBaseUrl(port)

       fs.writeFileSync(this.wineryConfigFilePath, dumpYaml(yamlConfig))
    }

    private handleBackendExit(error?: Error) {
        this.process = null
        this._ready = false
        this._port = null
        this._repositoryPath = null
        if (this.shouldBeRunning) {
            this.backendEvents.emit("unexpected-exit", error)
            this.shouldBeRunning = false
        }
    }

    private waitForBackendReady(port: number) {
        return new Promise<void>(((resolve, reject) => {
            let exitedWhileWaitingToStart = false

            const exitListener = () => {
                exitedWhileWaitingToStart = true
                reject("Winery exited while waiting for it to start.")
                this.process?.removeListener("exit", exitListener)
            }
            this.process?.on("exit", exitListener)

            const tryStartBackend = () => {
                if (!this.process || this.process.exitCode === null || exitedWhileWaitingToStart) {
                    return
                }

                const retry = () => {
                    this.logger.info(`Waiting for the Winery to start on port ${port}...`);
                    setTimeout(() => tryStartBackend(), 200)
                }
                fetch(this.getWineryUrl(port))
                    .then(response => {
                        if (response.ok) {
                            this.logger.info(`Winery started on port ${port}!`);
                            this._port = port
                            this._ready = true
                            this.process?.removeListener("exit", exitListener)
                            resolve()
                        } else {
                            retry()
                        }
                    })
                    .catch(retry)
            }

            tryStartBackend()
        }))
    }

    private waitForBackendStopped() {
        return new Promise<void>(((resolve, reject) => {
            const tryStopBackend = () => {
                const retry = () => {
                    this.logger.info(`Waiting for the Winery to stop...`);
                    setTimeout(() => tryStopBackend(), 200)
                }
                const success = () => {
                    this.logger.info("Winery stopped!")
                    resolve()
                }
                fetch(this.getWineryUrl(this.port!))
                    .then(response => {
                        if (response.ok) {
                            retry()
                        } else {
                            success()
                        }
                    })
                    .catch(success)
            }

            tryStopBackend()
        }))
    }
}

export const backend = new Backend()
