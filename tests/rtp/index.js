import { generateResult } from "../../src/helpers/result-helper";
import fs from "fs";
import Chance from "chance";
import { roundFloat } from "../../src/helpers/number-helper";
import crypto from "crypto";
import Randomstring from "randomstring";

const chance = new Chance();

const generateClientSeed = (length = 4, pool = "0123456789") => {
    return chance.string({ pool, length });
};

const generateClientSeeds = () => {
    return [generateClientSeed(), generateClientSeed(), generateClientSeed(), generateClientSeed(), generateClientSeed()];
};

// Generate server seed (simplified version using randomstring)
const generateServerSeed = (length = 40) => {
    return Randomstring.generate({ length });
};

// Generate final seeds using the same logic as round-result-consumer
const generateFinalSeeds = (serverSeed, clientSeeds) => {
    // Merge client seeds (array of strings) into a single string
    const mergeClientSeed = clientSeeds.join("");
    const mergeSeed = serverSeed + mergeClientSeed;
    const finalHash = crypto.createHash("sha512").update(mergeSeed).digest("hex");

    return { clientSeeds, mergeClientSeed, mergeSeed, finalHash };
};

// Categorize crash point into a range for better statistics
const getCrashPointRange = (crashPoint) => {
    if (crashPoint < 1.2) return "1.00x - 1.20x";
    if (crashPoint < 1.5) return "1.20x - 1.50x";
    if (crashPoint < 2.0) return "1.50x - 2.00x";
    if (crashPoint < 3.0) return "2.00x - 3.00x";
    if (crashPoint < 5.0) return "3.00x - 5.00x";
    if (crashPoint < 10.0) return "5.00x - 10.00x";
    if (crashPoint < 20.0) return "10.00x - 20.00x";
    if (crashPoint < 50.0) return "20.00x - 50.00x";
    if (crashPoint < 100.0) return "50.00x - 100.00x";
    if (crashPoint < 200.0) return "100.00x - 200.00x";
    if (crashPoint < 500.0) return "200.00x - 500.00x";
    if (crashPoint < 1000.0) return "500.00x - 1000.00x";
    return "1000.00x+";
};

const exportRtpResult = (randomMode = 1, crashAtBase = 3, { minPoint, maxPoint }, numberOfRuns = 1_000_000) => {
    let max = 0;
    let maxwin = 0;
    let crashPointRange = {};
    let totalWinAmount = 0;
    let winCount = 0;
    let totalBetAmount = 0;

    for (let index = 0; index < numberOfRuns; index++) {
        const betAmount = chance.pickone([1, 5, 10, 50, 100]);
        const cashOutPoint = chance.floating({ min: minPoint, max: maxPoint });

        const clientSeeds = generateClientSeeds();
        const serverSeed = generateServerSeed();
        const finalSeeds = generateFinalSeeds(serverSeed, clientSeeds);
        const crashPoint = generateResult(finalSeeds.finalHash);
        const range = getCrashPointRange(crashPoint);
        crashPointRange[range] ? crashPointRange[range]++ : (crashPointRange[range] = 1);
        totalBetAmount += betAmount;
        crashPoint > max && (max = crashPoint);
        if (cashOutPoint < crashPoint) {
            winCount++;
            cashOutPoint * betAmount > maxwin && (maxwin = cashOutPoint * betAmount);
            totalWinAmount += roundFloat(cashOutPoint * betAmount);
        }
    }

    let jsonData = "";

    jsonData += `*** RTP *** - ${(totalWinAmount / totalBetAmount) * 100}% \n`;
    jsonData += `*** Win Percent *** - ${(winCount / numberOfRuns) * 100}% \n`;
    jsonData += `*** Maximum Win *** - ${maxwin} \n`;
    jsonData += `*** Maximum Multiplier *** - ${max} \n\n`;
    jsonData += `*** Crash Point Distribution *** \n`;
    jsonData += `${"Range".padEnd(20)} | ${"Count".padEnd(12)} | Percentage\n`;
    jsonData += `${"-".repeat(20)} | ${"-".repeat(12)} | ${"-".repeat(10)}\n`;

    Object.entries(crashPointRange)
        .sort((a, b) => {
            const aMin = parseFloat(a[0].split("x")[0]);
            const bMin = parseFloat(b[0].split("x")[0]);
            return aMin - bMin;
        })
        .forEach(([range, count]) => {
            const percentage = ((count / numberOfRuns) * 100).toFixed(2);
            jsonData += `${range.padEnd(20)} | ${count.toString().padEnd(12)} | ${percentage}%\n`;
        });

    fs.writeFileSync(`./tests/rtp/stat_[${minPoint},${maxPoint}]_${numberOfRuns}.txt`, jsonData);
};

