import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/predictmaxcs/simulation.js', () => {
  const simulateScenario = vi.fn(({ tokensPerPlayer }) => {
    const score = Array.isArray(tokensPerPlayer) ? tokensPerPlayer[0] : tokensPerPlayer;
    return { summaries: [{ cs: score }] };
  });

  const simulateScenariosParallel = vi.fn(async (scenarios) =>
    scenarios.map((scenario) => simulateScenario(scenario)));

  const computeAdjustedSummaries = vi.fn(({ summaries }) => ({
    adjustedSummaries: summaries,
    adjustedMaxCS: summaries[0]?.cs ?? 0,
    adjustedMinCS: summaries[0]?.cs ?? 0,
    adjustedMeanCS: summaries[0]?.cs ?? 0,
  }));

  return { simulateScenario, simulateScenariosParallel, computeAdjustedSummaries };
});

const loadModel = async () => import('../../../../utils/predictmaxcs/model.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('utils/predictmaxcs/model optimization', () => {
  it('optimizes late boost tokens with improvement', async () => {
    const { optimizeLateBoostTokens } = await loadModel();

    const result = optimizeLateBoostTokens({
      players: 1,
      baseTokens: 6,
      altTokens: 8,
      baselineScenario: null,
      baselineDeflectors: [20],
      durationSeconds: 60,
      targetEggs: 100,
      tokenTimerMinutes: 2,
      giftMinutes: 2,
      gg: false,
      baseIHR: 100,
      cxpMode: false,
      playerConfigs: [{}],
    });

    expect(result.bestCount).toBe(1);
    expect(result.bestCs).toBe(8);
    expect(result.tokensByPlayer[0]).toBe(8);
  });

  it('keeps base tokens when alt is worse', async () => {
    const { optimizeLateBoostTokens } = await loadModel();

    const result = optimizeLateBoostTokens({
      players: 1,
      baseTokens: 8,
      altTokens: 4,
      baselineScenario: null,
      baselineDeflectors: [20],
      durationSeconds: 60,
      targetEggs: 100,
      tokenTimerMinutes: 2,
      giftMinutes: 2,
      gg: false,
      baseIHR: 100,
      cxpMode: false,
      playerConfigs: [{}],
    });

    expect(result.bestCount).toBe(0);
    expect(result.bestCs).toBe(8);
    expect(result.tokensByPlayer[0]).toBe(8);
  });

  it('optimizes after deflector with late tokens', async () => {
    const { optimizeLateBoostTokensAfterDeflector } = await loadModel();

    const result = await optimizeLateBoostTokensAfterDeflector({
      players: 1,
      baseTokens: 6,
      altTokens: 8,
      baselineDeflectors: [20],
      playerConfigs: [{}],
      durationSeconds: 60,
      targetEggs: 100,
      tokenTimerMinutes: 2,
      giftMinutes: 2,
      gg: false,
      baseIHR: 100,
      cxpMode: false,
      deflectorDisplay: { displayDeflectors: [20] },
      assumptions: { cxpMode: false, siabPercent: 0 },
    });

    expect(result.bestCount).toBe(1);
    expect(result.tokensByPlayer[0]).toBe(8);
    expect(result.bestCs).toBe(8);
  });
});
