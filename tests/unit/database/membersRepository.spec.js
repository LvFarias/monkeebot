import { beforeEach, describe, expect, it, vi } from 'vitest';

const { statementMap, makeStmt } = vi.hoisted(() => {
  const statementMap = new Map();
  const makeStmt = (sql) => {
    const stmt = {
      sql,
      run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    };
    statementMap.set(sql, stmt);
    return stmt;
  };

  return { statementMap, makeStmt };
});

const buildMembersByIgnsQuery = (count) => {
  const placeholders = Array.from({ length: count }, () => '?').join(', ');
  return `SELECT internal_id, discord_id, ign FROM members WHERE ign IS NOT NULL AND LOWER(ign) IN (${placeholders})`;
};

vi.mock('../../../utils/database/schema.js', () => ({
  DEFAULT_MAMABIRD_IDS: ['659339631564947456'],
}));

vi.mock('../../../utils/database/client.js', () => ({
  default: {
    prepare: (sql) => statementMap.get(sql) ?? makeStmt(sql),
  },
}));

import {
  normalizeDiscordId,
  getMemberRecord,
  getMemberInternalId,
  getMembersByIgns,
  ensureMemberRecord,
  updateMemberIgnByInternalId,
  updateMemberActiveByInternalId,
  setAltRelationship,
  removeAltRelationship,
  listMembersWithoutIgn,
  listMembersWithIgn,
  setMamaBirdStatus,
  isMamaBird,
} from '../../../utils/database/membersRepository.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const stmt of statementMap.values()) {
    stmt.run.mockClear();
    stmt.get.mockClear();
    stmt.all.mockClear();
    stmt.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 });
    stmt.get.mockReturnValue(null);
    stmt.all.mockReturnValue([]);
  }
});

