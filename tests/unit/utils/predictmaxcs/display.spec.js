import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/predictmaxcs/simulation.js', () => ({
  computeAdjustedSummaries: () => ({
    adjustedSummaries: [
      { index: 1, cs: 100, stoneLayout: { numTach: 2, numQuant: 1 }, siabPercent: 0 },
      { index: 2, cs: 80, stoneLayout: { numTach: 1, numQuant: 2 }, siabPercent: 10 },
    ],
    adjustedMaxCS: 120,
    adjustedMinCS: 80,
    adjustedMeanCS: 100,
  }),
}));

vi.mock('../../../../utils/predictmaxcs/constants.js', () => ({
  DEFLECTOR_TIERS: [
    { label: 'quant-scrub', percent: 0 },
    { label: 'epic+', percent: 19 },
    { label: 'legendary', percent: 20 },
  ],
  IHR_SET: {
    chalice: { ihrMult: 1.4, slots: 3 },
    monocle: { ihrMult: 1.3, slots: 3 },
    deflector: { slots: 2 },
  },
}));

vi.mock('../../../../utils/predictmaxcs/deflector.js', () => ({
  formatDeflectorDisplay: (value) => `DEF ${value}%`,
}));

vi.mock('../../../../utils/predictmaxcs/tokens.js', () => ({
  calcBoostMulti: () => 100,
}));

import {
  buildPlayerTableLines,
  formatEggs,
  formatMinutes,
  formatBillions,
  secondsToHuman,
} from '../../../../utils/predictmaxcs/display.js';
import { getChickenRunAskPop } from '../../../../utils/predictmaxcs/chickenRun.js';

const baseModel = {
  players: 2,
  durationSeconds: 7200,
  tokenTimerMinutes: 6,
  giftMinutes: 10,
  gg: true,
  stoneLayout: { numTach: 2, numQuant: 1 },
  baseIHR: 100,
  playerIHRs: [100, 200],
  requiredDeflector: 30,
  playerSummaries: { summaries: [] },
  tokensForPrediction: 6,
  hasFixedTokens: false,
  tokensByPlayer: [6, 6],
  tokenUpgrade: { bestCount: 1, tokensByPlayer: [6, 6] },
  deflectorDisplay: { displayDeflectors: [20, 0], unusedDeflector: 20 },
  playerConfigs: [
    { maxChickens: 1000 },
    { maxChickens: 1000 },
  ],
  playerArtifacts: [
    { deflector: { name: 'T4L' }, metro: { name: 'T4E' }, compass: { name: 'T4E' }, gusset: { name: 'T4E' } },
    { deflector: { name: 'T4E' }, metro: { name: 'T4E' }, compass: { name: 'T4E' }, gusset: { name: 'T4E' } },
  ],
};

const assumptions = { te: 150, teValues: [100, 200] };

describe('utils/predictmaxcs/display', () => {
  it('builds player table lines', () => {
    const lines = buildPlayerTableLines(baseModel, assumptions);
    expect(lines.length).toBeGreaterThan(5);
    expect(lines[0]).toContain('Token timer');
    expect(lines.some(line => line.includes('player1'))).toBe(true);
  });

  it('formats egg quantities', () => {
    expect(formatEggs(1e12)).toContain('T');
    expect(formatEggs(1e15)).toContain('q');
    expect(formatEggs(1e18)).toContain('Q');
  });

  it('formats minutes and billions', () => {
    expect(formatMinutes(30)).toContain('m');
    expect(formatMinutes(120)).toContain('h');
    expect(formatMinutes(1440)).toContain('d');
    expect(formatBillions(2e9)).toBe('2.0');
  });

  it('computes chicken run ask population', () => {
    const pop = getChickenRunAskPop({ maxChickens: 1000, baseIHR: 100, boostMulti: 10, players: 4 });
    expect(pop).toBeGreaterThanOrEqual(0);
    expect(getChickenRunAskPop({ maxChickens: 0, baseIHR: 100, boostMulti: 10, players: 4 })).toBe(0);
  });

  it('converts seconds to human readable', () => {
    expect(secondsToHuman(59)).toBe('0m');
    expect(secondsToHuman(3600)).toContain('h');
    expect(secondsToHuman(90000)).toContain('d');
  });
});
