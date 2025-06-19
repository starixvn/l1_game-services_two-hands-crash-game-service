import { stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { logger } from "sc-common";
import { Actions } from "../../constants";
import GameData from "../../game-data";
import UmInfoWatcher from "../um-info-watcher";

jest.mock("sc-common");

const umInfoRepository = stubMongoose(mongoose.Model);
const gameData = new GameData(0);

function initUMWatcher() {
    return new UmInfoWatcher(gameData, umInfoRepository, logger);
}

describe("UmInfoWatcher", () => {
    /** @type {UmInfoWatcher}*/
    let watcher;

    beforeEach(() => {
        watcher = initUMWatcher();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe("constructor", () => {
        it("should initialize with correct dependencies", () => {
            // Assert
            expect(watcher.umInfoRepository).toBe(umInfoRepository);
            expect(watcher.gameData).toBe(gameData);
            expect(watcher.logService).toBe(logger);
        });
    });

    describe("initChangeStream", () => {
        beforeEach(() => {
            jest.clearAllMocks();

            watcher.registerEvents = jest.fn();
        });

        it("should initialize change stream with default parameters", () => {
            // Arrange
            const watchSpy = jest.spyOn(umInfoRepository, "watch");
            watchSpy.mockReturnValue({
                on: jest.fn(),
            });
            // Act
            watcher.initChangeStream();

            // Assert
            expect(watchSpy).toHaveBeenCalledWith([], {});
            expect(watcher.changeStream).toBeDefined();
        });

        it("should initialize change stream with custom parameters", () => {
            // Arrange
            const pipeline = [{ $match: { status: "active" } }];
            const options = { fullDocument: "updateLookup" };
            const watchSpy = jest.spyOn(umInfoRepository, "watch");

            // Act
            watcher.initChangeStream(pipeline, options);

            // Assert
            expect(watchSpy).toHaveBeenCalledWith(pipeline, options);
            expect(watcher.changeStream).toBeDefined();
        });
    });

    describe("registerEvents", () => {
        it("should register all event handlers", () => {
            // Arrange
            const mockChangeStream = {
                on: jest.fn(),
            };
            watcher.changeStream = mockChangeStream;

            // Act
            watcher.registerEvents();

            // Assert
            expect(mockChangeStream.on).toHaveBeenCalledWith("change", expect.any(Function));
            expect(mockChangeStream.on).toHaveBeenCalledWith("close", expect.any(Function));
            expect(mockChangeStream.on).toHaveBeenCalledWith("error", expect.any(Function));
        });
    });

    describe("handleChangeStreamChange", () => {
        describe("when operationType is insert", () => {
            describe("when partnerId has value", () => {
                it("should set isUm to true for refund players with matching partnerId", () => {
                    // Arrange
                    const data = {
                        operationType: "insert",
                        fullDocument: {
                            partnerId: "partner1",
                        },
                    };
                    const player1 = {
                        betTracks: {},
                        operatorId: "partner1",
                        isUm: false,
                    };
                    const player2 = {
                        betTracks: {},
                        operatorId: "partner2",
                        isUm: false,
                    };
                    gameData.ingame = {
                        player1,
                        player2,
                    };

                    // Act
                    watcher.handleChangeStreamChange(data);

                    // Assert
                    expect(player1.isUm).toBe(true);
                    expect(player2.isUm).toBe(false);
                });
            });

            describe("when partnerId is null", () => {
                it("should set isUm to true for all players", () => {
                    // Arrange
                    const data = {
                        operationType: "insert",
                        fullDocument: {
                            partnerId: null,
                        },
                    };
                    const player1 = {
                        betTracks: {},
                        operatorId: "partner1",
                        isUm: false,
                    };
                    const player2 = {
                        betTracks: {},
                        operatorId: "partner2",
                        isUm: false,
                    };
                    gameData.ingame = {
                        player1,
                        player2,
                    };

                    // Act
                    watcher.handleChangeStreamChange(data);

                    // Assert
                    expect(player1.isUm).toBe(true);
                    expect(player2.isUm).toBe(true);
                });
            });

            it("should not set isUm to true for players with cashout", () => {
                // Arrange
                const data = {
                    operationType: "insert",
                    fullDocument: {
                        partnerId: "partner1",
                    },
                };
                const player1 = {
                    betTracks: {
                        [Actions.CashOut]: { time: new Date() },
                    },
                    operatorId: "partner1",
                    isUm: false,
                };
                const player2 = {
                    betTracks: {},
                    operatorId: "partner1",
                    isUm: false,
                };
                gameData.ingame = {
                    player1,
                    player2,
                };

                // Act
                watcher.handleChangeStreamChange(data);

                // Assert
                expect(player1.isUm).toBe(false);
                expect(player2.isUm).toBe(true);
            });
        });

        describe("when operationType is not insert", () => {
            it("should not modify player isUm status", () => {
                // Arrange
                const data = {
                    operationType: "update",
                    fullDocument: {
                        partnerId: "partner1",
                    },
                };
                const player1 = {
                    betTracks: {},
                    operatorId: "partner1",
                    isUm: false,
                };
                gameData.ingame = {
                    player1,
                };

                // Act
                watcher.handleChangeStreamChange(data);

                // Assert
                expect(player1.isUm).toBe(false);
            });
        });
    });

    describe("handleChangeStreamError", () => {
        it("should call logger.logError with the error", () => {
            // Arrange
            const error = new Error("Stream error");

            // Act
            watcher.handleChangeStreamError(error);

            // Assert
            expect(logger.logError).toHaveBeenCalledWith(error);
        });
    });

    describe("handleChangeStreamClosed", () => {
        beforeEach(() => {
            jest.clearAllMocks();
            watcher.initChangeStream = jest.fn();
        });

        it("should reinitialize change stream after delay with resume token", () => {
            // Arrange
            const resumeToken = "test-resume-token";
            watcher.changeStream = { resumeToken };

            // Act
            watcher.handleChangeStreamClosed();
            jest.advanceTimersByTime(1000);

            // Assert
            expect(watcher.initChangeStream).toHaveBeenCalledWith([], { startAfter: resumeToken });
        });

        it("should reinitialize change stream after delay without resume token", () => {
            // Arrange
            watcher.changeStream = {};

            // Act
            watcher.handleChangeStreamClosed();
            jest.advanceTimersByTime(1000);

            // Assert
            expect(watcher.initChangeStream).toHaveBeenCalledWith([], { startAfter: undefined });
        });

        it("should not reinitialize change stream before delay", () => {
            // Arrange
            const resumeToken = "test-resume-token";
            watcher.changeStream = { resumeToken };

            // Act
            watcher.handleChangeStreamClosed();
            jest.advanceTimersByTime(500);

            // Assert
            expect(watcher.initChangeStream).not.toHaveBeenCalled();
        });
    });
});
