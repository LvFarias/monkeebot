import db from './client.js';

const getMetaStmt = db.prepare('SELECT value FROM meta WHERE key = ?');
const setMetaStmt = db.prepare(`
  INSERT INTO meta (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value
`);

export function getMeta(key) {
  const row = getMetaStmt.get(key);
  return row ? row.value : null;
}

export function setMeta(key, value) {
  setMetaStmt.run(key, value);
}
