import path from "path";
import {fileURLToPath} from "url";
import { writeFile, readFile } from "fs/promises"
import fs from "fs";
import crypto from "crypto";
import os from "os"
import {execSync} from "child_process";
import {runCommand} from "../common/common.mjs";
import yauzl from "yauzl"
import minimist from "minimist"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const jreVersionFile = path.join(__dirname, "../../jre-version.json")
const vendorDir = path.join(__dirname, "../../vendor/java")

function clean() {
    const entries = fs.readdirSync(vendorDir)
    entries
        .filter(entry => entry !== ".keep")
        .forEach(entry => fs.rmSync(path.join(vendorDir, entry), {recursive: true}))
}

function downloadFile(url, targetPath) {
    console.log(`Downloading ${url} -> ${targetPath}`)

    return fetch(url)
        .then(response => response.arrayBuffer())
        .then(buffer => writeFile(targetPath, Buffer.from(buffer)))
}

function generateChecksum(path) {
    const shaSum = crypto.createHash("sha256")
    return new Promise(resolve => {
        const stream = new fs.ReadStream(path)
        stream.on("data", data => shaSum.update(data))
        stream.on("end", () => resolve(shaSum.digest("hex")))
    })
}

function extractJreZip(zipFilePath, destDir) {
   return new Promise(((resolve, reject) => {
       let jreRootDir

       yauzl.open(zipFilePath, { autoClose: true, lazyEntries: true },  (err, zipfile) => {
           if (err || !zipfile) {
               reject(err)
               return
           }

           zipfile.readEntry()

           zipfile.on("error", err => {
               reject(err)
           })

           zipfile.once("end", () => resolve())

           zipfile.on("entry", entry => {
               if (!jreRootDir) {
                   jreRootDir = entry.fileName.split(path.delimiter)[0]
               }

               const extractPath = path.join(destDir, entry.fileName.substring(jreRootDir.length))
               if (/\/$/.test(entry.fileName)) {
                   // is directory
                   fs.mkdirSync(extractPath, { recursive: true})
                   zipfile.readEntry()
               } else {
                   const writeStream = fs.createWriteStream(extractPath)
                   writeStream.on("error", err => reject(err))
                   zipfile.openReadStream(entry, (err, readStream) => {
                       readStream.on("end", () => {
                           zipfile.readEntry()
                       })
                       readStream.pipe(writeStream)
                   })
               }
           })
       })
   }))
}

async function getJreReleaseInfo(version) {
    const releaseInfoFileName = `jre_${version}.release_info.json`
    const localReleaseInfoFile = path.join(vendorDir, releaseInfoFileName)
    if (!fs.existsSync(localReleaseInfoFile)) {
        console.log(`Get release info from Adoptium for JRE ${version}`)
        await downloadFile(`https://api.adoptium.net/v3/assets/release_name/eclipse/jdk-${version}?heap_size=normal&image_type=jre&project=jdk`, localReleaseInfoFile)
    } else {
        console.log(`Found existing release info from Adoptium for JRE ${version} at ${localReleaseInfoFile}`)
    }

    const releaseInfoJson =  (await readFile(localReleaseInfoFile)).toString()
    return {
        releaseInfoFileName,
        localReleaseInfoFile,
        releaseInfo: JSON.parse(releaseInfoJson)
    }
}

async function downloadJrePackage(packageInfo) {
    const {checksum, link} = packageInfo

    const destFilePath = path.join(vendorDir, path.basename(new URL(link).pathname))

    const packageFileExists = fs.existsSync(destFilePath)
    const checksumMatches = packageFileExists && (
        await generateChecksum(destFilePath) === checksum
    )

    if (packageFileExists && checksumMatches) {
        console.log("JRE already downloaded.")
        return destFilePath
    }

    await downloadFile(link, destFilePath)
    const downloadedFileChecksum = await generateChecksum(destFilePath)

    if (downloadedFileChecksum !== checksum) {
        throw new Error("Checksum does not match")
    }

    return destFilePath
}

function getTargetDir(os, arch) {
    return path.join(vendorDir, os === "windows" ? "win" : os, arch === "aarch64" ? "arm64" : arch)
}

