import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../utils/permissions.js', () => ({
  requireMamaBird: vi.fn(),
}));

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
  chunkContent: (input) => [Array.isArray(input) ? input.join('\n') : String(input)],
  extractDiscordId: vi.fn(),
}));

vi.mock('../../../services/coopService.js', () => ({
  linkAltAccount: vi.fn(),
  unlinkAltAccount: vi.fn(),
}));

vi.mock('../../../services/memberService.js', () => ({
  setIgnForMember: vi.fn(),
  setMembersActiveStatus: vi.fn(),
  syncMembersFromApiEntries: vi.fn(),
}));

import { execute } from '../../../commands/member.js';
import { requireMamaBird } from '../../../utils/permissions.js';
import { extractDiscordId } from '../../../services/discord.js';
import { linkAltAccount, unlinkAltAccount } from '../../../services/coopService.js';
import { setIgnForMember, setMembersActiveStatus, syncMembersFromApiEntries } from '../../../services/memberService.js';

beforeEach(() => {
  vi.clearAllMocks();
  requireMamaBird.mockResolvedValue(true);
  extractDiscordId.mockImplementation((value) => {
    if (!value) return null;
    const match = /\d{17,20}/.exec(String(value));
    return match ? match[0] : null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('commands/member setalt', () => {
  it('rejects invalid ids', async () => {
    extractDiscordId.mockReturnValueOnce(null);

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'setalt',
        strings: { main: 'bad', alt: 'bad' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('valid Discord IDs');
  });

  it('reports successful linking', async () => {
    linkAltAccount.mockReturnValue({
      ok: true,
      details: { main: { discord_id: '111111111111111111' }, alt: { discord_id: '222222222222222222' } },
    });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'setalt',
        strings: { main: '<@111111111111111111>', alt: '<@222222222222222222>' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Linked <@222222222222222222>');
  });
});

describe('commands/member removealt', () => {
  it('handles missing link', async () => {
    unlinkAltAccount.mockReturnValue({ ok: false, reason: 'not-linked' });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'removealt',
        strings: { main: '<@111111111111111111>', alt: '<@222222222222222222>' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('not currently linked');
  });
});

describe('commands/member setign', () => {
  it('reports conflicts', async () => {
    setIgnForMember.mockReturnValue({
      ok: false,
      reason: 'conflict',
      conflictDiscordIds: ['111111111111111111', '222222222222222222'],
    });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'setign',
        strings: { user: '<@999999999999999999>', ign: 'ioo' },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('IGN already linked');
  });
});

describe('commands/member setactive', () => {
  it('rejects empty target list', async () => {
    extractDiscordId.mockReturnValueOnce(null);

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'setactive',
        strings: { targets: 'bad' },
        booleans: { active: true },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Provide at least one valid Discord ID');
  });

  it('reports update summary', async () => {
    setMembersActiveStatus.mockReturnValue({
      ok: true,
      updated: ['111111111111111111'],
      created: ['222222222222222222'],
      unchanged: [],
      failures: [],
    });

    const interaction = createInteraction({
      options: createOptions({
        subcommand: 'setactive',
        strings: { targets: '<@111111111111111111> <@222222222222222222>' },
        booleans: { active: true },
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Set active=true');
  });
});

describe('commands/member updatemembers', () => {
  it('handles unexpected API payloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    syncMembersFromApiEntries.mockReturnValue({
      total: 0,
      updated: 0,
      unchanged: 0,
      conflicts: [],
      invalid: [],
      skipped: [],
      failures: [],
    });

    const interaction = createInteraction({
      options: createOptions({ subcommand: 'updatemembers' }),
    });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.editReply.mock.calls[0][0].content).toContain('Unexpected API response');
  });
});
