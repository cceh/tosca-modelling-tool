export interface WineryConfig {
    ui:             UI;
    repository:     Repository;
    accountability: Accountability;
}

export interface Accountability {
    "ethereum-provenance-smart-contract-address":    string;
    "ethereum-credentials-file-name":                string;
    "swarm-gateway-url":                             string;
    "geth-url":                                      string;
    "ethereum-authorization-smart-contract-address": string;
    "ethereum-password":                             string;
}

export interface Repository {
    git:            Git;
    tenantMode:     boolean;
    provider:       string;
    repositoryRoot: string;
}

export interface Git {
    password:     string;
    clientID:     string;
    autocommit:   boolean;
    clientSecret: string;
    accessToken:  string;
    tokenType:    string;
    username:     string;
}

export interface UI {
    features:  { [key: string]: boolean };
    endpoints: Endpoints;
}

export interface Endpoints {
    container:              string;
    workflowmodeler:        string;
    topologymodeler:        string;
    edmmTransformationTool: string;
    repositoryApiUrl:       string;
    repositoryUiUrl:        string;
}
