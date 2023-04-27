/**
 * windows.ts – Create and manage the lifecycle of app windows
 * ------------------------------------------------------------
 *
 * @fileoverview Create and manage the lifecycle of app windows
 * @author Marcel Schaeben <m.schaeben@uni-koeln.de>
 *
 */


import {app, BrowserWindow, dialog, HandlerDetails, shell, WebContents} from 'electron';
import {mainWindowUrl} from './resources';
import process from 'process';
import path from 'path';
import {EventEmitter} from "events";

export type WindowOpenHandler = Parameters<WebContents['setWindowOpenHandler']>[0];

export const LAST_WINERY_WINDOW_CLOSED = "all-winery-windows-closed"

let mainWindow: BrowserWindow = null

export class WindowManager extends EventEmitter {
    private wineryWindows = new Set<BrowserWindow>()

    constructor(private navigationChecker: (url: URL) => boolean) {
        super()
    }

    get mainWindow() { return mainWindow }

    /**
     * Opens the main "workspace selection" window. Makes sure it is created as needed and that there is only one main
     * window created / visible at all times.
     */
    openMainWindow() {
        if (!mainWindow) {
            mainWindow = this.createMainWindow()
        }
    }

    /**
     * Opens a TOSCA Manager window for the specified URL.
     */
    openToscaManagerWindow(url: string) {
        if (this.isToscaManagerUrl(new URL(url))) {
            const toscaManagerWindow = this.createToscaManagerWindow()
        toscaManagerWindow.once("ready-to-show", () => mainWindow?.close())
        toscaManagerWindow.loadURL(url)
        } else {
            throw new Error(`Specified URL is not a TOSCA Manager URL: ${url}`)
        }
    }

    closeAllWineryWindows() {
        this.wineryWindows.forEach(window => window.destroy())
    }

    /**
     * Creates and configures a browser window suitable for the TOSCA Manager
     */
    private createToscaManagerWindow(): BrowserWindow {
        let toscaManagerWindow = new BrowserWindow({
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
        this.wineryWindows.add(toscaManagerWindow)

        if (!app.isPackaged) {
            toscaManagerWindow.webContents.openDevTools();
        }

        toscaManagerWindow
            .once('ready-to-show', () => toscaManagerWindow.show())
            .once('closed',  (event: Electron.Event) => this.onWineryWindowClosed(event, toscaManagerWindow))

        toscaManagerWindow.webContents.setWindowOpenHandler(this.wineryWindowOpenHandler);

        return toscaManagerWindow;
    }

    /**
     * Creates and configures a browser window suitable for the Topology Manager.
     */
    createTopologyManagerWindow(): BrowserWindow {
        const topologyManagerWindow = new BrowserWindow({
            webPreferences: {nodeIntegration: false},
            width: 1200,
            height: 1200,
            show: false,
        });
        this.wineryWindows.add(topologyManagerWindow)

        topologyManagerWindow
            .once('ready-to-show', () => topologyManagerWindow.show())
            .once('closed',  (event: Electron.Event) => this.onWineryWindowClosed(event, topologyManagerWindow))

        topologyManagerWindow.webContents.setWindowOpenHandler(this.wineryWindowOpenHandler);

        return topologyManagerWindow;
    }

    /**
     * Creates and configures the singleton main window instance and loads the URL for the renderer process.
     */
    private createMainWindow(): BrowserWindow {
        mainWindow = new BrowserWindow({
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

        mainWindow.loadURL(mainWindowUrl).catch((err) => {
            dialog.showErrorBox(
                'Error',
                `Could not load main UI at ${mainWindowUrl}: ${err.message}`,
            );
            process.exit(-1);
        });

        if (!app.isPackaged) {
            mainWindow.webContents.openDevTools();
        }

        mainWindow
            .on('ready-to-show', () => mainWindow.show())
            .on('closed', (): void => mainWindow = null)

        return mainWindow;
    }

    /**
     * Handler function that is passed to the `setWindowOpenHandler` method of the webContents of
     * Winery windows (TOSCA Manager and Topology Modeler). This is called when the user clicks a link
     * that opens a new window. For app-internal, local links, makes sure that the correct type of window is created
     * depending on the link. External (web) links will be opened externally in the user's web browser.
     */
    private wineryWindowOpenHandler(details: HandlerDetails): ReturnType<WindowOpenHandler> {
        const parsedUrl = new URL(details.url)
        const navigationAllowed = this.navigationChecker(parsedUrl)

        if (!navigationAllowed) {
            shell.openExternal(details.url)
            return {action: "deny"}
        }

        if (this.isTopologyManagerUrl(parsedUrl)) {
            const topologyModelerWindow = this.createTopologyManagerWindow()
            topologyModelerWindow.loadURL(details.url)
        } else if (this.isToscaManagerUrl(parsedUrl)) {
            const toscaManagerWindow = this.createToscaManagerWindow()
            toscaManagerWindow.loadURL(details.url)
        }
    }

    // TODO: make sure the host is the local backend
    private isToscaManagerUrl(parsedUrl: URL) {
        return parsedUrl.pathname === "/";
    }

    // TODO: make sure the host is the local backend
    private isTopologyManagerUrl(parsedUrl: URL) {
        return parsedUrl.pathname.startsWith(`/winery-topologymodeler`);
    }

    /**
     * Function that is passed as the handler for the close event for Winery windows. Emits an event when all Winery
     * windows have been closed.
     */
    private onWineryWindowClosed(event: Electron.Event, window: BrowserWindow) {
        if (!mainWindow && this.wineryWindows.size === 1) {
            // this is the last open Winery windows and about to be closed
            event.preventDefault()
            this.emit(LAST_WINERY_WINDOW_CLOSED, event)
        }
        this.wineryWindows.delete(window);
    }
}

export default WindowManager;