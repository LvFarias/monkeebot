import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
  chunkContent: (input) => [Array.isArray(input) ? input.join('\n') : String(input)],
}));

vi.mock('../../../services/contractService.js', () => ({
  fetchActiveContracts: vi.fn(),
  fetchContractSummaries: vi.fn(),
}));

vi.mock('../../../services/coopService.js', () => ({
  findFreeCoopCodes: vi.fn(),
}));

import { execute } from '../../../commands/freecoops.js';
import { fetchActiveContracts, fetchContractSummaries } from '../../../services/contractService.js';
import { findFreeCoopCodes } from '../../../services/coopService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/freecoops', () => {
  it('rejects empty contract input', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { contract: '' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Please choose a contract');
  });

  it('builds a report for selected contract', async () => {
    fetchActiveContracts.mockResolvedValue({ seasonal: [['Name', 'c1']], leggacy: [] });
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'Contract 1' }]);
    findFreeCoopCodes.mockResolvedValue({ filteredResults: ['aa'], coopCodes: ['aa'] });

    const interaction = createInteraction({
      options: createOptions({ strings: { contract: 'c1' } }),
    });

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });
});
