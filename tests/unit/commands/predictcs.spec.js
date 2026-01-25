import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction } from './helpers.js';

vi.mock('../../../services/contractService.js', () => ({
  fetchContractSummaries: vi.fn(),
}));

vi.mock('../../../services/discord.js', () => ({
  chunkContent: vi.fn((lines) => (Array.isArray(lines) ? [lines.join('\n')] : [String(lines)])),
  createDiscordProgressReporter: vi.fn(() => vi.fn(async () => {})),
  createTextComponentMessage: vi.fn((content, options) => ({ content, ...options })),
  startDeferredReplyHeartbeat: vi.fn(() => () => {}),
}));

vi.mock('../../../utils/predictcs/sandbox.js', () => ({
  parseSandboxUrl: vi.fn(),
}));

vi.mock('../../../utils/predictcs/model.js', () => ({
  buildBoostOrder: vi.fn(() => [0]),
  buildPredictCsModel: vi.fn(() => ({ mock: true })),
}));

vi.mock('../../../utils/predictmaxcs/display.js', () => ({
  buildPlayerTableLines: vi.fn(() => ['line1']),
  formatEggs: vi.fn(() => '1T'),
  secondsToHuman: vi.fn(() => '1h'),
}));

import { execute, autocomplete, handleComponentInteraction, handleModalSubmit } from '../../../commands/predictcs.js';
import { fetchContractSummaries } from '../../../services/contractService.js';
import { createTextComponentMessage } from '../../../services/discord.js';
import { parseSandboxUrl } from '../../../utils/predictcs/sandbox.js';

beforeEach(() => {
  vi.clearAllMocks();
});

const createOptions = ({
  contract = 'c1',
  tokenSpeed = 5,
  boostOrder = 'input',
  gg = null,
  focused = '',
} = {}) => ({
  getString: (name) => {
    if (name === 'contract') return contract;
    if (name === 'boost_order') return boostOrder;
    return null;
  },
  getNumber: (name) => (name === 'token_speed' ? tokenSpeed : null),
  getBoolean: (name) => (name === 'gg' ? gg : null),
  getFocused: () => focused,
});

