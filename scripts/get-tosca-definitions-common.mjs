import {runCommand} from "./common/common.mjs";
import path from "path";
import {fileURLToPath} from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const toscaDefinitionsCommonSubmoduleDir = path.join(__dirname, "../vendor/base-repos/tosca-definitions-common")

console.log("Initializing Tosca Definitions Common submodule...")
try {
    runCommand("git", ["config", "core.longpaths", "true"])
    runCommand("git", ["submodule", "update", "--init", "--recursive", toscaDefinitionsCommonSubmoduleDir])
} catch {
    console.error("Could not initialize Winery submodule.")
    process.exit(1)
}
