/**
 * index.ts – Entry point for the Electron main process for the TOSCA Modelling Tool
 * ---------------------------------------------------------------------------------
 *
 * Within the realms of Electron's land,
 * The main process takes a valiant stand,
 * Orchestrating windows, menus, and more,
 * Handling events that knock on its door.
 *
 * It starts the wineryProcess, swift as a breeze,
 * Ensuring that all workspaces it sees,
 * Managing repositories, both old and new,
 * Guiding their paths, it knows what to do.
 *
 * With IPC channels, it communicates,
 * A bridge between processes, it creates,
 * From opening workspaces to stopping the core,
 * The main process tends to every chore.
 *
 * So here lies the tale of this noble quest,
 * A story of code that strives for the best,
 * And as our journey through this file goes,
 * The spirit of Electron's main process grows.
 * ---
 *
 * The Electron main process manages the TOSCA Modeling Tool's lifecycle. It is responsible for:
 *
 *  - Initializing the application's store and setting default values.
 *  - Starting and stopping the TOSCA Winery wineryProcess.
 *  - Interact with the WindowManager class to manage multiple windows, such as the main window and one or multiple
 *    "Winery windows", i.e. TOSCA Manager and Topology Modeler windows.
 *  - Handling Inter-Process Communication (IPC) between the main process and renderer process. The renderer process
 *    is the "web app" providing the app's user interface.
 *  - Responding to menu actions, navigation events, and other application events.
 *
 *  The main process coordinates the application's flow by listening for IPC messages from the renderer process,
 *  and interacting with the Winery process and window manager accordingly. Additionally, it ensures that only allowed
 *  URLs are navigated to within the application, and opens external URLs in the user's default browser.
 *
 */

import {app, BrowserWindow, dialog, ipcMain, Menu, shell} from "electron";
import path from "path";
import {WineryManager} from "./wineryManager";
import {SK_DEFAULT_WORKSPACE_PARENT_PATH, SK_KNOWN_WORKSPACES, store} from "../common/store";
import * as fs from "fs";
import * as fse from "fs-extra";

import {
    WINERY_STARTING,
    WINERY_STOPPED,
    WINERY_STOPPING,
    CHOOSE_DIRECTORY,
    CREATE_A_WORKSPACE,
    IS_WINERY_RUNNING, SHOW_LINK_CONTEXT_MENU, OPEN_NEW_WINDOW,
    OPEN_A_WORKSPACE
} from "../common/ipcEvents";
import * as process from "process";
import {LAST_WINERY_WINDOW_CLOSED, NavigationUrlType, WindowManager} from "./windowManager";
import {baseRepositoriesPath, mainWindowUrl} from "./resources";

const wineryProcess = new WineryManager(app.getPath("userData"))
const windowManager = new WindowManager(checkUrlType)


// ---------------------------
// HELPER FUNCTIONS
// ---------------------------

// phony check if this is a valid winery repository
function isValidRepository(repositoryPath: string) {
    return fs.existsSync(path.join(repositoryPath, ".git")) || fs.existsSync(path.join(repositoryPath, "workspace"));
}

/**
 * Check if the given URL is part of the app.
 */
function checkUrlType(url: URL): NavigationUrlType {
    const parsedMainWindowUrl = new URL(mainWindowUrl)

    if (url.href.startsWith(parsedMainWindowUrl.href)) {
        return "mainWindow"
    } else if (
        url.origin === wineryProcess.toscaManagerUrl.origin &&
        url.pathname === wineryProcess.toscaManagerUrl.pathname) {
        return "toscaManager"
    } else if (
        url.origin === wineryProcess.topologyModelerUrl.origin &&
        url.pathname.startsWith(wineryProcess.topologyModelerUrl.pathname)) {
        return "topologyModeler"
    }

    return "external"
}

/**
 * Initialize the store with default values.
 */
