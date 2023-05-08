import {expect} from 'chai';
import {BrowserWindow, shell} from 'electron';
import sinon, {SinonStub} from 'sinon';
import {NavigationUrlType, WindowManager} from "../../src/main/windowManager";
import {mainWindowUrlMatcher} from "./utils";
import {mainWindowUrl} from "../../src/main/resources";

type LoadURLStub = SinonStub<[string, Electron.LoadURLOptions?], Promise<void>>

describe('WindowManager', function () {
    this.timeout(20000)

    let windowManager: WindowManager;
    let urlTypeCheckerStub: SinonStub<[URL], NavigationUrlType>;

    beforeEach(() => {
        urlTypeCheckerStub = sinon.stub<[URL]>()
        windowManager = new WindowManager(urlTypeCheckerStub)

        // make sure electron does not try to load any urls during tests (which would open an error dialog)
        sinon
            .stub(BrowserWindow.prototype, 'loadURL')
            .withArgs(mainWindowUrlMatcher)
            .resolves()
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('openMainWindow', () => {
        it('should create a new main window when called for the first time', () => {
            expect(windowManager.mainWindow).to.be.null;
            windowManager.openMainWindow();
            expect(windowManager.mainWindow).to.be.instanceOf(BrowserWindow);
        });

        it('should not create a new main window when called multiple times', () => {
            windowManager.openMainWindow();
            const firstWindow = windowManager.mainWindow;
            windowManager.openMainWindow();
            const secondWindow = windowManager.mainWindow;
            expect(firstWindow).to.equal(secondWindow);
        });
    });

    describe('openWindowFor', () => {
        it('should create and load a TOSCA Manager window when called with a TOSCA Manager URL', async () => {
            const url = "about:blank"
            urlTypeCheckerStub.returns("toscaManager");

            const window = await windowManager.openWindowFor(new URL(url))

            expect((window.loadURL as LoadURLStub).calledOnceWith(url.toString())).to.be.true;
            expect(windowManager.toscaManagerWindows.length).to.equal(1)
            expect(windowManager.toscaManagerWindows).to.contain(window)
        });

        it('should create and load a new Topology Modeler window with the specified URL', async () => {
            const url = "about:blank"
            urlTypeCheckerStub.returns("topologyModeler");
            const window = await windowManager.openWindowFor(new URL(url))

            expect((window.loadURL as LoadURLStub).calledOnceWith(url.toString())).to.be.true;
            expect(windowManager.topologyModelerWindows.length).to.equal(1)
            expect(windowManager.topologyModelerWindows).to.contain(window)
        });

        it('should open external links in the user\'s web browser', async () => {
            const externalUrl = new URL('http://example.com');
            urlTypeCheckerStub.returns("external");
            const shellOpenExternalStub = sinon.stub(shell, 'openExternal')
                .withArgs(externalUrl.toString())
                .resolves()

            await windowManager.openWindowFor(externalUrl);
            expect(shellOpenExternalStub.calledOnceWith(externalUrl.toString())).to.be.true;
        });

        it('should throw an error if the specified URL is the main window URL', async () => {
            urlTypeCheckerStub.returns("mainWindow");
            try {
                await windowManager.openWindowFor(new URL(mainWindowUrl))
                expect.fail("openWindowFor should fail when trying to open the mainWindowUrl")
            } catch (e) { /* empty */ }
        });
    });

    describe('closeAllWineryWindows', () => {
        it('should close all winery windows', () => {
            const destroySpy = sinon.spy(BrowserWindow.prototype, 'destroy');

            // Open two Tosca Manager windows and one Topology Modeler window
            urlTypeCheckerStub.returns("toscaManager");
            windowManager.openWindowFor(new URL('about:blank'));
            windowManager.openWindowFor(new URL('about:blank'));

            urlTypeCheckerStub.returns("topologyModeler");
            windowManager.openWindowFor(new URL('about:blank'));

            expect(windowManager.wineryWindows.length).to.equal(3)

            windowManager.closeAllWineryWindows();
            expect(windowManager.wineryWindows).to.be.empty
        });
    });
});