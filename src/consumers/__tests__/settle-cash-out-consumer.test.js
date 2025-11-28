import Chance from "chance";
import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { Actions } from "../../constants";
import PlaceBetPublisher from "../../event-publishers/place-bet-publisher";
import GameData from "../../game-data";
import { roundFloat } from "../../helpers/number-helper";
import { SettleCashOutConsumer } from "../settle-cash-out-consumer";

const chance = new Chance();

jest.mock("../../helpers/date-helper", () => ({
    addMillisecond: jest.fn(),
}));

describe("SettleCashOutConsumer", () => {
    const gameData = new GameData();
    gameData.updatePlayerAction = jest.fn();
    gameData.gameConfigs.crashConfig = {};
    gameData.result = 1000;

    const placeBetPublisher = stub(PlaceBetPublisher);
    const logService = {
        logError: jest.fn(),
    };
    const betLogsRepository = stubMongoose(mongoose.Model);

    /**
     * @type {SettleCashOutConsumer}
     */
    let consumer;

    beforeEach(() => {
        consumer = new SettleCashOutConsumer(gameData, placeBetPublisher, logService, betLogsRepository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const UID = "uid";
    const playerName = "name01";
    const realPlayer = {
        UID,
        socketClient: {
            connected: true,
        },
        profile: {
            name: playerName,
        },
        session: {
            userId: 1,
            playerId: 1,
            siteId: "123456",
            currencyCode: "USD",
            currencyName: "USD",
            multiplier: 1000,
            currencyGroupId: chance.guid(),
        },
    };

    describe("settleCashOut", () => {
        const payload = { roundId: chance.natural(), action: chance.pickone(Object.values(Actions)), betKey: 1 };
        const amount = chance.natural({ min: 1, max: 100 });
        const multiplier = chance.floating({ min: 1, max: 999 });
        const maxWinPerRound = 200000;
        const winAmount = roundFloat(multiplier * amount);
        const reachMaxWin = winAmount === maxWinPerRound;
        const currencyRate = chance.floating({ min: 0.1, max: 1000 });

        beforeEach(() => {
            consumer.getMaxWinPerRound = jest.fn().mockReturnValueOnce(maxWinPerRound);
            consumer.insertBetLog = jest.fn();
            consumer.calculateCurrencyRate = jest.fn().mockReturnValueOnce(currencyRate);
        });

        it("should call getMaxWinPerRound", async () => {
            // Act
            await consumer.settleCashOut(realPlayer, payload, amount, multiplier);

            // Assert
            expect(consumer.getMaxWinPerRound).toHaveBeenCalledWith(realPlayer);
        });

        it("should call calculateTotalWin", async () => {
            consumer.calculateTotalWin = jest.fn();

            // Act
            await consumer.settleCashOut(realPlayer, payload, amount, multiplier);

            // Assert
            expect(consumer.calculateTotalWin).toHaveBeenCalledWith(realPlayer);
        });

        it("should call insertBetLog", async () => {
            // Arrange
            const expectBetLog = { ...payload, winAmount, multiplier, amount, reachMaxWin };

            // Act
            await consumer.settleCashOut(realPlayer, payload, amount, multiplier);

            // Assert
            expect(consumer.insertBetLog).toHaveBeenCalledWith(realPlayer, payload.roundId, expectBetLog);
        });

        it("should call calculateCurrencyRate", async () => {
            consumer.calculateCurrencyRate = jest.fn();

            // Act
            await consumer.settleCashOut(realPlayer, payload, amount, multiplier);

            // Assert
            expect(consumer.calculateCurrencyRate).toHaveBeenCalledWith(realPlayer.session);
        });

        it("should call placeBetPublisher.publishSuccessCashOut", async () => {
            // Act
            await consumer.settleCashOut(realPlayer, payload, amount, multiplier);

            // Assert
            expect(placeBetPublisher.publishSuccessCashOut).toHaveBeenCalledWith(
                realPlayer.UID,
                {
                    name: realPlayer.profile.name,
                    playerId: realPlayer.UID,
                    [payload.action]: {
                        amount,
                        win: winAmount,
                        multiplier,
                        reachMaxWin: false,
                        cashOutWin: winAmount,
                        betKey: payload.betKey,
                    },
                },
                currencyRate
            );
        });

        it("should call gameData.updatePlayerAction", async () => {
            // Act
            await consumer.settleCashOut(realPlayer, payload, amount, multiplier);

            // Assert
            expect(gameData.updatePlayerAction).toHaveBeenCalledWith(realPlayer.UID, payload.action, payload.betKey, {
                amount,
                win: winAmount,
                multiplier,
                cashOutWin: winAmount,
                reachMaxWin: false,
            });
        });

        describe("when multiplier is greater than result", () => {
            beforeEach(() => {
                gameData.result = 10;
                consumer.settleCashOut = jest.fn();
            });

            it("should call settleCashOut", async () => {
                // Act
                await consumer.settleCashOut(realPlayer, payload, amount, 15);
            });
        });
    });

    describe("getMaxWinPerRound", () => {
        it("should return max win per round", () => {
            // Arrange
            const maxWinPerRound = chance.natural({ min: 1, max: 2000 });
            const currencyMaxBet = chance.natural({ min: 1, max: 2000 });
            consumer.gameData.currencyGroupGames = [{ groupId: realPlayer.session.currencyGroupId, maxBet: currencyMaxBet }];
            consumer.gameData.gameConfigs.crashConfig.maxWinPerRound = maxWinPerRound;
            const maxBet = Math.min(realPlayer.profile.maxBet, currencyMaxBet);

            // Act
            const actualResult = consumer.getMaxWinPerRound(realPlayer);

            // Assert
            expect(actualResult).toBe(maxBet * maxWinPerRound);
        });
    });

    describe("insertBetLog", () => {
        const roundId = chance.natural();
        const payload = { roundId, action: chance.pickone(Object.values(Actions)) };

        beforeEach(() => {
            consumer.calculateCurrencyRate = jest.fn();
        });

        it("should call calculateCurrencyRate", async () => {
            // Act
            await consumer.insertBetLog(realPlayer, roundId, payload);

            // Assert
            expect(consumer.calculateCurrencyRate).toHaveBeenCalledWith(realPlayer.session);
        });

        it("should call betLogsRepository.create", async () => {
            // Arrange
            const rate = chance.floating({ min: 1 });
            const mockDate = new Date();
            jest.spyOn(global, "Date").mockReturnValueOnce(mockDate);
            consumer.calculateCurrencyRate.mockReturnValueOnce(rate);

            // Act
            await consumer.insertBetLog(realPlayer, roundId, payload);

            // Assert
            expect(betLogsRepository.create).toHaveBeenCalledWith({
                uid: realPlayer.UID,
                name: realPlayer.profile.name,
                time: mockDate,
                action: payload.action,
                amount: payload.amount,
                winAmount: payload.winAmount,
                freeBet: payload.freeBet,
                clientSendTime: payload.clientSendTime,
                receivedTime: payload.receivedTime,
                roundId,
                multiplier: payload.multiplier,
                reachMaxWin: payload.reachMaxWin,
                siteId: realPlayer.session.siteId,
                currency: realPlayer.session.currencyName,
                rate,
                operatorId: realPlayer.session.operatorId,
                playerId: realPlayer.session.playerId,
            });
        });
    });

    describe("proceedAutoCashOut", () => {
        const multiplier = chance.floating({ min: 1, max: 999 });
        const player1 = {
            ...realPlayer,
            profile: { ...realPlayer.profile, name: "player1" },
            betTracks: {
                1: {
                    [Actions.Bet]: {
                        amount: 100,
                        autoCashOut: 1.5,
                    },
                },
            },
        };
        const player2 = {
            ...realPlayer,
            profile: { ...realPlayer.profile, name: "player2" },
            betTracks: {
                1: {
                    [Actions.Bet]: {
                        amount: 200,
                        autoCashOut: 2.0,
                    },
                },
            },
        };
        const umPlayer = {
            ...realPlayer,
            profile: { ...realPlayer.profile, name: "umPlayer" },
            betTracks: {
                1: {
                    [Actions.Bet]: {
                        amount: 300,
                        autoCashOut: 1.8,
                    },
                },
            },
        };

        beforeEach(() => {
            gameData.ingame = {
                [player1.profile.name]: { playerData: player1, betTracks: player1.betTracks, isUm: false },
                [player2.profile.name]: { playerData: player2, betTracks: player2.betTracks, isUm: false },
                [umPlayer.profile.name]: { playerData: umPlayer, betTracks: umPlayer.betTracks, isUm: true },
            };
            gameData.roundId = chance.natural();
            consumer.validateAutoCashOut = jest.fn();
            consumer.settleCashOut = jest.fn();
        });

        it("should process auto cash out for valid players", async () => {
            // Arrange
            consumer.validateAutoCashOut.mockReturnValue(true);

            // Act
            await consumer.proceedAutoCashOut(multiplier);

            // Assert
            expect(consumer.validateAutoCashOut).toHaveBeenCalledWith(player1.betTracks[1], multiplier);
            expect(consumer.validateAutoCashOut).toHaveBeenCalledWith(player2.betTracks[1], multiplier);
            expect(consumer.settleCashOut).toHaveBeenCalledWith(
                player1,
                expect.objectContaining({
                    roundId: gameData.roundId,
                    action: Actions.CashOut,
                    betKey: 1,
                }),
                player1.betTracks[1][Actions.Bet].amount,
                player1.betTracks[1][Actions.Bet].autoCashOut
            );
            expect(consumer.settleCashOut).toHaveBeenCalledWith(
                player2,
                expect.objectContaining({
                    roundId: gameData.roundId,
                    action: Actions.CashOut,
                    betKey: 1,
                }),
                player2.betTracks[1][Actions.Bet].amount,
                player2.betTracks[1][Actions.Bet].autoCashOut
            );
        });

        it("should not process auto cash out for UM players", async () => {
            // Arrange
            consumer.validateAutoCashOut.mockReturnValue(true);

            // Act
            await consumer.proceedAutoCashOut(multiplier);

            // Assert
            expect(consumer.validateAutoCashOut).not.toHaveBeenCalledWith(umPlayer.betTracks[1], multiplier);
            expect(consumer.settleCashOut).not.toHaveBeenCalledWith(
                umPlayer.playerData,
                expect.any(Object),
                umPlayer.betTracks[1][Actions.Bet].amount,
                umPlayer.betTracks[1][Actions.Bet].autoCashOut
            );
        });

        it("should not process auto cash out for invalid bets", async () => {
            // Arrange
            consumer.validateAutoCashOut.mockReturnValue(false);

            // Act
            await consumer.proceedAutoCashOut(multiplier);

            // Assert
            expect(consumer.settleCashOut).not.toHaveBeenCalled();
        });
    });

    describe("validateAutoCashOut", () => {
        const multiplier = 2.0;
        const betTracks = {
            [Actions.Bet]: {
                amount: 100,
                autoCashOut: 1.5,
            },
        };

        beforeEach(() => {
            gameData.result = 3.0;
        });

        it("should return true when auto cash out threshold is reached and no cash out exists", () => {
            // Act
            const result = consumer.validateAutoCashOut(betTracks, multiplier);

            // Assert
            expect(result).toBe(true);
        });

        it("should return false when auto cash out threshold is not reached", () => {
            // Arrange
            betTracks[Actions.Bet].autoCashOut = 2.5;

            // Act
            const result = consumer.validateAutoCashOut(betTracks, multiplier);

            // Assert
            expect(result).toBe(false);
        });

        it("should return false when game result is less than auto cash out", () => {
            // Arrange
            gameData.result = 1.0;

            // Act
            const result = consumer.validateAutoCashOut(betTracks, multiplier);

            // Assert
            expect(result).toBe(false);
        });

        it("should return false when cash out already exists", () => {
            // Arrange
            betTracks[Actions.CashOut] = {
                time: new Date(),
            };

            // Act
            const result = consumer.validateAutoCashOut(betTracks, multiplier);

            // Assert
            expect(result).toBe(false);
        });

        it("should return false when bet tracks is undefined", () => {
            // Act
            const result = consumer.validateAutoCashOut(undefined, multiplier);

            // Assert
            expect(result).toBe(false);
        });

        it("should return false when bet is undefined", () => {
            // Arrange
            const invalidBetTracks = {};

            // Act
            const result = consumer.validateAutoCashOut(invalidBetTracks, multiplier);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe("calculateCurrencyRate", () => {
        const session = {
            multiplier: 1000,
            currencyCode: "USD",
        };
        const exchangeRate = 1.5;

        beforeEach(() => {
            gameData.exchangeRates = {
                code: {
                    [session.currencyCode]: exchangeRate,
                },
            };
        });

        it("should calculate currency rate correctly", () => {
            // Act
            const result = consumer.calculateCurrencyRate(session);

            // Assert
            expect(result).toBe(1500);
        });

        it("should handle undefined exchange rate", () => {
            // Arrange
            gameData.exchangeRates.code[session.currencyCode] = undefined;

            // Act
            const result = consumer.calculateCurrencyRate(session);

            // Assert
            expect(result).toBeNaN();
        });
    });

    describe("calculateTotalWin", () => {
        const player = {
            UID: "player1",
        };
        const betKey0 = "0";
        const betKey1 = "1";
        const winAmount1 = 100;
        const winAmount2 = 200;

        beforeEach(() => {
            gameData.betList = {
                [player.UID]: {
                    [betKey0]: {
                        [Actions.CashOut]: {
                            win: winAmount1,
                        },
                    },
                    [betKey1]: {
                        [Actions.CashOut]: {
                            win: winAmount2,
                        },
                    },
                },
            };
        });

        it("should calculate total win from all cash outs", () => {
            // Act
            const result = consumer.calculateTotalWin(player);

            // Assert
            expect(result).toBe(winAmount1 + winAmount2);
        });

        it("should return 0 when player has no bets", () => {
            // Arrange
            gameData.betList = {};

            // Act
            const result = consumer.calculateTotalWin(player);

            // Assert
            expect(result).toBe(0);
        });

        it("should handle undefined win amount", () => {
            // Arrange
            gameData.betList[player.UID][betKey0][Actions.CashOut].win = undefined;

            // Act
            const result = consumer.calculateTotalWin(player);

            // Assert
            expect(result).toBe(winAmount2);
        });

        it("should handle missing cash out", () => {
            // Arrange
            delete gameData.betList[player.UID][betKey0][Actions.CashOut];

            // Act
            const result = consumer.calculateTotalWin(player);

            // Assert
            expect(result).toBe(winAmount2);
        });
    });
});
