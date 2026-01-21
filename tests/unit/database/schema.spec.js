import { beforeEach, describe, expect, it, vi } from 'vitest';

const statementMap = new Map();

vi.mock('../../../utils/database/client.js', () => {
  const makeStmt = (sql) => {
    const stmt = { sql, run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) };
    statementMap.set(sql, stmt);
    return stmt;
  };

  return {
    default: {
      exec: vi.fn(),
      prepare: (sql) => statementMap.get(sql) ?? makeStmt(sql),
    },
  };
});

describe('database/schema', () => {
  beforeEach(() => {
    vi.resetModules();
    statementMap.clear();
  });

  it('bootstraps schema state', async () => {
    const membersInfo = [{ name: 'main_id' }, { name: 'is_mamabird' }, { name: 'ign' }];
    const coopsInfo = [{ name: 'push' }, { name: 'report' }];
    const fkInfo = [{ id: 1 }];

    statementMap.set("PRAGMA table_info('members')", { sql: "PRAGMA table_info('members')", run: vi.fn(), get: vi.fn(), all: vi.fn(() => membersInfo) });
    statementMap.set("PRAGMA table_info('coops')", { sql: "PRAGMA table_info('coops')", run: vi.fn(), get: vi.fn(), all: vi.fn(() => coopsInfo) });
    statementMap.set("PRAGMA foreign_key_list('coops')", { sql: "PRAGMA foreign_key_list('coops')", run: vi.fn(), get: vi.fn(), all: vi.fn(() => fkInfo) });

    const mod = await import('../../../utils/database/schema.js');

    expect(mod.schemaState.coopsHasPush).toBe(true);
    expect(mod.schemaState.coopsHasReport).toBe(true);
  });
});