const exportRtpResultAtSpecificCashOut = (cashOutPoint, numberOfRuns = 1_000_000) => {
    let max = 0;
    let maxwin = 0;
    let crashPointRange = {};
    let totalWinAmount = 0;
    let winCount = 0;
    let totalBetAmount = 0;

    for (let index = 0; index < numberOfRuns; index++) {
        const betAmount = chance.pickone([1, 5, 10, 50, 100]);

        const clientSeeds = generateClientSeeds();
        const serverSeed = generateServerSeed();
        const finalSeeds = generateFinalSeeds(serverSeed, clientSeeds);
        const crashPoint = generateResult(finalSeeds.finalHash);
        const range = getCrashPointRange(crashPoint);
        crashPointRange[range] ? crashPointRange[range]++ : (crashPointRange[range] = 1);
        totalBetAmount += betAmount;
        crashPoint > max && (max = crashPoint);
        if (cashOutPoint < crashPoint) {
            winCount++;
            cashOutPoint * betAmount > maxwin && (maxwin = cashOutPoint * betAmount);
            totalWinAmount += roundFloat(cashOutPoint * betAmount);
        }
    }

    const rtpPercent = ((totalWinAmount / totalBetAmount) * 100).toFixed(2);
    const winPercent = ((winCount / numberOfRuns) * 100).toFixed(2);

    let jsonData = "";

    jsonData += `*** FIXED CASH OUT POINT *** - ${cashOutPoint}x \n`;
    jsonData += `*** RTP *** - ${rtpPercent}% \n`;
    jsonData += `*** Win Percent *** - ${winPercent}% \n`;
    jsonData += `*** Win Count *** - ${winCount.toLocaleString()} / ${numberOfRuns.toLocaleString()} \n`;
    jsonData += `*** Maximum Win *** - ${maxwin} \n`;
    jsonData += `*** Maximum Multiplier *** - ${max} \n\n`;
    jsonData += `*** Crash Point Distribution *** \n`;
    jsonData += `${"Range".padEnd(20)} | ${"Count".padEnd(12)} | Percentage\n`;
    jsonData += `${"-".repeat(20)} | ${"-".repeat(12)} | ${"-".repeat(10)}\n`;

    Object.entries(crashPointRange)
        .sort((a, b) => {
            const aMin = parseFloat(a[0].split("x")[0]);
            const bMin = parseFloat(b[0].split("x")[0]);
            return aMin - bMin;
        })
        .forEach(([range, count]) => {
            const percentage = ((count / numberOfRuns) * 100).toFixed(2);
            jsonData += `${range.padEnd(20)} | ${count.toString().padEnd(12)} | ${percentage}%\n`;
        });

    console.log(`\n========== RTP at ${cashOutPoint}x (${numberOfRuns.toLocaleString()} runs) ==========`);
    console.log(`RTP: ${rtpPercent}%`);
    console.log(`Win Rate: ${winPercent}%`);
    console.log(`Wins: ${winCount.toLocaleString()} / ${numberOfRuns.toLocaleString()}`);
    console.log(`Expected RTP: ${((97 * (cashOutPoint - 1)) / cashOutPoint).toFixed(2)}%`);

    fs.writeFileSync(`./tests/rtp/stat_fixed_${cashOutPoint}x_${numberOfRuns}.txt`, jsonData);
};

