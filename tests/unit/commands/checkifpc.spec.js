import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
  chunkContent: (input) => [Array.isArray(input) ? input.join('\n') : String(input)],
}));

vi.mock('../../../services/contractService.js', () => ({
  fetchContractSummaries: vi.fn(),
}));

vi.mock('../../../services/coopService.js', () => ({
  checkCoopForKnownPlayers: vi.fn(),
  findFreeCoopCodes: vi.fn(),
  listCoops: vi.fn(),
}));

import { execute } from '../../../commands/checkifpc.js';
import { fetchContractSummaries } from '../../../services/contractService.js';
import { checkCoopForKnownPlayers, findFreeCoopCodes, listCoops } from '../../../services/coopService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/checkifpc', () => {
  it('rejects empty contract input', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { contract: '' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Please choose a contract');
  });

  it('reports cooptracker link when known players are found', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'Contract 1' }]);
    findFreeCoopCodes.mockResolvedValue({ filteredResults: [], coopCodes: [] });
    listCoops.mockReturnValue([]);
    checkCoopForKnownPlayers
      .mockResolvedValueOnce({ ok: true, matched: [{ ign: 'Player1', discordId: '123' }], missing: [] })
      .mockResolvedValue({ ok: true, matched: [], missing: [] });

    const interaction = createInteraction({
      options: createOptions({ strings: { contract: 'c1' } }),
    });
    interaction.channel.isTextBased = () => true;
    interaction.channel.isDMBased = () => true;

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(checkCoopForKnownPlayers).toHaveBeenCalled();

    const sent = interaction.channel.send.mock.calls
      .map(call => call?.[0]?.content ?? '')
      .join('\n');
    expect(sent).toContain('https://eicoop-carpet.netlify.app/c1/');
  });
});
