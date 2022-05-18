import electron from "electron";
import {store, Workspace} from "../common/store";
import { LitElement, html } from "lit";

import styles from "./styles.scss"

import {loadingModal} from "./loading-modal";
import {createWorkspaceDialog} from "./create-workspace-dialog"
import path from "path";
import * as fs from "fs";
import {
    BACKEND_STARTING,
    BACKEND_STOPPED,
    BACKEND_STOPPING,
    CHOOSE_DIRECTORY,
    CREATE_A_WORKSPACE,
    IS_BACKEND_RUNNING, OPEN_A_WORKSPACE
} from "../common/ipcEvents";

const style = styles

document.adoptedStyleSheets = [style]

electron.ipcRenderer.on(BACKEND_STARTING, () => {
    loadingModal.show("Starting the Winery...")
})

electron.ipcRenderer.on(BACKEND_STOPPING, () => {
    const isBackendRunning = electron.ipcRenderer.invoke(IS_BACKEND_RUNNING)
    if (isBackendRunning) {
        loadingModal.show("Stopping the Winery...", false)
    }
})

electron.ipcRenderer.on(BACKEND_STOPPED, () => {
    if (loadingModal.status === "shown") {
        loadingModal.close()
    }
    // ensure to close loading modal
    if (loadingModal.status === "showing") {
        loadingModal.events.once("shown", () => loadingModal.close())
    }
})

declare global {
    interface Window {
        openWorkspace: () => void
        createWorkspace: () => void
        startWinery: (workspacePath: string, create?: boolean) => void
    }
}
window.openWorkspace = async () => {
    const path = await electron.ipcRenderer.invoke(CHOOSE_DIRECTORY)
    if (path) {
        window.startWinery(path)
    }
}

window.startWinery = (path, create = false) => {
    const message = create ? CREATE_A_WORKSPACE : OPEN_A_WORKSPACE
    electron.ipcRenderer.send(message, path)
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
        const workspaces = store.get("knownWorkspaces").map(workspace => {
            const pathComponents = workspace.path.split(path.sep)
            return {
                name: pathComponents.pop(),
                path: pathComponents.join(path.sep),
                workspace
            }
        })

        return html`
            <div class="repository-list list-group bg-light overflow-auto" style="height: 100%">
                ${workspaces.map(workspace => html`
                    <button
                        type="button"
                        class="list-group-item list-group-item-action"
                        @click=${() => this.handleClick(workspace.workspace)}
                >
                        <h5>${workspace.name}</h5>
                        <div class="text-muted">${workspace.path}</div>
                    </button>
                `)}
            </div>
        `
    }
}
window.customElements.define("repository-list2", RepositoryList)

