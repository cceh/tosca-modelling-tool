import Modal from "bootstrap/js/dist/modal";
import {html, LitElement} from "lit";
import { customElement, state } from "lit/decorators.js";
import styles from "./styles.scss"
import {EventEmitter} from "events";
import path from "path";
import electron from "electron";
const style = styles

@customElement("create-workspace-dialog")
class CreateWorkspaceDialog extends LitElement {

    static styles = [style]

    private modal: Modal
    private modalElem: HTMLElement
    private locationInput: HTMLInputElement
    private nameInput: HTMLInputElement
    private createButton: HTMLButtonElement

    private notifyClose: (repositoryPath: string | null) => void

    async show(parentPath: string, name: string): Promise<string> {
        this.locationInput.value = parentPath
        this.nameInput.value = name
        this.modal.show()


        return new Promise<string>(resolve => {
            this.notifyClose = resolve
            this.modalElem.addEventListener("closed", () => resolve(null))
        })
    }

    createButtonHandler() {
        const repositoryPath = path.join(this.locationInput.value, this.nameInput.value)
        this.notifyClose(repositoryPath)
    }

    chooseLocationButtonHandler() {

        const path = electron.ipcRenderer.sendSync("selectWorkspaceDir", this.locationInput.value);
        if (path) {
            this.locationInput.value = path
        }
    }

    nameChangedHandler() {
        setTimeout(() => this.createButton.disabled = !this.nameInput.value)
    }


    firstUpdated() {
        this.modalElem = this.shadowRoot.querySelector("div") as HTMLElement
        this.modal = new Modal(this.modalElem, { backdrop: "static" })

        this.locationInput = this.shadowRoot.querySelector("#location-input")
        this.nameInput = this.shadowRoot.querySelector("#name-input")
        this.createButton = this.shadowRoot.querySelector("#create-button")

        this.modalElem.addEventListener("shown.bs.modal", () => this.nameInput.select())
    }

    render() {
        return html`
            <div class="modal fade" tabindex="-1" role="dialog" aria-hidden="true">
              <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="exampleModalLabel">Create new workspace</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>

                    <div class="modal-body">
                        <form>
                            <div class="form-floating mb-3">
                                <input type="text" aria-label="Workspace name" id="name-input" class="form-control" @input=${this.nameChangedHandler} >
                                <label for="name-input">Workspace name</label>
                            </div>
                            <div class="input-group mb-3">
                                <span class="input-group-text"><i class="bi-folder"></i></span>
                                <input type="text" disabled aria-label="Saving location" id="location-input" class="form-control">
                                <button class="btn btn-outline-secondary" type="button" @click=${this.chooseLocationButtonHandler}>Choose location...</button>
                            </div>
                        </form>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="create-button" @click=${this.createButtonHandler}>Create repository</button>
                    </div>
                </div>
              </div>
            </div>`
    }
}

export const createWorkspaceDialog = document.querySelector("create-workspace-dialog") as CreateWorkspaceDialog
