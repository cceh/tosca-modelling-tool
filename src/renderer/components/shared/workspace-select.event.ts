export const WORKSPACE_SELECT = "workspace-select";

interface WorkspaceSelectEventDetail {
    workspacePath: string
}

export class WorkspaceSelectEvent extends CustomEvent<WorkspaceSelectEventDetail> {
    constructor(workspacePath: string) {
        super(WORKSPACE_SELECT, {detail: {workspacePath}});
    }
}
