import path from 'path';
import {app} from 'electron';
import {getPlatform} from "./get-platform";

export class PathProvider {
  private useProdPath = app?.isPackaged;

  getResourcePath(): string {
    return this.useProdPath
      ? process.resourcesPath
      : path.join(__dirname, "..", "..", "resources");
  }

  getJavaCmdPath(): string {
    return this.useProdPath
      ? path.join(this.getResourcePath(), "java", "bin", "java")
      : path.join(__dirname, "..", "..", "vendor", "java", getPlatform(), "bin", "java");
  }

  getBaseRepositoriesPath(): string {
    return this.useProdPath
      ? path.join(this.getResourcePath(), "base-repos")
      : path.join(__dirname, "..", "..", "vendor", "base-repos");
  }

  getLauncherRootPath(): string {
    return this.useProdPath
      ? path.join(this.getResourcePath(), "winery")
      : path.join(this.getResourcePath(), "..", "winery-launcher", "target");
  }

  getLauncherPath(): string {
    return path.join(this.getLauncherRootPath(), "winery-launcher.jar");
  }

  getLogbackConfigurationPathDefault(): string {
    return path.join(this.getResourcePath(), "logback.xml");
  }

  getLogbackConfigurationPathDebug(): string {
    return path.join(this.getResourcePath(), "logback-debug.xml");
  }

  getWineryYamlConfigTemplatePath(): string {
    return path.join(this.getResourcePath(), "winery.yaml");
  }
}

export const pathProvider = new PathProvider()
export default pathProvider