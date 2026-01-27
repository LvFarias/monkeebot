import {
  getContractAdjustedBases,
  getDynamicColeggtibles,
  DEFLECTOR_TIERS,
  IHR_SET,
} from '../predictmaxcs/constants.js';
import {
  buildDeflectorPlan,
  getRequiredOtherDeflector,
  getUnusedDeflectorPercent,
} from '../predictmaxcs/deflector.js';
import { computeAdjustedSummaries, simulateScenario, simulateScenariosParallel } from '../predictmaxcs/simulation.js';
import { buildTokenPlan } from '../predictmaxcs/tokens.js';
import { optimizeStones, TOKEN_CANDIDATES } from '../predictmaxcs/model.js';

export async function buildPredictCsModel(options) {
  const COLEGGTIBLES = getDynamicColeggtibles();
  const {
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    playerArtifacts,
    playerIhrArtifacts,
    playerTe,
    boostOrder,
    siabEnabled,
    pushCount = 0,
    modifierType = null,
    modifierValue = null,
    progress = null,
  } = options;
  const bases = getContractAdjustedBases({ modifierType, modifierValue });

  const avgTe = playerTe.reduce((sum, value) => sum + value, 0) / Math.max(1, playerTe.length);
  const assumptions = {
    te: Math.round(avgTe),
    tokensPerPlayer: 0,
    swapBonus: false,
    cxpMode: true,
    siabPercent: 0,
  };

  const totalDeflector = playerArtifacts.reduce((sum, entry) => sum + (entry.deflector?.deflectorPercent ?? 0), 0);

  const playerConfigs = playerArtifacts.map((entry, index) => {
    const ihrArtifacts = playerIhrArtifacts?.[index] ?? {};
    const deflector = entry.deflector ?? { deflectorPercent: 0, slots: 0 };
    const metro = entry.metro ?? { elrMult: 1, slots: 0 };
    const compass = entry.compass ?? { srMult: 1, slots: 0 };
    const gusset = entry.gusset ?? { chickMult: 1, slots: 0, siabPercent: 0 };
    const chalice = ihrArtifacts.chalice ?? null;
    const monocle = ihrArtifacts.monocle ?? null;
    const ihrDeflector = ihrArtifacts.deflector ?? null;
    const ihrSiab = ihrArtifacts.siab ?? null;
    const boostedSiabPercent = gusset.siabPercent ?? 0;
    const ihrSiabPercent = ihrSiab?.siabPercent ?? 0;
    const te = Number.isFinite(playerTe?.[index]) ? playerTe[index] : 0;

    const maxChickens = bases.baseChickens * COLEGGTIBLES.chickenMult * gusset.chickMult;
    const baseELR = bases.baseELR * COLEGGTIBLES.elrMult * metro.elrMult;
    const baseShip = bases.baseShip * COLEGGTIBLES.shipMult * compass.srMult;
    const baseIHR = bases.baseIHR
      * Math.pow(1.01, te)
      * COLEGGTIBLES.ihrMult
      * (Number.isFinite(chalice?.ihrMult) ? chalice.ihrMult : IHR_SET.chalice.ihrMult)
      * (Number.isFinite(monocle?.ihrMult) ? monocle.ihrMult : IHR_SET.monocle.ihrMult)
      * Math.pow(1.04, getIhrStoneSlotsFromArtifacts(chalice, monocle, ihrDeflector, ihrSiab));

    const otherDefl = totalDeflector - deflector.deflectorPercent;
    const totalSlots = (deflector.slots ?? 0) + (metro.slots ?? 0) + (compass.slots ?? 0) + (gusset.slots ?? 0);
    const elrForStones = maxChickens * baseELR * (1 + otherDefl / 100);
    const stoneLayout = optimizeStones(elrForStones, baseShip, totalSlots);

    return {
      maxChickens,
      ihr: baseIHR,
      elrPerChickenNoStones: baseELR,
      elrPerChickenWithStones: baseELR * Math.pow(1.05, stoneLayout.numTach),
      srNoStones: baseShip,
      srWithStones: baseShip * Math.pow(1.05, stoneLayout.numQuant),
      stoneLayout,
      siabPercent: siabEnabled
        ? Math.max(boostedSiabPercent, ihrSiabPercent)
        : 0,
      siabAlwaysOn: siabEnabled && boostedSiabPercent > 0,
    };
  });

  const playerDeflectors = playerArtifacts.map(entry => entry.deflector?.deflectorPercent ?? 0);
  const playerIHRs = playerConfigs.map(config => config.ihr);
  const avgIHR = playerIHRs.reduce((sum, value) => sum + value, 0) / Math.max(1, playerIHRs.length);
  const avgMaxChickens = playerConfigs.reduce((sum, value) => sum + value.maxChickens, 0) / Math.max(1, playerConfigs.length);

  const baseTokens = 6;
  const altTokens = 4;
  const tokensForPrediction = baseTokens;
  const tokensByPlayer = Array.from({ length: players }, () => tokensForPrediction);

  const requiredDeflector = getRequiredOtherDeflector(playerConfigs);
  const deflectorDisplay = buildPredictCsDeflectorDisplay({
    players,
    playerDeflectors,
    playerConfigs,
  });

  const tokenUpgrade = await optimizePredictCsTokens({
    players,
    baseTokens,
    altTokens,
    baselineDeflectors: playerDeflectors,
    playerConfigs,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR: avgIHR,
    cxpMode: assumptions.cxpMode,
    deflectorDisplay,
    assumptions,
    boostOrder,
    pushCount,
    progress: options.progress,
  });

  const finalTokensByPlayer = tokenUpgrade.tokensByPlayer ?? tokensByPlayer;
  const scenario = tokenUpgrade.scenario ?? simulateScenario({
    players,
    playerDeflectors,
    playerConfigs,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR: avgIHR,
    tokensPerPlayer: finalTokensByPlayer,
    cxpMode: assumptions.cxpMode,
    boostOrder,
  });

  const tokenPlan = buildTokenPlan(tokenTimerMinutes, giftMinutes, gg, players, avgIHR, avgMaxChickens);

  const firstStoneLayout = playerConfigs[0]?.stoneLayout ?? {
    numTach: 0,
    numQuant: 0,
  };

  return {
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    modifierType,
    modifierValue,
    maxChickens: avgMaxChickens,
    baseIHR: avgIHR,
    playerIHRs,
    baseElrPerPlayer: 0,
    baseSrPerPlayer: 0,
    elrPerChickenWithStones: 0,
    srWithStones: 0,
    stoneLayout: firstStoneLayout,
    requiredDeflector,
    deflectorPlan: buildDeflectorPlan(playerDeflectors, DEFLECTOR_TIERS),
    baselineScenario: scenario,
    playerSummaries: scenario,
    tokensForPrediction,
    hasFixedTokens: true,
    tokenPlan,
    tokensByPlayer: finalTokensByPlayer,
    tokenUpgrade,
    usePlayer1Siab: (siabEnabled && (playerConfigs[0]?.siabPercent ?? 0) > 0),
    siabScoreDelta: 0,
    playerConfigs,
    playerArtifacts,
    deflectorDisplay,
  };
}

