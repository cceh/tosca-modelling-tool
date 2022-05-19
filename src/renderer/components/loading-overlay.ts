import Modal from "bootstrap/js/dist/modal";
import styles from "../styles.scss"
import {EventEmitter} from "events";

const style = styles

export class LoadingOverlay extends HTMLElement {

    private readonly modal: Modal

    private readonly modalElem: HTMLElement
    private readonly textElem: HTMLSpanElement

    readonly events = new EventEmitter()

    private _status: "showing" | "shown" | "hiding" | "hidden" = "hidden"
    get status() { return this._status }

    constructor() {
        super();

        this.attachShadow({mode: "open"})
        this.shadowRoot.adoptedStyleSheets = [style]

        this.shadowRoot.innerHTML = `
            <div class="modal" tabindex="-1" role="dialog" aria-hidden="true">
              <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                   <div class="modal-body d-flex gap-3 align-items-center">
                       <span class="spinner-border text-primary" role="status"></span>
                       <span id="modalText"></span>
                   </div>
                </div>
              </div>
            </div>`

        this.modalElem = this.shadowRoot.querySelector("div")
        this.textElem = this.shadowRoot.querySelector("#modalText")

        this.modal = new Modal(this.modalElem, { backdrop: "static", keyboard: false})

        this.modalElem.addEventListener("shown.bs.modal", () => {
            this._status = "shown"
            this.events.emit("shown")
        })

        this.modalElem.addEventListener("hidden.bs.modal", () => {
            this._status = "hidden"
            this.events.emit("hidden")
        })
        this.modalElem.addEventListener("show.bs.modal", () => {
            this._status = "showing"
        })

        this.modalElem.addEventListener("hide.bs.modal", () => {
            this._status = "hidden"
        })
    }

    show(text: string, fade = true) {
        if (fade) {
            this.modalElem.classList.add("fade")
        } else {
            this.modalElem.classList.remove("fade")
        }

        this.textElem.innerText = text

        this.modal.show()
    }

    close() {
        this.modal?.hide()
    }
}