const exportRtpResultWithFixedBetAndCashout = (betAmount, cashOutPoint, numberOfRuns = 100_000) => {
    let max = 0;
    let maxwin = 0;
    let crashPointRange = {};
    let totalWinAmount = 0;
    let winCount = 0;
    let totalBetAmount = 0;

    for (let index = 0; index < numberOfRuns; index++) {
        const clientSeeds = generateClientSeeds();
        const serverSeed = generateServerSeed();
        const finalSeeds = generateFinalSeeds(serverSeed, clientSeeds);
        const crashPoint = generateResult(finalSeeds.finalHash);
        const range = getCrashPointRange(crashPoint);
        crashPointRange[range] ? crashPointRange[range]++ : (crashPointRange[range] = 1);
        totalBetAmount += betAmount;
        crashPoint > max && (max = crashPoint);
        if (cashOutPoint < crashPoint) {
            winCount++;
            const winAmount = cashOutPoint * betAmount;
            winAmount > maxwin && (maxwin = winAmount);
            totalWinAmount += roundFloat(winAmount);
        }
    }

    const rtpPercent = ((totalWinAmount / totalBetAmount) * 100).toFixed(4);
    const winPercent = ((winCount / numberOfRuns) * 100).toFixed(4);
    const theoreticalRTP = ((97 * (cashOutPoint - 1)) / cashOutPoint).toFixed(4);
    const theoreticalWinRate = ((97 / cashOutPoint) * 100).toFixed(4);

    let jsonData = "";

    jsonData += `*** FIXED BET & FIXED CASH OUT POINT *** \n`;
    jsonData += `*** Bet Amount *** - ${betAmount.toLocaleString()} \n`;
    jsonData += `*** Cash Out Point *** - ${cashOutPoint}x \n\n`;
    jsonData += `*** RESULTS *** \n`;
    jsonData += `*** RTP *** - ${rtpPercent}% (Theoretical: ${theoreticalRTP}%) \n`;
    jsonData += `*** Win Percent *** - ${winPercent}% (Theoretical: ${theoreticalWinRate}%) \n`;
    jsonData += `*** Win Count *** - ${winCount.toLocaleString()} / ${numberOfRuns.toLocaleString()} \n`;
    jsonData += `*** Total Bet Amount *** - ${totalBetAmount.toLocaleString()} \n`;
    jsonData += `*** Total Win Amount *** - ${totalWinAmount.toLocaleString()} \n`;
    jsonData += `*** Net Profit/Loss *** - ${(totalWinAmount - totalBetAmount).toLocaleString()} \n`;
    jsonData += `*** Maximum Single Win *** - ${maxwin.toLocaleString()} \n`;
    jsonData += `*** Maximum Multiplier *** - ${max} \n\n`;
    jsonData += `*** Crash Point Distribution *** \n`;
    jsonData += `${"Range".padEnd(20)} | ${"Count".padEnd(12)} | Percentage\n`;
    jsonData += `${"-".repeat(20)} | ${"-".repeat(12)} | ${"-".repeat(10)}\n`;

    Object.entries(crashPointRange)
        .sort((a, b) => {
            const aMin = parseFloat(a[0].split("x")[0]);
            const bMin = parseFloat(b[0].split("x")[0]);
            return aMin - bMin;
        })
        .forEach(([range, count]) => {
            const percentage = ((count / numberOfRuns) * 100).toFixed(2);
            jsonData += `${range.padEnd(20)} | ${count.toString().padEnd(12)} | ${percentage}%\n`;
        });

    console.log(`\n========== Fixed Bet RTP Test (${numberOfRuns.toLocaleString()} runs) ==========`);
    console.log(`Bet Amount: ${betAmount.toLocaleString()}`);
    console.log(`Cash Out Point: ${cashOutPoint}x`);
    console.log(`RTP: ${rtpPercent}% (Theoretical: ${theoreticalRTP}%)`);
    console.log(`Win Rate: ${winPercent}% (Theoretical: ${theoreticalWinRate}%)`);
    console.log(`Wins: ${winCount.toLocaleString()} / ${numberOfRuns.toLocaleString()}`);
    console.log(`Total Wagered: ${totalBetAmount.toLocaleString()}`);
    console.log(`Total Won: ${totalWinAmount.toLocaleString()}`);
    console.log(`Net P/L: ${(totalWinAmount - totalBetAmount).toLocaleString()}`);

    fs.writeFileSync(`./tests/rtp/stat_fixed_bet_${betAmount}_cashout_${cashOutPoint}x_${numberOfRuns}.txt`, jsonData);
};

const minPoint = 1.01,
    maxPoint = 10,
    crashAtBase = 2;

// Random cash out point tests
// exportRtpResult(1, crashAtBase, { minPoint, maxPoint }, 5_000);
// exportRtpResult(1, crashAtBase, { minPoint, maxPoint }, 10_000);
// exportRtpResult(1, crashAtBase, { minPoint, maxPoint }, 100_000);
// exportRtpResult(1, crashAtBase, { minPoint, maxPoint }, 1_000_000);

// Fixed cash out point tests
console.log("\n======================================");
console.log("Testing RTP at Specific Cash Out Points");
console.log("======================================");

exportRtpResultAtSpecificCashOut(1.5, 100_000);
exportRtpResultAtSpecificCashOut(2.0, 100_000);
exportRtpResultAtSpecificCashOut(3.0, 100_000);
exportRtpResultAtSpecificCashOut(5.0, 100_000);
exportRtpResultAtSpecificCashOut(10.0, 100_000);

// Fixed bet amount AND fixed cash out point tests
console.log("\n======================================");
console.log("Testing RTP with Fixed Bet & Fixed Cashout");
console.log("======================================");

exportRtpResultWithFixedBetAndCashout(20000, 1.5, 100_000);
exportRtpResultWithFixedBetAndCashout(20000, 2.0, 100_000);
exportRtpResultWithFixedBetAndCashout(20000, 3.0, 100_000);
