import {store} from "../../common/store";
import path from "path";
import styles from "../styles.scss";

export class WorkspaceList extends HTMLElement {

    private readonly workspaces = store.get("knownWorkspaces").map(workspace => {
        const pathComponents = workspace.path.split(path.sep)
        return {
            name: pathComponents.pop(),
            location: pathComponents.join(path.sep),
            path: workspace.path
        }
    })

    constructor() {
        super();

        this.attachShadow({mode: "open"})
        this.shadowRoot.adoptedStyleSheets = [styles]

        this.shadowRoot.innerHTML = `
            <div class="repository-list list-group bg-light overflow-auto" style="height: 100%">
                ${this.workspaces.map(workspace => `
                    <button
                        type="button"
                        class="list-group-item list-group-item-action"
                        data-winery-workspace-path="${workspace.path}"
                >
                        <h5>${workspace.name}</h5>
                        <div class="text-muted">${workspace.location}</div>
                    </button>
                `).join(" ")}
            </div>
        `

        this.shadowRoot
            .querySelectorAll("[data-winery-workspace-path]")
            .forEach((workspaceButton: HTMLElement) =>
                workspaceButton.addEventListener("click", () => this.handleClick(workspaceButton))
            )
    }

    handleClick(workspaceButton: HTMLElement) {
        const {wineryWorkspacePath} = workspaceButton.dataset
        window.startWinery(wineryWorkspacePath)
    }
}

