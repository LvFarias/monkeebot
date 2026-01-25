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

import { buildPredictCsModel, buildBoostOrder } from '../../../../utils/predictcs/model.js';
import {
  parseDeflector,
  parseMetro,
  parseCompass,
  parseGusset,
  parseIhrChalice,
  parseIhrMonocle,
  parseIhrDeflector,
  parseIhrSiab,
} from '../../../../utils/predictcs/artifacts.js';

describe('utils/predictcs/model', () => {
  it('builds a predict CS model', async () => {
    const playerArtifacts = [
      {
        deflector: parseDeflector('T4L Defl.'),
        metro: parseMetro('T4L Metro'),
        compass: parseCompass('T4L Compass'),
        gusset: parseGusset('T4L Gusset'),
      },
      {
        deflector: parseDeflector('T4E Defl.'),
        metro: parseMetro('T4E Metro'),
        compass: parseCompass('T4E Compass'),
        gusset: parseGusset('T4E Gusset'),
      },
    ];

    const playerIhrArtifacts = [
      {
        chalice: parseIhrChalice('T4L Chalice'),
        monocle: parseIhrMonocle('T4L Monocle'),
        deflector: parseIhrDeflector('T4L Defl.'),
        siab: parseIhrSiab('T4L SIAB'),
      },
      {
        chalice: parseIhrChalice('T4E Chalice'),
        monocle: parseIhrMonocle('T4E Monocle'),
        deflector: parseIhrDeflector('T4E Defl.'),
        siab: parseIhrSiab('T4E SIAB'),
      },
    ];

    const playerTe = [120, 80];
    const boostOrder = buildBoostOrder('te', playerTe);

    const model = await buildPredictCsModel({
      players: 2,
      durationSeconds: 120,
      targetEggs: 1e9,
      tokenTimerMinutes: 4,
      giftMinutes: 6,
      gg: true,
      playerArtifacts,
      playerIhrArtifacts,
      playerTe,
      boostOrder,
      siabEnabled: true,
    });

    expect(model.players).toBe(2);
    expect(model.deflectorPlan.totalDeflector).toBeGreaterThan(0);
    expect(model.deflectorDisplay.displayDeflectors.length).toBe(2);
    expect(model.tokensByPlayer.length).toBe(2);
    expect(model.usePlayer1Siab).toBe(true);
  });

  it('builds boost orders', () => {
    const playerTe = [10, 20, 20, 5];
    const defaultOrder = buildBoostOrder('default', playerTe);
    expect(defaultOrder).toEqual([0, 1, 2, 3]);

    const randomOrder = buildBoostOrder('random', playerTe);
    const randomSorted = [...randomOrder].sort((a, b) => a - b);
    expect(randomSorted).toEqual([0, 1, 2, 3]);

    const teOrder = buildBoostOrder('te', playerTe);
    const teSorted = [...teOrder].sort((a, b) => a - b);
    expect(teSorted).toEqual([0, 1, 2, 3]);
  });
});
