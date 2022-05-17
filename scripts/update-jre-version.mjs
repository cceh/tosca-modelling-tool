import path from "path"
import fetch from "node-fetch"
import {fileURLToPath} from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url))
import semver from "semver";
import fs from "fs";
import os from "os";

const JRE_RELEASE = 11

const jreVersionFile = path.join(__dirname, "../jre-version.json")

async function getLatestJreSecurityVersion(os, arch) {
    const versionPattern = `(${JRE_RELEASE},${JRE_RELEASE + 1}]`
    try {
        const url = `https://api.adoptium.net/v3/info/release_versions?architecture=${arch}&heap_size=normal&image_type=jre&os=${os}&page=0&page_size=1&project=jdk&release_type=ga&sort_method=DEFAULT&sort_order=DESC&vendor=eclipse&version=${encodeURIComponent(versionPattern)}`
        const releaseVersionsResponse = await fetch(url)

        if (!releaseVersionsResponse.ok) {
            console.warn(`Could not get response from Adoptium API: ${url}`)
            throw new Error(`${releaseVersionsResponse.status}: ${releaseVersionsResponse.statusText}`)
        }

        const releaseVersions = await releaseVersionsResponse.json()
        return releaseVersions["versions"][0]["semver"]
    } catch (e) {
        console.warn(`Could not get latest JRE version for ${os} (${arch}).`)
        throw e
    }
}

const jreVersions = (() => {
    try {
        return JSON.parse(fs.readFileSync(jreVersionFile).toString())
    } catch (e) {
        console.warn(`Could not read JRE version file ${jreVersionFile}.`)
        throw e
    }

})()

const jreVersionsJson = JSON.stringify(jreVersions,null, 2)
const updatedJreVersions = JSON.parse(jreVersionsJson)

const updatedVersions = new Set()
for (const os of Object.keys(jreVersions)) {
    for (const arch of Object.keys(jreVersions[os])) {
        const latest = await getLatestJreSecurityVersion(os, arch)
        const current = jreVersions[os][arch]
        const currentSemver = semver.parse(current)
        if (!currentSemver) {
            console.warn(`Invalid or empty version for ${os} (${arch}): ${current}. Assuming outdated.`)
        }
        if (currentSemver == null || semver.patch(latest) > currentSemver.patch) {
            console.warn(`JRE update available for ${os} (${arch}): ${latest}`)
            updatedVersions.add(latest)
            updatedJreVersions[os][arch] = latest
        } else {
            console.warn(`JRE for ${os} (${arch}) up to date (${current}).`)
        }
    }
}

if (updatedVersions.size > 0) {
    console.warn("JRE versions updated.")
    fs.writeFileSync(jreVersionFile, JSON.stringify(updatedJreVersions, null, 2) + os.EOL)
    console.log(Array.from(updatedVersions.values()).join(", "))
}
