import { utils } from "sc-common";
import { TableHttpRouter } from "sc-game-base/src/table/routers";
import HttpRouter from "../http-router";

jest.mock("sc-common");

describe("httpRouter", () => {
    const app = { post: jest.fn(), get: jest.fn() };
    const logService = { logError: jest.fn(), logWarning: jest.fn() };
    const appConfigs = {
        apiSettings: {
            authUrl: "http://localhost",
        },
        authenticateSettings: {
            audiences: ["test-audience"],
        },
    };
    const gameData = { roundId: 100 };
    /** @type {HttpRouter}*/
    let router;

    beforeEach(() => {
        router = new HttpRouter(appConfigs, gameData, {}, {}, logService);
        utils.authentication.useAuthenticate = jest.fn().mockReturnValue("auth-middleware");
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("inherit TableHttpRouter", () => {
        expect(router instanceof TableHttpRouter);
    });

    describe("init", () => {
        it("should call super.init", () => {
            // Arrange
            spyOn(TableHttpRouter.prototype, "init");

            // Act
            router.init(app);

            // Assert
            expect(TableHttpRouter.prototype.init).toHaveBeenCalledWith(app);
        });

        it("should register post api/set-result route with authentication", () => {
            // Act
            router.init(app);

            // Assert
            expect(utils.authentication.useAuthenticate).toHaveBeenCalledWith({
                authUrl: appConfigs.apiSettings.authUrl,
                audiences: appConfigs.authenticateSettings.audiences,
            });
            expect(app.post).toHaveBeenLastCalledWith(
                "/api/set-result",
                "auth-middleware",
                expect.any(Function)
            );
        });
    });

    describe("handleSetBoard", () => {
        const res = { send: jest.fn() };

        describe("when param is NOT valid", () => {
            it("should call logService.logError when params is undefined", () => {
                // Act
                router.handleSetBoard(undefined, res);

                // Assert
                expect(logService.logError).toHaveBeenCalledWith("receives a result cheating call with invalid params.");
                expect(res.send).toHaveBeenCalledWith(false);
            });

            it("should call logService.logError when params is null", () => {
                // Act
                router.handleSetBoard(null, res);

                // Assert
                expect(logService.logError).toHaveBeenCalledWith("receives a result cheating call with invalid params.");
                expect(res.send).toHaveBeenCalledWith(false);
            });

            it("should call logService.logError when result is missing", () => {
                // Act
                router.handleSetBoard({ roundId: 1 }, res);

                // Assert
                expect(logService.logError).toHaveBeenCalledWith("receives a result cheating call with invalid params.");
                expect(res.send).toHaveBeenCalledWith(false);
            });
        });

        describe("when param is valid", () => {
            const params = { result: 1, roundId: 1, name: "test-game" };

            it("should call logService.logWarning with game name", () => {
                // Act
                router.handleSetBoard(params, res);

                // Assert
                expect(logService.logWarning).toHaveBeenCalledWith(
                    `receives a result cheating call for ${params.name} with the board as ${params.result}.`
                );
            });

            it("should call logService.logWarning without game name", () => {
                // Arrange
                const paramsWithoutName = { result: 1, roundId: 1 };

                // Act
                router.handleSetBoard(paramsWithoutName, res);

                // Assert
                expect(logService.logWarning).toHaveBeenCalledWith(
                    `receives a result cheating call for undefined with the board as ${paramsWithoutName.result}.`
                );
            });

            it("should set settlementResultFromAdmin in gameData with provided roundId", () => {
                // Act
                router.handleSetBoard(params, res);

                // Assert
                expect(router.gameData.settlementResultFromAdmin).toStrictEqual({
                    result: params.result,
                    roundId: params.roundId,
                });
            });

            it("should set settlementResultFromAdmin in gameData with calculated roundId", () => {
                // Arrange
                const paramsWithoutRoundId = { result: 1 };

                // Act
                router.handleSetBoard(paramsWithoutRoundId, res);

                // Assert
                expect(router.gameData.settlementResultFromAdmin).toStrictEqual({
                    result: paramsWithoutRoundId.result,
                    roundId: gameData.roundId + 1,
                });
            });

            it("should response true on success", () => {
                // Act
                router.handleSetBoard(params, res);

                // Assert
                expect(res.send).toHaveBeenCalledWith(true);
            });
        });

        describe("error handling", () => {
            it("should handle errors during processing", () => {
                // Arrange
                const error = new Error("Processing failed");
                router.gameData = {
                    get roundId() {
                        throw error;
                    }
                };

                // Act
                router.handleSetBoard({ result: 1 }, res);

                // Assert
                expect(logService.logError).toHaveBeenCalledWith(error);
                expect(res.send).toHaveBeenCalledWith(false);
            });

            it("should handle errors during settlementResultFromAdmin assignment", () => {
                // Arrange
                const error = new Error("Assignment failed");
                Object.defineProperty(router.gameData, "settlementResultFromAdmin", {
                    set: () => { throw error; }
                });

                // Act
                router.handleSetBoard({ result: 1 }, res);

                // Assert
                expect(logService.logError).toHaveBeenCalledWith(error);
                expect(res.send).toHaveBeenCalledWith(false);
            });
        });
    });
});
