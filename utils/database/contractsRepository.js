import db from './client.js';

const upsertContractStmt = db.prepare(`
  INSERT INTO contracts (contract_id, name, release, season, egg)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(contract_id) DO UPDATE SET
    name = excluded.name,
    release = excluded.release,
    season = excluded.season,
    egg = excluded.egg
`);

const getAllContractsStmt = db.prepare(`
  SELECT contract_id AS id, name, season, egg, release
  FROM contracts
  ORDER BY release DESC
`);

const getContractReleaseStmt = db.prepare('SELECT release FROM contracts WHERE contract_id = ?');

export function upsertContracts(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const tx = db.transaction((items) => {
    for (const row of items) {
      const id = typeof row.id === 'string' ? row.id.trim() : String(row.id || '').trim();
      if (!id) continue;

      const name = row.name == null ? null : String(row.name);
      const release = typeof row.release === 'number' ? row.release : 0;
      const season = row.season == null ? null : String(row.season);
      const egg = row.egg == null ? null : String(row.egg);

      upsertContractStmt.run(id, name, release, season, egg);
    }
  });

  tx(rows);
}

export function getStoredContracts() {
  return getAllContractsStmt.all().map(({ id, name, season, egg, release }) => ({
    id,
    name,
    season,
    egg,
    release,
  }));
}

export function getContractRelease(contractId) {
  if (!contractId) return null;
  const row = getContractReleaseStmt.get(String(contractId).trim());
  return row ? row.release : null;
}
