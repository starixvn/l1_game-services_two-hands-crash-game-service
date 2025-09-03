import { GameClientDriver, normalUser } from "sc-game-service-integration-utils";
import { initUserSession } from "./helpers";
import { socketOptions } from "./stubs/test-data";

describe("cashOut", () => {
    let userClientDriver;

    afterAll(() => {
        userClientDriver.close();
    });

    beforeAll(async () => {
        userClientDriver = new GameClientDriver(socketOptions, initUserSession(normalUser));
        await userClientDriver.handleSignedInEvent();
        userClientDriver.sendInGameEvent();
    });
    const roundId = 4;
    describe("when cashOut", () => {
        it("should cash out successful", async () => {
            console.time("cashOut");
            const betAmount = 1;
            await userClientDriver.handleGameEvent((data) => data.spb);
            await new Promise((r) => setTimeout(r, 1000));
            userClientDriver.emit("bet", {
                amount: betAmount,
                betKey: 0,
                clientSeed: "1234",
                clientSendTime: new Date(),
                freeBet: false,
                m: 1,
                roundId,
                username: normalUser.playerName,
            });

            await userClientDriver.handleGameEvent((data) => data.endBet);
            await userClientDriver.handleGameEvent((data) => data.c?.m > 1);
            userClientDriver.emit("cashOut", { betKey: 0, roundId, m: 1, clientSendTime: new Date() });
            const { cashOut } = await userClientDriver.handleGameEvent((data) => data.cashOut);
            console.timeEnd("cashOut");
            const { status } = await userClientDriver.handleGameEvent((data) => data.status);

            expect(cashOut.amount).toBe(betAmount);
            expect(status.bet).toBe(betAmount * cashOut.multiplier);
        }, 60_000);
    });

    describe("when autoCashOut", () => {
        it("should cash out successful", async () => {
            const betAmount = 1;
            const autoCashOut = 1.1;
            await userClientDriver.handleGameEvent((data) => data.spb);
            await new Promise((r) => setTimeout(r, 1000));
            userClientDriver.emit("bet", {
                amount: betAmount,
                autoCashOut,
                betKey: 0,
                clientSeed: "1234",
                clientSendTime: new Date(),
                freeBet: false,
                m: 1,
                roundId: 5,
                username: normalUser.playerName,
            });

            const endBet = await userClientDriver.handleGameEvent((data) => data.endBet);
            const m = await userClientDriver.handleGameEvent((data) => data.c?.m > 1);
            const { cashOut } = await userClientDriver.handleGameEvent((data) => data.cashOut);
            const { status } = await userClientDriver.handleGameEvent((data) => data.status);

            expect(cashOut.amount).toBe(betAmount);
            expect(cashOut.win).toBe(betAmount * autoCashOut);
            expect(status.bet).toBe(betAmount * autoCashOut);
        }, 60_000);
    });
});
