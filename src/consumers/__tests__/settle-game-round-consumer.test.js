import Chance from "chance";
import { Models } from "jest-auto-fixture";
import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { RoundResultPublisher, UserBetResultPublisher } from "sc-game-base/src/core/event-publishers";
import GameDefinition from "sc-game-base/src/core/game-definition";
import { Actions } from "../../constants";
import CrashGameData from "../../game-data";
import { SettleGameRoundConsumer } from "../settle-game-round-consumer";

describe("SettleGameRoundConsumer", () => {
    const chance = new Chance();
    const defaultDefinition = new GameDefinition({ id: 1, name: "game name" }, jest.fn(), jest.fn());
    const roundId = chance.natural();

    const defaultGameData = new CrashGameData(30);
    defaultGameData.gameConfigs = Models.GameConfig({});

    let gameData, definition;

    /** @type {SettleGameRoundConsumer}*/
    let consumer;

    /** @type {UserRoundResultPublisher}*/
    const roundResultPublisher = stub(RoundResultPublisher);

    /** @type {UserBetResultPublisher}*/
    const userBetResultPublisher = stub(UserBetResultPublisher);

    /** @type {mongoose.Model}*/
    const roundsRepository = stubMongoose(mongoose.Model);

    /** @type {mongoose.Model}*/
    const betsRepository = stubMongoose(mongoose.Model);

    /** @type {mongoose.Model}*/
    const betLogsRepository = stubMongoose(mongoose.Model);
    betLogsRepository.insertMany = jest.fn();

    /** @type {mongoose.Model}*/
    const tempBetsRepository = stubMongoose(mongoose.Model);

    /** @type {mongoose.Model}*/
    const tempBetLogsRepository = stubMongoose(mongoose.Model);

    const endGame = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        gameData = { ...defaultGameData };
        definition = { ...defaultDefinition };

        consumer = new SettleGameRoundConsumer({
            definition,
            gameData,
            roundResultPublisher,
            userBetResultPublisher,
            endGame,
            roundsRepository,
            betsRepository,
            betLogsRepository,
            tempBetsRepository,
            tempBetLogsRepository,
        });
    });

    describe("settleBets", () => {
        const result = chance.floating({ min: 1, max: 10000 });
        const playerId = chance.natural();
        const queryBets = [
            { uid: chance.guid(), playerId, siteId: chance.natural(), save: jest.fn() },
            {
                uid: chance.guid(),
                amount: chance.natural(),
                playerId: chance.natural(),
                siteId: chance.natural(),
                freeBet: true,
                save: jest.fn(),
            },
        ];
        const betResult = {
            totalBetAmount: chance.natural(),
            totalWin: chance.natural(),
            netWin: chance.natural(),
            totalLost: chance.natural(),
            winningByChoices: {},
        };

        const settleBetParams = { result, roundId, time: new Date() };
        const betLogs = [
            { uid: queryBets[0].uid, action: Actions.Bet, amount: 100, winAmount: 200, reachMaxWin: true },
            { uid: queryBets[1].uid, action: Actions.Bet, amount: 50, winAmount: 0, reachMaxWin: false }
        ];

        beforeEach(() => {
            roundsRepository.create.mockReturnValueOnce({ id: 1, result });
            consumer.callEndGame = jest.fn().mockResolvedValue({ isOk: true });
            consumer.queryBets = jest.fn(() => queryBets);
            consumer.calculateBetResult = jest.fn(() => betResult);
            consumer.captureBetResult = jest.fn();
            consumer.betLogsRepository.find().lean().exec.mockReturnValueOnce(betLogs);
            consumer.tempBetLogsRepository.find().lean().exec.mockReturnValueOnce([]);
            consumer.addRefundBetLogForPlayersOnUM = jest.fn().mockReturnValue([]);
            consumer.addCrashBetLog = jest.fn().mockReturnValue([]);
        });

        it("should call queryBets", async () => {
            // Act
            await consumer.settleBets(settleBetParams);

            // Assert
            expect(consumer.queryBets).toHaveBeenCalledWith(settleBetParams.roundId);
        });

        it("should query betLogs", async () => {
            // Act
            await consumer.settleBets(settleBetParams);

            // Assert
            expect(betLogsRepository.find).toHaveBeenCalledWith({ roundId });
            expect(tempBetLogsRepository.find).toHaveBeenCalledWith({ roundId });
        });

        it("should call addRefundBetLogForPlayersOnUM", async () => {
            // Act
            await consumer.settleBets(settleBetParams);

            // Assert
            expect(consumer.addRefundBetLogForPlayersOnUM).toHaveBeenCalledWith(betLogs);
        });

        it("should call addCrashBetLog", async () => {
            // Act
            await consumer.settleBets(settleBetParams);

            // Assert
            expect(consumer.addCrashBetLog).toHaveBeenCalledWith(betLogs, settleBetParams.time);
        });

        describe("when there are no bets", () => {
            beforeEach(() => {
                consumer.queryBets = jest.fn(() => []);
            });

            it("should not process any bets", async () => {
                // Act
                await consumer.settleBets(settleBetParams);

                // Assert
                expect(consumer.calculateBetResult).not.toHaveBeenCalled();
                expect(consumer.callEndGame).not.toHaveBeenCalled();
                expect(userBetResultPublisher.publish).not.toHaveBeenCalled();
            });
        });

        Object.keys(queryBets)
            .map((index) => +index)
            .forEach((betIndex) => {
                describe(`with bet ${betIndex + 1}`, () => {
                    it("should call calculateBetResult", async () => {
                        // Act
                        await consumer.settleBets(settleBetParams);

                        // Assert
                        expect(consumer.calculateBetResult).toHaveBeenNthCalledWith(
                            betIndex + 1,
                            queryBets[betIndex],
                            betLogs.filter(log => log.uid === queryBets[betIndex].uid)
                        );
                    });

                    it("should update bet with win amount and paid status", async () => {
                        // Act
                        await consumer.settleBets(settleBetParams);

                        // Assert
                        expect(queryBets[betIndex].betwin).toBe(betResult.totalWin);
                        expect(queryBets[betIndex].paid).toBe(true);
                        expect(queryBets[betIndex].save).toHaveBeenCalled();
                    });

                    it("should call endGame", async () => {
                        // Act
                        await consumer.settleBets(settleBetParams);

                        // Assert
                        expect(consumer.callEndGame).toHaveBeenNthCalledWith(
                            betIndex + 1,
                            queryBets[betIndex],
                            settleBetParams.roundId,
                            settleBetParams.time,
                            betResult
                        );
                    });

                    it("should publish bet result to user when endGame is successful", async () => {
                        // Act
                        await consumer.settleBets(settleBetParams);

                        // Assert
                        expect(userBetResultPublisher.publish).toHaveBeenNthCalledWith(
                            betIndex + 1,
                            queryBets[betIndex].uid,
                            {
                                ...betResult,
                                reachMaxWin: betLogs.some(log => log.uid === queryBets[betIndex].uid && log.reachMaxWin),
                            }
                        );
                    });

                    it("should not publish bet result when endGame fails", async () => {
                        // Arrange
                        consumer.callEndGame = jest.fn().mockResolvedValue({ isOk: false });

                        // Act
                        await consumer.settleBets(settleBetParams);

                        // Assert
                        expect(userBetResultPublisher.publish).not.toHaveBeenCalled();
                    });
                });
            });
    });

    describe("calculateWinAmount", () => {
        describe("when bet logs is empty", () => {
            it("should return 0", () => {
                // Act
                const result = consumer.calculateWinAmount([]);

                // Assert
                expect(result).toBe(0);
            });
        });

        describe("when bet logs is NOT empty", () => {
            const winAmount1 = chance.natural();
            const winAmount2 = chance.natural();

            const betLogs = [{ winAmount: winAmount1 }, { winAmount: winAmount2 }];

            it("should return total win amount", () => {
                // Act
                const result = consumer.calculateWinAmount(betLogs);

                // Assert
                expect(result).toBe(winAmount2 + winAmount1);
            });
        });
    });

    describe("calculateBetResult", () => {
        const bet = {
            totalAmount: chance.natural(),
        };

        const betLogs = [];

        beforeEach(() => {
            consumer.calculateWinAmount = jest.fn();
        });

        it("should call calculateWinAmount", () => {
            // Arrange
            const winAmount = chance.natural();
            consumer.calculateWinAmount.mockReturnValueOnce(winAmount);

            // Act
            consumer.calculateBetResult(bet, betLogs);

            // Assert
            expect(consumer.calculateWinAmount).toHaveBeenCalledWith(betLogs);
        });

        it("should return Bet Result with total win equal winAmount", () => {
            // Arrange
            const winAmount = chance.natural();
            consumer.calculateWinAmount.mockReturnValueOnce(winAmount);

            // Act
            const { totalWin } = consumer.calculateBetResult(bet, betLogs);

            // Assert
            expect(totalWin).toBe(winAmount);
        });
        it("should return Bet Result with total bet amount equal bet amount", () => {
            // Arrange
            const winAmount = chance.natural();
            consumer.calculateWinAmount.mockReturnValueOnce(winAmount);

            // Act
            const { totalBetAmount } = consumer.calculateBetResult(bet, betLogs);

            // Assert
            expect(totalBetAmount).toBe(bet.totalAmount);
        });

        describe("when win amount is greater than bet amount", () => {
            const betAmount = chance.natural({ min: 1, max: 2000 });
            const winAmount = betAmount * chance.floating({ min: 1, max: 2000 });

            beforeEach(() => {
                consumer.calculateWinAmount.mockReturnValueOnce(winAmount);
            });

            it("should return Bet Result with netWin is greater than 0", () => {
                // Act
                const expectResult = +(winAmount - betAmount).toFixed(2);
                const { netWin } = consumer.calculateBetResult({ totalAmount: betAmount }, betLogs);

                // Assert
                expect(netWin).toBeGreaterThan(0);
                expect(netWin).toBe(expectResult);
            });

            it("should return Bet Result with totalLost is 0", () => {
                // Act
                const { totalLost } = consumer.calculateBetResult({ totalAmount: betAmount }, betLogs);

                // Assert
                expect(totalLost).toBe(0);
            });
        });

        describe("when win amount is smaller than bet amount", () => {
            const betAmount = chance.natural({ min: 1, max: 2000 });
            const winAmount = betAmount * chance.floating({ min: 0, max: 0.9 });

            beforeEach(() => {
                consumer.calculateWinAmount.mockReturnValueOnce(winAmount);
            });

            it("should return Bet Result with netWin is 0", () => {
                // Act
                const { netWin } = consumer.calculateBetResult({ totalAmount: betAmount }, betLogs);

                // Assert
                expect(netWin).toBe(0);
            });

            it("should return Bet Result with totalLost is greater than 0", () => {
                // Act
                const expectedResult = +(betAmount - winAmount).toFixed(2);
                const { totalLost } = consumer.calculateBetResult({ totalAmount: betAmount }, betLogs);

                // Assert
                expect(totalLost).toBeGreaterThan(0);
                expect(totalLost).toBe(expectedResult);
            });
        });
    });

    describe("addRefundBetLogForPlayersOnUM", () => {
        const player1 = {
            uid: chance.guid(),
            name: chance.string(),
            playerId: chance.natural(),
            siteId: chance.string(),
            operatorId: "operator1",
            amount: 20,
        };
        const player2 = {
            uid: chance.guid(),
            name: chance.string(),
            playerId: chance.natural(),
            siteId: chance.string(),
            operatorId: "operator2",
            amount: 10,
        };

        afterEach(() => {
            gameData.ingame = {};
        });
        describe("when operator1 is under UM", () => {
            it("should only refund to users belong to operator1", async () => {
                //Arrange
                const betLogs = [
                    { playerId: player1.playerId, operatorId: player1.operatorId, action: Actions.Bet, amount: player1.amount, betKey: 1 },
                    { playerId: player2.playerId, operatorId: player2.operatorId, action: Actions.Bet, amount: player2.amount, betKey: 1 },
                ];
                gameData.ingame = {
                    [player1.name]: {
                        playerData: {
                            session: {
                                playerId: player1.playerId,
                                operatorId: player1.operatorId,
                            },
                        },
                        isUm: true,
                    },
                    [player2.name]: {
                        playerData: {
                            session: {
                                playerId: player2.playerId,
                                operatorId: player2.operatorId,
                            },
                        },
                    },
                };
                //Act
                const result = await consumer.addRefundBetLogForPlayersOnUM(betLogs);

                //Assert
                expect(result.length).toBe(1);
                expect(betLogsRepository.insertMany).toHaveBeenCalled();
            });
        });
    });

    describe("addCrashBetLog", () => {
        const crashTime = new Date();
        const player1 = {
            uid: chance.guid(),
            playerId: chance.natural(),
            operatorId: "operator1",
            betKey: 1,
            amount: 100
        };
        const player2 = {
            uid: chance.guid(),
            playerId: chance.natural(),
            operatorId: "operator2",
            betKey: 1,
            amount: 200
        };

        const betLogs = [
            { ...player1, action: Actions.Bet },
            { ...player2, action: Actions.Bet }
        ];

        beforeEach(() => {
            betLogsRepository.insertMany = jest.fn();
        });

        it("should create crash bet logs for bets without cash out or refund", async () => {
            // Act
            const result = await consumer.addCrashBetLog(betLogs, crashTime);

            // Assert
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                ...player1,
                time: crashTime,
                amount: player1.amount,
                betKey: player1.betKey,
                winAmount: 0,
                action: Actions.Crash,
                _id: undefined
            });
            expect(result[1]).toEqual({
                ...player2,
                time: crashTime,
                amount: player2.amount,
                betKey: player2.betKey,
                winAmount: 0,
                action: Actions.Crash,
                _id: undefined
            });
            expect(betLogsRepository.insertMany).toHaveBeenCalledWith(result);
        });

        it("should not create crash bet logs for bets with cash out", async () => {
            // Arrange
            const betLogsWithCashOut = [
                { ...player1, action: Actions.Bet },
                { ...player2, action: Actions.Bet },
                { ...player1, action: Actions.CashOut }
            ];

            // Act
            const result = await consumer.addCrashBetLog(betLogsWithCashOut, crashTime);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                ...player2,
                time: crashTime,
                amount: player2.amount,
                betKey: player2.betKey,
                winAmount: 0,
                action: Actions.Crash,
                _id: undefined
            });
            expect(betLogsRepository.insertMany).toHaveBeenCalledWith(result);
        });

        it("should not create crash bet logs for bets with refund", async () => {
            // Arrange
            const betLogsWithRefund = [
                { ...player1, action: Actions.Bet },
                { ...player2, action: Actions.Bet },
                { ...player1, action: Actions.Refund }
            ];

            // Act
            const result = await consumer.addCrashBetLog(betLogsWithRefund, crashTime);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                ...player2,
                time: crashTime,
                amount: player2.amount,
                betKey: player2.betKey,
                winAmount: 0,
                action: Actions.Crash,
                _id: undefined
            });
            expect(betLogsRepository.insertMany).toHaveBeenCalledWith(result);
        });

        it("should handle empty bet logs", async () => {
            // Act
            const result = await consumer.addCrashBetLog([], crashTime);

            // Assert
            expect(result).toHaveLength(0);
        });

        it("should handle bet logs with no bet actions", async () => {
            // Arrange
            const betLogsWithoutBets = [
                { ...player1, action: Actions.CashOut },
                { ...player2, action: Actions.Refund }
            ];

            // Act
            const result = await consumer.addCrashBetLog(betLogsWithoutBets, crashTime);

            // Assert
            expect(result).toHaveLength(0);
        });
    });

    describe("callEndGame", () => {
        const bet = {
            uid: chance.guid(),
            playerId: chance.natural(),
            operatorId: "operator1",
            amount: 100,
            betKey: 1
        };
        const roundId = chance.natural();
        const time = new Date();
        const betResult = {
            totalBetAmount: 100,
            totalWin: 200,
            netWin: 100,
            totalLost: 0
        };

        beforeEach(() => {
            consumer.formatEndGameInfo = jest.fn().mockReturnValue({
                gameInfo: { gameId: 1, roundId },
                settlementInfo: { red: 100 }
            });
            consumer.userBetResultPublisher = {
                publishApiError: jest.fn()
            };
        });

        it("should call endGame with formatted info", async () => {
            // Arrange
            endGame.mockResolvedValueOnce({ isOk: true });

            // Act
            await consumer.callEndGame(bet, roundId, time, betResult);

            // Assert
            expect(consumer.formatEndGameInfo).toHaveBeenCalledWith(bet, roundId, time, betResult);
            expect(endGame).toHaveBeenCalledWith(
                bet.uid,
                { gameId: 1, roundId },
                { red: 100 }
            );
        });

        it("should publish API error when endGame fails", async () => {
            // Arrange
            const errorResponse = "Error message";
            endGame.mockResolvedValueOnce({ isOk: false, response: errorResponse });

            // Act
            await consumer.callEndGame(bet, roundId, time, betResult);

            // Assert
            expect(consumer.userBetResultPublisher.publishApiError).toHaveBeenCalledWith(
                bet.uid,
                errorResponse
            );
        });

        it("should not publish API error when endGame succeeds", async () => {
            // Arrange
            endGame.mockResolvedValueOnce({ isOk: true });

            // Act
            await consumer.callEndGame(bet, roundId, time, betResult);

            // Assert
            expect(consumer.userBetResultPublisher.publishApiError).not.toHaveBeenCalled();
        });

        it("should return endGame result", async () => {
            // Arrange
            const endGameResult = { isOk: true, response: "Success" };
            endGame.mockResolvedValueOnce(endGameResult);

            // Act
            const result = await consumer.callEndGame(bet, roundId, time, betResult);

            // Assert
            expect(result).toBe(endGameResult);
        });
    });
});