async function getJre(version, os, arch) {
    console.log(`Get JRE for: ${os}`)

    const {releaseInfo, releaseInfoFileName, localReleaseInfoFile} = await getJreReleaseInfo(version)

    const binaryInfo = releaseInfo["binaries"]
        .find(({architecture, os: _os}) => architecture === arch && os === _os)
    const packageInfo = binaryInfo["package"]

    const packageFilePath = await downloadJrePackage(packageInfo)

    const extractDir = getTargetDir(os, arch)
    const isAlreadyExtracted = fs.existsSync(path.join(extractDir, releaseInfoFileName))

    if (isAlreadyExtracted) {
        console.log(`JRE for ${os} already extracted`)
        return Promise.resolve()
    }


    let extractSuccess = false
    fs.mkdirSync(extractDir, {recursive: true})
    if (packageFilePath.endsWith(".zip")) {
        await extractJreZip(packageFilePath, extractDir)
        extractSuccess = true // TODO handle fail
    } else if (packageFilePath.endsWith(".tar.gz")) {
        const stripComponents = os === "mac" ? "3" : "1"
        const tarParams = ["xfz", packageFilePath, "-C", extractDir, "--keep-newer-files", `--strip-components=${stripComponents}`]
        if (os === "mac") {
            tarParams.push("./*/Contents/Home")
        }
        const tarCmd = await runCommand("tar", tarParams)
        extractSuccess = tarCmd && !tarCmd.failed
    }

    if (!extractSuccess) {
        throw new Error(`Could not extract ${packageFilePath}.`)
    }

    fs.copyFileSync(localReleaseInfoFile, path.join(extractDir, path.basename(localReleaseInfoFile)))
    return Promise.resolve()
}

function traverseDir(dir, callback) {
    const files = fs.readdirSync(dir)
    files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath)
        if (stats.isDirectory()) {
            traverseDir(filePath, callback)
        } else if (stats.isFile()) {
            callback(filePath)
        }
    });
}

function createUniversalBinary(x64File, arm64File, universalFile) {
    const lipoCommand = `lipo -create "${x64File}" "${arm64File}" -output "${universalFile}"`
    console.log(`Executing: ${lipoCommand}`)
    execSync(lipoCommand)
}

function isMachExecutable(filePath) {
    const fileOutput = execSync(`file -b "${filePath}"`).toString();
    return fileOutput.includes("Mach-O")
}

function createMacUniversalJRE() {
    const universalPath = getTargetDir("mac", "universal")
    if (!fs.existsSync(universalPath)) {
        fs.mkdirSync(universalPath, {recursive: true})
        const x64Path = getTargetDir("mac", "x64")
        const arm64Path = getTargetDir("mac", "aarch64")

        traverseDir(x64Path, (x64File) => {
            const relativePath = path.relative(x64Path, x64File);
            const arm64File = path.join(arm64Path, relativePath);
            const universalFile = path.join(universalPath, relativePath);

            // Make sure corresponding arm64 file exists
            if (fs.existsSync(arm64File)) {

                const universalDir = path.dirname(universalFile);

                // Create directory structure in the universal JRE folder
                if (!fs.existsSync(universalDir)) {
                    fs.mkdirSync(universalDir, {recursive: true});
                }

                if (isMachExecutable(arm64File)) {
                    createUniversalBinary(x64File, arm64File, universalFile);
                } else {
                    fs.copyFileSync(x64File, universalFile)
                }
            }
        });
    }
}


const argv = minimist(process.argv)
if (argv.clean) {
    await clean()
    process.exit()
}

const jreVersions = (() => {
    try {
        return JSON.parse(fs.readFileSync(jreVersionFile).toString())
    } catch (e) {
        console.log(`Could not read JRE version file ${jreVersionFile}.`)
        throw e
    }

})()

const platforms = argv.all ? ["win32", "darwin", "linux"] : [os.platform()]
for (const platform of platforms) {
    const os =  (() => {
        switch (platform) {
            case "win32": return "windows"
            case "darwin": return "mac"
            default: return platform
        }
    })()

    const arches = platform === "darwin" ? ["x64", "aarch64"] : ["x64"]
    for (const arch of arches) {
        const version = jreVersions[os]?.[arch]?.openjdk_version

        if (!version) {
            throw new Error(`Could not find JRE version for ${os} (${arch}) in versions file (${jreVersionFile}).`)
        }
        try {
            await getJre(version, os, arch)
        } catch (e) {
            console.log(`Could not download JRE for ${os} (${arch}).`)
            throw e
        }
    }

    if (platform === "darwin") {
       try {
           createMacUniversalJRE()
       } catch (e) {
           console.log("Could not create mac universal JRE")
           throw e
       }
    }
}
