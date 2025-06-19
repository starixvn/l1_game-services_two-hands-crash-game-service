import Chance from "chance";
import { stub } from "jest-micro-auto-stub";
import { Core } from "sc-game-base";
import { BaseEventPublisher } from "sc-game-base/src/core/event-publishers";
import gameSettings from "../../../src/game-settings";
import { Actions } from "../../constants";
import noticeHelper from "../../helpers/notice-helper";
import { CashOutConsumer } from "../cash-out-consumer";

const player = {
    socketId: "scoketId1",
    UID: "uid1",
    session: { currencyGroupId: "group1", currencyName: "UUS", system: 1, partnerId: 2 },
    profile: {
        name: "name1",
        maxBet: 8,
        minBet: 6,
    },
};
describe("CashOutConsumer", () => {
    const chance = new Chance();
    const payload = {
        freeBet: chance.bool(),
        roundId: chance.natural(),
        betKey: 0,
    };
    const definition = new Core.GameDefinition(gameSettings);
    const gameData = {
        gameConfigs: { odds: {}, enableFreeBet: false },
        exchangeRates: { code: {} },
        currencyGroupGames: [{ groupId: player.session.currencyGroupId, minBet: 4, maxBet: 18 }],
        players: {},
        ingame: {
            [player.profile.name]: {
                betQueue: [],
                betTracks: {
                    0: {},
                    1: {},
                },
            },
        },
        roundId: 1,
        remainingTime: 30,
    };

    /** @type {CashOutConsumer} */
    let consumer;

    beforeEach(() => {
        jest.clearAllMocks();
        const publisher = stub(BaseEventPublisher);
        consumer = new CashOutConsumer(definition, gameData, publisher);
    });

    it("inherit Core.BaseEventConsumers.PlaceBetConsumer", () => {
        // Assert
        expect(consumer instanceof Core.BaseEventConsumers.PlaceBetConsumer);
    });

    describe("consume", () => {
        beforeEach(() => {
            consumer.validateRequest = jest.fn();
            consumer.adjustBetTracks = jest.fn();
        });

        it("should call validateRequest", () => {
            // Act
            consumer.consume(player, payload);

            // Assert
            expect(consumer.validateRequest).toHaveBeenCalledWith(player, payload.roundId, payload.betKey);
        });

        describe("when bet request is invalid", () => {
            beforeEach(() => {
                consumer.validateRequest.mockReturnValueOnce(false);
            });

            it("should NOT call adjustBetTracks", () => {
                // Act
                consumer.consume(player, payload);

                // Assert
                expect(consumer.adjustBetTracks).not.toHaveBeenCalled();
            });

            it("should NOT push bet to bet queue", () => {
                // Act
                consumer.consume(player, payload);

                // Assert
                expect(gameData.ingame[player.profile.name]?.betQueue?.length ?? 0).toBe(0);
            });
        });

        describe("when bet request is valid", () => {
            beforeEach(() => {
                consumer.validateRequest.mockReturnValueOnce(true);
            });

            it("should call adjustBetTracks", () => {
                // Act
                consumer.consume(player, payload);

                // Assert
                expect(consumer.adjustBetTracks).toHaveBeenCalledWith(player.profile.name, payload);
            });

            it("should push bet to bet queue", () => {
                // Act
                consumer.consume(player, payload);

                // Assert
                expect(gameData.ingame[player.profile.name]?.betQueue.includes((bet) => bet.player === player && bet.payload === payload));
            });
        });
    });

    describe("validateBetRequest", () => {
        beforeEach(() => {
            gameData.gameConfigs.enabled = true;
            gameData.remainingTime = -1;
            gameData.ingame = {
                [player.profile.name]: {
                    betQueue: [],
                    betTracks: {
                        0: {
                            [Actions.Bet]: {
                                time: new Date(),
                            },
                            [Actions.CashOut]: undefined,
                        },
                    },
                },
            };
        });

        describe("when game is NOT enable", () => {
            beforeEach(() => {
                gameData.gameConfigs.enabled = false;
            });

            it("should publishToUser failed bet", () => {
                // Act
                consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(consumer.publisher.publishToUser).toHaveBeenCalledWith(player.UID, {
                    endBet: -1,
                    betKey: payload.betKey,
                    notice: consumer.getNoticeObj(noticeHelper.invalidCashOut),
                });
            });

            it("should return false", () => {
                // Act
                const result = consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(result).toBeFalsy();
            });
        });

        describe("when NOT already bet", () => {
            beforeEach(() => {
                gameData.ingame = {
                    [player.profile.name]: {
                        betQueue: [],
                        betTracks: {
                            [Actions.Bet]: undefined,
                        },
                    },
                };
            });

            it("should publishToUser failed bet", () => {
                // Act
                consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(consumer.publisher.publishToUser).toHaveBeenCalledWith(player.UID, {
                    endBet: -1,
                    betKey: payload.betKey,
                    notice: consumer.getNoticeObj(noticeHelper.invalidCashOut),
                });
            });

            it("should return false", () => {
                // Act
                const result = consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(result).toBeFalsy();
            });
        });

        describe("when already cash out", () => {
            beforeEach(() => {
                gameData.ingame = {
                    [player.profile.name]: {
                        betQueue: [],
                        betTracks: {
                            [Actions.CashOut]: {
                                time: new Date(),
                            },
                        },
                    },
                };
            });

            it("should publishToUser failed bet", () => {
                // Act
                consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(consumer.publisher.publishToUser).toHaveBeenCalledWith(player.UID, {
                    endBet: -1,
                    betKey: payload.betKey,
                    notice: consumer.getNoticeObj(noticeHelper.invalidCashOut),
                });
            });

            it("should return false", () => {
                // Act
                const result = consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(result).toBeFalsy();
            });
        });

        describe("when cash out half and already cash out half", () => {
            beforeEach(() => {
                gameData.ingame = {
                    [player.profile.name]: {
                        betQueue: [],
                        betTracks: {
                            [Actions.HalfCashOut]: {
                                time: new Date(),
                            },
                        },
                    },
                };
            });

            it("should publishToUser failed bet", () => {
                // Act
                consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(consumer.publisher.publishToUser).toHaveBeenCalledWith(player.UID, {
                    endBet: -1,
                    betKey: payload.betKey,
                    notice: consumer.getNoticeObj(noticeHelper.invalidCashOut),
                });
            });

            it("should return false", () => {
                // Act
                const result = consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(result).toBeFalsy();
            });
        });

        describe("when roundId NOT valid", () => {
            it("should publishToUser failed bet", () => {
                // Arrange
                const roundId = gameData.roundId - 1;

                // Act
                consumer.validateRequest(player, roundId, payload.betKey);

                // Assert
                expect(consumer.publisher.publishToUser).toHaveBeenCalledWith(player.UID, {
                    endBet: -1,
                    betKey: payload.betKey,
                    notice: consumer.getNoticeObj(noticeHelper.invalidCashOut, { gameRoundId: roundId }),
                });
            });

            it("should return false", () => {
                // Act
                const result = consumer.validateRequest(player, gameData.roundId - 1, payload.betKey);

                // Assert
                expect(result).toBeFalsy();
            });
        });

        describe("when cashout time NOT valid", () => {
            beforeEach(() => {
                gameData.remainingTime = chance.natural();
            });

            it("should publishToUser failed bet", () => {
                // Act
                consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(consumer.publisher.publishToUser).toHaveBeenCalledWith(player.UID, {
                    endBet: -1,
                    betKey: payload.betKey,
                    notice: consumer.getNoticeObj(noticeHelper.invalidCashOut),
                });
            });

            it("should return false", () => {
                // Act
                const result = consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(result).toBeFalsy();
            });
        });

        describe("when cashOut valid", () => {
            it("should NOT publishToUser failed bet", () => {
                // Act
                consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(consumer.publisher.publishToUser).not.toHaveBeenCalled();
            });

            it("should return true", () => {
                // Act
                const result = consumer.validateRequest(player, gameData.roundId, payload.betKey);

                // Assert
                expect(result).toBeTruthy();
            });
        });

      
    });

    describe("adjustBetTrack", () => {
        describe("when bet action is CashOut", () => {
            it("should update player betTracks CashOut Time", () => {
                // Arrange
                const bet = {
                    receivedTime: new Date(),
                    action: Actions.CashOut,
                    betKey: payload.betKey,
                };
                gameData.ingame[player.profile.name] = {
                    betTracks: {
                        0: {
                            [Actions.CashOut]: {
                                time: new Date(),
                            },
                        },
                        1: {},
                    },
                };

                // Act
                consumer.adjustBetTracks(player.profile.name, bet);

                // Assert
                expect(gameData.ingame[player.profile.name].betTracks[payload.betKey][bet.action].time).toEqual(bet.receivedTime);
            });
        });
    });
});
