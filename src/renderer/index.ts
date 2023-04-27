import electron from "electron";
import {SK_DEFAULT_WORKSPACE_PARENT_PATH, SK_KNOWN_WORKSPACES, store} from "../common/store";

import globalStyles from "./global-styles.scss"
import indexStyles from "./index.scss"

import path from "path";
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

import {BigButton} from "./components/shared/big-button.component";
import {WorkspaceList} from "./components/workspace-list.component";
import {CreateWorkspaceDialogComponent} from "./components/create-workspace-dialog.component";
import {LoadingOverlayComponent} from "./components/loading-overlay.component";
import {WORKSPACE_SELECT, WorkspaceSelectEvent} from "./components/shared/workspace-select.event";
import {LastWorkspaceButton} from "./components/last-workspace-button.component";

declare global {
    interface Window extends GlobalMethods { }
}

interface GlobalMethods {
    openWorkspace: () => void
    openLastWorkspace: () => void
    createWorkspace: (baseRepository?: string) => void
}

document.adoptedStyleSheets = [globalStyles, indexStyles]

window.customElements.define("workspace-list", WorkspaceList)
window.customElements.define("create-workspace-dialog", CreateWorkspaceDialogComponent)
window.customElements.define("loading-overlay", LoadingOverlayComponent)
window.customElements.define("last-workspace-button", LastWorkspaceButton)
window.customElements.define('big-button', BigButton);

const createWorkspaceDialog = document.querySelector("create-workspace-dialog") as CreateWorkspaceDialogComponent
const loadingOverlay = document.querySelector("loading-overlay") as LoadingOverlayComponent
const workspaceList = document.querySelector("workspace-list") as WorkspaceList
const lastWorkspaceButton = document.querySelector("last-workspace-button") as LastWorkspaceButton

// const workspaces = [] as Workspace[] // store.get(SK_KNOWN_WORKSPACES)
const workspaces = store.get(SK_KNOWN_WORKSPACES)

if (workspaces?.length > 0) {
    workspaceList.setWorkspaces(store.get(SK_KNOWN_WORKSPACES))
    lastWorkspaceButton.setLastWorkspace(workspaces[0])
} else {
    workspaceList.classList.add("hidden")
    lastWorkspaceButton.classList.add("hidden")
}

workspaceList.addEventListener(WORKSPACE_SELECT, (event: WorkspaceSelectEvent) =>
    startWinery(event.detail.workspacePath)
)

electron.ipcRenderer.on(BACKEND_STARTING, () => {
    loadingOverlay.show("Starting the Winery...")
})

electron.ipcRenderer.on(BACKEND_STOPPING, () => {
    const isBackendRunning = electron.ipcRenderer.invoke(IS_BACKEND_RUNNING)
    if (isBackendRunning) {
        loadingOverlay.show("Stopping the Winery...", false)
    }
})

electron.ipcRenderer.on(BACKEND_STOPPED, () => loadingOverlay.close())

function startWinery(path: string, create = false, baseRepository: string = null) {
    const message = create ? CREATE_A_WORKSPACE : OPEN_A_WORKSPACE
    electron.ipcRenderer.send(message, path, baseRepository)
}

const globalMethods: GlobalMethods = {
    async openWorkspace() {
        const path = await electron.ipcRenderer.invoke(CHOOSE_DIRECTORY)
        if (path) {
            startWinery(path)
        }
    },
    async openLastWorkspace() {
      const workspaces = store.get(SK_KNOWN_WORKSPACES)
      if (workspaces.length > 0) {
          startWinery(workspaces[0].path)
      } else {
          throw new Error("There are no known workspaces.")
      }
    },
    async createWorkspace(baseRepository) {
        const defaultParentPath = store.get(SK_DEFAULT_WORKSPACE_PARENT_PATH)

        let nameIndex = 1
        let defaultName = "Winery Workspace"

        if (fs.existsSync(path.join(defaultParentPath, defaultName))) {
            nameIndex++
            defaultName = `Winery Workspace ${nameIndex}`
        }

        const workspacePath = await createWorkspaceDialog.show(defaultParentPath, defaultName)
        if (workspacePath) {
            startWinery(workspacePath, true, baseRepository)
        }
    }
}

Object.assign(window, globalMethods)
