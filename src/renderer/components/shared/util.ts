import {Workspace} from "../../../common/store";
import path from "path";

export function getWorkspacePathComponents(workspace: Workspace) {
    const pathComponents = workspace.path.split(path.sep)
    return {
        name: pathComponents.pop(),
        location: pathComponents.join(path.sep),
        path: workspace.path
    }
}
