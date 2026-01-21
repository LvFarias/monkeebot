import { beforeEach, describe, expect, it, vi } from 'vitest';

const { statementMap, makeStmt } = vi.hoisted(() => {
  const statementMap = new Map();
  const makeStmt = (sql) => {
    const stmt = { sql, run: vi.fn(), get: vi.fn(), all: vi.fn() };
    statementMap.set(sql, stmt);
    return stmt;
  };

  return { statementMap, makeStmt };
});

vi.mock('../../../utils/database/client.js', () => ({
  default: {
    prepare: (sql) => statementMap.get(sql) ?? makeStmt(sql),
  },
}));

import { getMeta, setMeta } from '../../../utils/database/metaRepository.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const stmt of statementMap.values()) {
    stmt.run.mockReset();
    stmt.get.mockReset();
    stmt.all.mockReset();
  }
});

describe('database/metaRepository', () => {
  it('returns null when key missing', () => {
    const stmt = [...statementMap.values()].find(s => s.sql.includes('SELECT value FROM meta'));
    if (stmt) stmt.get.mockReturnValue(null);
    expect(getMeta('k')).toBeNull();
  });

  it('sets meta values', () => {
    setMeta('k', 'v');
    const stmt = [...statementMap.values()].find(s => s.sql.includes('INSERT INTO meta'));
    expect(stmt?.run).toHaveBeenCalled();
  });
});
