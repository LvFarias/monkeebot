import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../utils/permissions.js', () => ({
  requireMamaBird: vi.fn(),
}));

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
  chunkContent: (input) => [Array.isArray(input) ? input.join('\n') : String(input)],
  isValidHttpUrl: vi.fn(),
}));

vi.mock('../../../services/coopService.js', () => ({
  addCoopFromInput: vi.fn(),
  removeCoop: vi.fn(),
  updatePushFlag: vi.fn(),
  addPlayersToCoop: vi.fn(),
  addCoopIfMissing: vi.fn(),
  listCoops: vi.fn(),
  saveCoopReport: vi.fn(),
  clearCoopReport: vi.fn(),
  removePlayersFromCoopService: vi.fn(),
  autoPopulateCoopMembers: vi.fn(),
}));

vi.mock('../../../services/contractService.js', () => ({
  fetchContractSummaries: vi.fn(),
}));

import { execute, autocomplete } from '../../../commands/coop.js';
import { requireMamaBird } from '../../../utils/permissions.js';
import {
  addCoopFromInput,
  removeCoop,
  updatePushFlag,
  addPlayersToCoop,
  addCoopIfMissing,
  listCoops,
  saveCoopReport,
  clearCoopReport,
  removePlayersFromCoopService,
  autoPopulateCoopMembers,
} from '../../../services/coopService.js';
import { isValidHttpUrl } from '../../../services/discord.js';
import { fetchContractSummaries } from '../../../services/contractService.js';

beforeEach(() => {
  vi.clearAllMocks();
  requireMamaBird.mockResolvedValue(true);
  addCoopFromInput.mockReset();
  autoPopulateCoopMembers.mockReset();
});

