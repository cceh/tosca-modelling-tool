import * as path from "path";
import * as fs from "fs";
import {runCommand} from "./common/common.mjs";
import {fileURLToPath} from "url";

process.env.FORCE_COLOR = "1"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const winerySubmoduleDir = path.join(__dirname, "../vendor/winery")
const wineryLauncherBuildTargetDir = path.join(__dirname, "../winery-launcher/target")
const wineryLauncherJarFilename = "winery-launcher.jar"
const parentPom = path.join(__dirname, "../pom.xml").toString()


runCommand.prefix = "WINERY"

function clean() {
    console.log(`Removing Winery files in ${winerySubmoduleDir}`)
    runCommand.prefix = "CLEAN WINERY"
    return runCommand("mvn", [`-f`, parentPom, "clean", "-Dstyle.color=always"])
}

async function isWinerySubmoduleInitialized() {
    const checkWinerySubmoduleResult = await runCommand("git", ["submodule", "status", winerySubmoduleDir])
    return checkWinerySubmoduleResult.stdout.toString().startsWith(" ") && fs.existsSync(path.join(winerySubmoduleDir, "pom.xml"))
}

function isWineryLauncherBuilt() {
    return fs.existsSync(path.join(wineryLauncherBuildTargetDir, wineryLauncherJarFilename))
}

async function initializeWinerySubmodule() {
    console.log("Initializing Winery submodule...")
    try {
        return runCommand("git", ["submodule", "update", "--init", "--recursive", winerySubmoduleDir])
    } catch {
        console.error("Could not initialize Winery submodule.")
        process.exit(1)
    }
}

function buildWineryLauncher() {
    console.log("Building the winery launcher...")
    try {
        return runCommand("mvn", [
            "package",
            `--batch-mode`,
            `-f`, parentPom,
            "-Dstyle.color=always",

            // skip the Winery tests, only test the winery launcher
            "-Dtest=!%regex[org/eclipse/winery.*]",
            "-DfailIfNoTests=false",

            "-Dcheckstyle.skip",
            "-Dmaven.javadoc.skip=true",

            ...(process.argv.includes("--skip-frontends") ? ["-Pjava"] : [])
        ])
    } catch (e) {
        console.error("Could not build the winery launcher.")
        process.exit(1)
    }
}


if (process.argv.includes("--clean")) {
    await clean()
    process.exit()
}

// make sure Winery git submodule is initialized
runCommand.prefix = "GET WINERY"
if (!await isWinerySubmoduleInitialized()) {
    await initializeWinerySubmodule()
} else {
    console.log("Winery submodule already initialized.")
}

runCommand.prefix = "BUILD WINERY"
if (!isWineryLauncherBuilt()) {
    await buildWineryLauncher()
} else {
    console.log("Winery launcher already built.")
}
