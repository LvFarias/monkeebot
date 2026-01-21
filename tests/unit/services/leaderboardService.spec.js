import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('../../../utils/database/index.js', () => ({
  listMembersWithIgn: vi.fn(),
}));

import axios from 'axios';
import { fetchLeaderboardEntries, buildLeaderboardReport } from '../../../services/leaderboardService.js';
import { listMembersWithIgn } from '../../../utils/database/index.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('services/leaderboardService', () => {
  it('requires a scope', async () => {
    await expect(fetchLeaderboardEntries({ scope: '' })).rejects.toThrow('Scope is required');
  });

  it('sanitizes leaderboard entries', async () => {
    axios.get.mockResolvedValue({
      data: {
        topEntriesList: [
          { alias: ' aoo ', rank: 2, score: 1000 },
          { alias: '', rank: 3, score: 999 },
          { alias: 'foo', rank: '1', score: 'not-a-number' },
        ],
      },
    });

    const entries = await fetchLeaderboardEntries({ scope: 'fall_2025' });
    expect(entries.length).toBe(2);
    expect(entries[0].alias).toBe('foo');
    expect(entries[0].rank).toBe(1);
  });

  it('builds a report with matches and missing entries', async () => {
    axios.get.mockResolvedValue({
      data: {
        topEntriesList: [
          { alias: 'aoo', rank: 1, score: 100 },
          { alias: 'foo', rank: 2, score: 90 },
        ],
      },
    });

    listMembersWithIgn.mockReturnValue([
      { discord_id: '111', ign: 'aoo' },
      { discord_id: '222', ign: 'goo' },
    ]);

    const report = await buildLeaderboardReport({ scope: 'fall_2025' });
    expect(report.matches.length).toBe(1);
    expect(report.unmatchedMembers.length).toBe(1);
    expect(report.missingEntries.length).toBe(1);
  });
});