describe('commands/coop execute', () => {
  it('rejects invalid addcoop input', async () => {
    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'addcoop',
        strings: { url: 'http://x', contract: 'c', coop: 'c2' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Provide either a URL');
  });

  it('adds a coop and reports success', async () => {
    addCoopFromInput.mockResolvedValueOnce({ ok: true, contract: 'c1', coop: 'coop1' });
    autoPopulateCoopMembers.mockResolvedValueOnce({ ok: true, matched: [], missing: [], departedCount: 0 });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'addcoop',
        strings: { url: 'c1/coop1' },
        booleans: { push: false },
      }),
    });

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.editReply.mock.calls[0][0].content).toContain('Added coop');
  });

  it('rejects addcoop when contract/coop pair is incomplete', async () => {
    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'addcoop',
        strings: { contract: 'c1' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Provide both contract and coop');
  });

  it('rejects addcoop when no input is provided', async () => {
    const interaction = createInteraction({
      options: createOptions({ subcommand: 'addcoop' }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Provide a coop URL');
  });

  it('reports addcoop failures from service', async () => {
    const reasons = [
      { reason: 'missing-input', expected: 'Please provide a coop URL' },
      { reason: 'invalid-path', expected: 'Invalid path' },
      { reason: 'unknown-contract', expected: 'Invalid contract id' },
      { reason: 'exists', expected: 'already exists' },
      { reason: 'invalid-input', expected: 'Invalid contract or coop' },
      { reason: 'other', expected: 'Error adding coop' },
    ];

    for (const { reason, expected } of reasons) {
      addCoopFromInput.mockResolvedValueOnce({ ok: false, reason, contract: 'c1', coop: 'coop1' });
      autoPopulateCoopMembers.mockResolvedValueOnce({ ok: true, matched: [], missing: [], departedCount: 0 });

      const interaction = createInteraction({
        options: createOptions({
          subcommand: 'addcoop',
          strings: { url: 'c1/coop1' },
        }),
      });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalled();
      expect(interaction.editReply.mock.calls[0][0].content).toContain(expected);
    }
  });

  it('includes auto-populate failure details in addcoop reply', async () => {
    addCoopFromInput.mockResolvedValueOnce({ ok: true, contract: 'c1', coop: 'coop1' });
    autoPopulateCoopMembers.mockResolvedValueOnce({ ok: false, reason: 'no-access' });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'addcoop',
        strings: { url: 'c1/coop1' },
      }),
    });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.editReply.mock.calls[0][0].content).toContain('unable to fetch contributors');
  });

  it('includes auto-populate matched/missing/departed sections', async () => {
    addCoopFromInput.mockResolvedValueOnce({ ok: true, contract: 'c1', coop: 'coop1' });
    autoPopulateCoopMembers.mockResolvedValueOnce({
      ok: true,
      matched: [
        { discordId: '1', ign: 'boo', status: 'linked' },
        { discordId: '2', ign: 'coo', status: 'already' },
      ],
      missing: ['doo'],
      departedCount: 2,
    });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'addcoop',
        strings: { url: 'c1/coop1' },
      }),
    });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain('automatically found');
    expect(content).toContain('<@1>');
    expect(content).toContain('<@2>');
    expect(content).toContain("wasn't able to find");
    expect(content).toContain('departed');
  });

  it('adds push note for addcoop when push is true', async () => {
    addCoopFromInput.mockResolvedValue({ ok: true, contract: 'c1', coop: 'coop1' });
    autoPopulateCoopMembers.mockResolvedValue({ ok: true, matched: [], missing: [], departedCount: 0 });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'addcoop',
        strings: { url: 'c1/coop1' },
        booleans: { push: true },
      }),
    });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.editReply.mock.calls[0][0].content).toContain('added as a push coop');
  });

  it('handles addreport invalid url', async () => {
    isValidHttpUrl.mockReturnValue(false);

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'addreport',
        strings: { contract: 'c1', coop: 'coop1', report: 'nope' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Report must be a valid http');
  });

  it('handles addreport missing inputs', async () => {
    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'addreport',
        strings: { contract: 'c1', coop: 'coop1' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Please provide contract');
  });

  it('handles addreport ensure failure', async () => {
    isValidHttpUrl.mockReturnValue(true);
    addCoopIfMissing.mockResolvedValue({ ok: false, reason: 'unknown-contract' });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'addreport',
        strings: { contract: 'c1', coop: 'coop1', report: 'https://x.test' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Invalid contract ID');
  });

  it('handles addreport save failures', async () => {
    isValidHttpUrl.mockReturnValue(true);
    addCoopIfMissing.mockResolvedValue({ ok: true });

    const failures = [
      { reason: 'exists', expected: 'already exists' },
      { reason: 'invalid-url', expected: 'valid http' },
      { reason: 'other', expected: 'Failed to store report' },
    ];

    for (const { reason, expected } of failures) {
      saveCoopReport.mockResolvedValueOnce({ ok: false, reason });

      const interaction = createInteraction({
        options: createOptions({
          subcommand: 'addreport',
          strings: { contract: 'c1', coop: 'coop1', report: 'https://x.test' },
        }),
      });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalled();
      expect(interaction.reply.mock.calls[0][0].content).toContain(expected);
    }
  });

  it('handles addreport success', async () => {
    isValidHttpUrl.mockReturnValue(true);
    addCoopIfMissing.mockResolvedValue({ ok: true });
    saveCoopReport.mockResolvedValue({ ok: true });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'addreport',
        strings: { contract: 'c1', coop: 'coop1', report: 'https://x.test' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Report saved');
  });

  it('handles removecoop success and failure', async () => {
    removeCoop.mockReturnValueOnce({ ok: true });
    removeCoop.mockReturnValueOnce({ ok: false });

    const success = createInteraction({
      options: createOptions({
        subcommand: 'removecoop',
        strings: { contract: 'c1', coop: 'coop1' },
      }),
    });
    await execute(success);

    const failure = createInteraction({
      options: createOptions({
        subcommand: 'removecoop',
        strings: { contract: 'c1', coop: 'coop1' },
      }),
    });
    await execute(failure);

    expect(success.reply).toHaveBeenCalled();
    expect(success.reply.mock.calls[0][0].content).toContain('removed');
    expect(failure.reply).toHaveBeenCalled();
    expect(failure.reply.mock.calls[0][0].content).toContain('not found');
  });

  it('handles addplayers invalid input', async () => {
    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'addplayers',
        strings: { contract: 'c1', coop: 'coop1' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Invalid input');
  });

  it('handles addplayers errors and success', async () => {
    addPlayersToCoop.mockResolvedValueOnce({ ok: false, reason: 'unknown-contract' });
    addPlayersToCoop.mockResolvedValueOnce({ ok: false, reason: 'coop-not-found' });
    addPlayersToCoop.mockResolvedValueOnce({
      ok: true,
      newlyLinked: ['1'],
      alreadyLinked: ['2'],
    });

    const invalidContract = createInteraction({
      options: createOptions({
        subcommand: 'addplayers',
        strings: { contract: 'c1', coop: 'coop1', users: 'u1' },
      }),
    });
    await execute(invalidContract);
    expect(invalidContract.reply).toHaveBeenCalled();
    expect(invalidContract.reply.mock.calls[0][0].content).toContain('Invalid contract ID');

    const missingCoop = createInteraction({
      options: createOptions({
        subcommand: 'addplayers',
        strings: { contract: 'c1', coop: 'coop1', users: 'u1' },
      }),
    });
    await execute(missingCoop);
    expect(missingCoop.reply).toHaveBeenCalled();
    expect(missingCoop.reply.mock.calls[0][0].content).toContain('does not exist');

    const success = createInteraction({
      options: createOptions({
        subcommand: 'addplayers',
        strings: { contract: 'c1', coop: 'coop1', users: 'u1' },
      }),
    });
    await execute(success);
    expect(success.reply).toHaveBeenCalled();
    expect(success.reply.mock.calls[0][0].content).toContain('Linked 1 player');
    expect(success.reply.mock.calls[0][0].content).toContain('<@1>');
    expect(success.reply.mock.calls[0][0].content).toContain('already in the coop');
  });

  it('handles removeplayer errors', async () => {
    removePlayersFromCoopService.mockReturnValue({ ok: false, reason: 'no-users' });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'removeplayer',
        strings: { contract: 'c1', coop: 'coop1', users: 'bad' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('No valid Discord IDs');
  });

  it('handles removeplayer invalid input and success', async () => {
    removePlayersFromCoopService.mockReturnValueOnce({ ok: false, reason: 'invalid-input' });
    removePlayersFromCoopService.mockReturnValueOnce({
      ok: true,
      removedCount: 2,
      removedIds: ['1', '2'],
      contract: 'c1',
      coop: 'coop1',
    });

    const invalid = createInteraction({
      options: createOptions({
        subcommand: 'removeplayer',
        strings: { contract: 'c1', coop: 'coop1', users: 'bad' },
      }),
    });
    await execute(invalid);
    expect(invalid.reply).toHaveBeenCalled();
    expect(invalid.reply.mock.calls[0][0].content).toContain('Invalid input');

    const success = createInteraction({
      options: createOptions({
        subcommand: 'removeplayer',
        strings: { contract: 'c1', coop: 'coop1', users: 'u1 u2' },
      }),
    });
    await execute(success);
    expect(success.reply).toHaveBeenCalled();
    expect(success.reply.mock.calls[0][0].content).toContain('Removed 2 user');
    expect(success.reply.mock.calls[0][0].content).toContain('<@1>');
    expect(success.reply.mock.calls[0][0].content).toContain('<@2>');
  });

  it('handles setpush already-set responses', async () => {
    updatePushFlag.mockReturnValue({ ok: false, already: true });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'setpush',
        strings: { contract: 'c1', coop: 'coop1' },
        booleans: { push: true },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('already set');
  });

  it('handles setpush failure and success', async () => {
    updatePushFlag.mockReturnValueOnce({ ok: false, already: false, reason: 'oops' });
    updatePushFlag.mockReturnValueOnce({ ok: true });

    const failure = createInteraction({
      options: createOptions({
        subcommand: 'setpush',
        strings: { contract: 'c1', coop: 'coop1' },
        booleans: { push: false },
      }),
    });
    await execute(failure);
    expect(failure.reply).toHaveBeenCalled();
    expect(failure.reply.mock.calls[0][0].content).toContain('Failed to update push');

    const success = createInteraction({
      options: createOptions({
        subcommand: 'setpush',
        strings: { contract: 'c1', coop: 'coop1' },
        booleans: { push: true },
      }),
    });
    await execute(success);
    expect(success.reply).toHaveBeenCalled();
    expect(success.reply.mock.calls[0][0].content).toContain('Set push flag');
  });

  it('handles removereport missing inputs, errors, and success', async () => {
    clearCoopReport.mockReturnValueOnce({ ok: false, reason: 'missing-report' });
    clearCoopReport.mockReturnValueOnce({ ok: false, reason: 'invalid-input' });
    clearCoopReport.mockReturnValueOnce({ ok: true });

    const missing = createInteraction({
      options: createOptions({
        subcommand: 'removereport',
        strings: { contract: 'c1' },
      }),
    });
    await execute(missing);
    expect(missing.reply).toHaveBeenCalled();
    expect(missing.reply.mock.calls[0][0].content).toContain('Please provide both contract and coop');

    const noReport = createInteraction({
      options: createOptions({
        subcommand: 'removereport',
        strings: { contract: 'c1', coop: 'coop1' },
      }),
    });
    await execute(noReport);
    expect(noReport.reply).toHaveBeenCalled();
    expect(noReport.reply.mock.calls[0][0].content).toContain('No report is stored');

    const invalid = createInteraction({
      options: createOptions({
        subcommand: 'removereport',
        strings: { contract: 'c1', coop: 'coop1' },
      }),
    });
    await execute(invalid);
    expect(invalid.reply).toHaveBeenCalled();
    expect(invalid.reply.mock.calls[0][0].content).toContain('Please provide both contract and coop');

    const success = createInteraction({
      options: createOptions({
        subcommand: 'removereport',
        strings: { contract: 'c1', coop: 'coop1' },
      }),
    });
    await execute(success);
    expect(success.reply).toHaveBeenCalled();
    expect(success.reply.mock.calls[0][0].content).toContain('Report removed');
  });

  it('handles unknown subcommands', async () => {
    const interaction = createInteraction({
      options: createOptions({ subcommand: 'unknown' }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Unknown subcommand');
  });
});

describe('commands/coop autocomplete', () => {
  it('responds with contract matches', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'fall_2025', name: 'Fall Contract', release: 2 },
      { id: 'spring_2025', name: 'Spring Contract', release: 1 },
    ]);

    const interaction = createInteraction({
      options: createOptions({
        focused: 'fall',
        focusedOptionName: 'contract',
      }),
    });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalled();
    expect(interaction.respond.mock.calls[0][0][0].value).toBe('fall_2025');
  });

  it('responds with coop matches when contract is selected', async () => {
    listCoops.mockReturnValue(['coop1', 'coop2']);

    const interaction = createInteraction({
      options: createOptions({
        focused: 'coop',
        focusedOptionName: 'coop',
        strings: { contract: 'c1' },
      }),
    });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalled();
    expect(interaction.respond.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it('returns empty results when coop autocomplete has no contract', async () => {
    const interaction = createInteraction({
      options: createOptions({
        focused: 'coop',
        focusedOptionName: 'coop',
      }),
    });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalled();
    expect(interaction.respond.mock.calls[0][0]).toEqual([]);
  });

  it('returns empty results for unknown autocomplete option', async () => {
    const interaction = createInteraction({
      options: createOptions({
        focused: 'anything',
        focusedOptionName: 'other',
      }),
    });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalled();
    expect(interaction.respond.mock.calls[0][0]).toEqual([]);
  });
});
