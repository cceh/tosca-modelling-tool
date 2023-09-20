// electron-builder hook to copy the JRE into the output path before packaging

const path = require('path')
const fs = require('fs-extra')

exports.default = async function (context) {
    console.log("Running afterPack hook for bundling JRE for Windows and Linux")
    if (context.electronPlatformName !== "darwin") {
        const targetDir = path.join(context.appOutDir, "resources", "java")
        fs.mkdirSync(targetDir, {recursive: true})

        const platformName = (() => {
            switch (context.electronPlatformName) {
                case "darwin":
                    return "mac"
                case "win32":
                    return "win"
                default:
                    return context.electronPlatformName
            }
        })()

        const archName = (() => {
            console.log(context.arch)
            switch (context.arch) {
                case 0:
                    return 'ia32'
                case 1:
                    return 'x64'
                case 2:
                    return 'armv7l'
                case 3:
                    return 'arm64'
                case 4:
                    return 'universal'
                default:
                    return 'unknown'
            }
        })()


        const source = path.join(__dirname, `../vendor/java`, platformName, archName)
        await fs.copy(source, targetDir)
    }

    // const appOutDir = context.appOutDir;
    // const os = context.targets[0].platform.name; // 'darwin', 'win32', or 'linux'
    // const arch = context.arch; // 'x64' or 'arm64'
    //
    // const source = path.join(__dirname, `vendor/java/${os}/${arch}`);
    // const destination = path.join(appOutDir, 'java');
    //
    // // Copy the Java JRE files
    // await fs.copy(source, destination);
};