function initializeStore() {
    if (!store.has(SK_KNOWN_WORKSPACES)) {
        store.set(SK_KNOWN_WORKSPACES, [])
    } else {
        // When existing workspaces are found, filter out those that cannot be found in the file system
        const existingWorkspaces = store
            .get(SK_KNOWN_WORKSPACES)
            .filter(workspace => isValidRepository(workspace.path))

        store.set(SK_KNOWN_WORKSPACES, existingWorkspaces)
    }

    if (!store.has(SK_DEFAULT_WORKSPACE_PARENT_PATH) || !fs.existsSync(store.get(SK_DEFAULT_WORKSPACE_PARENT_PATH))) {
        store.set(SK_DEFAULT_WORKSPACE_PARENT_PATH, path.join(app.getPath("home"), "Winery Workspaces"))
    }
}


/**
 * Start the Winery process with the given repository path.
 *
 * @param repositoryPath - The path of the repository to start the wineryProcess with.
 * @returns A Promise that resolves when the wineryProcess has started, or throws an error if something goes wrong.
 */
function startWinery(repositoryPath: string): null | Promise<void> {
    if (!repositoryPath) {
        throw new Error("No repositoryPath set!")
    }

    windowManager.mainWindow.webContents.send(WINERY_STARTING)
    return wineryProcess
        .start(repositoryPath)
        .then(() => {

            const knownWorkspaces = store.get(SK_KNOWN_WORKSPACES) ?? []
            const knownOtherWorkspaces = knownWorkspaces.filter(workspace => workspace.path !== repositoryPath)
            store.set(SK_KNOWN_WORKSPACES, [
                {path: repositoryPath},
                ...knownOtherWorkspaces
            ])

            const parentLocation = path.resolve(repositoryPath, "..")
            store.set(SK_DEFAULT_WORKSPACE_PARENT_PATH, parentLocation)

            windowManager
                .openWindowFor(wineryProcess.toscaManagerUrl)
                .then(() => windowManager.mainWindow.close())

        }).catch(e => {
            windowManager.mainWindow.webContents.send(WINERY_STOPPED)
            dialog.showErrorBox("Winery error", e.toString())
            console.error(e)
            windowManager.mainWindow.show()
        });
}


// ---------------------------
// IPC AND EVENT HANDLING
// ---------------------------

// Handle IPC calls from the renderer process (triggered when a user interacts with the app)
// ----------------------------------------------------------------------------------------

ipcMain.on(OPEN_A_WORKSPACE, async (event, repositoryPath) => {
    if (!fs.existsSync(repositoryPath)) {
        dialog.showErrorBox("Repository path not found", `The specified repository path could not be found: ${repositoryPath}`)
        return
    }

    if (!isValidRepository(repositoryPath)) {
        dialog.showErrorBox("Invalid repository", `The selected directory is not a valid Winery repository: ${repositoryPath}`)
        return
    }

    await startWinery(repositoryPath)
})

ipcMain.on(CREATE_A_WORKSPACE, async (event, repositoryPath, baseRepository) => {

    // handle already existing repository directory
    if (fs.existsSync(repositoryPath)) {
        if (isValidRepository(repositoryPath)) {
            const result = dialog.showMessageBoxSync({
                title: "Workspace already exists",
                message: `Found an existing workspace at ${repositoryPath}. What would you like to do?`,
                buttons: ["Open the workspace", "Choose another name"],
                cancelId: 1
            })

            if (result === 0) {
                await startWinery(repositoryPath)
            }
        } else {
            if(fs.readdirSync(repositoryPath).length > 0) {
                dialog.showMessageBoxSync({
                    title: "Directory not empty",
                    message: `The directory at ${repositoryPath} already exists and is not empty. Cannot create a workspace in a non-empty directory.`,
                    buttons: ["Choose another name"]
                })
            }
        }

        return
    }

    // create the repository directory
    try {
        if (baseRepository) {
            fse.copySync(path.join(baseRepositoriesPath, baseRepository), repositoryPath)
        } else {
            fs.mkdirSync(repositoryPath, { recursive: true })
        }
    } catch (e) {
        dialog.showErrorBox("Could create workspace directory", `Could not create new workspace directory ${repositoryPath}: ${e.message}`)
        return
    }

    await startWinery(repositoryPath)
})

