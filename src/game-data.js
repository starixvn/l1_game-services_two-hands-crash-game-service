import { Table } from "sc-game-base";

export default class GameData extends Table.TableGameData {
    constructor(remainingTime) {
        super(remainingTime);
        this.betList = {};
    }

    addPlayerToBetList(playerId, { name, amount, rate, autoCashOut, betKey = 0 }) {
        this.betList[playerId] = this.betList[playerId] || {};
        this.betList[playerId][betKey] = { time: new Date(), playerId, name, amount, rate, autoCashOut };
    }

    updatePlayerAction(playerId, action, betKey, data) {
        this.betList[playerId][betKey][action] = data;
        this.betList[playerId][betKey].time = new Date();
    }
}
