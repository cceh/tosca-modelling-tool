import electron from "electron";

document.addEventListener("DOMContentLoaded", () => {

    // or use contents.on('context-menu', () => console.log("MENU!"))?
    document.querySelector("body").addEventListener("contextmenu", event => {
        if (event.target instanceof HTMLElement) {
            const closestLink = event.target.closest<HTMLAnchorElement>("a[href]")
            if (closestLink) {
                electron.ipcRenderer.send("menu", closestLink.href)
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
                    electron.ipcRenderer.send("newWindow", closestLink.href)
                }
            }
        }
    })
})