function getIhrStoneSlotsFromArtifacts(chalice, monocle, deflector, siab) {
  const chaliceSlots = Number.isFinite(chalice?.slots) ? chalice.slots : IHR_SET.chalice.slots;
  const monocleSlots = Number.isFinite(monocle?.slots) ? monocle.slots : IHR_SET.monocle.slots;
  const deflectorSlots = Number.isFinite(deflector?.slots) ? deflector.slots : IHR_SET.deflector.slots;
  const siabSlots = Number.isFinite(siab?.slots) ? siab.slots : 2;
  return chaliceSlots + monocleSlots + deflectorSlots + siabSlots;
}

function buildPredictCsDeflectorDisplay(options) {
  const { players, playerDeflectors, playerConfigs } = options;
  const deflectorPlan = buildDeflectorPlan(playerDeflectors, DEFLECTOR_TIERS);
  const recommendedPlan = deflectorPlan.tiers.length
    ? deflectorPlan.tiers.map(entry => `${entry.count}x ${entry.tier.label}`).join(' + ')
    : 'none';
  const unusedDeflector = getUnusedDeflectorPercent(players, playerDeflectors, playerConfigs);

  return {
    displayDeflectors: playerDeflectors,
    recommendedPlan,
    unusedDeflector,
    canQuantScrub: false,
  };
}

