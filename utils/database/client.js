import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'data');

function resolveDatabasePath() {
  const overridePath = process.env.COOPS_DB_PATH;
  if (overridePath) {
    const absolutePath = path.isAbsolute(overridePath)
      ? overridePath
      : path.join(process.cwd(), overridePath);

    const customDir = path.dirname(absolutePath);
    if (!fs.existsSync(customDir)) {
      fs.mkdirSync(customDir, { recursive: true });
    }
    return absolutePath;
  }

  if (!fs.existsSync(DEFAULT_DATA_DIR)) {
    fs.mkdirSync(DEFAULT_DATA_DIR, { recursive: true });
  }

  return path.join(DEFAULT_DATA_DIR, 'coops.db');
}

const DB_PATH = resolveDatabasePath();

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

export default db;
export { DB_PATH };
