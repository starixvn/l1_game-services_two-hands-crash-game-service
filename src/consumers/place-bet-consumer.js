import { helpers } from "sc-common";
import { BaseEventConsumers } from "sc-game-base/src/core";
import { Actions, MinMultiplierValue } from "../constants";
import noticeHelper from "../helpers/notice-helper";
import { roundFloat } from "../helpers/number-helper";

export class PlaceBetConsumer extends BaseEventConsumers.PlaceBetConsumer {
    consume(player, payload) {
        Object.assign(payload, {
            amount: payload.amount >> 0,
            autoCashOut: roundFloat(payload.autoCashOut ?? 0),
            freeBet: payload.freeBet ?? false,
            roundId: payload.roundId ?? this.gameData.roundId,
            mode: payload.m ?? this.DisplayMode.Landscape,
            action: Actions.Bet,
            receivedTime: new Date(),
        });

        const { amount, freeBet, roundId, autoCashOut, betKey } = payload;
        const name = player.profile.name;

        if (
            !this.validateRequestParams(payload, player) ||
            !this.validateBetRequest(player, amount, betKey, freeBet, roundId, autoCashOut)
        ) {
            return;
        }

        if (!this.gameData.ingame[name]) {
            const newPlayer = {
                name: player.profile.name,
                currency: player.session.currencyName,
                system: player.session.system,
                betTracks: {
                    0: {},
                    1: {},
                },
                betQueue: [],
                operatorId: player.session.operatorId,
                playerData: { ...player },
            };

            this.gameData.ingame[name] = newPlayer;
        }

        this.adjustBetTracks(player.profile.name, payload);

        this.gameData.ingame[name].betQueue.push({ player, payload });
    }

    validateBetRequest(player, amount, betKey, freeBet, roundId, autoCashOut) {
        const criteria = this.composeValidationCriteria(player, amount, betKey, freeBet, roundId, autoCashOut);

        return this.verifyCriteria(criteria, player, betKey);
    }

    verifyCriteria(criteria, player, betKey) {
        const failedCriterion = criteria.find((criterion) => criterion.failure);

        if (failedCriterion) {
            this.publisher.publishToUser(player.UID, { endBet: -1, betKey, notice: failedCriterion.notice });
        }

        return failedCriterion === undefined;
    }

    validateRequestParams(request, player) {
        const criteria = this.composeRequestParamsValidationCriteria(request);

        return this.verifyCriteria(criteria, player, request.betKey);
    }

    validateBetRequestParams(request) {
        const { amount, betKey } = request;

        return [
            {
                failure: !amount,
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
            {
                failure: ![0, 1].includes(betKey),
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
        ];
    }

    composeValidationCriteria(player, amount, betKey, freeBet, roundId, autoCashOut) {
        const bettingTimeValidationCriteria = this.composeBettingTimeValidationCriteria(roundId) ?? [];
        const betAmountValidationCriteria = this.composeBetAmountValidationCriteria(player, amount, betKey, freeBet, autoCashOut) || [];

        return bettingTimeValidationCriteria.concat(betAmountValidationCriteria);
    }

    composeBetAmountValidationCriteria(player, amount, betKey, freeBet, autoCashOut) {
        const settings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === player.session.currencyGroupId);
        const configs = this.gameData.gameConfigs;
        const playerIngame = this.gameData.ingame[player.profile.name];
        const firstBetAmount = playerIngame?.betTracks[0][Actions.Bet]?.amount ?? 0;
        const secondBetAmount = playerIngame?.betTracks[1][Actions.Bet]?.amount ?? 0;
        const totalBet = firstBetAmount + secondBetAmount + amount;
        const minBet = Math.max(player.profile.minBet, settings.minBet);
        const maxBet = Math.min(player.profile.maxBet, settings.maxBet);

        return [
            {
                failure: !!playerIngame?.betTracks[betKey][Actions.Bet],
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
            {
                failure: freeBet && !configs.enableFreeBet,
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
            {
                failure: amount < minBet,
                notice: this.getNoticeObj(helpers.noticeHelper.minBet, { minBet }),
            },
            {
                failure: totalBet > maxBet,
                notice: this.getNoticeObj(helpers.noticeHelper.maxBet, { maxBet }),
            },
            {
                failure: !!autoCashOut && (autoCashOut < MinMultiplierValue || autoCashOut > configs.crashConfig.maxMultiplier),
                notice: this.getNoticeObj(noticeHelper.invalidValueCashOut, { autoCashOut }),
            },
        ];
    }

    adjustBetTracks(playerName, bet) {
        const { amount, receivedTime, autoCashOut, action, betKey } = bet;

        if (this.gameData.ingame?.[playerName]) {
            const playerInGame = this.gameData.ingame[playerName];

            playerInGame.betTracks[betKey][action] = {
                amount,
                time: receivedTime,
                autoCashOut: autoCashOut > 0 ? autoCashOut : undefined,
            };
        }
    }
}
