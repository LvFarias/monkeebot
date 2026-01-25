import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/predictmaxcs/constants.js', async () => {
  const actual = await vi.importActual('../../../../utils/predictmaxcs/constants.js');
  return {
    ...actual,
    getDynamicColeggtibles: () => ({
      elrMult: 1,
      shipMult: 1,
      ihrMult: 1,
      chickenMult: 1,
    }),
  };
});

import {
  getAssumptions,
  buildModel,
  buildPlayerConfigs,
  optimizeStones,
  getIhrStoneSlots,
  getSwapChickenJump,
} from '../../../../utils/predictmaxcs/model.js';
import { BOOSTED_SET } from '../../../../utils/predictmaxcs/constants.js';

describe('utils/predictmaxcs/model', () => {
  it('optimizes stones by balancing elr and sr', () => {
    const result = optimizeStones(100, 100, 2);
    expect(result.numTach + result.numQuant).toBe(2);
    expect(result.numTach).toBe(1);
    expect(result.numQuant).toBe(1);
  });

  it('builds player configs with siab for player 1', () => {
    const playerConfigs = buildPlayerConfigs({
      coleggtibles: { chickenMult: 1 },
      players: 2,
      maxChickens: 1000,
      baseELR: 10,
      baseShip: 20,
      totalSlots: BOOSTED_SET.metro.slots + BOOSTED_SET.compass.slots + BOOSTED_SET.gusset.slots,
      baselineOtherDefl: 20,
      usePlayer1Siab: true,
    });

    expect(playerConfigs).toHaveLength(2);
    expect(playerConfigs[0].maxChickens).toBeLessThan(playerConfigs[1].maxChickens);
    expect(playerConfigs[0].siabAlwaysOn).toBe(true);
  });

  it('computes swap chicken jump and IHR stone slots', () => {
    expect(getSwapChickenJump(1)).toBe(0);
    expect(getSwapChickenJump(4)).toBe(1.5e9);
    expect(getIhrStoneSlots()).toBeGreaterThan(0);
  });

  it('builds a model with minimal inputs', async () => {
    const assumptions = getAssumptions(100);
    const model = await buildModel({
      players: 2,
      durationSeconds: 60,
      targetEggs: 1e6,
      tokenTimerMinutes: 2,
      giftMinutes: 2,
      gg: false,
      assumptions,
    });

    expect(model.players).toBe(2);
    expect(model.deflectorPlan.totalDeflector).toBeGreaterThan(0);
    expect(model.deflectorDisplay.displayDeflectors.length).toBe(2);
    expect(model.tokenPlan.bestTime.tokens).toBeTruthy();
  });
});
