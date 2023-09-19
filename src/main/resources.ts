import path from 'path';
import {app} from 'electron';
import {getArch, getPlatform} from "./get-platform";
import url from "url";

const useProdPath = app?.isPackaged;

const resourcePath = useProdPath
    ? process.resourcesPath
    : path.join(__dirname, "..", "..", "resources");

export const javaCmdPath = useProdPath
    ? path.join(resourcePath, "java", "bin", "java")
    : path.join(__dirname, "..", "..", "vendor", "java", getPlatform(), getArch(), "bin", "java");

export const baseRepositoriesPath = useProdPath
    ? path.join(resourcePath, "base-repos")
    : path.join(__dirname, "..", "..", "vendor", "base-repos");

const launcherRootPath = useProdPath
    ? path.join(resourcePath, "winery")
    : path.join(resourcePath, "..", "winery-launcher", "target");

export const launcherPath = path.join(launcherRootPath, "winery-launcher.jar");

export const logbackConfigurationPathDefault = path.join(resourcePath, "logback.xml");

export const logbackConfigurationPathDebug = path.join(resourcePath, "logback-debug.xml");

export const wineryYamlConfigTemplatePath = path.join(resourcePath, "winery.yaml");

export const mainWindowUrl = app?.isPackaged
    ? url.format({
        pathname: path.join(__dirname, './index.html'),
        protocol: 'file:',
        slashes: true
    })
    : `http://localhost:8080/`

export const wineryApiPath = "/winery"
export const toscaManagerPath = "/"
export const topologyModelerPath = "/winery-topologymodeler"