describe('database/membersRepository', () => {
  it('normalizes discord ids', () => {
    expect(normalizeDiscordId(' 123 ')).toBe('123');
  });

  it('returns null for missing member records', () => {
    const result = getMemberRecord('');
    expect(result).toBeNull();
  });

  it('returns null for missing member internal id', () => {
    const result = getMemberInternalId('missing');
    expect(result).toBeNull();
  });

  it('returns existing member records', () => {
    const stmt = [...statementMap.values()].find(s => s.sql.includes('FROM members WHERE discord_id'));
    if (stmt) stmt.get.mockReturnValue({ internal_id: 1, discord_id: '123' });

    const result = ensureMemberRecord('123');
    expect(result.created).toBe(false);
  });

  it('returns unchanged when mamabird status already matches', () => {
    const stmt = [...statementMap.values()].find(s => s.sql.includes('FROM members WHERE discord_id'));
    if (stmt) stmt.get.mockReturnValue({ internal_id: 1, discord_id: '123', is_mamabird: 1 });

    const result = setMamaBirdStatus('123', true);
    expect(result.updated).toBe(true);
    expect(result.unchanged).toBe(true);
  });

  it('detects mamabird status', () => {
    const stmt = [...statementMap.values()].find(s => s.sql.includes('SELECT is_mamabird'));
    if (stmt) stmt.get.mockReturnValue({ is_mamabird: 1 });

    expect(isMamaBird('123')).toBe(true);
  });

  it('updates ign and active flags', () => {
    const ignResult = updateMemberIgnByInternalId(1, '  aoo ');
    const activeResult = updateMemberActiveByInternalId(1, true);

    expect(ignResult.changes).toBe(1);
    expect(activeResult.changes).toBe(1);
  });

  it('returns zero changes for invalid internal ids', () => {
    expect(updateMemberIgnByInternalId(null, 'aoo')).toEqual({ changes: 0 });
    expect(updateMemberActiveByInternalId(0, true)).toEqual({ changes: 0 });
  });

  it('fetches members by igns with normalization', () => {
    const stmt = makeStmt(buildMembersByIgnsQuery(2));
    stmt.all.mockReturnValue([
      { internal_id: 1, discord_id: '111', ign: 'aoo' },
      { internal_id: 2, discord_id: '222', ign: null },
    ]);

    const rows = getMembersByIgns([' aoo ', '', null, 'foo']);
    expect(rows).toEqual([
      { internal_id: 1, discord_id: '111', ign: 'aoo' },
      { internal_id: 2, discord_id: '222', ign: null },
    ]);
  });

  it('links and unlinks alt relationships', () => {
    const link = setAltRelationship('111', '222');
    expect(link.updated).toBe(true);

    const findStmt = [...statementMap.values()].find(s => s.sql.includes('FROM members WHERE discord_id'));
    if (findStmt) {
      findStmt.get
        .mockReturnValueOnce({ internal_id: 1, discord_id: '111', main_id: null })
        .mockReturnValueOnce({ internal_id: 2, discord_id: '222', main_id: 1 });
    }

    const unlink = removeAltRelationship('111', '222');
    expect(unlink.updated).toBe(true);
  });

  it('handles alt relationship edge cases', () => {
    const findStmt = [...statementMap.values()].find(s => s.sql.includes('FROM members WHERE discord_id'));
    const countStmt = [...statementMap.values()].find(s => s.sql.includes('COUNT(*) AS cnt'));
    const setMainStmt = [...statementMap.values()].find(s => s.sql.includes('UPDATE members SET main_id'));

    const same = setAltRelationship('111', '111');
    expect(same.updated).toBe(false);
    expect(same.reason).toBe('same-id');

    if (findStmt) {
      findStmt.get
        .mockReturnValueOnce({ internal_id: 1, discord_id: '111', main_id: 5 })
        .mockReturnValueOnce({ internal_id: 2, discord_id: '222', main_id: null });
    }
    const mainIsAlt = setAltRelationship('111', '222');
    expect(mainIsAlt.reason).toBe('main-is-alt');

    if (findStmt) {
      findStmt.get
        .mockReturnValueOnce({ internal_id: 1, discord_id: '111', main_id: null })
        .mockReturnValueOnce({ internal_id: 2, discord_id: '222', main_id: 1 });
    }
    const alreadySet = setAltRelationship('111', '222');
    expect(alreadySet.reason).toBe('already-set');

    if (findStmt) {
      findStmt.get
        .mockReturnValueOnce({ internal_id: 1, discord_id: '111', main_id: null })
        .mockReturnValueOnce({ internal_id: 2, discord_id: '222', main_id: 99 });
    }
    const altLinked = setAltRelationship('111', '222');
    expect(altLinked.reason).toBe('alt-already-linked');

    if (findStmt) {
      findStmt.get
        .mockReturnValueOnce({ internal_id: 1, discord_id: '111', main_id: null })
        .mockReturnValueOnce({ internal_id: 2, discord_id: '222', main_id: null });
    }
    if (countStmt) countStmt.get.mockReturnValue({ cnt: 2 });
    const hasChildren = setAltRelationship('111', '222');
    expect(hasChildren.reason).toBe('alt-has-children');

    if (countStmt) countStmt.get.mockReturnValue({ cnt: 0 });
    if (setMainStmt) setMainStmt.run.mockReturnValue({ changes: 0 });
    const noChange = setAltRelationship('111', '222');
    expect(noChange.reason).toBe('no-change');
  });

  it('handles remove alt relationship failures', () => {
    const findStmt = [...statementMap.values()].find(s => s.sql.includes('FROM members WHERE discord_id'));
    const setMainStmt = [...statementMap.values()].find(s => s.sql.includes('UPDATE members SET main_id'));

    const notFound = removeAltRelationship('missing', 'alt');
    expect(notFound.reason).toBe('not-found');

    if (findStmt) {
      findStmt.get
        .mockReturnValueOnce({ internal_id: 1, discord_id: '111', main_id: null })
        .mockReturnValueOnce({ internal_id: 2, discord_id: '222', main_id: null });
    }
    const notLinked = removeAltRelationship('111', '222');
    expect(notLinked.reason).toBe('not-linked');

    if (findStmt) {
      findStmt.get
        .mockReturnValueOnce({ internal_id: 1, discord_id: '111', main_id: null })
        .mockReturnValueOnce({ internal_id: 2, discord_id: '222', main_id: 1 });
    }
    if (setMainStmt) setMainStmt.run.mockReturnValue({ changes: 0 });
    const noChange = removeAltRelationship('111', '222');
    expect(noChange.reason).toBe('no-change');
  });

  it('lists members with and without igns', () => {
    const noIgnStmt = [...statementMap.values()].find(s => s.sql.includes('ign IS NULL'));
    if (noIgnStmt) noIgnStmt.all.mockReturnValue([{ discord_id: '111' }, { discord_id: ' ' }, { discord_id: null }]);

    const withIgnStmt = [...statementMap.values()].find(s => s.sql.includes('ign IS NOT NULL'));
    if (withIgnStmt) withIgnStmt.all.mockReturnValue([
      { discord_id: '222', ign: 'aoo' },
      { discord_id: '333', ign: '  ' },
    ]);

    expect(listMembersWithoutIgn()).toEqual(['111']);
    expect(listMembersWithIgn()).toEqual([{ discord_id: '222', ign: 'aoo' }]);
  });

  it('returns false when mamabird update fails', () => {
    const findStmt = [...statementMap.values()].find(s => s.sql.includes('FROM members WHERE discord_id'));
    const updateStmt = [...statementMap.values()].find(s => s.sql.includes('UPDATE members SET is_mamabird'));
    const getStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT is_mamabird'));

    if (findStmt) findStmt.get.mockReturnValue({ internal_id: 9, discord_id: '555', is_mamabird: 0 });
    if (updateStmt) updateStmt.run.mockReturnValue({ changes: 0 });
    if (getStmt) getStmt.get.mockReturnValue({ is_mamabird: 0 });

    const result = setMamaBirdStatus('555', true);
    expect(result.updated).toBe(false);
    expect(result.reason).toBe('no-change');
  });

  it('returns false for invalid mamabird inputs', () => {
    const result = setMamaBirdStatus('   ', true);
    expect(result.updated).toBe(false);
    expect(result.reason).toBe('invalid-input');
    expect(isMamaBird('')).toBe(false);
  });
});