async function optimizePredictCsTokens(options) {
  const {
    players,
    baseTokens,
    baselineDeflectors,
    playerConfigs,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR,
    cxpMode,
    deflectorDisplay,
    assumptions,
    boostOrder,
    pushCount = 0,
    progress = null,
  } = options;
  const tokenCandidates = TOKEN_CANDIDATES;
  const canUpdateProgress = typeof progress?.update === 'function';

  const buildScenarioOptions = tokensByPlayer => ({
    players,
    playerDeflectors: baselineDeflectors,
    playerConfigs,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR,
    tokensPerPlayer: tokensByPlayer,
    cxpMode,
    boostOrder,
  });

  const evaluateBatch = async (tokensByPlayerList, completedOffset) => {
    if (!tokensByPlayerList.length) return { results: [], completedOffset };
    const scenarios = tokensByPlayerList.map(buildScenarioOptions);
    const onProgress = canUpdateProgress
      ? ({ completed, total, active, queued }) => {
        progress.update({
          completed: completedOffset + completed,
          active,
          queued,
        });
      }
      : null;

    const results = await simulateScenariosParallel(scenarios, { onProgress });

    if (canUpdateProgress) {
      progress.update({
        completed: completedOffset + scenarios.length,
        active: 0,
      });
    }

    return { results, completedOffset: completedOffset + scenarios.length };
  };

  const buildScoreEntry = scenario => {
    const adjusted = computeAdjustedSummaries({
      summaries: scenario.summaries,
      displayDeflectors: deflectorDisplay.displayDeflectors,
      durationSeconds,
      players,
      assumptions,
    });

    let score = adjusted.adjustedMeanCS;
    const normalizedPushCount = Number.isInteger(pushCount)
      ? Math.max(0, Math.min(pushCount, adjusted.adjustedSummaries.length))
      : 0;
    if (normalizedPushCount > 0) {
      const boostOrderList = Array.isArray(boostOrder)
        ? boostOrder
        : Array.from({ length: players }, (_, index) => index);
      const orderedScores = boostOrderList
        .slice(0, normalizedPushCount)
        .map(playerIndex => adjusted.adjustedSummaries[playerIndex]?.cs)
        .filter(value => Number.isFinite(value));
      if (orderedScores.length > 0) {
        score = orderedScores.reduce((sum, value) => sum + value, 0) / orderedScores.length;
      }
    }

    return {
      scenario,
      adjusted,
      score,
      summaries: adjusted.adjustedSummaries,
    };
  };

  const hasAllPlayersImproved = (prevSummaries, nextSummaries) => {
    if (!Array.isArray(prevSummaries) || !Array.isArray(nextSummaries)) return false;
    if (prevSummaries.length !== nextSummaries.length) return false;
    return nextSummaries.every((summary, index) => summary.cs >= (prevSummaries[index]?.cs ?? -Infinity));
  };

  const baseTokensByPlayer = Array.from({ length: players }, () => baseTokens);
  let completedOffset = 0;
  const baseBatch = await evaluateBatch([baseTokensByPlayer], completedOffset);
  completedOffset = baseBatch.completedOffset;
  let best = buildScoreEntry(baseBatch.results[0]);
  let bestTokensByPlayer = baseTokensByPlayer;

  for (let index = 0; index < players; index += 1) {
    const candidateTokens = tokenCandidates.map(candidate =>
      bestTokensByPlayer.map((tokens, idx) => (idx === index ? candidate : tokens)));
    const batch = await evaluateBatch(candidateTokens, completedOffset);
    completedOffset = batch.completedOffset;

    const scored = batch.results.map(buildScoreEntry);
    const bestCandidate = scored.reduce((top, entry, idx) =>
      (entry.score > top.entry.score ? { entry, idx } : top),
    { entry: best, idx: -1 });

    if (bestCandidate.entry.score > best.score) {
      best = bestCandidate.entry;
      bestTokensByPlayer = candidateTokens[bestCandidate.idx];
    }
  }

  const bestCount = countTokensFromEnd(bestTokensByPlayer, 8);
  const earlyBestCount = countTokensFromStart(bestTokensByPlayer, 4);

  return {
    bestCount,
    earlyBestCount,
    baseCs: best.score,
    bestCs: best.score,
    tokensByPlayer: bestTokensByPlayer,
    scenario: best.scenario,
  };
}

function countTokensFromStart(tokensByPlayer, tokenValue) {
  if (!Array.isArray(tokensByPlayer) || tokensByPlayer.length === 0) return 0;
  let count = 0;
  for (const tokens of tokensByPlayer) {
    if (tokens !== tokenValue) break;
    count += 1;
  }
  return count;
}

function countTokensFromEnd(tokensByPlayer, tokenValue) {
  if (!Array.isArray(tokensByPlayer) || tokensByPlayer.length === 0) return 0;
  let count = 0;
  for (let i = tokensByPlayer.length - 1; i >= 0; i -= 1) {
    if (tokensByPlayer[i] !== tokenValue) break;
    count += 1;
  }
  return count;
}

export function buildBoostOrder(mode, playerTe) {
  const size = playerTe.length;
  const indices = Array.from({ length: size }, (_, index) => index);

  if (mode === 'random') {
    return shuffle(indices);
  }

  if (mode === 'te') {
    const grouped = new Map();
    playerTe.forEach((te, index) => {
      const key = Number.isFinite(te) ? te : 0;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(index);
    });
    const sortedKeys = Array.from(grouped.keys()).sort((a, b) => b - a);
    const ordered = [];
    sortedKeys.forEach(key => {
      ordered.push(...shuffle(grouped.get(key)));
    });
    return ordered;
  }

  return indices;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
