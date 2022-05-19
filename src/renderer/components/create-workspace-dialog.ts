import Modal from "bootstrap/js/dist/modal";
import styles from "../styles.scss"
import path from "path";
import electron from "electron";
import {CHOOSE_DIRECTORY} from "../../common/ipcEvents";
const style = styles

import template from "./create-workspace-dialog.html"

export class CreateWorkspaceDialog extends HTMLElement {

    private readonly modal: Modal
    private readonly modalElem: HTMLElement
    private readonly locationInput: HTMLInputElement
    private readonly nameInput: HTMLInputElement
    private readonly createButton: HTMLButtonElement
    private readonly chooseLocationButton: HTMLButtonElement

    private notifyResult: (repositoryPath: string | null) => void
    private cancelListener: () => void | null

    constructor() {
        super();

        this.attachShadow({mode: "open"})
        this.shadowRoot.adoptedStyleSheets = [style]
        this.shadowRoot.innerHTML = template

        this.modalElem = this.shadowRoot.querySelector("div") as HTMLElement
        this.modal = new Modal(this.modalElem, { backdrop: "static" })

        this.locationInput = this.shadowRoot.querySelector("#location-input")
        this.nameInput = this.shadowRoot.querySelector("#name-input")
        this.createButton = this.shadowRoot.querySelector("#create-button")
        this.chooseLocationButton = this.shadowRoot.querySelector("#choose-location-button")

        this.nameInput.addEventListener("input", () => this.nameChangedHandler())
        this.createButton.addEventListener("click", () => this.createButtonHandler())
        this.chooseLocationButton.addEventListener("click", () => this.chooseLocationButtonHandler())

        this.modalElem.addEventListener("shown.bs.modal", () => this.nameInput.select())
    }

    show(parentPath: string, name: string): Promise<string> {
        this.locationInput.value = parentPath
        this.nameInput.value = name
        this.modal.show()


        return new Promise<string>(resolve => {
            this.notifyResult = (repositoryPath => {
                resolve(repositoryPath)
                this.modalElem.removeEventListener("hidden.bs.modal", this.cancelListener)
                this.cancelListener = null
                this.notifyResult = null
            })

            this.cancelListener = () => this.notifyResult(null)
            this.modalElem.addEventListener("hidden.bs.modal", this.cancelListener)
        })
    }

    private createButtonHandler() {
        const repositoryPath = path.join(this.locationInput.value, this.nameInput.value)
        this.notifyResult(repositoryPath)
        this.modal.hide()
    }

    private async chooseLocationButtonHandler() {

        const path = await electron.ipcRenderer.invoke(CHOOSE_DIRECTORY, this.locationInput.value);
        if (path) {
            this.locationInput.value = path
        }
    }

    private nameChangedHandler() {
        setTimeout(() => this.createButton.disabled = !this.nameInput.value)
    }
}
