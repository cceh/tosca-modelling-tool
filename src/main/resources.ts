import path from 'path';
import {app} from 'electron';
// @ts-ignore
import {getPlatform} from "./get-platform";
// @ts-ignore
// import {rootPath} from 'electron-root-path';

const useProdPath = app.isPackaged

export const resourcePath = useProdPath
    ? process.resourcesPath
    : path.join(__dirname, "..", "..", "resources")

export const javaCmdPath = useProdPath
    ? path.join(resourcePath, "java", "bin", "java")
    : path.join(resourcePath, "java", getPlatform(), "bin", "java")

export const launcherRootPath = useProdPath
    ? path.join(resourcePath, "winery")
    : path.join(resourcePath, "..", "launcher", "launcher", "target")

export const launcherPath = path.join(launcherRootPath, "launcher-1.0-SNAPSHOT.jar")

export const logbackConfigurationPathDefault = path.join(resourcePath, "logback.xml")
export const logbackConfigurationPathDebug = path.join(resourcePath, "logback-debug.xml")

export const wineryYamlConfigTemplatePath = path.join(resourcePath, "winery.yaml")
