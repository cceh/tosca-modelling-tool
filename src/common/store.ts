import ElectronStore from "electron-store";

export const SK_DEFAULT_WORKSPACE_PARENT_PATH = "defaultWorkspaceParentPath"
export const SK_KNOWN_WORKSPACES = "knownWorkspaces"

export interface Workspace {
    path: string
}

export interface Store {
    knownWorkspaces: Workspace[]
    defaultWorkspaceParentPath?: string
}

export const store = new ElectronStore<Store>()