ipcMain.handle(CHOOSE_DIRECTORY, async (event, path: string) => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
        title: "Choose workspace directory",
        properties: ["openDirectory", "promptToCreate", "createDirectory"],
        defaultPath: path
    })
    return !result.canceled && result.filePaths[0]
})

ipcMain.handle(IS_WINERY_RUNNING, async () => {
    return wineryProcess.isRunning
})

ipcMain.on(SHOW_LINK_CONTEXT_MENU, (event, url) => {
    Menu.buildFromTemplate([
        {
            label: "Open in new window",
            click: () => windowManager.openWindowFor(url)
        }
    ]).popup({window: BrowserWindow.fromWebContents(event.sender)})
})

ipcMain.on(OPEN_NEW_WINDOW, async (_event, url: string) => {
    await windowManager.openWindowFor(new URL(url))
})


// Handle WindowManager events
// ---------------------------

/*
 * When the last  Winery window (TOSCA Manager or Topology Modeler) is closed, the main (workspace selection)
 * window should re-open
 */
windowManager.on(LAST_WINERY_WINDOW_CLOSED, () => {
    windowManager.openMainWindow()
    windowManager.mainWindow.webContents.on("dom-ready", () => {
        windowManager.mainWindow.webContents.send(WINERY_STOPPING)
        wineryProcess.stop().then(() => {
            windowManager.mainWindow.webContents.send(WINERY_STOPPED)
        }).catch(() => {
            dialog.showMessageBoxSync({
                type: "error",
                title: "Winery wineryProcess error",
                message: `Timeout of reached while waiting for the winery to stop.`
            })

            process.exit(-1);
        })
    })
})

// Handle Winery events
// ---------------------------

/*
 * When the Winery process exits unexpectedly, the main window should re-open.
 */
wineryProcess.on("unexpected-exit", (error?) => {
    dialog.showMessageBoxSync({
        type: "error",
        title: "Winery wineryProcess error",
        message: `The Winery has exited unexpectedly${error ? `: ${error}` : "."}`
    })
    windowManager.mainWindow?.webContents?.send(WINERY_STOPPED)

    windowManager.closeAllWineryWindows()

    if (!windowManager.mainWindow) {
        windowManager.openMainWindow()
    }
})


// Handle Electron app events
// ---------------------------

/*
 * Registers a handler for when a user clicks on a link which intercepts navigation.
 */
app.on('web-contents-created', (event, contents) => {

    contents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl)


        // workaround for TOSCA manager bug: TOSCA docs link in 'about' dialog invalid
        if (parsedUrl.pathname.startsWith("/docs.oasis-open.org")) {
            shell.openExternal(`https://${parsedUrl.pathname}`).catch()
            event.preventDefault()
            return
        }

        if (parsedUrl.hostname === "github.com" && parsedUrl.pathname.startsWith("/login/oauth")) {
            dialog.showMessageBoxSync(BrowserWindow.getFocusedWindow(), {
                message: "Login with GitHub is not supported in the Desktop Winery.",
                title: "GitHub login not supported",
                type: "info"
            })
            event.preventDefault()
            return
        }

        // open external URLs in the user's web browser
        if (checkUrlType(parsedUrl) === "external") {
            shell.openExternal(parsedUrl.toString()).catch()
            event.preventDefault()
        }
    })
})

app.on('window-all-closed', () => {
    app.quit()
})

app.on('activate', () => {
  if (!windowManager.mainWindow) {
    windowManager.openMainWindow()
  }
});

app.on('ready', () => windowManager.openMainWindow())

initializeStore();
