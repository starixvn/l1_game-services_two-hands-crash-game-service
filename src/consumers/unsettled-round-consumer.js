import { UnsettledRoundConsumer as BaseUnsettledRoundConsumer } from "sc-game-base/src/core/event-consumers";
import { Actions } from "../constants";

export class UnsettledRoundConsumer extends BaseUnsettledRoundConsumer {
    async proceedUnsettledBets(unsettledBets) {
        if (unsettledBets.length > 0) {
            const betLogs = await this.betLogsRepository.find({ roundId: this.gameData.roundId }).lean().exec();
            const newBetLogs = [];

            for (const bet of unsettledBets.filter((x) => x.playerId)) {
                const playerBetLogs = betLogs.filter((x) => x.playerId === bet.playerId);
                const unsettledBetLogs = playerBetLogs.filter(
                    (x) => x.action === Actions.Bet && !playerBetLogs.some((y) => y.action === Actions.CashOut && x.betKey === y.betKey)
                );

                newBetLogs.push(
                    ...unsettledBetLogs.map((log) => ({
                        uid: log.uid,
                        name: log.name,
                        time: new Date(),
                        action: Actions.Refund,
                        amount: log.amount,
                        winAmount: log.amount,
                        clientSendTime: new Date(),
                        receivedTime: new Date(),
                        roundId: log.roundId,
                        siteId: log.siteId,
                        currency: log.currency,
                        rate: log.rate,
                        operatorId: log.operatorId,
                        playerId: log.playerId,
                        betKey: log.betKey,
                    }))
                );
            }

            await this.betLogsRepository.insertMany(newBetLogs);
        }
    }
}
