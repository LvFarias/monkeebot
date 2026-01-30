import db from './client.js';

const upsertContractStmt = db.prepare(`
  INSERT INTO contracts (contract_id, name, release, season, egg, size)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(contract_id) DO UPDATE SET
    name = excluded.name,
    release = excluded.release,
    season = excluded.season,
    egg = excluded.egg,
    size = excluded.size
`);

const getAllContractsStmt = db.prepare(`
  SELECT contract_id AS id, name, season, egg, release, size
  FROM contracts
  ORDER BY release DESC
`);

const getContractReleaseStmt = db.prepare('SELECT release FROM contracts WHERE contract_id = ?');

const getContractByIdStmt = db.prepare('SELECT * FROM contracts WHERE contract_id = ?');

const getContractSizeStmt = db.prepare('SELECT size FROM contracts WHERE contract_id = ?');

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
      const size = row.size == null ? null : String(row.size);

      upsertContractStmt.run(id, name, release, season, egg, size);
    }
  });

  tx(rows);
}

export function getStoredContracts() {
  return getAllContractsStmt.all().map(({ id, name, season, egg, release, size }) => ({
    id,
    name,
    season,
    egg,
    release,
    size,
  }));
}

export function getContractRelease(contractId) {
  if (!contractId) return null;
  const row = getContractReleaseStmt.get(String(contractId).trim());
  return row ? row.release : null;
}

export function getContractById(contractId) {
  if (!contractId) return null;
  const row = getContractByIdStmt.get(String(contractId).trim());
  return row ? row : null;
}

export function getContractSize(contractId) {
  if (!contractId) return null;
  const row = getContractSizeStmt.get(String(contractId).trim());
  return row ? row.size : null;
}
