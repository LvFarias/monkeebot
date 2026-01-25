import { getBtvRate, getCS, getTeamwork } from './score.js';
import { applyNextBoost, computeTotalTokens } from './tokens.js';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import readline from 'node:readline';

const DEFAULT_MAX_WORKERS = Math.min(8, Math.max(1, os.cpus()?.length ?? 1));

function runScenarioWorker(options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./simulationWorker.js', import.meta.url), {
      workerData: options,
    });

    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Simulation worker exited with code ${code}`));
      }
    });
  });
}

export async function simulateScenarioParallel(options, { maxWorkers } = {}) {
  const [result] = await simulateScenariosParallel([options], { maxWorkers });
  return result;
}

export function createConsoleProgress(total, { prefix = 'Simulations', width = 20 } = {}) {
  const safeTotal = Math.max(1, Number(total) || 1);
  return ({ completed }) => {
    const ratio = Math.min(1, Math.max(0, completed / safeTotal));
    const filled = Math.round(ratio * width);
    const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
    const percent = Math.round(ratio * 100);
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`${prefix}: [${bar}] ${percent}% (${completed}/${safeTotal})`);
    if (completed >= safeTotal) {
      process.stdout.write('\n');
    }
  };
}

export async function simulateScenariosParallel(
  scenarios,
  {
    maxWorkers = DEFAULT_MAX_WORKERS,
    onProgress = null,
    showProgress = false,
    progressOptions = {},
  } = {}
) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return [];

  const results = new Array(scenarios.length);
  let nextIndex = 0;
  let active = 0;
  let completed = 0;
  const reporter = typeof onProgress === 'function'
    ? onProgress
    : (showProgress ? createConsoleProgress(scenarios.length, progressOptions) : null);

  if (reporter) {
    reporter({ completed, total: scenarios.length, active, queued: scenarios.length });
  }

  return new Promise((resolve, reject) => {
    const spawnNext = () => {
      if (nextIndex >= scenarios.length && active === 0) {
        resolve(results);
        return;
      }

      while (active < maxWorkers && nextIndex < scenarios.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        active += 1;

        runScenarioWorker(scenarios[currentIndex])
          .then((result) => {
            results[currentIndex] = result;
            active -= 1;
            completed += 1;
            if (reporter) {
              reporter({
                completed,
                total: scenarios.length,
                active,
                queued: Math.max(0, scenarios.length - completed - active),
              });
            }
            spawnNext();
          })
          .catch((error) => {
            reject(error);
          });
      }
    };

    spawnNext();
  });
}

export function simulateScenario(options) {
  const {
    players,
    playerDeflectors,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR,
    tokensPerPlayer,
    cxpMode,
    playerConfigs,
    boostOrder,
  } = options;

  const totalDeflector = playerDeflectors.reduce((sum, value) => sum + value, 0);
  const durationDays = durationSeconds / 86400;
  const fairShare = targetEggs / players;
  const tokenTimerSeconds = tokenTimerMinutes * 60;
  const giftSeconds = giftMinutes * 60;
  const ggMult = gg ? 2 : 1;
  const updateRate = 1;

  const tokensPerPlayerList = Array.isArray(tokensPerPlayer)
    ? tokensPerPlayer
    : Array.from({ length: playerDeflectors.length }, () => tokensPerPlayer);
  const states = playerDeflectors.map((deflector, index) => {
    const config = playerConfigs?.[index];
    return {
      index: index + 1,
      deflector,
      otherDefl: totalDeflector - deflector,
      tokens: Number.isFinite(tokensPerPlayerList[index]) ? tokensPerPlayerList[index] : tokensPerPlayer,
      boostMulti: 1,
      chickens: 0,
      maxChickens: config?.maxChickens ?? 0,
      ihr: config?.ihr ?? null,
      elrPerChickenNoStones: config?.elrPerChickenNoStones ?? 0,
      elrPerChickenWithStones: config?.elrPerChickenWithStones ?? 0,
      srNoStones: config?.srNoStones ?? 0,
      srWithStones: config?.srWithStones ?? 0,
      stoneLayout: config?.stoneLayout ?? null,
      siabPercent: config?.siabPercent ?? 0,
      siabAlwaysOn: config?.siabAlwaysOn ?? false,
      eggsDelivered: 0,
      btv: 0,
      maxHab: false,
      timeToBoost: null,
      timeToMaxHab: null,
    };
  });

  const totals = runSimulationLoop({
    states,
    players,
    targetEggs,
    durationSeconds,
    updateRate,
    tokenTimerSeconds,
    giftSeconds,
    ggMult,
    baseIHR,
    cxpMode,
    boostOrder,
  });

  const completionTime = Math.min(totals.tElapsed, durationSeconds);
  const summaries = states.map(player => buildPlayerSummary({
    player,
    fairShare,
    completionTime,
    durationSeconds,
    durationDays,
    players,
    cxpMode,
  }));

  const maxCS = summaries.reduce((max, entry) => Math.max(max, entry.cs), 0);
  const minCS = summaries.reduce((min, entry) => Math.min(min, entry.cs), Infinity);
  const meanCS = summaries.reduce((sum, entry) => sum + entry.cs, 0) / summaries.length;

  return {
    playerDeflectors,
    summaries,
    maxCS,
    minCS,
    meanCS,
    completionTime,
  };
}

export function runSimulationLoop(options) {
  const {
    states,
    players,
    targetEggs,
    durationSeconds,
    updateRate,
    tokenTimerSeconds,
    giftSeconds,
    ggMult,
    baseIHR,
    elrPerChickenNoStones,
    elrPerChickenWithStones,
    srNoStones,
    srWithStones,
    siabPercent,
    cxpMode,
    boostOrder,
  } = options;

  let tElapsed = 0;
  let eggsDelivered = 0;
  let tokensUsed = 0;
  let numberBoosting = 0;
  let allBoosting = false;

  while (eggsDelivered < targetEggs && tElapsed < durationSeconds) {
    const updateTotals = updatePlayers({
      states,
      updateRate,
      tElapsed,
      baseIHR,
      elrPerChickenNoStones,
      elrPerChickenWithStones,
      srNoStones,
      srWithStones,
      siabPercent,
      cxpMode,
    });
    const totalTokens = computeTotalTokens({
      tElapsed,
      players,
      giftSeconds,
      tokenTimerSeconds,
      ggMult,
    });

    if (!allBoosting) {
      const boostResult = applyNextBoost({
        states,
        numberBoosting,
        totalTokens,
        tokensUsed,
        tElapsed,
        boostOrder,
      });
      numberBoosting = boostResult.numberBoosting;
      tokensUsed = boostResult.tokensUsed;
      allBoosting = numberBoosting >= states.length;
    }

    eggsDelivered = updateTotals.eggsDelivered;
    tElapsed += updateRate;
  }

  return { tElapsed, eggsDelivered };
}

export function updatePlayers(options) {
  const {
    states,
    updateRate,
    tElapsed,
    baseIHR,
    cxpMode,
  } = options;

  let notMaxHabs = 0;
  states.forEach(player => {
    const effectiveIHR = Number.isFinite(player.ihr) ? player.ihr : baseIHR;
    if (!player.maxHab) {
      const increase = effectiveIHR * 12 * player.boostMulti / 60 * updateRate;
      player.chickens = Math.min(player.chickens + increase, player.maxChickens);
      if (player.chickens === player.maxChickens) {
        player.maxHab = true;
        if (player.timeToMaxHab == null) {
          player.timeToMaxHab = tElapsed;
        }
      }
    }

    const elrPerChicken = player.maxHab ? player.elrPerChickenWithStones : player.elrPerChickenNoStones;
    const shipRate = player.maxHab ? player.srWithStones : player.srNoStones;
    const layRate = player.chickens * elrPerChicken * (1 + player.otherDefl / 100);
    const deliveryRate = Math.min(layRate, shipRate);
    player.eggsDelivered += updateRate * deliveryRate / 3600;
    let activeSiabPercent = player.siabPercent;
    if (!player.siabAlwaysOn) {
      activeSiabPercent = player.maxHab ? 0 : player.siabPercent;
    }
    player.btv += updateRate * getBtvRate(player.deflector, activeSiabPercent, cxpMode);

    if (!player.maxHab) notMaxHabs += 1;
  });

  const eggsDelivered = states.reduce((sum, player) => sum + player.eggsDelivered, 0);
  return { notMaxHabs, eggsDelivered };
}

export function buildPlayerSummary(options) {
  const {
    player,
    fairShare,
    completionTime,
    durationSeconds,
    durationDays,
    players,
    cxpMode,
  } = options;

  const contributionRatio = fairShare > 0 ? player.eggsDelivered / fairShare : 0;
  const btvRat = completionTime > 0 ? player.btv / completionTime : 0;
  const maxHabTime = Number.isFinite(player.timeToMaxHab) ? player.timeToMaxHab : completionTime;
  const siabWindow = completionTime > 0 ? Math.min(Math.max(maxHabTime, 0), completionTime) / completionTime : 0;
  const effectiveSiabPercent = player.siabAlwaysOn
    ? player.siabPercent
    : player.siabPercent * siabWindow;
  const teamwork = getTeamwork(btvRat, players, durationDays, Math.min(players - 1, 20), 0, cxpMode);
  const cs = getCS(contributionRatio, durationSeconds, completionTime, teamwork);

  return {
    index: player.index,
    deflector: player.deflector,
    contributionRatio,
    teamwork,
    cs,
    completionTime,
    timeToBoost: player.timeToBoost,
    stoneLayout: player.stoneLayout,
    siabPercent: effectiveSiabPercent,
  };
}

export function computeAdjustedSummaries(options) {
  const {
    summaries,
    displayDeflectors,
    durationSeconds,
    players,
    assumptions,
  } = options;

  const adjustedSummaries = summaries.map((summary, index) => {
    const deflectorPercent = displayDeflectors[index];
    const btvRat = getBtvRate(deflectorPercent, summary.siabPercent ?? assumptions.siabPercent, assumptions.cxpMode);
    const teamwork = getTeamwork(btvRat, players, durationSeconds / 86400, Math.min(players - 1, 20), 0, assumptions.cxpMode);
    const cs = getCS(summary.contributionRatio, durationSeconds, summary.completionTime, teamwork);
    return {
      ...summary,
      deflector: deflectorPercent,
      teamwork,
      cs,
    };
  });

  const adjustedMaxCS = adjustedSummaries.reduce((max, entry) => Math.max(max, entry.cs), 0);
  const adjustedMinCS = adjustedSummaries.reduce((min, entry) => Math.min(min, entry.cs), Infinity);
  const adjustedMeanCS = adjustedSummaries.reduce((sum, entry) => sum + entry.cs, 0) / adjustedSummaries.length;

  return {
    adjustedSummaries,
    adjustedMaxCS,
    adjustedMinCS,
    adjustedMeanCS,
  };
}
