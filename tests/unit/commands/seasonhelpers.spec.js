import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
  chunkContent: (input) => [Array.isArray(input) ? input.join('\n') : String(input)],
}));

vi.mock('../../../services/seasonService.js', () => ({
  fetchSeasonHelpers: vi.fn(),
}));

import { execute } from '../../../commands/seasonhelpers.js';
import { fetchSeasonHelpers } from '../../../services/seasonService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/seasonhelpers', () => {
  it('replies when no helpers exist', async () => {
    fetchSeasonHelpers.mockResolvedValue([]);

    const interaction = createInteraction({
      options: createOptions({ strings: { season: 'fall_2025' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('No helpers found');
  });

  it('renders helper breakdown', async () => {
    fetchSeasonHelpers.mockResolvedValue([
      {
        discord_id: '111',
        count: 3,
        breakdown: [{ discord_id: '111', count: 2 }, { discord_id: '222', count: 1 }],
      },
    ]);

    const interaction = createInteraction({
      options: createOptions({ strings: { season: 'fall_2025' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
  });
});
