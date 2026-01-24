import { ArtifactEmoji } from '../../Enums.js';
import { DEFLECTOR_TIERS } from './constants.js';

export function getRequiredOtherDeflector(playerConfigs) {
  if (!Array.isArray(playerConfigs) || playerConfigs.length === 0) return 0;
  return playerConfigs.reduce((maxRequired, config) => {
    if (!config?.maxChickens || !config?.elrPerChickenWithStones || !config?.srWithStones) {
      return maxRequired;
    }
    const layRate = config.maxChickens * config.elrPerChickenWithStones;
    if (layRate <= 0) return maxRequired;
    const required = Math.max(0, (config.srWithStones / layRate - 1) * 100);
    return Math.max(maxRequired, required);
  }, 0);
}

export function minimizeDeflectors(players, baselineMinCS, tiers, elrBase, srBase, durationSeconds, targetEggs) {
  const highestTier = tiers[tiers.length - 1];
  const playerDeflectors = Array.from({ length: players }, () => highestTier.percent);

  let improved = true;
  while (improved) {
    improved = false;
    for (let playerIndex = 0; playerIndex < players; playerIndex += 1) {
      const currentPercent = playerDeflectors[playerIndex];
      const currentTierIndex = tiers.findIndex(tier => tier.percent === currentPercent);
      if (currentTierIndex <= 0) continue;

      for (let lowerIndex = currentTierIndex - 1; lowerIndex >= 0; lowerIndex -= 1) {
        const nextPercent = tiers[lowerIndex].percent;
        playerDeflectors[playerIndex] = nextPercent;

        const scenario = computeScenario(players, playerDeflectors, elrBase, srBase, durationSeconds, targetEggs);
        if (scenario.minCS >= baselineMinCS) {
          improved = true;
          break;
        }

        playerDeflectors[playerIndex] = currentPercent;
      }
    }
  }

  return computeScenario(players, playerDeflectors, elrBase, srBase, durationSeconds, targetEggs);
}

