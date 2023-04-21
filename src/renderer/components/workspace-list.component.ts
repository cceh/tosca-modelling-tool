import {Workspace} from "../../common/store";
import workspaceListStyles from "./workspace-list.component.scss";
import template from "./workspace-list.component.html";
import {WorkspaceSelectEvent} from "./shared/workspace-select.event";
import {getWorkspacePathComponents} from "./shared/util";

export class WorkspaceList extends HTMLElement {
    private readonly listElem: HTMLElement
    constructor() {
        super();

        this.attachShadow({mode: "open"})
        this.shadowRoot.adoptedStyleSheets = [workspaceListStyles]
        this.shadowRoot.innerHTML = template
        this.classList.add("workspace-list", "card")

        this.listElem = this.shadowRoot.getElementById("list")
    }

    setWorkspaces(workspaces: Workspace[]) {
        const workspaceEntries = workspaces.map(getWorkspacePathComponents)

        if (workspaceEntries.length === 0) {
            this.listElem.innerHTML = ""
            return
        }

        this.listElem.innerHTML =
            workspaceEntries.map(workspace => `
               <button
                    type="button"
                    class="list-group-item list-group-item-action"
                    data-winery-workspace-path="${workspace.path}"
               >
                  <h6>${workspace.name}</h6>
                  <div class="text-muted small">${workspace.location}</div>
                    </button>
               `).join(" ")


        this.shadowRoot
            .querySelectorAll("[data-winery-workspace-path]")
            .forEach((workspaceButton: HTMLElement) =>
                workspaceButton.addEventListener("click", () => this.handleClick(workspaceButton))
            )
    }

    handleClick(workspaceButton: HTMLElement) {
        const workspacePath = workspaceButton.dataset.wineryWorkspacePath
        this.dispatchEvent(new WorkspaceSelectEvent(workspacePath))
    }
}

