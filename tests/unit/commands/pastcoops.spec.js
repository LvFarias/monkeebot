import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  chunkContent: (input) => [Array.isArray(input) ? input.join('\n') : String(input)],
}));

vi.mock('../../../services/coopService.js', () => ({
  fetchPastCoops: vi.fn(),
}));

import { execute } from '../../../commands/pastcoops.js';
import { fetchPastCoops } from '../../../services/coopService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/pastcoops', () => {
  it('responds when there are no rows', async () => {
    fetchPastCoops.mockReturnValue([]);

    const interaction = createInteraction({
      options: createOptions({}),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0]).toContain('No coops recorded');
  });

  it('sends a paged response when rows exist', async () => {
    fetchPastCoops.mockReturnValue([{ coop: 'coop1', cnt: 2 }]);

    const interaction = createInteraction({
      options: createOptions({}),
      channelSend: vi.fn(async () => {}),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
  });
});
