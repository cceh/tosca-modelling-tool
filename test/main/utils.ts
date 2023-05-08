import {mainWindowUrl, wineryApiPath} from "../../src/main/resources";
import {createLogger, transports} from "winston";
import {PassThrough} from "stream";
import {match} from "sinon";
import path from "path";
import os from "os";
import crypto from "crypto";

export const PORT = 8000
const wineryApiUrl = new URL(wineryApiPath, `http://localhost:${PORT}`).toString()
export const wineryApiUrlMatcher = match((url: URL) => url.toString() === wineryApiUrl)
export const mainWindowUrlMatcher = match((url: URL) => url.toString() === mainWindowUrl)

// Helper function: create da test dummy logger to listen for "logged" events
export const createTestLogger = () => {
    const testTransport = new transports.Stream({stream: new PassThrough()})
    const testLogger = createLogger({
        transports: [testTransport]
    })
    return {testTransport, testLogger};
};
export const getTemporaryRepositoryPath =
    () => path.join(os.tmpdir(), `test-repo-${crypto.randomBytes(6).toString('hex')}`)