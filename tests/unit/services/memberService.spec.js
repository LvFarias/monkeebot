import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/database/index.js', () => ({
  ensureMemberRecord: vi.fn(),
  getMemberRecord: vi.fn(),
  getMembersByIgns: vi.fn(),
  updateMemberIgnByInternalId: vi.fn(),
  updateMemberActiveByInternalId: vi.fn(),
}));

import { setIgnForMember, setMembersActiveStatus, syncMembersFromApiEntries } from '../../../services/memberService.js';
import {
  ensureMemberRecord,
  getMemberRecord,
  getMembersByIgns,
  updateMemberIgnByInternalId,
  updateMemberActiveByInternalId,
} from '../../../utils/database/index.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('services/memberService setIgnForMember', () => {
  it('rejects invalid ids and igns', () => {
    expect(setIgnForMember({ targetDiscordId: '', ign: 'aoo' })).toEqual({ ok: false, reason: 'invalid-id' });
    expect(setIgnForMember({ targetDiscordId: '111', ign: '' })).toEqual({ ok: false, reason: 'invalid-ign' });
  });

  it('detects ign conflicts', () => {
    getMembersByIgns.mockReturnValue([{ discord_id: '222', ign: 'aoo' }]);

    const result = setIgnForMember({ targetDiscordId: '111', ign: 'aoo' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('conflict');
  });

  it('returns not-found when member record missing', () => {
    getMembersByIgns.mockReturnValue([]);
    ensureMemberRecord.mockReturnValue({ record: null, created: false });

    const result = setIgnForMember({ targetDiscordId: '111', ign: 'aoo' });
    expect(result).toEqual({ ok: false, reason: 'not-found' });
  });

  it('returns unchanged when ign matches existing', () => {
    getMembersByIgns.mockReturnValue([]);
    ensureMemberRecord.mockReturnValue({ record: { internal_id: 1, ign: 'aoo' }, created: false });

    const result = setIgnForMember({ targetDiscordId: '111', ign: 'aoo' });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('unchanged');
  });

  it('updates ign when changed', () => {
    getMembersByIgns.mockReturnValue([]);
    ensureMemberRecord.mockReturnValue({ record: { internal_id: 1, ign: null }, created: true });
    updateMemberIgnByInternalId.mockReturnValue({ changes: 1 });
    getMemberRecord.mockReturnValue({ ign: 'aoo' });

    const result = setIgnForMember({ targetDiscordId: '111', ign: 'aoo' });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('created');
  });
});

describe('services/memberService setMembersActiveStatus', () => {
  it('validates inputs', () => {
    expect(setMembersActiveStatus()).toEqual({ ok: false, reason: 'no-targets' });
    expect(setMembersActiveStatus({ targetDiscordIds: ['111'], active: null })).toEqual({ ok: false, reason: 'invalid-active' });
  });

  it('updates members and reports failures', () => {
    ensureMemberRecord
      .mockReturnValueOnce({ record: { internal_id: 1, is_active: 0 }, created: false })
      .mockReturnValueOnce({ record: { internal_id: 2, is_active: 1 }, created: true })
      .mockReturnValueOnce({ record: null, created: false });

    updateMemberActiveByInternalId.mockReturnValue({ changes: 1 });
    getMemberRecord
      .mockReturnValueOnce({ is_active: 1 })
      .mockReturnValueOnce({ is_active: 1 });

    const result = setMembersActiveStatus({ targetDiscordIds: ['111', '222', '333'], active: true });
    expect(result.updated).toEqual(['111']);
    expect(result.created).toEqual(['222']);
    expect(result.failures.length).toBe(1);
  });
});

describe('services/memberService syncMembersFromApiEntries', () => {
  it('returns empty summary for empty input', () => {
    const summary = syncMembersFromApiEntries([]);
    expect(summary.total).toBe(0);
  });

  it('records conflicts and invalids', () => {
    getMembersByIgns.mockReturnValue([{ discord_id: '222', ign: 'aoo' }]);
    ensureMemberRecord.mockReturnValue({ record: { internal_id: 1, ign: null }, created: false });
    getMemberRecord.mockReturnValue({ internal_id: 1, ign: null });

    const summary = syncMembersFromApiEntries([
      { ID: '111', IGN: 'aoo' },
      { ID: '222', IGN: '' },
    ]);

    expect(summary.conflicts.length).toBe(1);
    expect(summary.invalid.length).toBeGreaterThan(0);
  });
});
