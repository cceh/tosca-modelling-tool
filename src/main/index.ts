import {app, BrowserWindow, dialog, HandlerDetails, ipcMain, Menu, shell, WebContents} from "electron";
import url from "url";
import path from "path";
import {backend} from "./backend";
import {store} from "../common/store";
import * as fs from "fs";

import {
    BACKEND_STARTING,
    BACKEND_STOPPED,
    BACKEND_STOPPING,
    CHOOSE_DIRECTORY,
    CREATE_A_WORKSPACE,
    IS_BACKEND_RUNNING,
    OPEN_A_WORKSPACE
} from "../common/ipcEvents";

export type WindowType = "main" | "tosca-manager" | "topology-modeler"
const windowTypeMap = new WeakMap<BrowserWindow, WindowType>()

const mainWindowUrl = app.isPackaged
    ? url.format({
      pathname: path.join(__dirname, './index.html'),
      protocol: 'file:',
      slashes: true
    })
    : `http://localhost:8080/`

let mainWindow: BrowserWindow


function navigationAllowedForUrl(url: URL) {
  if (url.toString() === mainWindowUrl) {
    return true
  }

  const parsedMainWindowUrl = new URL(mainWindowUrl)
  const parsedBackendUrl = new URL(backend.backendUrl)

  const allowedOrigins = [parsedMainWindowUrl.origin, parsedBackendUrl.origin]

  return allowedOrigins.includes(url.origin)
}

// phony check if this is a valid winery repository
function isValidRepository(repositoryPath: string) {
  return fs.existsSync(path.join(repositoryPath, ".git")) || fs.existsSync(path.join(repositoryPath, "workspace"));
}


function createMainWindow(): BrowserWindow {
    mainWindow = new BrowserWindow({
        center: true,
        width: 1024,
        height: 1000,
        show: false,
        maximizable: false,
        fullscreenable: false,
        titleBarStyle: "customButtonsOnHover",
        titleBarOverlay: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })

  windowTypeMap.set(mainWindow, "main")


  if (app.isPackaged) {
    mainWindow.loadURL(url.format({
      pathname: path.join(__dirname, './index.html'),
      protocol: 'file:',
      slashes: true
    }));
  } else {
    mainWindow.loadURL(`http://localhost:8080/`)
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow
      .on('ready-to-show', () => mainWindow.show())
      .on('closed', () => {
        mainWindow = null;
      })

  return mainWindow
}

function createToscaManagerWindow(): BrowserWindow {
  // no node integration because of orion editor
  let toscaManagerWindow = new BrowserWindow({
    webPreferences: {
      nodeIntegration: false,
      preload: path.join(__dirname, app.isPackaged ? "preload.js" : "../../dist/app/preload.js")
    },
    width: 1000,
    height: 600,
    show: false,
  })
  windowTypeMap.set(toscaManagerWindow, "tosca-manager")

  if (!app.isPackaged) {
    toscaManagerWindow.webContents.openDevTools()
  }

  toscaManagerWindow
      .on('ready-to-show', () => toscaManagerWindow.show())
      .on('closed',  () => {
        toscaManagerWindow = null
      })
      .on('close', wineryWindowClosedHandler)

  toscaManagerWindow.webContents.setWindowOpenHandler(wineryWindowOpenHandler)

  return toscaManagerWindow
}

function createTopologyManagerWindow(): BrowserWindow {
  const topologyManagerWindow = new BrowserWindow({
    webPreferences: {nodeIntegration: false},
    width: 1200,
    height: 1200,
    show: false
  })
  windowTypeMap.set(topologyManagerWindow, "topology-modeler")

  topologyManagerWindow
      .on("close", wineryWindowClosedHandler)
      .once("ready-to-show", () => topologyManagerWindow.show())
  topologyManagerWindow.webContents.setWindowOpenHandler(wineryWindowOpenHandler)

  return topologyManagerWindow
}

type WindowOpenHandler = Parameters<WebContents["setWindowOpenHandler"]>[0]
function wineryWindowOpenHandler(details: HandlerDetails): ReturnType<WindowOpenHandler> {
  const parsedUrl = new URL(details.url)
  const urlAllowed = navigationAllowedForUrl(parsedUrl)

  if (urlAllowed && parsedUrl.pathname.startsWith(`/winery-topologymodeler`)) {
    const topologyModelerWindow = createTopologyManagerWindow()
    topologyModelerWindow.loadURL(details.url)
  } else if (urlAllowed && parsedUrl.pathname === "/") {
    const toscaManagerWindow = createToscaManagerWindow()
    toscaManagerWindow.loadURL(details.url)
  } else {
    dialog.showErrorBox(
        "Navigation prevented",
        `Navigation prevented for URL: ${details.url}`
    )
  }


  return {action: "deny"}
}

function wineryWindowClosedHandler(this: BrowserWindow, event: Event) {
  const openWineryWindows = BrowserWindow
      .getAllWindows()
      .filter(window => windowTypeMap.get(window) !== "main")

  if (!mainWindow && openWineryWindows.length === 1) {
    event.preventDefault()

    mainWindow = createMainWindow()
    mainWindow.webContents.on("dom-ready", () => {
      mainWindow.webContents.send(BACKEND_STOPPING)
      backend.stop().then(() => {
        mainWindow.webContents.send(BACKEND_STOPPED)
        this.close()
      })
    })
  }
}

function startBackend(repositoryPath: string): null | Promise<void> {
  if (!repositoryPath) {
    throw new Error("No repositoryPath set!")
  }

  mainWindow?.webContents.send(BACKEND_STARTING)
  return backend.start(repositoryPath).then(() => {

    const knownWorkspaces = store.get("knownWorkspaces") ?? []
    const knownOtherWorkspaces = knownWorkspaces.filter(workspace => workspace.path !== repositoryPath)
    store.set("knownWorkspaces", [
      { path: repositoryPath },
      ...knownOtherWorkspaces
    ])

    const parentLocation = path.resolve(repositoryPath, "..")
    store.set("defaultWorkspaceParentPath", parentLocation)

    mainWindow?.hide()

    const toscaManagerWindow = createToscaManagerWindow()
    toscaManagerWindow.once("ready-to-show", () => mainWindow?.close())
    toscaManagerWindow.loadURL(backend.backendUrl)
  }).catch(e => {
    mainWindow?.webContents.send(BACKEND_STOPPED)
    dialog.showErrorBox("Winery error", e.toString())
  });
}

app.on('window-all-closed', () => {
 // if (process.platform !== 'darwin') { app.quit() }
  console.log("ALL WINDOWS CLOSED")
  app.quit()
})

app.on('ready', () => {
  createMainWindow()
})



ipcMain.on(OPEN_A_WORKSPACE, (event, repositoryPath) => {
  if (!fs.existsSync(repositoryPath)) {
    dialog.showErrorBox("Repository path not found", `The specified repository path could not be found: ${repositoryPath}`)
    return
  }

  if (!isValidRepository(repositoryPath)) {
    dialog.showErrorBox("Invalid repository", `The selected directory is not a valid Winery repository: ${repositoryPath}`)
    return
  }

  startBackend(repositoryPath)
})

ipcMain.on(CREATE_A_WORKSPACE, async (event, repositoryPath) => {

  if (fs.existsSync(repositoryPath)) {
    if (isValidRepository(repositoryPath)) {
      const result = dialog.showMessageBoxSync({
        title: "Workspace already exists",
        message: `Found an existing workspace at ${repositoryPath}. What would you like to do?`,
        buttons: ["Open the workspace", "Choose another name"],
        cancelId: 1
      })

      if (result === 0) {
        startBackend(repositoryPath)
      }
    }

    return
  }

  try {
    fs.mkdirSync(repositoryPath, { recursive: true })
  } catch (e) {
    dialog.showErrorBox("Could create workspace directory", `Could not create new workspace directory ${repositoryPath}`)
    return
  }

  startBackend(repositoryPath)
})

ipcMain.handle(CHOOSE_DIRECTORY, async (event, path: string) => {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    title: "Choose workspace directory",
    properties: ["openDirectory", "promptToCreate", "createDirectory"],
    defaultPath: path
  })
  return !result.canceled && result.filePaths[0]
})

