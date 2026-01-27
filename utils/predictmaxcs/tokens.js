export function calcBoostMulti(tokens) {
  switch (tokens) {
    case 1:
      return (4 * 10) * 2;
    case 2:
      return (100 + 4 * 10);
    case 3:
      return (100 + 3 * 10) * 2;
    case 4:
      return (1000 + 4 * 10);
    case 5:
      return (1000 + 3 * 10) * 2;
    case 6:
      return (1000 + 2 * 10) * 4;
    case 7:
      return (1000 + 10) * 6;
    case 8:
      return (1000 + 3 * 10) * 10;
    case 9:
      return (1000 + 2 * 10) * 12;
    case 10:
      return (1000 + 10) * 14;
    case 11:
      return (1000) * 16;
    case 12:
      return (1000 + 3 * 10) * 50;
    default:
      return 50;
  }
}

export function buildTokenPlan(tokenTimerMinutes, giftMinutes, gg, players, baseIHR, maxChickens) {
  const tokenRate = (players / tokenTimerMinutes) + (gg ? 2 : 1) * (players / giftMinutes);
  const options = [4, 5, 6, 8];
  const results = options.map(tokens => {
    const boostMulti = calcBoostMulti(tokens);
    const minutesToTokens = tokens / tokenRate;
    const minutesToMax = maxChickens / (baseIHR * 12 * boostMulti);
    const totalMinutes = minutesToTokens + minutesToMax;
    const efficiency = boostMulti / tokens;
    return {
      tokens,
      boostMulti,
      minutesToTokens,
      minutesToMax,
      totalMinutes,
      efficiency,
    };
  });

  const bestEfficiency = results.reduce((best, current) => {
    if (!best) return current;
    if (current.efficiency > best.efficiency) return current;
    if (current.efficiency === best.efficiency && current.totalMinutes < best.totalMinutes) return current;
    return best;
  }, null);

  const bestTime = results.reduce((best, current) => {
    if (!best) return current;
    if (current.totalMinutes < best.totalMinutes) return current;
    return best;
  }, null);

  return { tokenRate, results, bestEfficiency, bestTime };
}

export function getTokensForPrediction(tokenTimerMinutes, giftMinutes, gg, players, baseIHR, maxChickens) {
  const plan = buildTokenPlan(tokenTimerMinutes, giftMinutes, gg, players, baseIHR, maxChickens);
  return plan.bestTime?.tokens ?? 6;
}

export function computeTotalTokens(options) {
  const {
    tElapsed,
    players,
    giftSeconds,
    tokenTimerSeconds,
    ggMult,
  } = options;

  let totalTokens = 0;
  if (giftSeconds > 0) {
    totalTokens += Math.floor(tElapsed * players / giftSeconds) * ggMult;
  }
  if (tokenTimerSeconds > 0) {
    totalTokens += Math.floor(tElapsed / tokenTimerSeconds) * players;
  }
  return totalTokens;
}

export function applyNextBoost(options) {
  const {
    states,
    numberBoosting,
    totalTokens,
    tokensUsed,
    tElapsed,
    boostOrder,
  } = options;

  const nextIndex = Array.isArray(boostOrder)
    ? boostOrder[numberBoosting]
    : numberBoosting;
  const currentPlayer = Number.isInteger(nextIndex) ? states[nextIndex] : states[numberBoosting];
  if (!currentPlayer) {
    return { numberBoosting, tokensUsed };
  }

  if (currentPlayer.tokens <= (totalTokens - tokensUsed)) {
    currentPlayer.boostMulti = calcBoostMulti(currentPlayer.tokens);
    if (currentPlayer.timeToBoost == null) {
      currentPlayer.timeToBoost = tElapsed;
    }
    if (!currentPlayer.crRequested) {
      currentPlayer.crRequested = true;
    }
    return {
      numberBoosting: numberBoosting + 1,
      tokensUsed: tokensUsed + currentPlayer.tokens,
    };
  }

  return { numberBoosting, tokensUsed };
}
