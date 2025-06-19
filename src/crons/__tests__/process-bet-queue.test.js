import Chance from "chance";
import { stub, stubMongoose } from "jest-micro-auto-stub";
import { cloneDeep } from "lodash";
import mongoose from "mongoose";
import logger from "sc-common/logger";
import { GameDefinition } from "sc-game-base/src/core";
import BaseMetrics from "sc-game-base/src/core/base-metrics";
import { ProvablyFairConsumer } from "sc-game-base/src/core/event-consumers";
import { PlaceBetPublisher } from "sc-game-base/src/core/event-publishers";
import { Actions } from "../../constants";
import { SettleCashOutConsumer } from "../../consumers";
import CrashGameData from "../../game-data";
import { calculateMultiplier } from "../../helpers/crash-point-helper";
import ProcessBetQueue from "../process-bet-queue";

const chance = new Chance();

jest.mock("../../helpers/crash-point-helper", () => ({
    calculateMultiplier: jest.fn(),
}));

describe("ProcessBetQueue", () => {
    jest.mock("sc-game-base/src/core/event-publishers");
    const roundId = chance.natural();
    const gameData = new CrashGameData(10);
    gameData.exchangeRates = {
        exId: 1,
        code: {
            USD: 1,
            VND: 0.00004405,
            IDR: 0.07099,
        },
    };

    gameData.startTime = new Date();

    gameData.gameConfigs = {
        crashConfig: {},
    };

    gameData.currencies = [
        { code: "USD", name: "USD", isTest: false, isUncountOnTotal: false },
        { code: "IND", name: "IND", isTest: true, isUncountOnTotal: false },
        { code: "VND", name: "UUS", isTest: true, isUncountOnTotal: true },
    ];
    gameData.addPlayerToBetList = jest.fn();

    const definition = new GameDefinition({
        id: 1,
        name: "game name",
        durations: {},
    });
    /** @type {PlaceBetPublisher}*/
    const placeBetPublisher = stub(PlaceBetPublisher);
    /** @type {SettleCashOutConsumer}*/
    const settleCashOutConsumer = stub(SettleCashOutConsumer);
    /** @type {ProvablyFairConsumer}*/
    const provablyFairConsumer = stub(ProvablyFairConsumer);
    /** @type {logger}*/
    const logService = stub(logger);
    /** @type {mongoose.Model}*/
    const betsRepository = {
        create: jest.fn(),
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn() }) }),
        updateOne: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn() }) }),
    };
    /** @type {mongoose.Model}*/
    const betLogsRepository = {
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn() }) }),
        create: jest.fn(),
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn() }) }),
    };

    /** @type {mongoose.Model}*/
    const userInfosRepository = stubMongoose(mongoose.Model);
    userInfosRepository.updateOne = jest.fn();

    const baseMetrics = stub(BaseMetrics);
    let player = null,
        placeBet = null;

    /** @type {ProcessBetQueue} */
    let proceedBetQueue = null;

    const payload = {
        freeBet: chance.bool(),
        amount: 100,
        action: chance.pickone(Object.values(Actions)),
        roundId: gameData.roundId,
        receivedTime: new Date(),
        time: new Date(),
        clientSeed: "9000",
        betKey: 0,
    };
    beforeEach(() => {
        const playerInGameData = {
            name: "player01",
            betTracks: { 0: { [Actions.Bet]: { amount: 100, time: new Date() }, 1: {} } },
            betQueue: [
                {
                    player: {},
                    payload: {},
                },
            ],
        };
        player = mockPlayer();
        placeBet = jest.fn();
        proceedBetQueue = initBetQueue(placeBet);

        gameData.ingame = {
            player01: cloneDeep(playerInGameData),
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    describe("dequeueBets", () => {
        beforeEach(() => {
            proceedBetQueue.proceedActions = jest.fn();
        });

        describe("when gameData.inGame is undefined", () => {
            it("should not call proceedActions", () => {
                // Arrange
                gameData.ingame = undefined;

                // Act
                proceedBetQueue.dequeueBets();

                // Assert
                expect(proceedBetQueue.proceedActions).not.toHaveBeenCalled();
            });
        });

        describe("when gameData.inGame is empty", () => {
            it("should not call proceedActions", () => {
                // Arrange
                gameData.ingame = {};

                // Act
                proceedBetQueue.dequeueBets();

                // Assert
                expect(proceedBetQueue.proceedActions).not.toHaveBeenCalled();
            });
        });

        describe("when gameData.inGame is not empty", () => {
            describe("when playerInGame.betProcessing is true", () => {
                it("should not call proceedActions", () => {
                    // Arrange
                    gameData.ingame.player01.betProcessing = true;

                    // Act
                    proceedBetQueue.dequeueBets();

                    // Assert
                    expect(proceedBetQueue.proceedActions).not.toHaveBeenCalled();
                });
            });

            describe("when playerInGame.betQueue is undefined", () => {
                it("should not call proceedActions", () => {
                    // Arrange
                    gameData.ingame.player01.betQueue = undefined;

                    // Act
                    proceedBetQueue.dequeueBets();

                    // Assert
                    expect(proceedBetQueue.proceedActions).not.toHaveBeenCalled();
                });
            });

            describe("when playerInGame.betQueue is empty", () => {
                it("should not call proceedActions", () => {
                    // Arrange
                    gameData.ingame.player01.betQueue = [];

                    // Act
                    proceedBetQueue.dequeueBets();

                    // Assert
                    expect(proceedBetQueue.proceedActions).not.toHaveBeenCalled();
                });
            });

            describe("when playerInGame.betProcessing is false and betQueue is not empty", () => {
                it("should call proceedActions", () => {
                    // Arrange
                    proceedBetQueue.proceedActions = jest.fn().mockResolvedValueOnce({});

                    // Act
                    proceedBetQueue.dequeueBets();

                    // Assert
                    expect(proceedBetQueue.proceedActions).toHaveBeenCalledWith({}, {});
                });

                it("should update playerInGame.processingBet to true", () => {
                    // Arrange
                    proceedBetQueue.proceedActions = jest.fn().mockResolvedValueOnce({});

                    // Act
                    proceedBetQueue.dequeueBets();

                    // Assert
                    expect(gameData.ingame.player01.betProcessing).toBeTruthy();
                });
            });
        });
    });

    describe("proceedActions", () => {
        beforeEach(() => {
            proceedBetQueue.proceedBet = jest.fn();
            proceedBetQueue.proceedCashOut = jest.fn();
            proceedBetQueue.proceedHalfCashOut = jest.fn();
            betLogsRepository.find().lean().exec.mockResolvedValueOnce([]);
        });

        describe("when action is bet", () => {
            it("should call proceedBet", async () => {
                // Arrange
                const betPayload = { ...payload, action: Actions.Bet };

                // Act
                await proceedBetQueue.proceedActions(player, betPayload);

                // Assert
                expect(proceedBetQueue.proceedBet).toHaveBeenCalledWith(player, betPayload);
            });
        });

        describe("when action is cashOut", () => {
            it("should call proceedCashOut", async () => {
                // Arrange
                const cashOutPayload = { ...payload, action: Actions.CashOut };

                // Act
                await proceedBetQueue.proceedActions(player, cashOutPayload);

                // Assert
                expect(proceedBetQueue.proceedCashOut).toHaveBeenCalledWith(player, cashOutPayload);
            });
        });
    });

    describe("proceedCashOut", () => {
        beforeEach(() => {
            betLogsRepository.find = jest.fn().mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValueOnce([
                        {
                            uid: "player01-uid",
                            name: "player01",
                            playerId: 1,
                            action: Actions.Bet,
                            amount: 100,
                            siteId: "123",
                            currency: "USD",
                            rate: 1,
                            operatorId: "OW",
                            betKey: 0,
                            roundId: gameData.roundId,
                        }          
                    ])
                })
            })

            betsRepository.findOne = jest.fn().mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue({
                        uid: "player01-uid",
                        name: "player01",
                        playerId: 1,
                        action: Actions.Bet,
                        amount: 100,
                        betKey: 0,
                        roundId: gameData.roundId,
                    }),
                }),
            });
        });

        it("should find current round bet", async () => {
            // Act
            await proceedBetQueue.proceedCashOut(player, payload);

            // Assert
            expect(betsRepository.findOne).toHaveBeenCalledWith({
                uid: player.UID,
                roundId: gameData.roundId,
                freeBet: payload.freeBet,
            });
        });

        describe("when NOT exist bet", () => {
            beforeEach(() => {
                proceedBetQueue.publishCashOutFailed = jest.fn();
            });
            it("should not publishCashOutFailed", async () => {
                // Act
                await proceedBetQueue.proceedCashOut(player, payload);

                // Assert
                expect(proceedBetQueue.publishCashOutFailed).not.toHaveBeenCalled();
            });
        });

        describe("when existing bet", () => {
            const bet = { receivedTime: new Date(), amount: 100, roundId: gameData.roundId, betKey: payload.betKey };
            const multiplier = chance.floating({ min: 2, max: 100 });

            beforeEach(() => {
                betsRepository.findOne().lean().exec.mockResolvedValueOnce(bet);
                calculateMultiplier.mockReturnValueOnce(multiplier);
                proceedBetQueue.isCashOutHalfAmount = jest.fn();
                proceedBetQueue.publishCashOutFailed = jest.fn();
                proceedBetQueue.getMaxWinPerRound = jest.fn();
            });

            it("should call calculateMultiplier", async () => {
                // Act
                gameData.betList[player.UID] = {};
                await proceedBetQueue.proceedCashOut(player, payload);

                // Assert
                expect(calculateMultiplier).toHaveBeenCalledWith(expect.any(Number));
            });

            describe("when multiplier = result", () => {
                it("should call publishCashOutFailed", async () => {
                    // Arrange
                    gameData.result = multiplier;

                    // Act
                    await proceedBetQueue.proceedCashOut(player, payload);

                    // Assert
                    expect(proceedBetQueue.publishCashOutFailed).toHaveBeenCalledWith(player, payload.betKey);
                });
            });

            describe("when multiplier > result", () => {
                it("should publishGameFailedBet", async () => {
                    // Arrange
                    gameData.result = chance.floating({ min: 1, max: multiplier });

                    // Act
                    await proceedBetQueue.proceedCashOut(player, payload);

                    // Assert
                    expect(proceedBetQueue.publishCashOutFailed).toHaveBeenCalledWith(player, payload.betKey);
                });
            });

            describe("when gameData.roundId NOT match bet.roundId", () => {
                it("should publishGameFailedBet", async () => {
                    // Arrange
                    gameData.result = chance.floating({ min: multiplier });
                    bet.roundId = gameData.roundId - 1;

                    // Act
                    await proceedBetQueue.proceedCashOut(player, payload);

                    // Assert
                    expect(proceedBetQueue.publishCashOutFailed).toHaveBeenCalledWith(player, payload.betKey);
                });
            });

            describe("when cashOut request is valid", () => {
                beforeEach(() => {
                    gameData.result = chance.floating({ min: multiplier });
                    proceedBetQueue.settleCashOut = jest.fn();
                    bet.roundId = gameData.roundId;
                });

                it("should NOT publishGameFailed", async () => {
                    // Act
                    await proceedBetQueue.proceedCashOut(player, bet);

                    // Assert
                    expect(proceedBetQueue.publishCashOutFailed).not.toHaveBeenCalled();
                });

                describe("when action is Cash Out", () => {
                    describe("when NOT exist CashOut bet logs", () => {
                        it("should call settleCashOut with bet amount", async () => {
                            // Act
                            await proceedBetQueue.proceedCashOut(player, { ...payload, action: Actions.CashOut });

                            // Assert
                            expect(settleCashOutConsumer.settleCashOut).toHaveBeenCalledWith(
                                player,
                                { ...payload, action: Actions.CashOut },
                                bet.amount,
                                multiplier
                            );
                        });
                    });

                    describe("when exist CashOut bet logs", () => {
                        const betLogs = [
                            {
                                uid: "player01-uid",
                                name: "player01",
                                playerId: 1,
                                action: Actions.Bet,
                                amount: 100,
                                siteId: "123",
                                currency: "USD",
                                rate: 1,
                                operatorId: "OW",
                                betKey: 0,
                                roundId: gameData.roundId,
                            },
                            {
                                uid: "player01-uid",
                                name: "player01",
                                playerId: 1,
                                action: Actions.CashOut,
                                amount: 100,
                                siteId: "123",
                                currency: "USD",
                                rate: 1,
                                operatorId: "OW",
                                betKey: 0,
                                roundId: gameData.roundId,
                            },
                        ];

                        beforeEach(() => {
                            proceedBetQueue.getCashOutBet = jest
                                .fn()
                                .mockResolvedValueOnce({ multiplier, bet, roundId, freeBet: payload.freeBet, betLogs });
                        });

                        it("should call publishCashOutFailed", async () => {
                            // Arrange

                            // Act
                            await proceedBetQueue.proceedCashOut(player, { ...payload, action: Actions.CashOut });

                            // Assert
                            expect(proceedBetQueue.publishCashOutFailed).toHaveBeenCalledWith(player, payload.betKey);
                        });
                    });
                });
            });
        });
    });

    describe("handleSuccessBet", () => {
        const player = {
                session: chance.guid(),
                profile: {
                    minBet: chance.natural(),
                    maxBet: chance.natural(),
                    name: "player",
                },
            },
            balance = {
                minBet: chance.natural(),
                maxBet: chance.natural(),
            },
            roundId = chance.natural(),
            rate = chance.floating({ min: 1 });

        beforeEach(() => {
            proceedBetQueue.calculateCurrencyRate = jest.fn().mockReturnValueOnce(rate);
            proceedBetQueue.insertBetLog = jest.fn();
            proceedBetQueue.upsertBet = jest.fn();
            proceedBetQueue.notifyPlacingBetResult = jest.fn();
            proceedBetQueue.updateUserStakeLevel = jest.fn();
        });

        it("should call calculateCurrencyRate", async () => {
            // Act
            await proceedBetQueue.handleSuccessBet(player, balance, roundId, payload);

            // Assert
            expect(proceedBetQueue.calculateCurrencyRate).toHaveBeenCalledWith(player.session);
        });

        it("should call insertBet", async () => {
            // Act
            await proceedBetQueue.handleSuccessBet(player, balance, roundId, payload);

            // Assert
            expect(proceedBetQueue.upsertBet).toHaveBeenCalledWith(player, roundId, payload, rate);
        });

        it("should call insertBetLog", async () => {
            // Act
            await proceedBetQueue.handleSuccessBet(player, balance, roundId, payload);

            // Assert
            expect(proceedBetQueue.insertBetLog).toHaveBeenCalledWith(player, roundId, payload);
        });

        it("should call notifyPlacingBetResult", async () => {
            // Act
            await proceedBetQueue.handleSuccessBet(player, balance, roundId, payload);

            // Assert
            expect(proceedBetQueue.notifyPlacingBetResult).toHaveBeenCalledWith(player, balance, payload, rate);
        });

        it("gameData should call addPlayerToBetList", async () => {
            // Act
            await proceedBetQueue.handleSuccessBet(player, balance, roundId, payload);

            // Assert
            expect(proceedBetQueue.gameData.addPlayerToBetList).toHaveBeenCalledWith(player.UID, {
                name: player.profile.name,
                amount: payload.amount,
                rate,
                autoCashOut: payload.autoCashOut,
                betKey: payload.betKey,
            });
        });

        describe("when bet is free bet", () => {
            it("should not call updateUserStakeLevel", async () => {
                // Act
                await proceedBetQueue.handleSuccessBet(player, balance, roundId, { ...payload, freeBet: true });

                // Assert
                expect(proceedBetQueue.updateUserStakeLevel).not.toHaveBeenCalled();
            });
        });

        describe("when bet is not free bet and user stake level is not updated", () => {
            it("should not call updateUserStakeLevel", async () => {
                // Arrange
                const res = {
                    minBet: player.profile.minBet,
                    maxBet: player.profile.maxBet,
                };

                // Act
                await proceedBetQueue.handleSuccessBet(player, res, roundId, { ...payload, freeBet: false });

                // Assert
                expect(proceedBetQueue.updateUserStakeLevel).not.toHaveBeenCalled();
            });
        });

        describe("when bet is not free bet and user stake level is updated", () => {
            it("should call updateUserStakeLevel", async () => {
                // Act
                await proceedBetQueue.handleSuccessBet(player, balance, roundId, { ...payload, freeBet: false });

                // Assert
                expect(proceedBetQueue.updateUserStakeLevel).toHaveBeenCalledWith(player, balance.minBet, balance.maxBet);
            });
        });
    });

    describe("upsertBet", () => {
        const mockDate = new Date();

        beforeEach(() => {
            jest.spyOn(global, "Date").mockImplementation(() => mockDate);
        });

        it("should call betsRepository.updateOne", async () => {
            // Arrange
            const rate = chance.floating({ min: 1 });

            const newBet = {
                uid: player.UID,
                name: player.profile.name,
                time: mockDate,
                freeBet: payload.freeBet,
                roundId,
                siteId: player.session.siteId,
                currency: player.session.currencyName,
                rate: rate,
                operatorId: player.session.operatorId,
                playerId: player.session.playerId,
                clientSeed: payload.clientSeed,
            };

            // Act
            await proceedBetQueue.upsertBet(player, roundId, payload, rate);

            // Assert
            expect(proceedBetQueue.betsRepository.updateOne).toHaveBeenCalledWith(
                { uid: player.UID, roundId, freeBet: payload.freeBet },
                { $inc: { totalAmount: payload.amount }, $setOnInsert: newBet },
                { upsert: true, setDefaultsOnInsert: true }
            );
        });
    });

    describe("insertBetLog", () => {
        const mockDate = new Date();
        const roundId = chance.natural();
        const rate = chance.floating({ min: 1 });

        beforeEach(() => {
            jest.spyOn(global, "Date").mockImplementation(() => mockDate);
            proceedBetQueue.calculateCurrencyRate = jest.fn().mockReturnValue(rate);
            betLogsRepository.create = jest.fn();
        });

        it("should call betLogsRepository.create with correct bet log data", async () => {
            // Arrange
            const betPayload = {
                ...payload,
                action: Actions.Bet,
                winAmount: 200,
                clientSendTime: new Date(),
                autoCashOut: 2.5,
            };

            const expectedBetLog = {
                uid: player.UID,
                name: player.profile.name,
                time: mockDate,
                action: betPayload.action,
                amount: betPayload.amount,
                winAmount: betPayload.winAmount,
                freeBet: betPayload.freeBet,
                clientSendTime: betPayload.clientSendTime,
                receivedTime: betPayload.receivedTime,
                betKey: betPayload.betKey,
                autoCashOut: betPayload.autoCashOut,
                clientSeed: betPayload.clientSeed,
                roundId,
                siteId: player.session.siteId,
                currency: player.session.currencyName,
                rate: rate,
                operatorId: player.session.operatorId,
                playerId: player.session.playerId,
            };

            // Act
            await proceedBetQueue.insertBetLog(player, roundId, betPayload);

            // Assert
            expect(betLogsRepository.create).toHaveBeenCalledWith(expectedBetLog);
        });

        it("should call calculateCurrencyRate with player session", async () => {
            // Arrange
            const betPayload = { ...payload, action: Actions.Bet };

            // Act
            await proceedBetQueue.insertBetLog(player, roundId, betPayload);

            // Assert
            expect(proceedBetQueue.calculateCurrencyRate).toHaveBeenCalledWith(player.session);
        });

        describe("when player has session data", () => {
            it("should include session data in bet log", async () => {
                // Arrange
                const betPayload = { ...payload, action: Actions.Bet };

                // Act
                await proceedBetQueue.insertBetLog(player, roundId, betPayload);

                // Assert
                expect(betLogsRepository.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        siteId: player.session.siteId,
                        currency: player.session.currencyName,
                        rate: rate,
                        operatorId: player.session.operatorId,
                        playerId: player.session.playerId,
                    })
                );
            });
        });

        describe("when player has no session data", () => {
            it("should not include session data in bet log", async () => {
                // Arrange
                const playerWithoutSession = { ...player };
                delete playerWithoutSession.session;
                const betPayload = { ...payload, action: Actions.Bet };

                // Act
                await proceedBetQueue.insertBetLog(playerWithoutSession, roundId, betPayload);

                // Assert
                expect(betLogsRepository.create).toHaveBeenCalledWith(
                    expect.not.objectContaining({
                        siteId: expect.anything(),
                        currency: expect.anything(),
                        rate: expect.anything(),
                        operatorId: expect.anything(),
                        playerId: expect.anything(),
                    })
                );
            });
        });

    });

    const initBetQueue = (placeBet) => {
        return new ProcessBetQueue({
            definition,
            gameData,
            placeBetPublisher,
            placeBet,
            logService,
            betsRepository,
            betLogsRepository,
            userInfosRepository,
            baseMetrics,
            settleCashOutConsumer,
            provablyFairConsumer,
        });
    };

    const mockPlayer = () => {
        return {
            UID: 1,
            profile: { name: "player01", minBet: 1, maxBet: 5000 },
            session: {
                userId: 1,
                playerId: 1,
                siteId: "123456",
                currencyCode: "USD",
                currencyName: "USD",
                multiplier: 1000,
                currencyGroupId: chance.guid(),
            },
            socketClient: {
                emit: jest.fn(),
            },
        };
    };
});
