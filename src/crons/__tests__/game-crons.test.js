import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { Core } from "sc-game-base";
import { GameDefinition } from "sc-game-base/src/core";
import { BaseGameCron } from "sc-game-base/src/core/crons";
import { ProvablyFairConsumer, UnsettledRoundConsumer } from "sc-game-base/src/core/event-consumers";
import { GameStatusPublisher, RunningRoundInfoPublisher } from "sc-game-base/src/core/event-publishers";
import { SettleGameRoundConsumer } from "../../consumers/settle-game-round-consumer";
import CrashGameData from "../../game-data";
import gameSettings from "../../game-settings";
import UmInfoWatcher from "../../watchers/um-info-watcher";
import Bot from "../bot";
import GameCrons from "../game-crons";
import LiveGameCrons from "../live-game-cron";

jest.mock("sc-game-base/src/core/event-publishers");
jest.mock("../../consumers/settle-game-round-consumer");
jest.mock("../../helpers/crash-point-helper", () => ({
    calculateCrashTimeInMillisecond: jest.fn().mockReturnValue(1000),
}));
jest.mock("../../watchers/um-info-watcher");

/** @type {mongoose.Model}*/
const userInfosRepository = stubMongoose(mongoose.Model);
userInfosRepository.updateMany = jest.fn();

const { durations } = gameSettings;
const gameData = new CrashGameData(3);
const definition = new GameDefinition({ id: 1, name: "game name", durations }, jest.fn, jest.fn, jest.fn);
const bot = new Bot(gameData, definition, null, userInfosRepository);
const settleGameRoundConsumer = new SettleGameRoundConsumer({});
const runningRoundInfoPublisher = new RunningRoundInfoPublisher();
const gameStatusPublisher = new GameStatusPublisher();
const liveGameCrons = new LiveGameCrons({});
const umInfoWatcher = new UmInfoWatcher(gameData);
const unsettledRoundConsumer = stub(UnsettledRoundConsumer);
const provablyFairConsumer = stub(ProvablyFairConsumer);
/** @type {logger}*/
const logService = {
    logError: jest.fn(),
};

/** @type {mongoose.Model}*/
const gameConfigsRepository = stubMongoose(mongoose.Model);
gameConfigsRepository.updateOne = jest.fn();

/** @type {mongoose.Model}*/
const roundsRepository = stubMongoose(mongoose.Model);

/** @type {mongoose.Model}*/
const notificationRepository = stubMongoose(mongoose.Model);

/** @type {mongoose.Model}*/
const archiveRepository = stubMongoose(mongoose.Model);

/** @type {mongoose.Model}*/
const exchangeRatesRepository = stubMongoose(mongoose.Model);

/** @type {mongoose.Model}*/
const currencyGroupGamesRepository = stubMongoose(mongoose.Model);

/** @type {mongoose.Model}*/
const partnerConfigRepository = stubMongoose(mongoose.Model);

/** @type {mongoose.Model}*/
const currencyGroupRepository = stubMongoose(mongoose.Model);

/** @type {mongoose.Model}*/
const currencyRepository = stubMongoose(mongoose.Model);

/** @type {mongoose.Model}*/
const betsRepository = stubMongoose(mongoose.Model);

/** @type {mongoose.Model}*/
const betLogsRepository = stubMongoose(mongoose.Model);

const roundResultConsumer = { generateServerSeedAndPublishHash: jest.fn(), generateResult: jest.fn() };

const createBaseGameCron = function () {
    return new GameCrons({
        definition,
        gameData: { ...gameData },
        bot,
        settleGameRoundConsumer,
        gameStatusPublisher,
        runningRoundInfoPublisher,
        logService,
        gameConfigsRepository,
        roundsRepository,
        archiveRepository,
        notificationRepository,
        exchangeRatesRepository,
        currencyGroupGamesRepository,
        partnerConfigRepository,
        currencyGroupRepository,
        currencyRepository,
        roundResultConsumer,
        liveGameCrons,
        betsRepository,
        betLogsRepository,
        resultsRepository: {},
        umInfoWatcher,
        unsettledRoundConsumer,
        provablyFairConsumer,
    });
};

/** @type {GameCrons}*/
let cron;

