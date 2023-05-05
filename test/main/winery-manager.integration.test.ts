import {WineryManager} from "../../src/main/wineryManager";
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import {expect} from 'chai';
import * as fsextra from "fs-extra";

const getTemporaryRepositoryPath =
    () => path.join(os.tmpdir(), `test-repo-${crypto.randomBytes(6).toString('hex')}`)

describe('Winery Manager Integration Tests', () => {
    let wineryManager: WineryManager;
    let dataPath: string;
    let repositoryPath: string;
    let secondRepositoryPath: string;

    beforeEach(async () => {
        dataPath = fs.mkdtempSync(path.join(os.tmpdir(), "test-wineryManager-data-"))
        repositoryPath = getTemporaryRepositoryPath()
        secondRepositoryPath = getTemporaryRepositoryPath()
        wineryManager = new WineryManager(dataPath)
    })

    afterEach(async () => {
        await wineryManager.stop()

        fsextra.remove(dataPath)
        if (fs.existsSync(repositoryPath)) {
            await fsextra.remove(repositoryPath);
        }
        if (fs.existsSync(secondRepositoryPath)) {
            await fsextra.remove(secondRepositoryPath);
        }
    })

    it('should start and stop the Winery process', async () => {
        await wineryManager.start(repositoryPath);
        expect(wineryManager.isRunning).to.be.true;

        await wineryManager.stop();
        expect(wineryManager.isRunning).to.be.false;
    }).timeout(10000);

    it('should create the correct repository path', async () => {
        await wineryManager.start(repositoryPath);

        expect(wineryManager.isRunning).to.be.true;
        expect(fs.existsSync(repositoryPath)).to.be.true
        expect(fs.existsSync(path.join(repositoryPath, ".git"))).to.be.true
    }).timeout(10000);

    it('should be able to be started and stopped consecutively with different repository paths', async () => {
        await wineryManager.start(repositoryPath);
        expect(wineryManager.isRunning).to.be.true;
        expect(fs.existsSync(repositoryPath)).to.be.true
        await wineryManager.stop()

        await wineryManager.start(secondRepositoryPath);
        expect(wineryManager.isRunning).to.be.true;
        expect(fs.existsSync(secondRepositoryPath)).to.be.true
        await wineryManager.stop()
    }).timeout(20000);

    it('should respond to a request when running', async () => {
        if (!wineryManager.isRunning) {
            await wineryManager.start(repositoryPath);
        }
        expect(wineryManager.isRunning).to.be.true;

        const response = await fetch(wineryManager.getWineryApiUrl(wineryManager.port));
        expect(response.ok).to.be.true;
    }).timeout(10000);
})