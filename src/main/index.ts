import {app, BrowserWindow, dialog, ipcMain, HandlerDetails, WebContents, shell} from "electron";
import url from "url";
import path from "path";
import {backend} from "./backend";
import {store} from "../common/store";
import * as fs from "fs";

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

  mainWindow.webContents.openDevTools()

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
    webPreferences: {nodeIntegration: false},
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

    //this.hide()
    mainWindow = createMainWindow()
    mainWindow.webContents.on("dom-ready", () => {
      mainWindow.webContents.send("backendStopping")
      backend.stop().then(() => {
        mainWindow.webContents.send("backendStopped")
        this.close()
      })
    })
  }
}

function startBackend(repositoryPath: string): null | Promise<void> {
  if (!repositoryPath) {
    throw new Error("No repositoryPath set!")
  }

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
    mainWindow?.webContents.send("backendStopped")
    dialog.showErrorBox("Winery error", e.toString())
  });
}

app.on('window-all-closed', () => {
 // if (process.platform !== 'darwin') { app.quit() }
  console.log("ALL WINDOWS CLOSED")
  app.quit()
})

// if there is no mainWindow it creates one (like when you click the dock icon)
app.on('activate', () => {
  if (mainWindow === null) { createMainWindow() }
})

app.on('ready', () => {
  createMainWindow()
})



ipcMain.on("openWorkspace", (event, repositoryPath) => {
  if (!fs.existsSync(repositoryPath)) {
    dialog.showErrorBox("Repository path not found", `The specified repository path could not be found: ${repositoryPath}`)
    return null
  }

  if (!isValidRepository(repositoryPath)) {
    dialog.showErrorBox("Invalid repository", `The selected directory is not a valid Winery repository. ${repositoryPath}`)
    return null
  }

  const startBackendResult = startBackend(repositoryPath)
  event.returnValue = !!startBackendResult
})

ipcMain.on("createWorkspace", async (event, repositoryPath) => {

  if (fs.existsSync(repositoryPath)) {
    if (isValidRepository(repositoryPath)) {
      const result = dialog.showMessageBoxSync({
        title: "Workspace already exists",
        message: `Found an existing workspace at ${repositoryPath}. What would you like to do?`,
        buttons: ["Open the workspace", "Choose another name"],
        cancelId: 1
      })

      if (result === 0) {
        const startBackendResult = startBackend(repositoryPath)
        event.returnValue = !!startBackendResult
      }

      event.returnValue = false
    }

    return
  }

  try {
    fs.mkdirSync(repositoryPath, { recursive: true })
  } catch (e) {
    dialog.showErrorBox("Could create workspace directory", `Could not create new workspace directory ${repositoryPath}`)
    event.returnValue = false
    return
  }

  const startBackendResult = startBackend(repositoryPath)
  event.returnValue = !!startBackendResult
})

ipcMain.on("selectWorkspaceDir", (event, path: string) => {
  const result = dialog.showOpenDialogSync({
    title: "Choose workspace directory",
    properties: ["openDirectory", "promptToCreate", "createDirectory"],
    defaultPath: path
  })

  // phony check to determine if this is a valid repository
  event.returnValue = result && result[0]
})

ipcMain.on("isBackendRunning", (event) => {
  event.returnValue = backend.running
})

backend.backendEvents.on("unexpected-exit", (error?) => {
  dialog.showMessageBoxSync({
    type: "error",
    title: "Winery backend error",
    message: `The Winery has exited unexpectedly${error ? `: ${error}` : "."}`
  })
  mainWindow?.webContents?.send("backendStopped")

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

