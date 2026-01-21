import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
  chunkContent: (input) => [Array.isArray(input) ? input.join('\n') : String(input)],
  MAX_DISCORD_COMPONENT_LENGTH: 4000,
}));

vi.mock('../../../services/coopService.js', () => ({
  fetchPushReports: vi.fn(),
}));

import { execute } from '../../../commands/pushReport.js';
import { fetchPushReports } from '../../../services/coopService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/pushreport', () => {
  it('replies when no rows exist', async () => {
    fetchPushReports.mockReturnValue([]);

    const interaction = createInteraction({
      options: createOptions({ strings: { season: 'fall_2025' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('No push runs');
  });

  it('sends output chunks', async () => {
    fetchPushReports.mockReturnValue([
      { egg: 'contract', name: 'Name', contract: 'c1', coop: 'coop1', report: 'http://x' },
    ]);

    const interaction = createInteraction({
      options: createOptions({ strings: { season: 'fall_2025' } }),
      channelSend: vi.fn(async () => {}),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
  });
});
