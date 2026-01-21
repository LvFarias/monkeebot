import { beforeEach, describe, expect, it, vi } from 'vitest';

const { statementMap, makeStmt } = vi.hoisted(() => {
  const statementMap = new Map();
  const makeStmt = (sql) => {
    const stmt = {
      sql,
      run: vi.fn(() => ({ changes: 1 })),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    };
    statementMap.set(sql, stmt);
    return stmt;
  };

  return { statementMap, makeStmt };
});

vi.mock('../../../utils/database/client.js', () => ({
  default: {
    prepare: (sql) => statementMap.get(sql) ?? makeStmt(sql),
    transaction: (fn) => (items) => fn(items),
  },
}));

vi.mock('../../../utils/database/contractsRepository.js', () => ({
  getContractRelease: vi.fn(),
}));

vi.mock('../../../utils/database/membersRepository.js', () => ({
  ensureMemberRecord: vi.fn(() => ({ record: { internal_id: 1 } })),
  getMemberRecord: vi.fn(() => ({ internal_id: 1 })),
  normalizeDiscordId: (value) => String(value).trim(),
}));

const buildSeasonCoopsQuery = (requirePush = false) => {
  let query = `
    SELECT c.contract, c.coop
    FROM coops c
    JOIN contracts k ON c.contract = k.contract_id
    WHERE k.season = ?
  `;

  if (requirePush) {
    query += ' AND c.push = 1';
  }

  query += ' ORDER BY c.contract ASC, c.coop ASC';
  return query;
};

const buildPastCoopsByCoopQuery = ({ pushOnly = false, season = null } = {}) => {
  let query = `
    SELECT c.coop, COUNT(*) AS cnt
    FROM coops c
  `;

  if (season) {
    query += `
      JOIN contracts k ON c.contract = k.contract_id
      WHERE k.season = ?
    `;
  } else {
    query += ' WHERE 1=1';
  }

  if (pushOnly) {
    query += ' AND c.push = 1';
  }

  query += `
    GROUP BY c.coop
    ORDER BY cnt DESC, c.coop ASC
  `;

  return query;
};

const buildSeasonHelpersQuery = ({ pushOnly = true, placeholders = '?' } = {}) => {
  const filterClause = pushOnly ? 'c.push = 1 AND ' : '';
  return `
    WITH RECURSIVE root_map(member_internal_id, member_discord_id, root_internal_id, root_discord_id) AS (
      SELECT m.internal_id, m.discord_id, m.internal_id, m.discord_id
      FROM members m
      WHERE m.main_id IS NULL
        AND m.is_active = 1
      UNION ALL
      SELECT child.internal_id, child.discord_id, rm.root_internal_id, rm.root_discord_id
      FROM members child
      JOIN root_map rm ON child.main_id = rm.member_internal_id
      WHERE child.is_active = 1
    )
    SELECT
      rm.root_internal_id,
      rm.root_discord_id,
      rm.member_internal_id,
      rm.member_discord_id,
      COUNT(*) AS contribution_count
    FROM root_map rm
    JOIN member_coops mc ON rm.member_internal_id = mc.member_id
    JOIN coops c ON mc.coop_id = c.id
    WHERE ${filterClause}TRIM(CAST(c.contract AS TEXT)) IN (${placeholders})
    GROUP BY rm.root_internal_id, rm.root_discord_id, rm.member_internal_id, rm.member_discord_id
  `;
};

const buildContractsBySeasonQuery = () => 'SELECT contract_id FROM contracts WHERE season = ?';
const buildContractsByReleaseQuery = () => 'SELECT contract_id FROM contracts WHERE release >= ? AND release < ?';

const buildAllSeasonsQuery = () => `
    SELECT DISTINCT season
    FROM contracts
    WHERE season IS NOT NULL AND TRIM(season) != ''
    ORDER BY season DESC
  `;

const buildPushReportsQuery = () => `
    SELECT c.contract, c.coop, c.report, k.name, k.egg
    FROM coops c
    JOIN contracts k ON c.contract = k.contract_id
    WHERE c.push = 1
      AND k.season = ?
    ORDER BY k.release DESC, c.coop ASC
  `;

