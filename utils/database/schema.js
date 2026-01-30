import db from './client.js';

export const DEFAULT_MAMABIRD_IDS = ['659339631564947456'];
function ensureContractsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      internal_id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id TEXT NOT NULL UNIQUE,
      name TEXT,
      release INTEGER DEFAULT 0,
      season TEXT,
      egg TEXT,
      size INTEGER DEFAULT 0
    );
  `);
}

function migrateContractsTable() {
  const cols = db.prepare("PRAGMA table_info('contracts')").all();
  const hasSize = cols.some((col) => col.name === 'size');
  if (!hasSize) {
    db.exec(`ALTER TABLE contracts ADD COLUMN size INTEGER DEFAULT 0;`);
  }
}

function ensureMetaTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function ensureMembersTable() {

  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      internal_id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL UNIQUE,
      discord_name TEXT,
      ign TEXT,
      main_id INTEGER REFERENCES members(internal_id) ON DELETE SET NULL,
      is_mamabird INTEGER NOT NULL DEFAULT 0,
      is_pushed INTEGER NOT NULL DEFAULT 0,
      sheet_tab TEXT,
      is_active INTEGER NOT NULL DEFAULT 0
    );
  `);

  const membersCols = db.prepare("PRAGMA table_info('members')").all();
  const hasMain = membersCols.some(col => col.name === 'main_id');
  const hasMamabird = membersCols.some(col => col.name === 'is_mamabird');
  const hasIgn = membersCols.some(col => col.name === 'ign');
  if (!hasMain || !hasMamabird || !hasIgn) {
    throw new Error('Existing members table is missing required columns. Please recreate the database.');
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_members_main_id ON members(main_id)`);
  } catch (err) {
    console.warn('Failed to ensure idx_members_main_id index:', err.message);
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_members_mamabird ON members(is_mamabird)`);
  } catch (err) {
    console.warn('Failed to ensure idx_members_mamabird index:', err.message);
  }
}

function migrateMembersTable() {
  const cols = db.prepare("PRAGMA table_info('members')").all();
  const hasIsPushed = cols.some((col) => col.name === 'is_pushed');
  if (!hasIsPushed) {
    db.exec(
      `ALTER TABLE members ADD COLUMN is_pushed INTEGER NOT NULL DEFAULT 0;`,
    );
  }
  const hasSheetTab = cols.some((col) => col.name === 'sheet_tab');
  if (!hasSheetTab) {
    db.exec(`ALTER TABLE members ADD COLUMN sheet_tab TEXT;`);
  }
  const hasDiscordName = cols.some((col) => col.name === 'discord_name');
  if (!hasDiscordName) {
    db.exec(`ALTER TABLE members ADD COLUMN discord_name TEXT;`);
  }
}

function ensureMemberCoopsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_coops (
      member_id INTEGER NOT NULL,
      coop_id INTEGER NOT NULL,
      PRIMARY KEY(member_id, coop_id),
      FOREIGN KEY(member_id) REFERENCES members(internal_id) ON DELETE CASCADE,
      FOREIGN KEY(coop_id) REFERENCES coops(id) ON DELETE CASCADE
    );
  `);
}

function ensureCoopsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS coops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract TEXT NOT NULL,
      coop TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      push INTEGER NOT NULL DEFAULT 0,
      report TEXT,
      UNIQUE(contract, coop),
      FOREIGN KEY(contract) REFERENCES contracts(contract_id) ON DELETE CASCADE
    );
  `);

  const cols = db.prepare("PRAGMA table_info('coops')").all();
  const hasPush = cols.some(col => col.name === 'push');
  const hasReport = cols.some(col => col.name === 'report');
  if (!hasPush || !hasReport) {
    throw new Error('Existing coops table is missing required columns. Please recreate the database.');
  }

  const foreignKeys = db.prepare("PRAGMA foreign_key_list('coops')").all();
  const hasForeignKey = Array.isArray(foreignKeys) && foreignKeys.length > 0;
  if (!hasForeignKey) {
    throw new Error('Coops table is missing required foreign key constraints. Please recreate the database.');
  }

  return {
    coopsHasPush: true,
    coopsHasReport: true,
  };
}

function bootstrap() {
  ensureContractsTable();
  migrateContractsTable();
  ensureMetaTable();
  ensureMembersTable();
  migrateMembersTable();
  ensureMemberCoopsTable();
  return ensureCoopsTable();
}

export const schemaState = bootstrap();
export default schemaState;
