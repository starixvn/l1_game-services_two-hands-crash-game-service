export default {
    hostingPort: 5000,
    apiSettings: {
        enabledApi: true,
        apiUrl: "http://sp_hd_game_api_sit:5000",
        authUrl: "http://sp_hd_auth_api_sit:5000",
        client: {
            id: "game-server",
            secret: "gameserver@20luminet&",
        },
        useAuthenticate: true,
        requestTimeout: 10000,
        enabledApiLogs: true,
    },
    authenticateSettings: {
        url: "http://sp_hd_auth_api_sit:5000",
        id: "game-services",
        secret: "gameservices@20luminet&",
        requestTimeout: 10000,
        useAuthenticate: true,
        audiences: ["api", "admin-api"],
    },
    userServiceSettings: {
        url: "http://sp_hd_user_service_sit:5000",
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
        url: "mongodb://hotdog_backend:HotdogBackend%40517@10.99.99.53:39530,10.99.99.54:39530,10.99.99.188:39530,10.99.99.187:39530/?replicaSet=SP-SIT&appName=crashgame",
        options: {
            dbName: "hotdog_minigame",
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    },
    sentry: {
        sentryUrl: "http://d039f2abe16b4252a70cdf60fff232b6@10.2.190.51:9009/282",
        logIdentifier: "HD-crashgame",
        env: "SIT",
    },
    adminSecretKey: "asWDEerfOIdgsdqRTFabvmgh",
    enableCorsWs: true,
    corsUrls: [
        "http://l1sit.sgamesuat.com",
        "https://l1sit.sgamesuat.com",
        "http://l1sitadm.sgamesuat.com",
        "https://l1sitadm.sgamesuat.com",
    ],
    metrics: {
        enable: true,
        secretKey: "6c1f0f28-70f2-46ae-b031-22624a6cd8df",
    },
    enableMsgpackParser: true,
    otel: {
        system: "SG",
        enabled: true,
        endpoint: "http://10.2.190.51:4318/v1/traces",
    },
};
