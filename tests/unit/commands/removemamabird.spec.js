import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../utils/permissions.js', () => ({
  requireMamaBird: vi.fn(),
}));

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
  extractDiscordId: (value) => {
    if (!value) return null;
    const match = /\d{17,20}/.exec(String(value));
    return match ? match[0] : null;
  },
}));

vi.mock('../../../services/mamabirdService.js', () => ({
  revokeMamaBird: vi.fn(),
  checkMamaBird: vi.fn(),
}));

import { execute } from '../../../commands/removemamabird.js';
import { requireMamaBird } from '../../../utils/permissions.js';
import { revokeMamaBird, checkMamaBird } from '../../../services/mamabirdService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/removemamabird', () => {
  it('rejects invalid target id', async () => {
    requireMamaBird.mockResolvedValue(true);
    checkMamaBird.mockReturnValue(true);

    const interaction = createInteraction({
      options: createOptions({ strings: { user: 'nope' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('valid Discord ID');
  });

  it('responds when target is not a Mama Bird', async () => {
    requireMamaBird.mockResolvedValue(true);
    checkMamaBird.mockReturnValue(false);

    const interaction = createInteraction({
      options: createOptions({ strings: { user: '<@123456789012345678>' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('not currently a Mama Bird');
  });

  it('replies with success when revoke succeeds', async () => {
    requireMamaBird.mockResolvedValue(true);
    checkMamaBird.mockReturnValue(true);
    revokeMamaBird.mockReturnValue({ ok: true });

    const interaction = createInteraction({
      options: createOptions({ strings: { user: '<@123456789012345678>' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Revoked Mama Bird');
  });
});
