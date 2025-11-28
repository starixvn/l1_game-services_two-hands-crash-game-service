export default {
    hostingPort: 5000,
    apiSettings: {
        enabledApi: true,
        apiUrl: "http://sp-hd-game-api-klprod-service:5000",
        authUrl: "http://sp-hd-auth-api-klprod-service:5000",
        client: {
            id: "game-server",
            secret: "gameserver@20luminet&",
        },
        useAuthenticate: true,
        requestTimeout: 10000,
        enabledApiLogs: true,
    },
    authenticateSettings: {
        url: "http://sp-hd-auth-api-klprod-service:5000",
        id: "game-services",
        secret: "gameservices@20luminet&",
        requestTimeout: 10000,
        useAuthenticate: true,
        audiences: ["api", "admin-api"],
    },
    userServiceSettings: {
        url: "http://sp-hd-user-service-klprod-service:5000",
    },
    socketOptions: {
        pingInterval: 60 * 1000,
        pingTimeout: 60 * 1000,
        transports: ["websocket"],
        allowUpgrades: false,
        perMessageDeflate: false,
    },
    enabledLogs: true,
    database: {
        url: "mongodb://hotdog_backend:%3FD%60XWko0ZI99Y2PQ%5Eu%2E9LV%2BYv%2Emj6rhH@10.146.34.26:39510,10.146.34.27:39510,10.146.34.30:39510,10.146.34.28:39510/?replicaSet=SP-Main&appName=crashgame",
        options: {
            dbName: "hotdog_minigame",
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    },
    sentry: {
        sentryUrl: "http://f4980024f65945179a125e7ce17286d0@sentry-scklprod-ovs.ops-klprod.gamora.prod/178",
        logIdentifier: "HD-crashgame",
        env: "PROD",
    },
    adminSecretKey: "asWDEerfOIdgsdqRTFabvmgh",
    metrics: {
        enable: true,
        secretKey: "30d15293-c7de-4c77-9293-b85d6c5bfe1a",
    },
    enableMsgpackParser: true,
    otel: {
        system: "HD",
        enabled: true,
        endpoint: "http://jaeger-collector-sc.ops-klprod.gamora.prod:32318/v1/traces",
    },
    prefixServiceName: "hd",
};
