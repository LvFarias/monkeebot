import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

import { execute } from '../../../commands/whenthefuckis.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/whenthefuckis', () => {
  it('rejects unknown selections', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { target: 'unknown' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('no clue');
  });

  it('flags contract drop when it is right now', async () => {
    vi.useFakeTimers();
    const now = DateTime.fromISO('2026-01-19T17:00:00.000Z').toJSDate();
    vi.setSystemTime(now);

    const interaction = createInteraction({
      options: createOptions({ strings: { target: 'contract-drop' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('right the fuck now');

    vi.useRealTimers();
  });
});
