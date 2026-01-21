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
  grantMamaBird: vi.fn(),
  checkMamaBird: vi.fn(),
}));

import { execute } from '../../../commands/addmamabird.js';
import { requireMamaBird } from '../../../utils/permissions.js';
import { grantMamaBird, checkMamaBird } from '../../../services/mamabirdService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/addmamabird', () => {
  it('rejects invalid target id', async () => {
    requireMamaBird.mockResolvedValue(true);
    checkMamaBird.mockReturnValue(false);

    const interaction = createInteraction({
      options: createOptions({ strings: { user: 'invalid' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('valid Discord ID');
  });

  it('short-circuits when target is already a Mama Bird', async () => {
    requireMamaBird.mockResolvedValue(true);
    checkMamaBird.mockReturnValue(true);

    const interaction = createInteraction({
      options: createOptions({ strings: { user: '<@123456789012345678>' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('already a Mama Bird');
    expect(grantMamaBird).not.toHaveBeenCalled();
  });

  it('replies with success when grant succeeds', async () => {
    requireMamaBird.mockResolvedValue(true);
    checkMamaBird.mockReturnValue(false);
    grantMamaBird.mockReturnValue({ ok: true });

    const interaction = createInteraction({
      options: createOptions({ strings: { user: '<@123456789012345678>' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Granted Mama Bird');
  });

  it('handles service failures', async () => {
    requireMamaBird.mockResolvedValue(true);
    checkMamaBird.mockReturnValue(false);
    grantMamaBird.mockReturnValue({ ok: false, reason: 'db-down' });

    const interaction = createInteraction({
      options: createOptions({ strings: { user: '<@123456789012345678>' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Failed to grant');
  });
});
