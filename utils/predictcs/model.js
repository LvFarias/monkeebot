import {
  BASES,
  COLLECTIBLES,
  DEFLECTOR_TIERS,
  IHR_SET,
} from '../predictmaxcs/constants.js';
import {
  buildDeflectorPlan,
  getRequiredOtherDeflector,
  getUnusedDeflectorPercent,
} from '../predictmaxcs/deflector.js';
import { computeAdjustedSummaries, simulateScenario } from '../predictmaxcs/simulation.js';
import { buildTokenPlan } from '../predictmaxcs/tokens.js';
import { optimizeStones } from '../predictmaxcs/model.js';

export function buildPredictCsModel(options) {
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
  } = options;

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
    const te = Number.isFinite(playerTe?.[index]) ? playerTe[index] : 0;

    const maxChickens = BASES.baseChickens * COLLECTIBLES.chickenMult * gusset.chickMult;
    const baseELR = BASES.baseELR * COLLECTIBLES.elrMult * metro.elrMult;
    const baseShip = BASES.baseShip * COLLECTIBLES.shipMult * compass.srMult;
    const baseIHR = BASES.baseIHR
      * Math.pow(1.01, te)
      * COLLECTIBLES.ihrMult
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
        ? Math.max(gusset.siabPercent ?? 0, ihrSiab?.siabPercent ?? 0)
        : 0,
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

  const tokenUpgrade = optimizePredictCsTokens({
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

function optimizePredictCsTokens(options) {
  const {
    players,
    baseTokens,
    altTokens,
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
  } = options;

  const evaluateScenario = tokensByPlayer => {
    const scenario = simulateScenario({
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

    const adjusted = computeAdjustedSummaries({
      summaries: scenario.summaries,
      displayDeflectors: deflectorDisplay.displayDeflectors,
      durationSeconds,
      players,
      assumptions,
    });

    return {
      scenario,
      adjusted,
      score: adjusted.adjustedMeanCS,
    };
  };

  const baseTokensByPlayer = Array.from({ length: players }, () => baseTokens);
  let best = evaluateScenario(baseTokensByPlayer);
  let bestCount = 0;
  let bestTokensByPlayer = baseTokensByPlayer;

  for (let count = 1; count <= players; count += 1) {
    const tokensByPlayer = Array.from({ length: players }, (_, index) => {
      const isLate = index >= players - count;
      return isLate ? altTokens : baseTokens;
    });
    const current = evaluateScenario(tokensByPlayer);
    if (current.score > best.score) {
      best = current;
      bestCount = count;
      bestTokensByPlayer = tokensByPlayer;
    } else {
      break;
    }
  }

  let forwardBest = best;
  let forwardTokensByPlayer = bestTokensByPlayer;
  let forwardBestCount = 0;

  if (players > 0 && baseTokens > altTokens) {
    const tokensP1 = bestTokensByPlayer.map((tokens, index) => (index === 0 ? altTokens : tokens));
    const attemptP1 = evaluateScenario(tokensP1);
    if (attemptP1.score > forwardBest.score) {
      forwardBest = attemptP1;
      forwardTokensByPlayer = tokensP1;
      forwardBestCount = 1;

      for (let count = 2; count <= players; count += 1) {
        const tokensByPlayer = bestTokensByPlayer.map((tokens, index) => (index < count ? altTokens : tokens));
        const current = evaluateScenario(tokensByPlayer);
        if (current.score > forwardBest.score) {
          forwardBest = current;
          forwardTokensByPlayer = tokensByPlayer;
          forwardBestCount = count;
        } else {
          break;
        }
      }
    } else if (players > 1) {
      for (let count = 1; count <= players - 1; count += 1) {
        const tokensByPlayer = bestTokensByPlayer.map((tokens, index) => {
          if (index === 0) return tokens;
          return index < count + 1 ? altTokens : tokens;
        });
        const current = evaluateScenario(tokensByPlayer);
        if (current.score > forwardBest.score) {
          forwardBest = current;
          forwardTokensByPlayer = tokensByPlayer;
          forwardBestCount = count;
        } else {
          break;
        }
      }
    }
  }

  return {
    bestCount,
    earlyBestCount: forwardBestCount,
    baseCs: best.score,
    bestCs: forwardBest.score,
    tokensByPlayer: forwardTokensByPlayer,
    scenario: forwardBest.scenario,
  };
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
