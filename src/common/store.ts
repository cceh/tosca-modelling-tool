import ElectronStore from "electron-store";

export interface Workspace {
    path: string
}

export interface Store {
    knownWorkspaces: Workspace[]
    defaultWorkspaceParentPath?: string
}

export const store = new ElectronStore<Store>()
