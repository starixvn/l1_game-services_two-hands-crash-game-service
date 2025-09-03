import { BaseSocketRouter } from "sc-game-base/src/core/routers";
import { SocketRouter } from "../";

describe("socketRouter", () => {
    const socketClient = { on: jest.fn(), id: 99999, emit: jest.fn() };
    const cashOutConsumer = { consume: jest.fn() };
    const historyQuery = { queryHistory: jest.fn() };
    const logService = { logError: jest.fn() };
    const definition = { name: "gameName", historyPageSize: 10 };

    /** @type {SocketRouter}*/
    let socketRouter;
    beforeEach(() => {
        socketRouter = new SocketRouter({ 
            cashOutConsumer,
            historyQuery,
            logService,
            definition
        });
        socketRouter.socketClient = socketClient;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("should inherit BaseSocketRouter", () => {
        expect(socketRouter instanceof BaseSocketRouter);
    });

    describe("init", () => {
        it("should call super.init", () => {
            // Arrange
            spyOn(BaseSocketRouter.prototype, "init");

            // Act
            socketRouter.init(socketClient);

            // Assert
            expect(BaseSocketRouter.prototype.init).toHaveBeenCalledWith(socketClient);
        });

        it("should register cashOut event", () => {
            // Act
            socketRouter.init(socketClient);

            // Assert
            expect(socketClient.on).toHaveBeenLastCalledWith("cashOut", expect.any(Function));
        });
    });

    describe("handleCashOut", () => {
        const payload = { amount: 123 };

        beforeEach(() => {
            socketRouter.verify = jest.fn();
        });

        it("should call verify", () => {
            // Act
            socketRouter.handleCashOut(payload);

            // Assert
            expect(socketRouter.verify).toHaveBeenCalled();
        });

        describe("when event is valid", () => {
            const gameData = {
                realPlayers: {
                    [socketClient.id]: socketClient,
                },
            };

            beforeEach(() => {
                socketRouter.gameData = gameData;
                socketRouter.verify.mockReturnValueOnce(true);
            });

            it("should call cashOutConsumer.consume", () => {
                // Act
                socketRouter.handleCashOut(payload);

                // Assert
                expect(cashOutConsumer.consume).toHaveBeenCalledWith(socketClient, payload);
            });

            it("should handle errors during cash out", () => {
                // Arrange
                const error = new Error("Cash out failed");
                cashOutConsumer.consume.mockImplementationOnce(() => {
                    throw error;
                });

                // Act
                socketRouter.handleCashOut(payload);

                // Assert
                expect(logService.logError).toHaveBeenCalledWith(error);
            });
        });

        describe("when event is invalid", () => {
            beforeEach(() => {
                socketRouter.verify.mockReturnValueOnce(false);
            });

            it("should not call cashOutConsumer.consume", () => {
                // Act
                socketRouter.handleCashOut(payload);

                // Assert
                expect(cashOutConsumer.consume).not.toHaveBeenCalled();
            });
        });
    });

    describe("handleGetHistory", () => {
        const payload = { page: 1, pageSize: 20 };
        const history = { history: [{ id: 1 }, { id: 2 }] };

        beforeEach(() => {
            socketRouter.verify = jest.fn();
            socketRouter.gameData = {
                realPlayers: {
                    [socketClient.id]: socketClient,
                },
            };
            historyQuery.queryHistory.mockResolvedValueOnce(history);
        });

        it("should call verify", async () => {
            // Act
            await socketRouter.handleGetHistory(payload);

            // Assert
            expect(socketRouter.verify).toHaveBeenCalled();
        });

        describe("when event is valid", () => {
            beforeEach(() => {
                socketRouter.verify.mockReturnValueOnce(true);
            });

            it("should query history with correct parameters", async () => {
                // Act
                await socketRouter.handleGetHistory(payload);

                // Assert
                expect(historyQuery.queryHistory).toHaveBeenCalledWith(
                    socketClient,
                    payload.page,
                    payload.pageSize
                );
            });

            it("should use default page size when not provided", async () => {
                // Arrange
                const payloadWithoutPageSize = { page: 1 };

                // Act
                await socketRouter.handleGetHistory(payloadWithoutPageSize);

                // Assert
                expect(historyQuery.queryHistory).toHaveBeenCalledWith(
                    socketClient,
                    payloadWithoutPageSize.page,
                    definition.historyPageSize
                );
            });

            it("should emit history with default response key", async () => {
                // Act
                await socketRouter.handleGetHistory(payload);

                // Assert
                expect(socketClient.emit).toHaveBeenCalledWith(
                    definition.name,
                    { history: history.history }
                );
            });

            it("should emit history with custom response key", async () => {
                // Arrange
                const payloadWithCustomKey = { ...payload, responseKey: "customKey" };

                // Act
                await socketRouter.handleGetHistory(payloadWithCustomKey);

                // Assert
                expect(socketClient.emit).toHaveBeenCalledWith(
                    definition.name,
                    { customKey: history.history }
                );
            });

        });

        describe("when event is invalid", () => {
            beforeEach(() => {
                socketRouter.verify.mockReturnValueOnce(false);
            });

            it("should not query history", async () => {
                // Act
                await socketRouter.handleGetHistory(payload);

                // Assert
                expect(historyQuery.queryHistory).not.toHaveBeenCalled();
            });

            it("should not emit history", async () => {
                // Act
                await socketRouter.handleGetHistory(payload);

                // Assert
                expect(socketClient.emit).not.toHaveBeenCalled();
            });
        });
    });
});
