import {
  BASES,
  BOOSTED_SET,
  getContractAdjustedBases,
  getDynamicColeggtibles,
  DEFLECTOR_TIERS,
  IHR_SET,
} from './constants.js';
import {
  buildDeflectorDisplay,
  buildDeflectorPlan,
  getRequiredOtherDeflector,
} from './deflector.js';
import { computeAdjustedSummaries, simulateScenario } from './simulation.js';
import {
  buildTokenPlan,
  getTokensForPrediction,
} from './tokens.js';

export function getAssumptions(averageTe = 100) {
  return {
    te: averageTe,
    tokensPerPlayer: 6,
    swapBonus: false,
    cxpMode: true,
    siabPercent: 0,
  };
}

export function buildModel(options) {
  const COLEGGTIBLES = getDynamicColeggtibles();
  const {
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    siabOverride = null,
    modifierType = null,
    modifierValue = null,
  } = options;
  const bases = getContractAdjustedBases({ modifierType, modifierValue });
  const maxChickensBase = bases.baseChickens
    * BOOSTED_SET.gusset.chickMult
    * COLEGGTIBLES.chickenMult
    + (assumptions.swapBonus ? getSwapChickenJump(players) : 0);
  const baseELR = bases.baseELR * BOOSTED_SET.metro.elrMult * COLEGGTIBLES.elrMult;
  const baseShip = bases.baseShip * BOOSTED_SET.compass.srMult * COLEGGTIBLES.shipMult;
  const baseIHR = bases.baseIHR
    * Math.pow(1.01, assumptions.te)
    * COLEGGTIBLES.ihrMult
    * IHR_SET.chalice.ihrMult
    * IHR_SET.monocle.ihrMult
    * Math.pow(1.04, getIhrStoneSlots());

  const baseElrPerPlayer = maxChickensBase * baseELR;
  const baseSrPerPlayer = baseShip;
  const totalSlots = BOOSTED_SET.metro.slots + BOOSTED_SET.compass.slots + BOOSTED_SET.gusset.slots + BOOSTED_SET.deflector.slots;

  const baselineDeflectors = Array.from(
    { length: players },
    () => DEFLECTOR_TIERS.at(-1).percent,
  );
  const baselineOtherDefl = (players - 1) * DEFLECTOR_TIERS.at(-1).percent;
  const baselineElrForStones = baseElrPerPlayer * (1 + baselineOtherDefl / 100);
  const stoneLayout = optimizeStones(baselineElrForStones, baseSrPerPlayer, totalSlots);
  const srWithStones = baseSrPerPlayer * Math.pow(1.05, stoneLayout.numQuant);
  const elrPerChickenWithStones = baseELR * Math.pow(1.05, stoneLayout.numTach);

  const hasFixedTokens = Number.isFinite(assumptions.tokensPerPlayer) && assumptions.tokensPerPlayer > 0;
  const tokensForPrediction = hasFixedTokens
    ? assumptions.tokensPerPlayer
    : getTokensForPrediction(tokenTimerMinutes, giftMinutes, gg, players, baseIHR, maxChickens);
  const tokensByPlayer = Array.from({ length: players }, () => tokensForPrediction);

  const buildVariant = usePlayer1Siab => {
    const playerConfigs = buildPlayerConfigs({
      coleggtibles: COLEGGTIBLES,
      players,
      maxChickens: maxChickensBase,
      baseChickens: bases.baseChickens,
      baseELR,
      baseShip,
      totalSlots,
      baselineOtherDefl,
      usePlayer1Siab,
    });

    const requiredDeflector = getRequiredOtherDeflector(playerConfigs);
    const deflectorDisplay = buildDeflectorDisplay({
      players,
      baselineDeflectors,
      requiredOtherDeflector: Math.ceil(requiredDeflector),
      playerConfigs,
    });

    const tokenUpgrade = optimizeLateBoostTokensAfterDeflector({
      players,
      baseTokens: tokensForPrediction,
      altTokens: 8,
      baselineDeflectors,
      playerConfigs,
      durationSeconds,
      targetEggs,
      tokenTimerMinutes,
      giftMinutes,
      gg,
      baseIHR,
      cxpMode: assumptions.cxpMode,
      deflectorDisplay,
      assumptions,
    });

    const baselineScenario = tokenUpgrade.scenario ?? simulateScenario({
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
      cxpMode: assumptions.cxpMode,
    });

    return {
      usePlayer1Siab,
      playerConfigs,
      requiredDeflector,
      deflectorDisplay,
      tokenUpgrade,
      baselineScenario,
      tokensByPlayer: tokenUpgrade.tokensByPlayer ?? tokensByPlayer,
      score: tokenUpgrade.bestCs ?? 0,
    };
  };

  const baseVariant = buildVariant(false);
  const siabVariant = buildVariant(true);
  let selectedVariant = baseVariant;
  if (siabOverride === true) {
    selectedVariant = siabVariant;
  } else if (siabOverride === false) {
    selectedVariant = baseVariant;
  } else if (siabVariant.score > baseVariant.score) {
    selectedVariant = siabVariant;
  }
  const usePlayer1Siab = selectedVariant.usePlayer1Siab;
  const siabScoreDelta = Math.round((siabVariant.score ?? 0) - (baseVariant.score ?? 0));
  const selectedPlayerConfigs = selectedVariant.playerConfigs;
  const requiredDeflector = selectedVariant.requiredDeflector;
  const deflectorDisplay = selectedVariant.deflectorDisplay;
  const tokenUpgrade = selectedVariant.tokenUpgrade;
  const baselineScenario = selectedVariant.baselineScenario;
  const finalTokensByPlayer = selectedVariant.tokensByPlayer;
  const deflectorPlan = buildDeflectorPlan(baselineDeflectors, DEFLECTOR_TIERS);

  const tokenPlan = buildTokenPlan(tokenTimerMinutes, giftMinutes, gg, players, baseIHR, maxChickensBase);

  return {
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    maxChickens: maxChickensBase,
    baseIHR,
    baseElrPerPlayer,
    baseSrPerPlayer,
    elrPerChickenWithStones,
    srWithStones,
    stoneLayout,
    requiredDeflector,
    deflectorPlan,
    baselineScenario,
    playerSummaries: baselineScenario,
    tokensForPrediction,
    hasFixedTokens,
    tokenPlan,
    tokensByPlayer: finalTokensByPlayer,
    tokenUpgrade,
    usePlayer1Siab,
    siabScoreDelta,
    playerConfigs: selectedPlayerConfigs,
    deflectorDisplay,
  };
}

