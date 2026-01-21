import { describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

import { execute, isMonkeeEnabled } from '../../../commands/monkee.js';

describe('commands/monkee', () => {
  it('blocks non-owner users', async () => {
    const interaction = createInteraction({
      userId: 'not-the-owner',
      options: createOptions({ subcommand: 'on' }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('not authorized');
  });

  it('toggles monkee on and off', async () => {
    const interactionOn = createInteraction({
      userId: '659339631564947456',
      options: createOptions({ subcommand: 'on' }),
    });

    await execute(interactionOn);
    expect(isMonkeeEnabled()).toBe(true);

    const interactionOff = createInteraction({
      userId: '659339631564947456',
      options: createOptions({ subcommand: 'off' }),
    });

    await execute(interactionOff);
    expect(isMonkeeEnabled()).toBe(false);
  });
});
