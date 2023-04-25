import {Backend} from "../../src/main/backend";
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import {expect} from 'chai';

const getTemporaryRepositoryPath =
    () => path.join(os.tmpdir(), `test-repo-${crypto.randomBytes(6).toString('hex')}`)

describe('Backend Integration Tests', () => {
    let backend: Backend;
    let dataPath: string;
    let repositoryPath: string;
    let secondRepositoryPath: string;

    beforeEach(async () => {
        dataPath = fs.mkdtempSync(path.join(os.tmpdir(), "test-backend-data-"))
        repositoryPath = getTemporaryRepositoryPath()
        secondRepositoryPath = getTemporaryRepositoryPath()
        backend = new Backend(dataPath)
    })

    afterEach(async () => {
        await backend.stop()

        fs.rmSync(dataPath, {recursive: true, force: true})
        if (fs.existsSync(repositoryPath)) {
            fs.rmSync(repositoryPath, {recursive: true, force: true})
        }
        if (fs.existsSync(secondRepositoryPath)) {
            fs.rmSync(secondRepositoryPath, {recursive: true, force: true})
        }
    })

    it('should start and stop the backend', async () => {
        await backend.start(repositoryPath);
        expect(backend.isRunning).to.be.true;

        await backend.stop();
        expect(backend.isRunning).to.be.false;
    }).timeout(10000);

    it('should create the correct repository path', async () => {
        await backend.start(repositoryPath);

        expect(backend.isRunning).to.be.true;
        expect(fs.existsSync(repositoryPath)).to.be.true
        expect(fs.existsSync(path.join(repositoryPath, ".git"))).to.be.true
    }).timeout(10000);

    it('should be able to be started and stopped consecutively with different repository paths', async () => {
        await backend.start(repositoryPath);
        expect(backend.isRunning).to.be.true;
        expect(fs.existsSync(repositoryPath)).to.be.true
        await backend.stop()

        await backend.start(secondRepositoryPath);
        expect(backend.isRunning).to.be.true;
        expect(fs.existsSync(secondRepositoryPath)).to.be.true
        await backend.stop()
    }).timeout(20000);

    it('should respond to a request when running', async () => {
        if (!backend.isRunning) {
            await backend.start(repositoryPath);
        }
        expect(backend.isRunning).to.be.true;

        const response = await fetch(backend.getWineryUrl(backend.port));
        expect(response.ok).to.be.true;
    }).timeout(10000);
})