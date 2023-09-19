// electron-builder hook to copy the JRE into the output path before packaging

const path = require('path')
const fs = require('fs-extra')

exports.default = async function (context) {
    if (context.electronPlatformName === "darwin") {
        const appName = context.packager.appInfo.productFilename
        const appDir = path.join(context.appOutDir, `${appName}.app`)
        const targetDir = path.join(appDir, "Contents", "Resources", "java")
        fs.mkdirSync(targetDir, {recursive: true})

        const source = path.join(__dirname, `../vendor/java/mac/universal`)
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