export function buildPlayerConfigs(options) {
  const {
    coleggtibles,
    players,
    maxChickens,
    baseChickens = BASES.baseChickens,
    baseELR,
    baseShip,
    totalSlots,
    baselineOtherDefl,
    usePlayer1Siab,
  } = options;

  const gussetBonus = Math.max(0, (BOOSTED_SET.gusset.chickMult ?? 1) - 1);
  const player1ChickenPenalty = baseChickens * (coleggtibles?.chickenMult ?? 1) * gussetBonus;
  const player1SlotPenalty = 1;
  const baseSiabPercent = Number.isFinite(IHR_SET.siabPercent) ? IHR_SET.siabPercent : 0;

  return Array.from({ length: players }, (_, index) => {
    const isPlayer1 = index === 0 && usePlayer1Siab;
    const playerMaxChickens = Math.max(0, maxChickens - (isPlayer1 ? player1ChickenPenalty : 0));
    const playerSlots = Math.max(0, totalSlots - (isPlayer1 ? player1SlotPenalty : 0));
    const elrPerPlayer = playerMaxChickens * baseELR;
    const elrForStones = elrPerPlayer * (1 + baselineOtherDefl / 100);
    const stoneLayout = optimizeStones(elrForStones, baseShip, playerSlots);

    return {
      maxChickens: playerMaxChickens,
      elrPerChickenNoStones: baseELR,
      elrPerChickenWithStones: baseELR * Math.pow(1.05, stoneLayout.numTach),
      srNoStones: baseShip,
      srWithStones: baseShip * Math.pow(1.05, stoneLayout.numQuant),
      stoneLayout,
      siabPercent: baseSiabPercent,
      siabAlwaysOn: isPlayer1 && usePlayer1Siab && baseSiabPercent > 0,
    };
  });
}

