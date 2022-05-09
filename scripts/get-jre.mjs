import fetch from "node-fetch"
import path from "path";
import {fileURLToPath} from "url";
import { writeFile, readFile } from "fs/promises"
import fs from "fs";
import crypto from "crypto";
import {runCommand} from "./common/common.mjs";
import yauzl from "yauzl"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const jreVersionFile = path.join(__dirname, "../JRE_VERSION")
const vendorDir = path.join(__dirname, "../vendor/java")

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
           if (err) {
               reject(err)
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
    const localReleaseInfoFile = path.join(vendorDir, `jre_${jreVersion}.release_info.json`)
    if (!fs.existsSync(localReleaseInfoFile)) {
        console.log(`Get release info from Adoptium for JRE ${version}`)
        await downloadFile(`https://api.adoptium.net/v3/assets/release_name/eclipse/${jreVersion}?heap_size=normal&image_type=jre&project=jdk`, localReleaseInfoFile)
    } else {
        console.log(`Found existing release info from Adoptium for JRE ${version}`)
    }

    const releaseInfoJson =  (await readFile(localReleaseInfoFile)).toString()
    return JSON.parse(releaseInfoJson)
}

async function downloadJrePackage(packageInfo, destFilePath) {
    const {checksum, link} = packageInfo

    const packageFileExists = fs.existsSync(destFilePath)
    const checksumMatches = packageFileExists && (
        await generateChecksum(destFilePath) === checksum
    )

    if (packageFileExists && checksumMatches) {
        console.log("JRE already downloaded.")
        return
    }

    await downloadFile(link, destFilePath)
    const downloadedFileChecksum = await generateChecksum(destFilePath)

    if (downloadedFileChecksum !== checksum) {
        throw new Error("Checksum does not match")
    }
}

async function getJre(os) {
    const jreVersion = (await readFile(jreVersionFile)).toString().trim()
    const releaseInfo = await getJreReleaseInfo(jreVersion)

    const binaryInfo = releaseInfo["binaries"]
        .find(({architecture, os: _os}) => architecture === "x64" && os === _os)
    const packageInfo = binaryInfo["package"]

    const packageFilePath = path.join(vendorDir, path.basename(new URL(link).pathname))

    await downloadJrePackage(packageInfo, packageFilePath)

    const extractDir = path.join(vendorDir, os)
    const isAlreadyExtracted = fs.existsSync(path.join(extractDir, path.basename(localReleaseInfoFile)))

    if (isAlreadyExtracted) {
        console.log(`JRE for ${os} already extracted`)
        return
    }

    fs.mkdirSync(extractDir, {recursive: true})

    if (packageFilePath.endsWith(".zip")) {
        await extractJreZip(packageFilePath, extractDir)
    } else if (packageFilePath.endsWith(".tar.gz")) {
        await runCommand("tar", ["xfz", packageFilePath, "-C", extractDir, "--keep-newer-files", "--strip-components=1"])
    }

    fs.copyFileSync(localReleaseInfoFile, path.join(extractDir, path.basename(localReleaseInfoFile)))


}

await getJre("windows")
await getJre("linux")
await getJre("mac")
