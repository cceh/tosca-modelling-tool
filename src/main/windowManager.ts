import {app, BrowserWindow, dialog, HandlerDetails, shell, WebContents} from 'electron';
import {mainWindowUrl} from './resources';
import process from 'process';
import path from 'path';
import {EventEmitter} from "events";

export type WindowOpenHandler = Parameters<WebContents['setWindowOpenHandler']>[0];

export type NavigationUrlType = "toscaManager" | "topologyModeler" | "mainWindow" | "external"

export const LAST_WINERY_WINDOW_CLOSED = "all-winery-windows-closed"

/**
 * Create and manage the lifecycle of app windows
 */
export class WindowManager extends EventEmitter {
    private _mainWindow: BrowserWindow = null
    private toscaManagerWindowSet = new Set<BrowserWindow>()
    private topologyModelerWindowSet = new Set<BrowserWindow>()

    constructor(private urlTypeChecker: (url: URL) => NavigationUrlType) {
        super()
    }

    get mainWindow() { return this._mainWindow }
    get toscaManagerWindows() { return Object.freeze(Array.from(this.toscaManagerWindowSet)) }
    get topologyModelerWindows() { return Object.freeze(Array.from(this.topologyModelerWindowSet)) }
    get wineryWindows() { return Object.freeze([...this.toscaManagerWindows, ...this.topologyModelerWindows]) }

    /**
     * Opens the main "workspace selection" window. Makes sure it is created as needed and that there is only one main
     * window created / visible at all times.
     */
    openMainWindow() {
        if (!this.mainWindow) {
            this._mainWindow = this.createMainWindow()
        }
    }

    /**
     * Opens a Winery window for the specified URL. Makes sure that the correct type of window is created
     * depending on the link. External (web) links will be opened externally in the user's web browser.
     *
     * @throws
     * Throws an error if the specified URL is the main window (renderer) URL.
     */
    async openWindowFor(url: URL) {
        let window

        switch (this.urlTypeChecker(url)) {
            case "toscaManager":
                window = this.createToscaManagerWindow()
                break;
            case "topologyModeler":
                window = this.createTopologyModelerWindow()
                break;
            case "mainWindow":
                throw new Error("Will open a new Window for the main window URL.")
            case "external":
                await shell.openExternal(url.toString())
        }

        if (window) {
            await window.loadURL(url.toString())
        }

        return window
    }


    closeAllWineryWindows() {
        this.wineryWindows.forEach(window => window.destroy())
    }

    /**
     * Creates and configures a browser window suitable for the TOSCA Manager
     */
    private createToscaManagerWindow(): BrowserWindow {
        const toscaManagerWindow = new BrowserWindow({
            webPreferences: {
                nodeIntegration: false,
                preload: path.join(
                    __dirname,
                    app.isPackaged ? 'preload.js' : '../../dist/app/preload.js',
                ),
            },
            width: 1000,
            height: 600,
            show: false,
        });
        this.toscaManagerWindowSet.add(toscaManagerWindow)

        if (!app.isPackaged) {
            toscaManagerWindow.webContents.openDevTools();
        }

        toscaManagerWindow
            .once('ready-to-show', () => toscaManagerWindow.show())
            .once('closed',  (event: Electron.Event) => this.onWineryWindowClosed(event, toscaManagerWindow))

        toscaManagerWindow.webContents.setWindowOpenHandler(
            (details) => this.wineryWindowOpenHandler(details)
        );

        return toscaManagerWindow;
    }

    /**
     * Creates and configures a browser window suitable for the Topology Manager.
     */
    private createTopologyModelerWindow(): BrowserWindow {
        const topologyModelerWindow = new BrowserWindow({
            webPreferences: {nodeIntegration: false},
            width: 1200,
            height: 1200,
            show: false,
        });
        this.topologyModelerWindowSet.add(topologyModelerWindow)

        topologyModelerWindow
            .once('ready-to-show', () => topologyModelerWindow.show())
            .once('closed',  (event: Electron.Event) => this.onWineryWindowClosed(event, topologyModelerWindow))

        topologyModelerWindow.webContents.setWindowOpenHandler(this.wineryWindowOpenHandler);

        return topologyModelerWindow;
    }

    /**
     * Creates and configures the singleton main window instance and loads the URL for the renderer process.
     */
    private createMainWindow(): BrowserWindow {
        this._mainWindow = new BrowserWindow({
            center: true,
            width: 1024,
            height: 1000,
            show: false,
            maximizable: false,
            fullscreenable: false,
            frame: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        });

        this._mainWindow.loadURL(mainWindowUrl).catch((err) => {
            dialog.showErrorBox(
                'Error',
                `Could not load main UI at ${mainWindowUrl}: ${err.message}`,
            );
            process.exit(-1);
        });

        if (!app.isPackaged) {
            this._mainWindow.webContents.openDevTools();
        }

        this._mainWindow
            .on('ready-to-show', () => this._mainWindow.show())
            .on('closed', (): void => this._mainWindow = null)

        return this._mainWindow;
    }

    /**
     * Handler function that is passed to the `setWindowOpenHandler` method of the webContents of
     * Winery windows (TOSCA Manager and Topology Modeler). This is called when the user clicks a link
     * that opens a new window. For app-internal, local links, makes sure that the correct type of window is created
     * depending on the link. External (web) links will be opened externally in the user's web browser.
     */
    private wineryWindowOpenHandler(details: HandlerDetails): ReturnType<WindowOpenHandler> {
        const parsedUrl = new URL(details.url)
        const urlType = this.urlTypeChecker(parsedUrl)

        this.openWindowFor(parsedUrl).catch()

        switch (urlType) {
            case "mainWindow":
            case "external":
                return {action: "deny"}
        }

        return {action: "allow"}
    }

    /**
     * Function that is passed as the handler for the close event for Winery windows. Emits an event when all Winery
     * windows have been closed and removes the window from the respective Set.
     */
    private onWineryWindowClosed(event: Electron.Event, window: BrowserWindow) {
        if (!this._mainWindow && this.wineryWindows.length === 1) {
            // this is the last open Winery windows and about to be closed
            event.preventDefault()
            this.emit(LAST_WINERY_WINDOW_CLOSED, event)
        }

        this.toscaManagerWindowSet.delete(window)
        this.topologyModelerWindowSet.delete(window)
    }
}