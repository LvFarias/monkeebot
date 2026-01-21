import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../utils/permissions.js', () => ({
  requireMamaBird: vi.fn(),
}));

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

import { execute } from '../../../commands/ban.js';
import { requireMamaBird } from '../../../utils/permissions.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/ban', () => {
  it('does nothing when permission check fails', async () => {
    requireMamaBird.mockResolvedValue(false);
    const interaction = createInteraction({
      options: createOptions({ strings: { user: '<@123>', reason: 'bad' } }),
    });

    await execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('rejects invalid user input', async () => {
    requireMamaBird.mockResolvedValue(true);
    const interaction = createInteraction({
      options: createOptions({ strings: { user: 'nope', reason: 'bad' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('valid Discord ID');
  });

  it('rejects empty reason input', async () => {
    requireMamaBird.mockResolvedValue(true);
    const interaction = createInteraction({
      options: createOptions({ strings: { user: '<@123456789012345678>', reason: '   ' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('non-empty reason');
  });

  it('replies with a ban confirmation', async () => {
    requireMamaBird.mockResolvedValue(true);
    const interaction = createInteraction({
      options: createOptions({ strings: { user: '<@123456789012345678>', reason: 'spoilers' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('banned <@123456789012345678>');
  });
});