describe('commands/predictcs', () => {
  it('replies when contract is unknown', async () => {
    fetchContractSummaries.mockResolvedValue([]);
    const interaction = createInteraction({ options: createOptions({ contract: 'missing' }) });

    await execute(interaction);

    expect(createTextComponentMessage).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
  });

  it('replies when contract data is missing', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 0 },
    ]);
    const interaction = createInteraction({ options: createOptions() });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
  });

  it('replies when token speed is invalid', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 2, coopDurationSeconds: 3600, eggGoal: 1000, minutesPerToken: 4 },
    ]);
    const interaction = createInteraction({ options: createOptions({ tokenSpeed: 0 }) });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
  });

  it('builds a mode selection message', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 2, coopDurationSeconds: 3600, eggGoal: 1000, minutesPerToken: 4 },
    ]);
    const interaction = createInteraction({ options: createOptions({ gg: true }) });
    interaction.id = 'session-1';

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    const message = interaction.editReply.mock.calls[0][0];
    expect(message.content).toContain('Contract:');
    expect(message.components.length).toBeGreaterThan(0);
  });

  it('handles mode selection actions', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 2, coopDurationSeconds: 3600, eggGoal: 1000, minutesPerToken: 4 },
    ]);
    const interaction = createInteraction({ options: createOptions() });
    interaction.id = 'session-2';

    await execute(interaction);

    const manualInteraction = {
      customId: 'predictcs:mode:session-2:manual',
      user: interaction.user,
      isMessageComponent: () => true,
      isButton: () => true,
      isStringSelectMenu: () => false,
      update: vi.fn(async () => {}),
      showModal: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    };

    await handleComponentInteraction(manualInteraction);
    expect(manualInteraction.update).toHaveBeenCalled();

    const sandboxInteraction = {
      customId: 'predictcs:mode:session-2:sandbox',
      user: interaction.user,
      isMessageComponent: () => true,
      isButton: () => true,
      isStringSelectMenu: () => false,
      update: vi.fn(async () => {}),
      showModal: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    };

    await handleComponentInteraction(sandboxInteraction);
    expect(sandboxInteraction.showModal).toHaveBeenCalled();
  });

  it('handles player selection and next actions', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 1, coopDurationSeconds: 3600, eggGoal: 1000, minutesPerToken: 4 },
    ]);
    const interaction = createInteraction({ options: createOptions() });
    interaction.id = 'session-3';

    await execute(interaction);

    const selectInteraction = {
      customId: 'predictcs:select:session-3:0:deflector',
      user: interaction.user,
      values: ['T4E Defl.'],
      isMessageComponent: () => true,
      isButton: () => false,
      isStringSelectMenu: () => true,
      update: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    };

    await handleComponentInteraction(selectInteraction);
    expect(selectInteraction.update).toHaveBeenCalled();

    const nextInteraction = {
      customId: 'predictcs:next:session-3:0',
      user: interaction.user,
      isMessageComponent: () => true,
      isButton: () => true,
      isStringSelectMenu: () => false,
      update: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    };

    await handleComponentInteraction(nextInteraction);
    expect(nextInteraction.update).toHaveBeenCalled();
  });

  it('filters autocomplete suggestions', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'First' },
      { id: 'c2', name: 'Second' },
    ]);

    const interaction = createInteraction({ options: createOptions({ focused: 'first' }) });
    interaction.respond = vi.fn(async () => {});

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalled();
    const results = interaction.respond.mock.calls[0][0];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe('c1');
  });

  it('handles sandbox modal errors and contract mismatch', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 2, coopDurationSeconds: 3600, eggGoal: 1000, minutesPerToken: 4 },
      { id: 'c2', name: 'Alt', maxCoopSize: 2, coopDurationSeconds: 7200, eggGoal: 2000, minutesPerToken: 6 },
    ]);
    const interaction = createInteraction({ options: createOptions() });
    interaction.id = 'session-4';

    await execute(interaction);

    const errorInteraction = {
      customId: 'predictcs:sandbox:session-4',
      user: interaction.user,
      fields: { getTextInputValue: () => 'bad' },
      reply: vi.fn(async () => {}),
    };

    parseSandboxUrl.mockReturnValueOnce({ error: 'bad data' });
    await handleModalSubmit(errorInteraction);
    expect(errorInteraction.reply).toHaveBeenCalled();

    const mismatchInteraction = {
      customId: 'predictcs:sandbox:session-4',
      user: interaction.user,
      fields: { getTextInputValue: () => 'ok' },
      reply: vi.fn(async () => {}),
    };

    parseSandboxUrl.mockReturnValueOnce({
      players: 2,
      playerArtifacts: [],
      playerIhrArtifacts: [],
      playerTe: [0, 0],
      contractInfo: {
        durationSeconds: 7200,
        targetEggs: 2000,
        tokenTimerMinutes: 6,
        players: 2,
      },
    });

    await handleModalSubmit(mismatchInteraction);
    expect(mismatchInteraction.reply).toHaveBeenCalled();
  });

  it('handles contract selection and sandbox run actions', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 2, coopDurationSeconds: 3600, eggGoal: 1000, minutesPerToken: 4 },
      { id: 'c2', name: 'Alt', maxCoopSize: 2, coopDurationSeconds: 7200, eggGoal: 2000, minutesPerToken: 6 },
    ]);
    const interaction = createInteraction({ options: createOptions() });
    interaction.id = 'session-5';

    await execute(interaction);

    parseSandboxUrl.mockReturnValueOnce({
      players: 2,
      playerArtifacts: [],
      playerIhrArtifacts: [],
      playerTe: [0, 0],
      contractInfo: {
        durationSeconds: 7200,
        targetEggs: 2000,
        tokenTimerMinutes: 6,
        players: 2,
      },
    });

    await handleModalSubmit({
      customId: 'predictcs:sandbox:session-5',
      user: interaction.user,
      fields: { getTextInputValue: () => 'ok' },
      reply: vi.fn(async () => {}),
    });

    const selectInteraction = {
      customId: 'predictcs:contractselect:session-5',
      user: interaction.user,
      values: ['c2'],
      isMessageComponent: () => true,
      isStringSelectMenu: () => true,
      isButton: () => false,
      update: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    };

    await handleComponentInteraction(selectInteraction);
    expect(selectInteraction.update).toHaveBeenCalled();

    const contractInteraction = {
      customId: 'predictcs:contract:session-5:sandbox',
      user: interaction.user,
      isMessageComponent: () => true,
      isStringSelectMenu: () => false,
      isButton: () => true,
      deferUpdate: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
      followUp: vi.fn(async () => {}),
      deferred: false,
      replied: false,
    };

    await handleComponentInteraction(contractInteraction);
    expect(contractInteraction.reply).toHaveBeenCalled();
  });
});
