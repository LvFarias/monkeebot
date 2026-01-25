import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction } from './helpers.js';

vi.mock('../../../services/contractService.js', () => ({
  fetchContractSummaries: vi.fn(),
}));

vi.mock('../../../services/discord.js', () => ({
  chunkContent: vi.fn((lines) => (Array.isArray(lines) ? [lines.join('\n'), 'extra'] : [String(lines)])),
  createDiscordProgressReporter: vi.fn(() => vi.fn(async () => {})),
  createTextComponentMessage: vi.fn((content, options) => ({ content, ...options })),
}));

vi.mock('../../../utils/predictmaxcs/display.js', () => ({
  buildPlayerTableLines: vi.fn(() => ['line1', 'line2']),
  formatEggs: vi.fn(() => '1T'),
  secondsToHuman: vi.fn(() => '1h'),
}));

vi.mock('../../../utils/predictmaxcs/model.js', () => ({
  buildModel: vi.fn(() => ({ mock: true })),
  getAssumptions: vi.fn(() => ({ te: 100 })),
  TOKEN_CANDIDATES: [0, 1, 2, 3, 4, 5, 6, 8],
}));

import { execute, autocomplete } from '../../../commands/predictmaxcs.js';
import { fetchContractSummaries } from '../../../services/contractService.js';
import { createTextComponentMessage } from '../../../services/discord.js';

beforeEach(() => {
  vi.clearAllMocks();
});

const createOptions = ({ contract = 'c1', tokenSpeed = 5, avgTe = null, gg = null, siab = null, focused = '' } = {}) => ({
  getString: (name) => (name === 'contract' ? contract : null),
  getNumber: (name) => {
    if (name === 'token_speed') return tokenSpeed;
    if (name === 'avg_te') return avgTe;
    return null;
  },
  getBoolean: (name) => {
    if (name === 'gg') return gg;
    if (name === 'siab') return siab;
    return null;
  },
  getFocused: () => focused,
});

describe('commands/predictmaxcs', () => {
  it('replies when contract is unknown', async () => {
    fetchContractSummaries.mockResolvedValue([]);
    const interaction = createInteraction({ options: createOptions({ contract: 'missing' }) });

    await execute(interaction);

    expect(createTextComponentMessage).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
  });

  it('replies when token speed is invalid', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 2, coopDurationSeconds: 3600, eggGoal: 1000, minutesPerToken: 4 },
    ]);
    const interaction = createInteraction({ options: createOptions({ tokenSpeed: -1 }) });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
  });

  it('builds embeds and follows up for additional chunks', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 2, coopDurationSeconds: 3600, eggGoal: 1000, minutesPerToken: 4 },
    ]);
    const interaction = createInteraction({ options: createOptions({ gg: true, avgTe: 120, siab: false }) });

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalled();
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
});
