// electron-builder hook to copy the JRE into the output path before packaging

const path = require('path')
const fs = require('fs-extra')

exports.default = async function (context) {
    if (context.electronPlatformName === "darwin") {
        console.log("Running afterSign hook for bundling JRE for Mac")
        const appName = context.packager.appInfo.productFilename
        const appDir = path.join(context.appOutDir, `${appName}.app`)
        const targetDir = path.join(appDir, "Contents", "Resources", "java")
        fs.mkdirSync(targetDir, {recursive: true})

        const source = path.join(__dirname, `../vendor/java/mac/universal`)
        await fs.copy(source, targetDir)
    }
};