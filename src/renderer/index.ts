import electron from "electron";
import {store} from "../common/store";

import styles from "./styles.scss"

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

import {WORKSPACE_SELECT, WorkspaceList, WorkspaceSelectEvent} from "./components/workspace-list";
import {CreateWorkspaceDialog} from "./components/create-workspace-dialog";
import {LoadingOverlay} from "./components/loading-overlay";

declare global {
    interface Window extends GlobalMethods { }
}

interface GlobalMethods {
    openWorkspace: () => void
    createWorkspace: () => void
}

document.adoptedStyleSheets = [styles]

window.customElements.define("workspace-list", WorkspaceList)
window.customElements.define("create-workspace-dialog", CreateWorkspaceDialog)
window.customElements.define("loading-overlay", LoadingOverlay)

const createWorkspaceDialog = document.querySelector("create-workspace-dialog") as CreateWorkspaceDialog
const loadingOverlay = document.querySelector("loading-overlay") as LoadingOverlay
const workspaceList = document.querySelector("workspace-list") as WorkspaceList

workspaceList.setWorkspaces(store.get("knownWorkspaces"))
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

function startWinery(path: string, create = false) {
    const message = create ? CREATE_A_WORKSPACE : OPEN_A_WORKSPACE
    electron.ipcRenderer.send(message, path)
}

const globalMethods: GlobalMethods = {
    async openWorkspace() {
        const path = await electron.ipcRenderer.invoke(CHOOSE_DIRECTORY)
        if (path) {
            startWinery(path)
        }
    },
    async createWorkspace() {
        const defaultParentPath = store.get("defaultWorkspaceParentPath")

        let nameIndex = 1
        let defaultName = "Winery Workspace"

        if (fs.existsSync(path.join(defaultParentPath, defaultName))) {
            nameIndex++
            defaultName = `Winery Workspace ${nameIndex}`
        }

        const workspacePath = await createWorkspaceDialog.show(defaultParentPath, defaultName)
        if (workspacePath) {
            startWinery(workspacePath, true)
        }
    }
}

Object.assign(window, globalMethods)
