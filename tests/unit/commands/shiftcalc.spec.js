import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

import { execute } from '../../../commands/ShiftCalc.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/shiftcalc', () => {
  it('rejects percent initial value', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { initial: '50%', target: '10s' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Initial SE must be a number');
  });

  it('returns an embed for valid input', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { initial: '100s', target: '50s' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].embeds).toBeDefined();
  });
});
