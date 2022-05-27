package de.cceh.electronwinery;

import org.eclipse.jetty.server.Handler;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.handler.*;
import org.eclipse.jetty.servlet.DefaultServlet;
import org.eclipse.jetty.servlet.FilterHolder;
import org.eclipse.jetty.servlet.ServletContextHandler;
import org.eclipse.jetty.servlet.ServletHolder;
import org.eclipse.jetty.servlets.CrossOriginFilter;
import org.eclipse.jetty.websocket.jsr356.server.deploy.WebSocketServerContainerInitializer;
import org.eclipse.winery.repository.backend.IRepository;
import org.eclipse.winery.repository.backend.RepositoryFactory;
import org.eclipse.winery.repository.rest.Prefs;
import org.eclipse.winery.repository.rest.websockets.AbstractWebSocket;
import org.glassfish.jersey.servlet.ServletContainer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;

import javax.servlet.DispatcherType;
import javax.websocket.server.ServerEndpoint;
import javax.websocket.server.ServerEndpointConfig;
import java.text.MessageFormat;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;

public class WineryLauncher {
    private static final Logger LOGGER = LoggerFactory.getLogger(WineryLauncher.class);

    /**
     * Creates a ContextHandler for serving a winery frontend app.
     *
     * The Winery frontends are, while packaged as a WAR originally, just a collection of files without a
     * WEB-INF directory that can be served statically without any overhead from a WebAppContext.
     *
     * @param contextPath The path under which the frontend will be available.
     * @param docRoot The path to the static resources for the frontend.
     * @return The ContextHandler created for the frontend.
     */
    private static ContextHandler createFrontedServlet(String contextPath, String docRoot) {

        // The ResourceHandler serves static resources from a docRoot.
        ResourceHandler resourceHandler = new ResourceHandler();
        resourceHandler.setResourceBase(docRoot);
        resourceHandler.setDirAllowed(true);

        // The ContextHandler makes the resources served by the ResourceHandler
        // available under the contextPath
        ContextHandler contextHandler = new ContextHandler();
        contextHandler.setContextPath(contextPath);
        contextHandler.setHandler(resourceHandler);

        return contextHandler;
    }

    /**
     * Scans the package org.eclipse.winery.repository.rest.websockets for classes with a @ServerEndpoint
     * annotation which designates a websocket endpoint
     *
     * @return Set of found Winery websocket classes
     * @throws ClassNotFoundException
     */
    private static Set<Class<?>> getWineryWebsocketEndpointClasses() {
        ClassPathScanningCandidateComponentProvider provider = new ClassPathScanningCandidateComponentProvider(false);
        provider.addIncludeFilter(new AssignableTypeFilter(AbstractWebSocket.class));
        Set<BeanDefinition> components = provider.findCandidateComponents("org.eclipse.winery.repository.rest.websockets");

        HashSet<Class<?>> serverEndpointClasses = new HashSet();
        for (BeanDefinition component : components)
        {
            try {
                Class<?> serverEndpointClass = Class.forName(component.getBeanClassName());
                serverEndpointClasses.add(serverEndpointClass);
            } catch (ClassNotFoundException e) {
                e.printStackTrace();
            }
        }

        return serverEndpointClasses;
    }

    // Jetty does not pick up web socket classes annotated with @ServerEndpoint(path) without using a WAR /
    // WebAppContext, but we can't use the built Winery WAR because its web.xml has a dependency on the
    // Tomcat CORS filter. So we scan for these classes and configure the endpoints manually.
    private static void addWebsocketEndpoints(ServletContextHandler context) {

        Set<Class<?>> websocketClasses = getWineryWebsocketEndpointClasses();

        WebSocketServerContainerInitializer.configure(context, (servletContext, serverContainer) -> {

            // Add each websocket class that has been found.
            for (Class<?> websocketClass : websocketClasses)
            {
                ServerEndpoint serverEndpointAnnotation = websocketClass.getAnnotation(ServerEndpoint.class);

                // The argument of the @ServerEndpoint annotation ist the endpoint path, e.g.
                // @ServerEndpoint("/checkconsistency"), and can be retrieved using the annotation's
                // value() method.
                String endpointPath = serverEndpointAnnotation.value();

                ServerEndpointConfig serverEndpointConfig = ServerEndpointConfig.Builder.create(
                        websocketClass, endpointPath
                ).build();

                LOGGER.info(MessageFormat.format(
                        "Adding Winery websocket class {0} at endpoint {1}{2}",
                        websocketClass.getName(),
                        context.getContextPath(),
                        endpointPath));

                serverContainer.addEndpoint(serverEndpointConfig);
            }
        });
    }

    private static ServletContextHandler createWineryServlet() {
        ServletContextHandler context = new ServletContextHandler();
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
                        "org.eclipse.winery.repository.rest.filters"
                );
        h.setInitParameter("jersey.config.server.provider.classnames",
                "org.glassfish.jersey.logging.LoggingFeature," +
                        "org.glassfish.jersey.media.multipart.MultiPartFeature," +
                        "org.eclipse.winery.common.json.JsonFeature"
        );
        h.setInitOrder(1);
        context.addServlet(DefaultServlet.class, "/");

        addWebsocketEndpoints(context);

        // Prefs is a ServerContextListener provided by Winery that initializes the repository
        // when the context is initialized.
        // This should mirror <listener-class>org.eclipse.winery.repository.rest.Prefs</listener-class> in web.xml
        Prefs prefs = new Prefs();
        context.addEventListener(prefs);

        return context;
    }

    public static Server startServer() throws Exception {
        int port = Integer.getInteger("winerylauncher.port", 8080);
        return startServer(port);
    }

    public static Server startServer(int port) throws Exception {
        Server server = new Server(port);

        HandlerList handlerList = new HandlerList();
        handlerList.setHandlers(new Handler[] {
                createFrontedServlet("/winery-topologymodeler", WineryLauncher.class.getClassLoader().getResource("topologymodeler").toString()),
                createFrontedServlet("/", WineryLauncher.class.getClassLoader().getResource("tosca-management").toString()),

                createWineryServlet(),

                // The shutdown handler can be used to gracefully shut down the server by POSTing to the /shutdown endpoint.
                // https://www.eclipse.org/jetty/javadoc/jetty-9/org/eclipse/jetty/server/handler/ShutdownHandler.html
                new ShutdownHandler("winery", true, false),
        });

        // The statistics handler keeps track of open connections and enables to gracefully shut down the server.
        // https://stackoverflow.com/questions/30347144/how-to-gracefully-shutdown-embeded-jetty
        StatisticsHandler statisticsHandler = new StatisticsHandler();
        statisticsHandler.setHandler(handlerList);
        server.setHandler(statisticsHandler);
        server.setStopAtShutdown(true);

        server.start();

        IRepository repository = getWineryRepository();
        LOGGER.info("Winery initialized with repository root " + repository.getRepositoryRoot());

        return server;
    }

    // RepositoryFactory.getRepository() should return something after the server has started and the Prefs
    // listener has been set up in createWineryServlet()
    public static IRepository getWineryRepository() throws Exception {
        IRepository repository = RepositoryFactory.getRepository();
        if (repository == null) {
            throw new Exception("Repository has not been initialized!");
        }

        return repository;
    }

    public static void main(String[] args) throws Exception {
        startServer().join();
    }
}
