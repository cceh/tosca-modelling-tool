import path from "path";
import {fileURLToPath} from "url";
import { writeFile, readFile } from "fs/promises"
import fs from "fs";
import crypto from "crypto";
import os from "os"
import {runCommand} from "./common/common.mjs";
import yauzl from "yauzl"
import minimist from "minimist"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const jreVersionFile = path.join(__dirname, "../jre-version.json")
const vendorDir = path.join(__dirname, "../vendor/java")

function clean() {
    const entries = fs.readdirSync(vendorDir)
    entries
        .filter(entry => entry !== ".keep")
        .forEach(entry => fs.rmSync(path.join(vendorDir, entry), {recursive: true}))
}

function downloadFile(url, targetPath) {
    console.log(`Downloading ${targetPath}`)

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
        console.log(`Found existing release info from Adoptium for JRE ${version}`)
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

async function getJre(version, os, arch, targetDirectoryName) {
    console.log(`Get JRE for: ${os}`)

    const {releaseInfo, releaseInfoFileName, localReleaseInfoFile} = await getJreReleaseInfo(version)

    const binaryInfo = releaseInfo["binaries"]
        .find(({architecture, os: _os}) => architecture === "x64" && os === _os)
    const packageInfo = binaryInfo["package"]

    const packageFilePath = await downloadJrePackage(packageInfo)

    const extractDir = path.join(vendorDir, targetDirectoryName)
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

    const arch = "x64"
    const version = jreVersions[os]?.[arch]

    if (!version) {
        throw new Error(`Could not find JRE version for ${os} (${arch}) in versions file (${jreVersionFile}).`)
    }

    try {
        await getJre(version, os, arch, os === "windows" ? "win" : os)
    } catch (e) {
        console.log(`Could not download JRE for ${os} (${arch}).`)
        throw e
    }
}
