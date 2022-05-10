import electron from "electron";
import {store, Workspace} from "../common/store";
import { LitElement, html } from "lit";

import styles from "./styles.scss"

import {loadingModal} from "./loading-modal";
import {createWorkspaceDialog} from "./create-workspace-dialog"
import path from "path";
import * as fs from "fs";

const style = styles

document.adoptedStyleSheets = [style]

electron.ipcRenderer.on("backendStopping", () => {
    const isBackendRunning = electron.ipcRenderer.sendSync("isBackendRunning")
    if (isBackendRunning) {
        loadingModal.show("Stopping the Winery...", false)
    }
})

electron.ipcRenderer.on("backendStopped", () => {
    if (loadingModal.status === "shown") {
        loadingModal.close()
    }

    if (loadingModal.status === "showing") {
        loadingModal.events.once("shown", () => loadingModal.close())
    }

    // ensure to close loading modal

})


document.addEventListener("DOMContentLoaded", () => {
})


declare global {
    interface Window {
        openWorkspace: () => void
        createWorkspace: () => void
        startWinery: (workspacePath: string, create?: boolean) => void
    }
}
window.openWorkspace = () => {
    const result = electron.ipcRenderer.sendSync("selectWorkspaceDir");
    if (result) {
        window.startWinery(result)
    }
}

window.startWinery = (path, create = false) => {
    const message = create ? "createWorkspace" : "openWorkspace"
    const isStarting = electron.ipcRenderer.sendSync(message, path)
    if (isStarting) {
        loadingModal.show("Starting the Winery...")
    }
}

window.createWorkspace = async () => {
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

export class RepositoryList extends LitElement {

    static styles = [style]

    handleClick(workspace: Workspace) {
        window.startWinery(workspace.path)
    }


    render() {
        const workspaces = store.get("knownWorkspaces")

        return html`
            <h2>Recent workspaces</h2>
            <div class="repository-list list-group bg-light">
                ${workspaces.map(workspace => html`
                    <button
                        type="button"
                        class="list-group-item list-group-item-action"
                        @click=${() => this.handleClick(workspace)}
                >${workspace.path}</button>
                `)}
            </div>
        `
    }
}
window.customElements.define("repository-list2", RepositoryList)

