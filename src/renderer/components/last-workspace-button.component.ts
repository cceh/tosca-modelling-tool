import lastWorkspaceButtonStyles from "./last-workspace-button.component.scss"
import template from "./last-workspace-button.component.html";
import {Workspace} from "../../common/store";
import {getWorkspacePathComponents} from "./shared/util";

export class LastWorkspaceButton extends HTMLElement {
    private workspaceNameElem: HTMLElement
    private workspacePathElem: HTMLElement
    constructor() {
        super();

        this.attachShadow({mode: "open"})
        this.shadowRoot.adoptedStyleSheets = [lastWorkspaceButtonStyles]
        this.shadowRoot.innerHTML = template

        this.workspaceNameElem = this.shadowRoot.getElementById("workspace-name")
        this.workspacePathElem = this.shadowRoot.getElementById("workspace-path")
    }

    setLastWorkspace(workspace: Workspace) {
        const pathComponents = getWorkspacePathComponents(workspace)
        this.workspaceNameElem.innerText = pathComponents.name
        this.workspacePathElem.innerText = pathComponents.location
    }
}
