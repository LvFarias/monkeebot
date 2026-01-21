import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
  chunkContent: (input) => [Array.isArray(input) ? input.join('\n') : String(input)],
}));

vi.mock('../../../services/leaderboardService.js', () => ({
  buildLeaderboardReport: vi.fn(),
}));

vi.mock('../../../services/seasonService.js', () => ({
  listSeasons: vi.fn(),
}));

import { execute, autocomplete } from '../../../commands/leaderboard.js';
import { buildLeaderboardReport } from '../../../services/leaderboardService.js';
import { listSeasons } from '../../../services/seasonService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/leaderboard', () => {
  it('renders leaderboard results', async () => {
    buildLeaderboardReport.mockResolvedValue({
      scope: 'fall_2025',
      matches: [{ rank: 1, alias: 'Ace', discordId: '111' }],
    });

    const interaction = createInteraction({
      options: createOptions({ strings: { season: 'fall_2025' } }),
    });

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it('handles report errors', async () => {
    buildLeaderboardReport.mockRejectedValue(new Error('boom'));

    const interaction = createInteraction({
      options: createOptions({ strings: { season: 'fall_2025' } }),
    });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.editReply.mock.calls[0][0].content).toContain('boom');
  });

  it('autocomplete lists seasons', async () => {
    listSeasons.mockReturnValue(['fall_2025', 'winter_2025']);

    const interaction = createInteraction({
      options: createOptions({ focused: 'fall' }),
    });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalled();
  });
});
