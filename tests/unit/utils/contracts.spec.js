import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('protobufjs', () => ({
  default: {
    load: vi.fn(async () => ({
      lookupType: () => ({
        decode: () => ({}),
      }),
      lookupEnum: () => ({ valuesById: {} }),
    })),
  },
}));

vi.mock('../../../utils/database/index.js', () => ({
  getStoredContracts: vi.fn(),
  getMeta: vi.fn(),
  setMeta: vi.fn(),
  upsertContracts: vi.fn(),
}));

import axios from 'axios';
import { activeContracts, getAllContracts, refreshContractsCache } from '../../../utils/contracts.js';
import { getStoredContracts, getMeta, setMeta } from '../../../utils/database/index.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-19T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('utils/contracts', () => {
  it('returns stored contracts when refresh is not needed', async () => {
    getMeta.mockReturnValue(DateTime.now().toISO());
    getStoredContracts.mockReturnValue([{ id: 'c1', release: 1 }]);

    const result = await getAllContracts();

    expect(result.length).toBe(1);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('computes active contracts', async () => {
    getMeta.mockReturnValue(DateTime.now().toISO());
    const nowSeconds = Math.floor(DateTime.now().toSeconds());
    getStoredContracts.mockReturnValue([
      { id: 'c1', name: 'A', season: 'fall_2025', release: nowSeconds },
      { id: 'c2', name: 'B', season: 'summer_2025', release: nowSeconds },
    ]);

    const result = await activeContracts();

    expect(result.seasonal.length).toBeGreaterThan(0);
  });

  it('refreshes contracts cache', async () => {
    axios.get.mockResolvedValue({ data: null });
    await refreshContractsCache();
    expect(setMeta).toHaveBeenCalled();
  });
});
