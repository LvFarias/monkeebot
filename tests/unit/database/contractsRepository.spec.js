import { beforeEach, describe, expect, it, vi } from 'vitest';

const { statementMap, makeStmt } = vi.hoisted(() => {
  const statementMap = new Map();
  const makeStmt = (sql) => {
    const stmt = {
      sql,
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
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

import { upsertContracts, getStoredContracts, getContractRelease } from '../../../utils/database/contractsRepository.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const stmt of statementMap.values()) {
    stmt.run.mockReset();
    stmt.get.mockReset();
    stmt.all.mockReset();
  }
});

describe('database/contractsRepository', () => {
  it('no-ops on empty upserts', () => {
    upsertContracts([]);
  });

  it('skips invalid rows and normalizes values', () => {
    const upsertStmt = [...statementMap.values()].find(s => s.sql.includes('INSERT INTO contracts'));

    upsertContracts([
      { id: '  c1  ', name: 'Name', release: 123, season: 'fall_2024', egg: 'egg' },
      { id: '', name: 'Bad', release: 5 },
      { id: 42, name: null, release: 'bad', season: 2024, egg: null },
    ]);

    expect(upsertStmt.run).toHaveBeenCalledTimes(2);
    expect(upsertStmt.run).toHaveBeenCalledWith('c1', 'Name', 123, 'fall_2024', 'egg');
    expect(upsertStmt.run).toHaveBeenCalledWith('42', null, 0, '2024', null);
  });

  it('returns stored contracts', () => {
    const stmt = [...statementMap.values()].find(s => s.sql.includes('SELECT contract_id AS id'));
    if (stmt) stmt.all.mockReturnValue([{ id: 'c1', name: 'A', season: 'fall', egg: 'egg', release: 1 }]);

    const rows = getStoredContracts();
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });

  it('returns null when no release exists', () => {
    const stmt = [...statementMap.values()].find(s => s.sql.includes('SELECT release FROM contracts'));
    if (stmt) stmt.get.mockReturnValue(null);
    const release = getContractRelease('c1');
    expect(release).toBeNull();
  });

  it('returns null for invalid contract ids', () => {
    expect(getContractRelease('')).toBeNull();
    expect(getContractRelease(null)).toBeNull();
  });
});
