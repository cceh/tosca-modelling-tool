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

import {WorkspaceList} from "./components/workspace-list";
import {CreateWorkspaceDialog} from "./components/create-workspace-dialog";
import {LoadingOverlay} from "./components/loading-overlay";

declare global {
    interface Window extends GlobalMethods { }
}

interface GlobalMethods {
    openWorkspace: () => void
    createWorkspace: () => void
    startWinery: (workspacePath: string, create?: boolean) => void
}

document.adoptedStyleSheets = [styles]

window.customElements.define("workspace-list", WorkspaceList)
window.customElements.define("create-workspace-dialog", CreateWorkspaceDialog)
window.customElements.define("loading-overlay", LoadingOverlay)

const createWorkspaceDialog = document.querySelector("create-workspace-dialog") as CreateWorkspaceDialog
const loadingOverlay = document.querySelector("loading-overlay") as LoadingOverlay


electron.ipcRenderer.on(BACKEND_STARTING, () => {
    loadingOverlay.show("Starting the Winery...")
})

electron.ipcRenderer.on(BACKEND_STOPPING, () => {
    const isBackendRunning = electron.ipcRenderer.invoke(IS_BACKEND_RUNNING)
    if (isBackendRunning) {
        loadingOverlay.show("Stopping the Winery...", false)
    }
})

electron.ipcRenderer.on(BACKEND_STOPPED, () => {
    if (loadingOverlay.status === "shown") {
        loadingOverlay.close()
    }
    // ensure to close loading modal
    if (loadingOverlay.status === "showing") {
        loadingOverlay.events.once("shown", () => loadingOverlay.close())
    }
})


const globalMethods: GlobalMethods = {
    openWorkspace: async () => {
        const path = await electron.ipcRenderer.invoke(CHOOSE_DIRECTORY)
        if (path) {
            window.startWinery(path)
        }
    },
    startWinery: (path: string, create = false) => {
        const message = create ? CREATE_A_WORKSPACE : OPEN_A_WORKSPACE
        electron.ipcRenderer.send(message, path)
    },
    createWorkspace: async () => {
        const defaultParentPath = store.get("defaultWorkspaceParentPath")

        let nameIndex = 1
        let defaultName = "Winery Workspace"

        if (fs.existsSync(path.join(defaultParentPath, defaultName))) {
            nameIndex++
            defaultName = `Winery Workspace ${nameIndex}`
        }

        const workspacePath = await createWorkspaceDialog.show(defaultParentPath, defaultName)
        if (workspacePath) {
            window.startWinery(workspacePath, true)
        }
    }
}

Object.assign(window, globalMethods)
