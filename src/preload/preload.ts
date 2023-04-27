import electron from "electron";
import {SHOW_LINK_CONTEXT_MENU, OPEN_NEW_WINDOW} from "../common/ipcEvents";

document.addEventListener("DOMContentLoaded", () => {

    // or use contents.on('context-menu', () => console.log("MENU!"))?
    document.querySelector("body").addEventListener("contextmenu", event => {
        if (event.target instanceof HTMLElement) {
            const closestLink = event.target.closest<HTMLAnchorElement>("a[href]")
            if (closestLink) {
                electron.ipcRenderer.send(SHOW_LINK_CONTEXT_MENU, closestLink.href)
            }
        }
    })

    document.querySelector("body").addEventListener("click", event => {
        if (event.target instanceof HTMLElement) {
            const closestLink = event.target.closest<HTMLAnchorElement>("a[href]")
            if (closestLink) {
                // TODO: adapt for Windows (and Linux?)
                if (event.shiftKey) {
                    event.preventDefault()
                    electron.ipcRenderer.send(OPEN_NEW_WINDOW, closestLink.href)
                }
            }
        }
    })
})
