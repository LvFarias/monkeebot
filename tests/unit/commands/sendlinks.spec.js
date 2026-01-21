import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

vi.mock('../../../services/coopService.js', () => ({
  listAllCoops: vi.fn(),
}));

vi.mock('node:fs', () => {
  const fsMock = {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
  return { default: fsMock, ...fsMock };
});

import { execute } from '../../../commands/sendlinks.js';
import { listAllCoops } from '../../../services/coopService.js';
import fs from 'node:fs';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/sendlinks', () => {
  it('responds when there are no coops', async () => {
    listAllCoops.mockReturnValue([]);

    const interaction = createInteraction({
      options: createOptions(),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('No coops found');
  });

  it('writes and deletes a links file', async () => {
    fs.existsSync.mockReturnValue(false);
    listAllCoops.mockReturnValue([{ contract: 'c1', coop: 'coop1' }]);

    const interaction = createInteraction({
      options: createOptions(),
    });

    await execute(interaction);

    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(fs.unlinkSync).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
  });
});
