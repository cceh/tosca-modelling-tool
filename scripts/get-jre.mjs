import fetch from "node-fetch"
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

const jreVersionFile = path.join(__dirname, "../JRE_VERSION")
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
        await downloadFile(`https://api.adoptium.net/v3/assets/release_name/eclipse/${version}?heap_size=normal&image_type=jre&project=jdk`, localReleaseInfoFile)
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

async function getJre(os, targetDirectoryName) {
    console.log(`Get JRE for: ${os}`)

    const jreVersion = (await readFile(jreVersionFile)).toString().trim()
    const {releaseInfo, releaseInfoFileName, localReleaseInfoFile} = await getJreReleaseInfo(jreVersion)

    const binaryInfo = releaseInfo["binaries"]
        .find(({architecture, os: _os}) => architecture === "x64" && os === _os)
    const packageInfo = binaryInfo["package"]

    const packageFilePath = await downloadJrePackage(packageInfo)

    const extractDir = path.join(vendorDir, targetDirectoryName)
    const isAlreadyExtracted = fs.existsSync(path.join(extractDir, releaseInfoFileName))

    if (isAlreadyExtracted) {
        console.log(`JRE for ${os} already extracted`)
        return
    }


    let extractSuccess = false
    fs.mkdirSync(extractDir, {recursive: true})
    if (packageFilePath.endsWith(".zip")) {
        await extractJreZip(packageFilePath, extractDir)
        extractSuccess = true // TODO handle fail
    } else if (packageFilePath.endsWith(".tar.gz")) {
        const stripComponents = os === "mac" ? "3" : "1"
        const extractSourcePath = os === "mac" ? "./*/Contents/Home" : ""
        const tarCmd = await runCommand("tar", ["xfz", packageFilePath, "-C", extractDir, "--keep-newer-files", `--strip-components=${stripComponents}`, extractSourcePath])
        extractSuccess = tarCmd && !tarCmd.failed
    }

   if (extractSuccess) {
       console.log(`JRE for ${os} extracted to ${extractDir}.`)
       fs.copyFileSync(localReleaseInfoFile, path.join(extractDir, path.basename(localReleaseInfoFile)))
       process.exit()
   }

   process.exit(1)


}

const argv = minimist(process.argv)
if (argv.clean) {
    await clean()
    process.exit()
}

const platforms = argv.all ? ["win32", "darwin", "linux"] : [os.platform()]
for (const platform of platforms) {
    switch (platform) {
        case "win32":  console.log(platform); await getJre("windows", "win"); break
        case "darwin": await getJre("mac", "mac"); break
        default: await getJre(platform, platform)
    }
}
