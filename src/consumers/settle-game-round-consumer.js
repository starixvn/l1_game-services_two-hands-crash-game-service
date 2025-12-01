import { EventConsumers } from "sc-game-base/src/table";
import { Actions } from "../constants";

export class SettleGameRoundConsumer extends EventConsumers.TableSettleGameRoundConsumer {
    constructor({
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
    }) {
        super({
            definition,
            gameData,
            roundResultPublisher,
            userBetResultPublisher,
            endGame,
            roundsRepository,
            betsRepository,
            tempBetsRepository,
        });

        this.betLogsRepository = betLogsRepository;
        this.tempBetLogsRepository = tempBetLogsRepository;
    }

    async queryBetLogs(roundId) {
        const realPlayerBetLogs = await this.betLogsRepository.find({ roundId }).lean().exec();
        const botBetLogs = await this.tempBetLogsRepository.find({ roundId }).lean().exec();

        return realPlayerBetLogs.concat(botBetLogs);
    }

    async settleBets({ roundId, time }) {
        const bets = await this.queryBets(roundId);
        const betLogs = await this.queryBetLogs(roundId);

        const refundBetlogs = await this.addRefundBetLogForPlayersOnUM(betLogs);
        betLogs.push(...refundBetlogs);

        const crashBetLogs = await this.addCrashBetLog(betLogs, time);
        betLogs.push(...crashBetLogs);

        if (bets && bets.length) {
            await Promise.all(
                bets.map(async (bet) => {
                    const betLog = betLogs?.filter((log) => log.uid === bet.uid);
                    const betResult = this.calculateBetResult(bet, betLog);

                    bet.betwin = betResult.totalWin;
                    bet.paid = true;

                    await bet.save();
                    const endGameResult = await this.callEndGame(bet, roundId, time, betResult);

                    if (endGameResult.isOk) {
                        await this.userBetResultPublisher.publish(bet.uid, {
                            ...betResult,
                            reachMaxWin: betLog?.some((log) => log.reachMaxWin),
                        });
                    }
                })
            );
        }
    }

    async addRefundBetLogForPlayersOnUM(betLogs) {
        const playersOnUM = Object.values(this.gameData.ingame).filter((x) => x.isUm);
        const refundBetLogs = [];

        for (const player of playersOnUM) {
            const { playerData } = player;
            const bet = betLogs.find(
                (x) =>
                    x.playerId === playerData.session.playerId && x.operatorId === playerData.session.operatorId && x.action === Actions.Bet
            );

            refundBetLogs.push(
                Object.assign(bet, {
                    time: new Date(),
                    amount: bet.amount,
                    winAmount: bet.amount,
                    action: Actions.Refund,
                    betKey: bet.betKey,
                    _id: null,
                })
            );
        }

        await this.betLogsRepository.insertMany(refundBetLogs);
        return refundBetLogs;
    }

    async addCrashBetLog(betLogs, crashTime) {
        const crashBetLogs = [];
        const placeBetLogs = betLogs.filter((x) => x.action === Actions.Bet);
        for (const bet of placeBetLogs) {
            if (
                !betLogs.some(
                    (x) =>
                        (x.action === Actions.CashOut || x.action === Actions.Refund) &&
                        x.playerId === bet.playerId &&
                        x.operatorId === bet.operatorId &&
                        x.betKey === bet.betKey
                )
            ) {
                crashBetLogs.push(
                    Object.assign(bet, {
                        time: crashTime,
                        amount: bet.amount,
                        betKey: bet.betKey,
                        winAmount: 0,
                        action: Actions.Crash,
                        _id: null,
                    })
                );
            }
        }

        await this.betLogsRepository.insertMany(crashBetLogs);
        return crashBetLogs;
    }

    calculateWinAmount(betLog = []) {
        return betLog.reduce((win, log) => win + (log.winAmount ?? 0), 0) ?? 0;
    }

    calculateBetResult(bet, betLog = []) {
        const { totalAmount } = bet;
        const winAmount = this.calculateWinAmount(betLog);
        const winLoss = winAmount - totalAmount;

        return {
            totalBetAmount: +totalAmount.toFixed(4),
            totalWin: +winAmount.toFixed(4),
            netWin: +(winLoss > 0 ? winLoss : 0).toFixed(4),
            totalLost: +(winLoss < 0 ? -winLoss : 0).toFixed(4),
        };
    }

    async callEndGame(bet, roundId, time, betResult) {
        const { gameInfo, settlementInfo } = this.formatEndGameInfo(bet, roundId, time, betResult);

        const apiResult = await this.endGame(bet.uid, gameInfo, settlementInfo);

        if (!apiResult.isOk) {
            this.userBetResultPublisher.publishApiError(bet.uid, apiResult.response);
        }

        return apiResult;
    }
}
