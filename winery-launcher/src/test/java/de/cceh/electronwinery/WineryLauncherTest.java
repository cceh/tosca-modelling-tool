package de.cceh.electronwinery;

import com.ginsberg.junit.exit.ExpectSystemExit;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.eclipse.winery.repository.backend.IRepository;
import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class WineryLauncherTest {

    Server server;

    @BeforeEach
    void setUp(final TestInfo info) throws Exception {
        final Set<String> testTags = info.getTags();
        if (testTags.stream().anyMatch(tag -> tag.equals("skipServerStart"))) {
            return;
        }

        server = WineryLauncher.startServer(8888);
    }

    @Test
    @DisplayName("Test if the Winery repository has been initialized after starting the server.")
    public void afterWineryServerIsStarted_repositoryShouldBeInitialized() throws Exception {
        IRepository repository = WineryLauncher.getWineryRepository();
        assertNotNull(repository);
    }

    @Test
    @DisplayName("Test if the server shuts down and exits the JVM when the shutdown POST request is made.")
    @ExpectSystemExit
    public void afterShutdownPostRequestMade_serverShouldShutDownAndExitJvm() throws IOException, InterruptedException {
        URL url = new URL("http://localhost:8888/shutdown?token=winery");
        HttpURLConnection con = (HttpURLConnection)url.openConnection();
        con.setRequestMethod("POST");
        con.connect();
        con.getInputStream().close();

        // give jetty time to shut down
        Thread.sleep(2000);
    }

    @Test
    @DisplayName("Test if the launcher respects the winerylaucher.port system property to set the server port.")
    @Tag("skipServerStart")
    public void afterSettingPortSystemProperty_serverShouldListenOnThatPort() throws Exception {
        System.setProperty("winerylauncher.port", "8765");
        Server server = WineryLauncher.startServer();
        int port = ((ServerConnector)server.getConnectors()[0]).getLocalPort();
        assertEquals(8765, port, "The jetty server is not listening on the port set by the system property winerylauncher.port.");
    }

    @ParameterizedTest
    @DisplayName("Test if the HTTP endpoints are correctly set up.")
    // will run the test for each comma separated tuple of "<endpoint>,<description>,<expected page title>"
    @CsvSource({
            "/winery/,Winery backend,",
            "/winery-topologymodeler/, Winery Topology Modeler frontend,Winery: Topologymodeler",
            "/,Tosca Management Frontend,Winery Repository"
    })
    public void afterWineryServerIsStarted_httpEndpointsShouldBeCorrectlySetUp(String endpoint, String description, String expectedPageTitle) throws IOException {
        Connection con = Jsoup.connect("http://localhost:8888" + endpoint);
        assertEquals(200, con.execute().statusCode(), "The " + description + " is not available at endpoint " + endpoint + ".");

        String expectedTitle = expectedPageTitle == null ? "" : expectedPageTitle;
        assertEquals(expectedTitle, con.get().title(), "Unexpected document title at " + description + " endpoint " + endpoint + ".");
    }

    @ParameterizedTest
    @DisplayName("Test if the Winery websockets defined in org.eclipse.winery.repository.rest.websockets are correctly set up.")
    @ValueSource(strings = {"/git", "/refineInstanceModel", "/refinetopology", "/checkconsistency"})
    public void afterWineryServerIsStarted_websocketsShouldBeCorrectlySetUp(String endpoint) {
        assertDoesNotThrow(() -> {
            URI uri = URI.create("ws://localhost:8888/winery" + endpoint);
            HttpClient httpClient = HttpClient.newHttpClient();
            WebSocket.Builder webSocketBuilder = httpClient.newWebSocketBuilder();
            webSocketBuilder.buildAsync(uri, new WebSocket.Listener() {
                @Override
                public void onOpen(WebSocket webSocket) {
                    WebSocket.Listener.super.onOpen(webSocket);
                }
            }).get();
        }, "Winery Websocket for endpoint /winery" + endpoint + " has not been correctly set up.");
    }

    @AfterEach
    void tearDown() throws Exception {
        if (server != null) {
            server.stop();
        }
    }
}