ipcMain.handle(IS_BACKEND_RUNNING, async (event) => {
  return backend.running
})

backend.backendEvents.on("unexpected-exit", (error?) => {
  dialog.showMessageBoxSync({
    type: "error",
    title: "Winery backend error",
    message: `The Winery has exited unexpectedly${error ? `: ${error}` : "."}`
  })
  mainWindow?.webContents?.send(BACKEND_STOPPED)

  if (!mainWindow) {
    createMainWindow()
  }


  BrowserWindow.getAllWindows().forEach(window => {
    if (windowTypeMap.get(window) !== "main") {
      window.destroy()
    }
  })
})



// open external links in external browser
app.on('web-contents-created', (event, contents) => {

  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)


    // workaround for TOSCA manager bug: TOSCA docs link in 'about' dialog invalid
    if (parsedUrl.pathname.startsWith("/docs.oasis-open.org")) {
      shell.openExternal(`https://${parsedUrl.pathname}`)
      event.preventDefault()
      return
    }

    if (parsedUrl.hostname === "github.com" && parsedUrl.pathname.startsWith("/login/oauth")) {
      dialog.showMessageBoxSync(BrowserWindow.getFocusedWindow(), {
        message: "Login with GitHub is not supported in the Dekstop Winery.",
        title: "GitHub login not supported",
        type: "info"
      })
      event.preventDefault()
      return
    }

    if (!navigationAllowedForUrl(parsedUrl)) {
      shell.openExternal(parsedUrl.toString())
      event.preventDefault()
    }
  })
})

// store initialization
if (!store.has("knownWorkspaces")) {
  store.set("knownWorkspaces", [])
} else {
  const existingWorkspaces = store.get("knownWorkspaces").filter(workspace => isValidRepository(workspace.path))
  store.set("knownWorkspaces", existingWorkspaces)
}

if (!store.has("defaultWorkspaceParentPath") || !fs.existsSync(store.get("defaultWorkspaceParentPath"))) {
    store.set("defaultWorkspaceParentPath", path.join(app.getPath("home"), "Winery Workspaces"))
}


ipcMain.on("menu", (event, url) => {
  Menu.buildFromTemplate([
    {
      label: "Open in new window",
      click: (item, browserWindow, keyboardEvent) => {
        const toscaWindow = createToscaManagerWindow()
        toscaWindow.loadURL(url)
      }
    }
  ]).popup({window: BrowserWindow.fromWebContents(event.sender)})
})

ipcMain.on("newWindow", (event, url) => {
  createToscaManagerWindow().loadURL(url)
})
