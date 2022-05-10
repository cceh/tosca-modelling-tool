package de.cceh.electronwinery;

import org.eclipse.jetty.server.Handler;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.handler.*;
import org.eclipse.jetty.servlet.DefaultServlet;
import org.eclipse.jetty.servlet.FilterHolder;
import org.eclipse.jetty.servlet.ServletContextHandler;
import org.eclipse.jetty.servlet.ServletHolder;
import org.eclipse.jetty.servlets.CrossOriginFilter;
import org.eclipse.winery.repository.backend.IRepository;
import org.eclipse.winery.repository.backend.RepositoryFactory;
import org.eclipse.winery.repository.backend.filebased.AbstractFileBasedRepository;
import org.eclipse.winery.repository.rest.Prefs;
import org.glassfish.jersey.servlet.ServletContainer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.DispatcherType;
import java.util.EnumSet;

public class WineryLauncher {
    private static final Logger LOGGER = LoggerFactory.getLogger(WineryLauncher.class);

    public static Server createHttpServer(int port) {
        HandlerList handlerList = new HandlerList();

        handlerList.setHandlers(new Handler[] {
                getFrontedServlet("/winery-topologymodeler", WineryLauncher.class.getClassLoader().getResource("topologymodeler").toString()),
                getFrontedServlet("/", WineryLauncher.class.getClassLoader().getResource("tosca-management").toString()),

                // https://www.eclipse.org/jetty/javadoc/jetty-9/org/eclipse/jetty/server/handler/ShutdownHandler.html
                new ShutdownHandler("winery", true, false),

                getWineryServlet()
        });

        Server server = new Server(port);

        // https://stackoverflow.com/questions/30347144/how-to-gracefully-shutdown-embeded-jetty
        StatisticsHandler statisticsHandler = new StatisticsHandler();
        statisticsHandler.setHandler(handlerList);
        server.setHandler(statisticsHandler);

        server.setStopAtShutdown(true);
        return server;
    }

    /**
     * Creates a server for the REST backend on URL localhost:8080/winery
     */
    public static Server createHttpServer() {
        return createHttpServer(Integer.getInteger("winerylauncher.port", 8080));
    }

    private static ContextHandler getFrontedServlet(String contextPath, String docRoot) {
        ResourceHandler resourceHandler = new ResourceHandler();
        resourceHandler.setResourceBase(docRoot);
        resourceHandler.setDirAllowed(true);

        ContextHandler contextHandler = new ContextHandler();
        contextHandler.setContextPath(contextPath);
        contextHandler.setHandler(resourceHandler);

        return contextHandler;
    }

    private static ServletContextHandler getWineryServlet() {
        ServletContextHandler context = new ServletContextHandler(ServletContextHandler.SESSIONS);
        context.setContextPath("/winery");


        // Add the filter, and then use the provided FilterHolder to configure it
        FilterHolder cors = context.addFilter(CrossOriginFilter.class, "/*", EnumSet.of(DispatcherType.REQUEST));
        cors.setInitParameter(CrossOriginFilter.ALLOWED_ORIGINS_PARAM, "*");
        cors.setInitParameter(CrossOriginFilter.ACCESS_CONTROL_ALLOW_ORIGIN_HEADER, "*");
        cors.setInitParameter(CrossOriginFilter.ALLOWED_METHODS_PARAM, "GET,PUT,POST,DELETE,HEAD,OPTIONS");
        cors.setInitParameter(CrossOriginFilter.ALLOWED_HEADERS_PARAM, "X-Requested-With,Content-Type,Accept,Origin");

        // this mirrors org.eclipse.winery.repository.rest\src\main\webapp\WEB-INF\web.xml
        ServletHolder h = context.addServlet(ServletContainer.class, "/*");
        h.setInitParameter("jersey.config.server.provider.packages",
                "org.eclipse.winery.repository.rest.resources," +
                        "org.eclipse.winery.repository.rest.filters");
        h.setInitParameter("jersey.config.server.provider.classnames",
                "org.glassfish.jersey.logging.LoggingFeature," +
                        "org.glassfish.jersey.media.multipart.MultiPartFeature," +
                        "org.eclipse.winery.common.json.JsonFeature"
        );

        h.setInitOrder(1);

        context.addServlet(DefaultServlet.class, "/");

        return context;
    }

    public static void main(String[] args) throws Exception {
        // Initialize repository
        new Prefs(true);

        Server server = createHttpServer();
        server.start();


        IRepository repository = RepositoryFactory.getRepository();
        if (repository instanceof AbstractFileBasedRepository) {
            LOGGER.debug("Using path " + repository.getRepositoryRoot());
        } else {
            LOGGER.debug("Repository is not filebased");
        }


        // Waits until server is finished.
        // Will never happen, thus user has to press Ctrl+C.
        // See also https://stackoverflow.com/a/14981621/873282.

//        Thread monitor = new MonitorThread();
//        monitor.start();


        server.join();
    }

//    private static class MonitorThread extends Thread {
//
//        private ServerSocket socket;
//
//        public MonitorThread() {
//            setDaemon(true);
//            setName("StopMonitor");
//            try {
//                socket = new ServerSocket(8079, 1, InetAddress.getByName("127.0.0.1"));
//            } catch(Exception e) {
//                throw new RuntimeException(e);
//            }
//        }
//
//        @Override
//        public void run() {
//            System.out.println("*** running jetty 'stop' thread");
//            Socket accept;
//            try {
//                accept = socket.accept();
//                BufferedReader reader = new BufferedReader(new InputStreamReader(accept.getInputStream()));
//                reader.readLine();
//                System.out.println("*** stopping jetty embedded server");
//                WineryLauncher.server.stop();
//                accept.close();
//                socket.close();
//            } catch(Exception e) {
//                throw new RuntimeException(e);
//            }
//        }
//    }
}
