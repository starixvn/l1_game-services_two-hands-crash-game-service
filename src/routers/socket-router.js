import { Routers } from "sc-game-base/src/core";

export default class SocketRouter extends Routers.BaseSocketRouter {
    constructor({
        definition,
        gameData,
        userSignInConsumer,
        inGameConsumer,
        placeBetConsumer,
        userDisconnectConsumer,
        userSignInPublisher,
        historyQuery,
        logService,
        playGamePermissionValidator,
        cashOutConsumer,
        roundQuery,
    }) {
        super({
            definition,
            gameData,
            userSignInConsumer,
            inGameConsumer,
            placeBetConsumer,
            userDisconnectConsumer,
            userSignInPublisher,
            historyQuery,
            logService,
            playGamePermissionValidator,
            roundQuery,
        });

        this.cashOutConsumer = cashOutConsumer;
    }

    init(socketClient) {
        super.init(socketClient);

        this.socketClient.on("cashOut", this.handleCashOut.bind(this));
    }

    handleCashOut(payload) {
        try {
            if (!this.verify()) {
                return;
            }

            this.cashOutConsumer.consume(this.gameData.realPlayers[this.socketClient.id], payload);
        } catch (error) {
            this.logService.logError(error);
        }
    }

    async handleGetHistory(payload) {
        try {
            if (!this.verify()) {
                return;
            }

            const responseKey = payload.responseKey ?? "history";

            const history = await this.historyQuery.queryHistory(
                this.gameData.realPlayers[this.socketClient.id],
                payload.page,
                payload.pageSize ?? this.definition.historyPageSize
            );

            this.socketClient.emit(this.definition.name, { [responseKey]: history.history });
        } catch (error) {
            this.logService.logError(error);
        }
    }
}
