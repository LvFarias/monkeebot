import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

vi.mock('../../../services/contractService.js', () => ({
  refreshContracts: vi.fn(),
}));

vi.mock('../../../utils/permissions.js', () => ({
  requireMamaBird: vi.fn(),
}));

import { execute } from '../../../commands/forcerefresh.js';
import { refreshContracts } from '../../../services/contractService.js';
import { requireMamaBird } from '../../../utils/permissions.js';

beforeEach(() => {
  vi.clearAllMocks();
  requireMamaBird.mockResolvedValue(true);
});

describe('commands/forcerefresh', () => {
  it('reports contract refresh success', async () => {
    refreshContracts.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

    const interaction = createInteraction({
      options: createOptions(),
    });

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.editReply.mock.calls[0][0].content).toContain('Contracts refreshed');
  });
});