import {
  addCoop,
  removecoop,
  setPush,
  setCoopReport,
  getCoopReport,
  getAllCoops,
  getAllPushCoops,
  getAllCoopsForSeason,
  getAllPushCoopsForSeason,
  getPastCoops,
  getPastCoopsByCoop,
  linkMembersToCoop,
  getMembersForCoop,
  removePlayersFromCoop,
  listRecentCoops,
  getSeasonHelpers,
  getPushHelpersForSeason,
  getAllSeasons,
  getPushReportsForSeason,
} from '../../../utils/database/coopsRepository.js';
import { getContractRelease } from '../../../utils/database/contractsRepository.js';
import { ensureMemberRecord, getMemberRecord } from '../../../utils/database/membersRepository.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const stmt of statementMap.values()) {
    stmt.run.mockClear();
    stmt.get.mockClear();
    stmt.all.mockClear();
    stmt.run.mockReturnValue({ changes: 1 });
    stmt.get.mockReturnValue(null);
    stmt.all.mockReturnValue([]);
  }
});

describe('database/coopsRepository', () => {
  it('rejects invalid coop input', () => {
    const result = addCoop('', 'coop');
    expect(result.added).toBe(false);
  });

  it('handles insert failures', () => {
    const insertStmt = [...statementMap.values()].find(s => s.sql.includes('INSERT INTO coops'));
    if (insertStmt) insertStmt.run.mockImplementation(() => { throw new Error('boom'); });
    const result = addCoop('c1', 'coop1');
    expect(result.added).toBe(false);
    expect(result.reason).toBe('boom');
  });

  it('prevents adding duplicate coops', () => {
    const stmt = [...statementMap.values()].find(s => s.sql.includes('SELECT id FROM coops'));
    if (stmt) stmt.get.mockReturnValue({ id: 1 });

    const result = addCoop('c1', 'coop1');
    expect(result.added).toBe(false);
    expect(result.reason).toBe('exists');
  });

  it('adds a coop when missing', () => {
    getContractRelease.mockReturnValue(1);
    const result = addCoop('c1', 'coop1');
    expect(result.added).toBe(true);
  });

  it('removes coops', () => {
    const stmt = [...statementMap.values()].find(s => s.sql.startsWith('DELETE FROM coops'));
    if (stmt) stmt.run.mockReturnValue({ changes: 1 });

    const result = removecoop('c1', 'coop1');
    expect(result.removed).toBe(true);
  });

  it('handles invalid and missing coop removals', () => {
    expect(removecoop('', 'x')).toEqual({ removed: false, reason: 'invalid-input' });
    const stmt = [...statementMap.values()].find(s => s.sql.startsWith('DELETE FROM coops'));
    if (stmt) stmt.run.mockReturnValue({ changes: 0 });
    expect(removecoop('c1', 'x')).toEqual({ removed: false, reason: 'not-found' });
  });

  it('handles already-set push flags', () => {
    const getStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT push FROM coops'));
    if (getStmt) getStmt.get.mockReturnValue({ push: 1 });

    const result = setPush('c1', 'coop1', true);
    expect(result.already).toBe(true);
  });

  it('handles push updates for invalid and missing coops', () => {
    expect(setPush('', 'x', true)).toEqual({ updated: false, reason: 'invalid-input' });

    const getStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT push FROM coops'));
    if (getStmt) getStmt.get.mockReturnValue(null);

    expect(setPush('c1', 'coop1', true)).toEqual({ updated: false, reason: 'not-found' });
  });

  it('handles push updates with no change', () => {
    const getStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT push FROM coops'));
    const setStmt = [...statementMap.values()].find(s => s.sql.includes('UPDATE coops SET push'));
    if (getStmt) getStmt.get.mockReturnValue({ push: 0 });
    if (setStmt) setStmt.run.mockReturnValue({ changes: 0 });

    const result = setPush('c1', 'coop1', true);
    expect(result.updated).toBe(false);
    expect(result.reason).toBe('no-change');
  });

  it('lists recent coops', () => {
    const listStmt = [...statementMap.values()].find(s => s.sql.includes('FROM coops ORDER BY id DESC'));
    if (listStmt) listStmt.all.mockReturnValue([{ contract: 'c1', coop: 'x' }]);

    const rows = listRecentCoops(10);
    expect(rows.length).toBe(1);
  });

  it('normalizes listRecentCoops limits', () => {
    const listStmt = [...statementMap.values()].find(s => s.sql.includes('FROM coops ORDER BY id DESC'));
    if (listStmt) listStmt.all.mockReturnValue([]);

    listRecentCoops(-5);
    expect(listStmt.all).toHaveBeenCalledWith(50);

    listRecentCoops(999);
    expect(listStmt.all).toHaveBeenCalledWith(500);
  });

  it('sets and gets coop reports', () => {
    const reportStmt = [...statementMap.values()].find(s => s.sql.includes('UPDATE coops SET report'));
    if (reportStmt) reportStmt.run.mockReturnValue({ changes: 1 });

    const setResult = setCoopReport('c1', 'coop1', 'https://x.test');
    expect(setResult.updated).toBe(true);

    const getStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT report FROM coops'));
    if (getStmt) getStmt.get.mockReturnValue({ report: 'https://x.test' });

    expect(getCoopReport('c1', 'coop1')).toBe('https://x.test');
  });

  it('handles missing report rows and invalid inputs', () => {
    const result = setCoopReport('', 'coop1', 'x');
    expect(result.reason).toBe('invalid-input');

    const reportStmt = [...statementMap.values()].find(s => s.sql.includes('UPDATE coops SET report'));
    if (reportStmt) reportStmt.run.mockReturnValue({ changes: 0 });
    expect(setCoopReport('c1', 'coop1', 'x')).toEqual({ updated: false, reason: 'not-found' });

    const getStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT report FROM coops'));
    if (getStmt) getStmt.get.mockImplementation(() => { throw new Error('boom'); });
    expect(getCoopReport('c1', 'coop1')).toBeNull();
    expect(getCoopReport('', 'coop1')).toBeNull();
  });

  it('returns coops for base and push lists', () => {
    const baseStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT contract, coop FROM coops ORDER BY'));
    if (baseStmt) baseStmt.all.mockReturnValue([{ contract: 'c1', coop: 'a' }]);

    const pushStmt = [...statementMap.values()].find(s => s.sql.includes('WHERE push = 1'));
    if (pushStmt) pushStmt.all.mockReturnValue([{ contract: 'c2', coop: 'b' }]);

    expect(getAllCoops()).toEqual([{ contract: 'c1', coop: 'a' }]);
    expect(getAllPushCoops()).toEqual([{ contract: 'c2', coop: 'b' }]);
  });

  it('returns coops for seasons', () => {
    const seasonalStmt = makeStmt(buildSeasonCoopsQuery(false));
    seasonalStmt.all.mockReturnValue([{ contract: 'c3', coop: 'z' }]);

    const seasonalPushStmt = makeStmt(buildSeasonCoopsQuery(true));
    seasonalPushStmt.all.mockReturnValue([{ contract: 'c3', coop: 'z' }]);

    expect(getAllCoopsForSeason('fall_2024')).toEqual([{ contract: 'c3', coop: 'z' }]);
    expect(getAllPushCoopsForSeason('fall_2024')).toEqual([{ contract: 'c3', coop: 'z' }]);
  });

  it('falls back when season is missing', () => {
    const baseStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT contract, coop FROM coops ORDER BY'));
    if (baseStmt) baseStmt.all.mockReturnValue([{ contract: 'c1', coop: 'a' }]);
    const pushStmt = [...statementMap.values()].find(s => s.sql.includes('WHERE push = 1'));
    if (pushStmt) pushStmt.all.mockReturnValue([{ contract: 'c2', coop: 'b' }]);

    expect(getAllCoopsForSeason(null)).toEqual([{ contract: 'c1', coop: 'a' }]);
    expect(getAllPushCoopsForSeason(null)).toEqual([{ contract: 'c2', coop: 'b' }]);
  });

  it('lists past coops with push filter', () => {
    const stmt = [...statementMap.values()].find(s => s.sql.includes('FROM coops') && s.sql.includes('GROUP BY coop, contract'));
    if (stmt) stmt.all.mockReturnValue([{ coop: 'x', contract: 'c1', cnt: 2 }]);

    expect(getPastCoops(true)).toEqual([{ coop: 'x', contract: 'c1', cnt: 2 }]);
    expect(stmt.all).toHaveBeenCalledWith(1);
  });

  it('lists past coops by coop and season', () => {
    const stmt = makeStmt(buildPastCoopsByCoopQuery({ pushOnly: true, season: 'fall_2024' }));
    stmt.all.mockReturnValue([{ coop: 'x', cnt: 1 }]);

    expect(getPastCoopsByCoop(true, 'fall_2024')).toEqual([{ coop: 'x', cnt: 1 }]);
    expect(stmt.all).toHaveBeenCalledWith('fall_2024');
  });

  it('links and removes coop members', () => {
    const coopIdStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT id FROM coops'));
    if (coopIdStmt) coopIdStmt.get.mockReturnValue({ id: 7 });

    const linkStmt = [...statementMap.values()].find(s => s.sql.includes('INSERT OR IGNORE INTO member_coops'));
    if (linkStmt) linkStmt.run.mockReturnValue({ changes: 1 });

    const linkResult = linkMembersToCoop('c1', 'coop1', ['111', '222']);
    expect(linkResult.linked).toBe(2);

    const listMembersStmt = [...statementMap.values()].find(s => s.sql.includes('JOIN member_coops'));
    if (listMembersStmt) listMembersStmt.all.mockReturnValue([{ discord_id: '111' }]);

    const members = getMembersForCoop('c1', 'coop1');
    expect(members).toEqual(['111']);

    const deleteStmt = [...statementMap.values()].find(s => s.sql.includes('DELETE FROM member_coops'));
    if (deleteStmt) deleteStmt.run.mockReturnValue({ changes: 1 });

    const removed = removePlayersFromCoop('c1', 'coop1', ['111']);
    expect(removed.removed).toBe(1);
  });

  it('handles invalid member linking/removal inputs', () => {
    expect(linkMembersToCoop('', 'c', [])).toEqual({ linked: 0, reason: 'invalid-input' });

    const coopIdStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT id FROM coops'));
    if (coopIdStmt) coopIdStmt.get.mockReturnValue(null);
    expect(linkMembersToCoop('c1', 'coop1', ['111'])).toEqual({ linked: 0, reason: 'coop-not-found' });

    expect(removePlayersFromCoop('c1', 'coop1', null)).toEqual({ removed: 0, removedIds: [] });
    expect(removePlayersFromCoop('', 'coop1', ['111'])).toEqual({ removed: 0, removedIds: [] });
  });

  it('tracks already-linked members and skips invalid ids', () => {
    const coopIdStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT id FROM coops'));
    if (coopIdStmt) coopIdStmt.get.mockReturnValue({ id: 5 });

    ensureMemberRecord.mockReturnValueOnce({ record: { internal_id: 1 } })
      .mockReturnValueOnce({ record: { internal_id: 2 } });

    const linkStmt = [...statementMap.values()].find(s => s.sql.includes('INSERT OR IGNORE INTO member_coops'));
    if (linkStmt) linkStmt.run.mockReturnValueOnce({ changes: 0 }).mockReturnValueOnce({ changes: 1 });

    const result = linkMembersToCoop('c1', 'coop1', [' 111 ', ' ', '222']);
    expect(result.linked).toBe(1);
    expect(result.alreadyIds).toEqual(['111']);
  });

  it('handles missing members during removal', () => {
    const coopIdStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT id FROM coops'));
    if (coopIdStmt) coopIdStmt.get.mockReturnValue({ id: 7 });

    getMemberRecord.mockReturnValueOnce(null).mockReturnValueOnce({ internal_id: 2 });

    const deleteStmt = [...statementMap.values()].find(s => s.sql.includes('DELETE FROM member_coops'));
    if (deleteStmt) deleteStmt.run.mockReturnValue({ changes: 0 });

    const removed = removePlayersFromCoop('c1', 'coop1', ['111', '222']);
    expect(removed.removed).toBe(0);
    expect(removed.removedIds).toEqual([]);
  });

  it('returns season helpers with aggregation', () => {
    const contractStmt = makeStmt(buildContractsBySeasonQuery());
    contractStmt.all.mockReturnValue([{ contract_id: 'c1' }]);

    const helperStmt = makeStmt(buildSeasonHelpersQuery({ pushOnly: true, placeholders: '?' }));
    helperStmt.all.mockReturnValue([
      { root_internal_id: 1, root_discord_id: '100', member_internal_id: 1, member_discord_id: '100', contribution_count: 2 },
      { root_internal_id: 1, root_discord_id: '100', member_internal_id: 2, member_discord_id: '200', contribution_count: 1 },
    ]);

    const helpers = getSeasonHelpers({ season: 'fall_2024', pushOnly: true, seasonalOnly: true });
    expect(helpers[0].discord_id).toBe('100');
    expect(helpers[0].count).toBe(3);
    expect(helpers[0].breakdown.length).toBe(2);
  });

  it('returns empty season helpers for invalid seasons', () => {
    expect(getSeasonHelpers({ season: null })).toEqual([]);
    expect(getSeasonHelpers({ season: 'badseason', seasonalOnly: false })).toEqual([]);
  });

  it('returns helpers for astronomical seasons', () => {
    const contractStmt = makeStmt(buildContractsByReleaseQuery());
    contractStmt.all.mockReturnValue([{ contract_id: 'c1' }]);
    const helperStmt = makeStmt(buildSeasonHelpersQuery({ pushOnly: false, placeholders: '?' }));
    helperStmt.all.mockReturnValue([
      { root_internal_id: 1, root_discord_id: '100', member_internal_id: 1, member_discord_id: '100', contribution_count: 1 },
    ]);

    const helpers = getSeasonHelpers({ season: 'winter_2024', pushOnly: false, seasonalOnly: false });
    expect(helpers.length).toBe(1);
  });

  it('returns push helpers for season', () => {
    const contractStmt = makeStmt(buildContractsBySeasonQuery());
    contractStmt.all.mockReturnValue([{ contract_id: 'c1' }]);
    const helperStmt = makeStmt(buildSeasonHelpersQuery({ pushOnly: true, placeholders: '?' }));
    helperStmt.all.mockReturnValue([
      { root_internal_id: 1, root_discord_id: '100', member_internal_id: 1, member_discord_id: '100', contribution_count: 1 },
    ]);

    const helpers = getPushHelpersForSeason('fall_2024');
    expect(helpers.length).toBe(1);
  });

  it('returns ordered seasons', () => {
    const stmt = makeStmt(buildAllSeasonsQuery());
    stmt.all.mockReturnValue([
      { season: 'spring_2024' },
      { season: 'fall_2023' },
      { season: 'summer_2024' },
      { season: 'winter_2024' },
      { season: 'fall_2024' },
    ]);

    expect(getAllSeasons()).toEqual(['fall_2024', 'summer_2024', 'spring_2024', 'winter_2024', 'fall_2023']);
  });

  it('returns push reports for season', () => {
    const stmt = makeStmt(buildPushReportsQuery());
    stmt.all.mockReturnValue([
      { contract: ' c1 ', coop: ' c ', report: 123, name: 'Name', egg: null },
    ]);

    expect(getPushReportsForSeason('fall_2024')).toEqual([
      { contract: 'c1', coop: 'c', report: '123', name: 'Name', egg: null },
    ]);
    expect(getPushReportsForSeason(null)).toEqual([]);
  });
});
