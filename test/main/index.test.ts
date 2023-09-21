import {NavigationUrlType, WindowManager} from "../../src/main/windowManager";
import sinon, {SinonStub} from "sinon";
import {BrowserWindow} from "electron";
import {mainWindowUrlMatcher} from "./utils";
import {expect} from "chai";

describe("IPC Event Handling", function() {
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
})