describe("gameCrons", () => {
    beforeEach(() => {
        cron = createBaseGameCron();

        cron.checkGameStatus = jest.fn();
        cron.resetForNewRound = jest.fn();
        cron.updatePromotionOddsAndNotify = jest.fn();
        cron.isStartingTime = jest.fn();
        cron.gameData.disabled = true;
        cron.bot.reset = jest.fn();
        cron.bot.run = jest.fn();
        cron.bot.cashOut = jest.fn();
    });

    it("should inherit Core.Crons.BaseGameCron", () => {
        // Assert
        expect(cron instanceof Core.Crons.BaseGameCron);
    });

    describe("start", () => {
        beforeEach(() => {
            cron.initRoundId = jest.fn();
            cron.queryLastResult = jest.fn();
            cron.updateExchangeRates = jest.fn();
            cron.proceedUnsettledBets = jest.fn();
            cron.initResultHash = jest.fn();
            cron.getSettingForNewRound = jest.fn();
            cron.startCron = jest.fn();
            cron.bot.resetInRoomTrackings = jest.fn();
        });

        it("should call initRoundId", async () => {
            // Act
            await cron.start();

            // Assert
            expect(cron.bot.resetInRoomTrackings).toHaveBeenCalled();
        });

        it("should call super.start", async () => {
            // Arrange
            spyOn(BaseGameCron.prototype, "start");

            // Act
            await cron.start();

            // Assert
            expect(BaseGameCron.prototype.start).toHaveBeenCalled();
        });

        it("should call umInfoWatcher.initChangeStream", async () => {
            // Act
            await cron.start();

            // Assert
            expect(umInfoWatcher.initChangeStream).toHaveBeenCalled();
        });
    });

    describe("proceed", () => {
        describe("when remainingTime = wholeRound", () => {
            it("should call checkGameStatus", async () => {
                // Arrange
                cron.definition.durations = durations;
                cron.gameData.remainingTime = durations.wholeRound;

                // Act
                await cron.proceed();

                // Assert
                expect(cron.checkGameStatus).toHaveBeenCalled();
            });
        });

        describe("when game is enabled", () => {
            it("should reduce remaining time by 1", async () => {
                cron.gameData.disabled = false;
                cron.gameData.remainingTime = 123;

                // Act
                await cron.proceed();

                // Assert
                expect(cron.gameData.remainingTime).toBe(122);
            });

            it("should not reduce remaining time when game is disabled", async () => {
                cron.gameData.disabled = true;
                cron.gameData.remainingTime = 123;

                // Act
                await cron.proceed();

                // Assert
                expect(cron.gameData.remainingTime).toBe(123);
            });
        });

        describe("when starting time", () => {
            it("should call resetForNewRound", async () => {
                // Arrange
                cron.isStartingTime = jest.fn().mockReturnValueOnce(true);

                // Act
                await cron.proceed();

                // Assert
                expect(cron.resetForNewRound).toHaveBeenCalled();
            });

            it("should not call resetForNewRound when not starting time", async () => {
                // Arrange
                cron.isStartingTime = jest.fn().mockReturnValueOnce(false);

                // Act
                await cron.proceed();

                // Assert
                expect(cron.resetForNewRound).not.toHaveBeenCalled();
            });
        });

        describe("when start placeBet time", () => {
            it("should call publishStartPlacingBetStatus", async () => {
                // Arrange
                cron.gameData.remainingTime = durations.placingBets;

                // Act
                await cron.proceed();

                // Assert
                expect(cron.gameStatusPublisher.publishStartPlacingBetStatus).toHaveBeenCalled();
            });

            describe("when exist resultsRepository", () => {
                it("should call generateServerSeedAndPublishHash", async () => {
                    // Arrange
                    cron.gameData.remainingTime = durations.placingBets;

                    // Act
                    await cron.proceed();

                    // Assert
                    expect(cron.roundResultConsumer.generateServerSeedAndPublishHash).toHaveBeenCalled();
                });
            });

            describe("when lock bet time", () => {
                it("should call publishEndPlacingBetStatus", async () => {
                    // Arrange
                    cron.gameData.remainingTime = durations.lockingBet - 1;

                    // Act
                    await cron.proceed();

                    // Assert
                    expect(cron.gameStatusPublisher.publishEndPlacingBetStatus).toHaveBeenCalled();
                });
            });

            describe("when remaining time is between placing bets and live time", () => {
                it("should run bot and publish running round info", async () => {
                    // Arrange
                    cron.gameData.remainingTime = durations.placingBets - 1;
                    cron.bot = { run: jest.fn() };

                    // Act
                    await cron.proceed();

                    // Assert
                    expect(cron.bot.run).toHaveBeenCalled();
                    expect(cron.runningRoundInfoPublisher.publish).toHaveBeenCalled();
                });

                it("should not run bot when bot is null", async () => {
                    // Arrange
                    cron.gameData.remainingTime = durations.placingBets - 1;
                    cron.bot = null;

                    // Act
                    await cron.proceed();

                    // Assert
                    expect(cron.runningRoundInfoPublisher.publish).toHaveBeenCalled();
                });
            });

            describe("when remaining time is liveTime", () => {
                beforeEach(() => {
                    cron.gameData.remainingTime = -1;
                    cron.startDelaySettleRound = jest.fn();
                });

                it("should call startDelaySettleRound", async () => {
                    // Act
                    await cron.proceed();

                    // Assert
                    expect(cron.startDelaySettleRound).toHaveBeenCalled();
                });

                it("should call provablyFairConsumer.updateClientSeedFromBets", async () => {
                    // Act
                    await cron.proceed();

                    // Assert
                    expect(provablyFairConsumer.updateClientSeedFromBets).toHaveBeenCalled();
                });

                it("should call roundResultConsumer.generateResult", async () => {
                    // Act
                    await cron.proceed();

                    // Assert
                    expect(roundResultConsumer.generateResult).toHaveBeenCalled();
                });

                it("should reset settlementResultFromAdmin", async () => {
                    // Arrange
                    cron.gameData.settlementResultFromAdmin = {
                        result: 100,
                    };

                    // Act
                    await cron.proceed();

                    // Assert
                    expect(cron.gameData.settlementResultFromAdmin).toStrictEqual({});
                });

                describe("when round result > 1", () => {
                    it("should start liveGameCrons", async () => {
                        // Arrange
                        cron.liveGameCrons = { start: jest.fn() };
                        cron.gameData.result = 1.1;

                        // Act
                        await cron.proceed();

                        // Assert
                        expect(cron.liveGameCrons.start).toHaveBeenCalled();
                    });

                    it("should not start liveGameCrons when result <= 1", async () => {
                        // Arrange
                        cron.liveGameCrons = { start: jest.fn() };
                        cron.gameData.result = 1;

                        // Act
                        await cron.proceed();

                        // Assert
                        expect(cron.liveGameCrons.start).not.toHaveBeenCalled();
                    });
                });
            });
        });
    });

    describe("startDelaySettleRound", () => {
        beforeEach(() => {
            jest.useFakeTimers();
            cron.liveGameCrons.stop = jest.fn();
            cron.settleCashOutConsumer = {
                proceedAutoCashOut: jest.fn()
            };
            cron.settleGameRoundConsumer = {
                settleRound: jest.fn()
            };
            cron.gameData.result = 2;
            cron.definition.durations = durations;
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it("should sets a timeout to settle the round after the specified delay", () => {
            // Assert
            jest.spyOn(global, "setTimeout");

            // Act
            cron.startDelaySettleRound();

            // Assert
            expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
        });

        it("should set start time to current time", () => {
            // Arrange
            const mockDate = new Date();
            jest.spyOn(global, "Date").mockImplementation(() => mockDate);
            cron.gameData.startTime = undefined;

            // Act
            cron.startDelaySettleRound();

            // Assert
            expect(cron.gameData.startTime).toBe(mockDate);
        });

        it("should execute settlement sequence after timeout", async () => {
            // Act
            cron.startDelaySettleRound();
            await jest.runAllTimersAsync();

            // Assert
            expect(cron.liveGameCrons.stop).toHaveBeenCalled();
            expect(cron.settleCashOutConsumer.proceedAutoCashOut).toHaveBeenCalledWith(cron.gameData.result);
            expect(cron.gameData.remainingTime).toBe(durations.wholeRound);
            expect(cron.settleGameRoundConsumer.settleRound).toHaveBeenCalledWith(cron.gameData);
        });

        it("should handle errors during settlement", async () => {
            // Arrange
            const error = new Error("Settlement failed");
            cron.settleGameRoundConsumer.settleRound.mockRejectedValueOnce(error);

            // Act
            cron.startDelaySettleRound();
            await jest.runAllTimersAsync();

            // Assert
            expect(cron.logService.logError).toHaveBeenCalledWith(error);
        });
    });

    describe("resetForNewRound", () => {
        beforeEach(() => {
            cron.gameData.betList = {
                player1: { bet: 100 },
                player2: { bet: 200 }
            };
            cron.bot = {
                reset: jest.fn()
            };
            cron.appConfigs = {
                enabledBoostedOdds: true
            };
            cron.updatePromotionOddsAndNotify = jest.fn();
        });

        it("should call super.resetForNewRound", async () => {
            // Arrange
            spyOn(BaseGameCron.prototype, "resetForNewRound");

            // Act
            await cron.resetForNewRound();

            // Assert
            expect(BaseGameCron.prototype.resetForNewRound).toHaveBeenCalled();
        });

        it("should clear betList", async () => {
            // Act
            await cron.resetForNewRound();

            // Assert
            expect(cron.gameData.betList).toEqual({});
        });

        it("should reset bot if bot exists", async () => {
            // Act
            await cron.resetForNewRound();

            // Assert
            expect(cron.bot.reset).toHaveBeenCalled();
        });

        it("should not reset bot if bot does not exist", async () => {
            // Arrange
            cron.bot = null;

            // Act
            await cron.resetForNewRound();

            // Assert
            expect(cron.bot).toBeNull();
        });

        it("should update promotion odds when enabledBoostedOdds is true", async () => {
            // Act
            await cron.resetForNewRound();

            // Assert
            expect(cron.updatePromotionOddsAndNotify).toHaveBeenCalled();
        });

        it("should not update promotion odds when enabledBoostedOdds is false", async () => {
            // Arrange
            cron.appConfigs.enabledBoostedOdds = false;

            // Act
            await cron.resetForNewRound();

            // Assert
            expect(cron.updatePromotionOddsAndNotify).not.toHaveBeenCalled();
        });

    });
});