export function buildDeflectorPlan(playerDeflectors, tiers = DEFLECTOR_TIERS) {
  const totalDeflector = playerDeflectors.reduce((sum, value) => sum + value, 0);
  const tierCounts = new Map();
  playerDeflectors.forEach(value => {
    const tier = tiers.find(entry => entry.percent === value);
    if (!tier) return;
    tierCounts.set(tier.label, (tierCounts.get(tier.label) ?? 0) + 1);
  });

  const tiersSummary = Array.from(tierCounts.entries())
    .map(([label, count]) => ({
      tier: tiers.find(entry => entry.label === label),
      count,
    }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.tier.percent - a.tier.percent);

  const minTier = [...tiersSummary].sort((a, b) => a.tier.percent - b.tier.percent)[0]?.tier ?? tiers[0];

  return {
    totalDeflector,
    minTier,
    tiers: tiersSummary,
  };
}

export function getEligibleDeflectorTiers(players, tiers, requiredOtherDeflector) {
  const sorted = [...tiers].sort((a, b) => a.percent - b.percent);
  if (players <= 1) return sorted;
  return sorted.filter(tier => (tier.percent * (players - 1)) >= requiredOtherDeflector);
}

export function canUseAllTier(players, tier, requiredOtherDeflector) {
  if (!tier) return false;
  if (players <= 1) return true;
  return (tier.percent * (players - 1)) >= requiredOtherDeflector;
}

export function canUseSwapMix(players, highestTier, nextTier, requiredOtherDeflector) {
  if (!highestTier || !nextTier) return false;
  if (players <= 1) return true;
  const otherForHighest = (players - 2) * highestTier.percent + nextTier.percent;
  const otherForNext = (players - 1) * highestTier.percent;
  return Math.min(otherForHighest, otherForNext) >= requiredOtherDeflector;
}

export function getMaxQuantScrubs(players, basePercent, requiredOtherDeflector) {
  if (players <= 1) return 0;
  if (!basePercent || basePercent <= 0) return 0;
  const minBaseNeeded = Math.ceil(requiredOtherDeflector / basePercent);
  const maxScrubs = (players - 1) - minBaseNeeded;
  return Math.max(0, Math.min(players, maxScrubs));
}

export function getUnusedDeflectorPercent(players, playerDeflectors, playerConfigs) {
  if (players < 2) {
    return Math.round(playerDeflectors.reduce((sum, value) => sum + value, 0));
  }

  const totalDeflector = playerDeflectors.reduce((sum, value) => sum + value, 0);
  let minRatio = Number.POSITIVE_INFINITY;
  let minDeflMultiplier = 1;

  playerDeflectors.forEach((deflector, index) => {
    const config = playerConfigs?.[index];
    if (!config?.maxChickens || !config?.elrPerChickenWithStones || !config?.srWithStones) return;
    const otherDefl = totalDeflector - deflector;
    const layRate = config.maxChickens * config.elrPerChickenWithStones * (1 + otherDefl / 100);
    const ratio = layRate / config.srWithStones;
    if (ratio < minRatio) {
      minRatio = ratio;
      minDeflMultiplier = otherDefl / 100 + 1;
    }
  });

  if (!Number.isFinite(minRatio) || minRatio < 1) return 0;
  const unused = (minDeflMultiplier - 1) * 100 - (minDeflMultiplier / minRatio - 1) * 100;
  return Math.min(Math.floor(unused), Math.round(totalDeflector));
}

export function buildDeflectorDisplay(options) {
  const {
    players,
    baselineDeflectors,
    playerConfigs,
  } = options;
  const highestTier = DEFLECTOR_TIERS.at(-1);
  const epicTier = DEFLECTOR_TIERS.at(-2);

  const displayDeflectors = baselineDeflectors.slice();
  const initialUnused = getUnusedDeflectorPercent(players, displayDeflectors, playerConfigs);
  const scrubCount = Math.max(0, Math.min(players, Math.floor(initialUnused / 20)));
  const remainingAfterScrubs = Math.max(0, initialUnused - scrubCount * 20);
  const epicCount = Math.max(0, Math.min(players - scrubCount, Math.floor(remainingAfterScrubs)));

  for (let i = displayDeflectors.length - scrubCount; i < displayDeflectors.length; i += 1) {
    if (i >= 0) displayDeflectors[i] = DEFLECTOR_TIERS[0].percent;
  }

  const epicStart = Math.max(0, displayDeflectors.length - scrubCount - epicCount);
  const epicEnd = Math.max(0, displayDeflectors.length - scrubCount);
  for (let i = epicStart; i < epicEnd; i += 1) {
    displayDeflectors[i] = epicTier?.percent ?? displayDeflectors[i];
  }

  const unusedDeflector = getUnusedDeflectorPercent(players, displayDeflectors, playerConfigs);

  const leggyCount = Math.max(0, players - scrubCount - epicCount);
  const planParts = [];
  if (highestTier) planParts.push(`${leggyCount}x ${highestTier.label}`);
  if (epicCount > 0 && epicTier) planParts.push(`${epicCount}x ${epicTier.label}`);
  if (scrubCount > 0) planParts.push(`${scrubCount}x quant-scrub`);
  const recommendedPlan = planParts.join(' + ');

  return {
    displayDeflectors,
    recommendedPlan,
    unusedDeflector,
    canQuantScrub: scrubCount > 0,
  };
}

export function formatDeflectorDisplay(deflectorPercent) {
  if (deflectorPercent === DEFLECTOR_TIERS[0].percent) {
    return `${ArtifactEmoji.NEO_MEDALLION_4} QS`;
  }
  if (deflectorPercent === DEFLECTOR_TIERS.at(-1)?.percent) {
    return `${ArtifactEmoji.DEFLECTOR_4} L`;
  }
  if (deflectorPercent === DEFLECTOR_TIERS.at(-2)?.percent) {
    return `${ArtifactEmoji.DEFLECTOR_4} E+`;
  }
  return `${ArtifactEmoji.DEFLECTOR_4} ${deflectorPercent}%`;
}