export function optimizeLateBoostTokens(options) {
  const {
    players,
    baseTokens,
    altTokens,
    baselineScenario,
    baselineDeflectors,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR,
    cxpMode,
    playerConfigs,
  } = options;

  const baseScenario = baselineScenario ?? simulateScenario({
    players,
    playerDeflectors: baselineDeflectors,
    playerConfigs,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR,
    tokensPerPlayer: baseTokens,
    cxpMode,
  });

  const baseCs = baseScenario.summaries[0]?.cs ?? 0;
  let bestCs = baseCs;
  let bestCount = 0;
  let bestScenario = baseScenario;

  for (let count = 1; count <= players; count += 1) {
    const tokensByPlayer = Array.from({ length: players }, (_, index) => {
      const isLate = index >= players - count;
      return isLate ? altTokens : baseTokens;
    });

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
    });

    const cs = scenario.summaries[0]?.cs ?? 0;
    if (cs > bestCs) {
      bestCs = cs;
      bestCount = count;
      bestScenario = scenario;
    } else {
      break;
    }
  }

  const tokensByPlayer = Array.from({ length: players }, (_, index) => {
    const isLate = index >= players - bestCount;
    return isLate ? altTokens : baseTokens;
  });

  return {
    bestCount,
    baseCs,
    bestCs,
    tokensByPlayer,
    scenario: bestScenario,
  };
}

export function optimizeLateBoostTokensAfterDeflector(options) {
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
    });

    const adjusted = computeAdjustedSummaries({
      summaries: scenario.summaries,
      displayDeflectors: deflectorDisplay.displayDeflectors,
      durationSeconds,
      players,
      assumptions,
    });

    const player1Score = adjusted.adjustedSummaries?.[0]?.cs ?? 0;
    return {
      scenario,
      adjusted,
      score: player1Score,
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

  let earlyBest = best;
  let earlyBestCount = 0;
  let earlyBestTokensByPlayer = bestTokensByPlayer;
  const earlyTokens = 4;

  if (players > 1 && baseTokens > earlyTokens) {
    for (let count = 1; count <= players - 1; count += 1) {
      const tokensByPlayer = bestTokensByPlayer.map((tokens, index) => {
        if (index === 0) return tokens;
        return index <= count ? earlyTokens : tokens;
      });

      const current = evaluateScenario(tokensByPlayer);
      const currentP1Score = current.adjusted.adjustedSummaries?.[0]?.cs ?? 0;
      const bestP1Score = earlyBest.adjusted.adjustedSummaries?.[0]?.cs ?? 0;

      if (currentP1Score > bestP1Score) {
        earlyBest = current;
        earlyBestCount = count;
        earlyBestTokensByPlayer = tokensByPlayer;
      } else {
        break;
      }
    }
  }

  return {
    bestCount,
    earlyBestCount,
    baseCs: earlyBest.score,
    bestCs: earlyBest.score,
    tokensByPlayer: earlyBestTokensByPlayer,
    scenario: earlyBest.scenario,
  };
}

export function optimizeStones(elr, sr, totalSlots) {
  let numTach = 0;
  let numQuant = 0;
  let curElr = elr;
  let curSr = sr;

  for (let i = 0; i < totalSlots; i += 1) {
    if (curElr < curSr) {
      curElr *= 1.05;
      numTach += 1;
    } else {
      curSr *= 1.05;
      numQuant += 1;
    }
  }

  return {
    elr: curElr,
    sr: curSr,
    numTach,
    numQuant,
    totalSlots,
  };
}

export function getIhrStoneSlots() {
  return IHR_SET.chalice.slots + IHR_SET.monocle.slots + IHR_SET.deflector.slots + 2;
}

export function getSwapChickenJump(players) {
  return 5e8 * Math.max(players - 1, 0);
}
