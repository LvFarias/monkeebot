import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

import { execute } from '../../../commands/timestamp.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/timestamp', () => {
  it('rejects offsets without sign', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '1.5' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Offsets must start with + or -');
  });

  it('rejects empty offsets', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Provide an offset');
  });

  it('rejects sign-only offsets', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '+' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Add a numeric offset after the sign');
  });

  it('rejects non-numeric decimal offsets', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '+abc' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Use decimal hours');
  });

  it('rejects HH:MM offsets with multiple colons', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '+1:2:3' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Use exactly one colon');
  });

  it('rejects HH:MM offsets missing minutes', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '+2:' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('HH:MM offsets require both hours and minutes');
  });

  it('rejects HH:MM offsets missing hours', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '+:30' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('HH:MM offsets require both hours and minutes');
  });

  it('rejects HH:MM offsets with non-numeric parts', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '+a:30' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Hours and minutes must be whole numbers');
  });

  it('rejects HH:MM offsets with minutes >= 60', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '+1:60' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Minutes must be less than 60');
  });

  it('emits a discord timestamp for valid input', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '+0.5', format: 'R' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('<t:');
  });

  it('accepts whitespace in offsets', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '+ 0 : 30', format: 'R' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('<t:');
  });

  it('handles negative offsets', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '-0.5', format: 'R' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('<t:');
  });

  it('defaults to relative format when unknown format is provided', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'eitime', offset: '+0:30', format: 'X' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    const content = interaction.reply.mock.calls[0][0].content;
    expect(content).toContain('EI time +0:30');
    expect(content).toContain(':R>');
  });

  it('uses followUp when interaction is deferred', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '+0.5', format: 'R' } }),
    });
    interaction.deferred = true;

    await execute(interaction);

    expect(interaction.followUp).toHaveBeenCalled();
  });

  it('returns ephemeral errors', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '1.5' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].flags).toBe(64);
  });
});
