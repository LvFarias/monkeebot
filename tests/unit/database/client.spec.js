import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => {
  const fsMock = {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  };
  return { default: fsMock, ...fsMock };
});

vi.mock('better-sqlite3', () => {
  return {
    default: class Database {
      pragma() {
        return null;
      }
    },
  };
});

describe('database/client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.COOPS_DB_PATH = 'data/test.db';
  });

  it('resolves a db path and initializes', async () => {
    const mod = await import('../../../utils/database/client.js');
    expect(mod.DB_PATH).toContain('data');
    expect(mod.default).toBeDefined();
  });
});
