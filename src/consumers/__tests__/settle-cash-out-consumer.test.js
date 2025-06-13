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

        it("should call insertBetLog", async () => {
            // Arrange
            const expectBetLog = { ...payload, winAmount, multiplier, amount, reachMaxWin };

            // Act
            await consumer.settleCashOut(realPlayer, payload, amount, multiplier);

            // Assert
            expect(consumer.insertBetLog).toHaveBeenCalledWith(realPlayer, payload.roundId, expectBetLog);
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
    
});
