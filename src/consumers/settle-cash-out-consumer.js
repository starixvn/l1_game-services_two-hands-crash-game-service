import { Actions } from "../constants";
import { roundFloat } from "../helpers/number-helper";
import noticeHelper from "../helpers/notice-helper";

export class SettleCashOutConsumer {
    /**
     * @param {Object} dependencies
     * @param {GameData} dependencies.gameData
     * @param {PlaceBetPublisher} dependencies.placeBetPublisher
     * @param {logger} dependencies.logService
     * @param {mongoose.Model} dependencies.betLogsRepository
     */
    constructor(gameData, placeBetPublisher, logService, betLogsRepository) {
        this.gameData = gameData;
        this.placeBetPublisher = placeBetPublisher;
        this.logService = logService;
        this.betLogsRepository = betLogsRepository;
    }
    async proceedAutoCashOut(multiplier) {
        try {
            const players = Object.values(this.gameData.ingame).filter((playerInGame) => !playerInGame.isUm);

            for (const player of players) {
                const betTracks = player?.betTracks;

                Object.keys(betTracks).forEach(async (betKey) => {
                    const isValid = this.validateAutoCashOut(betTracks[betKey], multiplier);

                    if (isValid) {
                        const bet = betTracks[betKey][Actions.Bet];

                        const payload = {
                            roundId: this.gameData.roundId,
                            receivedTime: new Date(),
                            action: Actions.CashOut,
                            betKey: +betKey,
                        };

                        betTracks[betKey][Actions.CashOut] = {
                            time: new Date(),
                        };

                        await this.settleCashOut(player.playerData, payload, bet.amount, bet.autoCashOut);
                    }
                });
            }
        } catch (err) {
            this.logService.logError(err);
        }
    }

    validateAutoCashOut(betTracks, multiplier) {
        const { result } = this.gameData;
        const bet = betTracks?.[Actions.Bet];

        return bet?.autoCashOut <= multiplier && bet?.autoCashOut <= result && !betTracks?.[Actions.CashOut];
    }

    async settleCashOut(player, payload, amount, multiplier) {
        try {
            if (multiplier < this.gameData.result) {
                const { action, roundId, betKey } = payload;
                const cashOutWin = roundFloat(amount * multiplier);
                const maxWinPerRound = this.getMaxWinPerRound(player);
                const currentWin = this.calculateTotalWin(player);
                const winAmount = Math.min(cashOutWin, maxWinPerRound - currentWin);
                const reachMaxWin = winAmount + currentWin === maxWinPerRound;

                const betLog = { ...payload, winAmount, multiplier, amount, reachMaxWin };

                await this.insertBetLog(player, roundId, betLog);
                this.placeBetPublisher.publishSuccessCashOut(
                    player.UID,
                    {
                        name: player.profile.name,
                        playerId: player.UID,
                        [action]: { amount, win: winAmount, cashOutWin, multiplier, reachMaxWin, betKey: payload.betKey },
                    },
                    this.calculateCurrencyRate(player.session)
                );

                this.gameData.updatePlayerAction(player.UID, action, betKey, {
                    amount,
                    win: winAmount,
                    multiplier,
                    cashOutWin,
                    reachMaxWin,
                });
            } else {
                this.placeBetPublisher.publishGameFailedBet(player.UID, {
                    endBet: -1,
                    betKey: payload.betKey,
                    notice: { errorCode: noticeHelper.invalidCashOut },
                });
            }
        } catch (err) {
            this.logService.logError(err);
        }
    }

    getMaxWinPerRound(player) {
        const { maxWinPerRound } = this.gameData.gameConfigs.crashConfig;
        const settings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === player.session.currencyGroupId);
        const maxBet = Math.min(player.profile.maxBet, settings.maxBet);

        return maxWinPerRound * maxBet;
    }

    async insertBetLog(player, roundId, bet) {
        const rate = this.calculateCurrencyRate(player.session);

        const newBetLog = {
            uid: player.UID,
            name: player.profile.name,
            time: new Date(),
            action: bet.action,
            amount: bet.amount,
            winAmount: bet.winAmount,
            freeBet: bet.freeBet,
            clientSendTime: bet.clientSendTime,
            receivedTime: bet.receivedTime,
            betKey: bet.betKey,
            roundId,
            multiplier: bet.multiplier,
            reachMaxWin: bet.reachMaxWin,
        };

        if (player.session) {
            newBetLog.siteId = player.session.siteId;
            newBetLog.currency = player.session.currencyName;
            newBetLog.rate = rate;

            newBetLog.operatorId = player.session.operatorId;
            newBetLog.playerId = player.session.playerId;
        }

        await this.betLogsRepository.create(newBetLog);
    }

    calculateCurrencyRate(session) {
        return session.multiplier * this.gameData.exchangeRates.code[session.currencyCode];
    }

    calculateTotalWin(player) {
        const betList = this.gameData.betList[player.UID] || [];
        let totalWin = 0;

        Object.keys(betList).forEach((betKey) => {
            const cashOutWin = betList[betKey][Actions.CashOut]?.win ?? 0;

            totalWin += cashOutWin;
        });

        return totalWin;
    }
}
