import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/database/index.js', () => ({
  getSeasonHelpers: vi.fn(),
  getAllSeasons: vi.fn(),
}));

import { fetchSeasonHelpers, listSeasons } from '../../../services/seasonService.js';
import { getSeasonHelpers, getAllSeasons } from '../../../utils/database/index.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('services/seasonService', () => {
  it('fetches season helpers', async () => {
    getSeasonHelpers.mockReturnValue([{ discord_id: '1', count: 2 }]);

    const result = await fetchSeasonHelpers({ season: 'fall_2025', pushOnly: false, seasonalOnly: true });

    expect(getSeasonHelpers).toHaveBeenCalledWith({ season: 'fall_2025', pushOnly: false, seasonalOnly: true });
    expect(result.length).toBe(1);
  });

  it('lists seasons', () => {
    getAllSeasons.mockReturnValue(['fall_2025']);
    expect(listSeasons()).toEqual(['fall_2025']);
  });
});
