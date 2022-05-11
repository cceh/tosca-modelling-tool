import Modal from "bootstrap/js/dist/modal";
import {html, LitElement} from "lit";
import { customElement, state } from "lit/decorators.js";
import styles from "./styles.scss"
import {EventEmitter} from "events";
const style = styles

@customElement("loading-modal")
class LoadingModal extends LitElement {

    // static styles = [style]
    @state() private _text: String
    @state() private _fade = true
    private modal: Modal
    private modalElem: HTMLElement

    readonly events = new EventEmitter()

    private _status: "showing" | "shown" | "hiding" | "hidden" = "hidden"

    get status() { return this._status }

    createRenderRoot() {
        const renderRoot = super.createRenderRoot()
        if (renderRoot instanceof ShadowRoot) {
            renderRoot.adoptedStyleSheets = [style]
        }
        return renderRoot
    }

    show(text: string, fade = true) {
        this._text = text
        this._fade = fade
        this.modal.show()
    }

    close() {
        console.log(this.modal)
        this.modal.hide()
    }

    firstUpdated() {
        this.modalElem = this.shadowRoot.querySelector("div") as HTMLElement
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

    render() {
        return html`
            <div class="modal${this._fade ? " fade" : ""}" tabindex="-1" role="dialog" aria-hidden="true">
              <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                   <div class="modal-body d-flex gap-3 align-items-center">
                       <span class="spinner-border text-primary" role="status"></span>
                       <span>${this._text}</span>
                       <!--div><button @click=${this.close}>close</button></div-->
                   </div>
                </div>
              </div>
            </div>`
    }
}

export const loadingModal = document.querySelector("loading-modal") as LoadingModal
