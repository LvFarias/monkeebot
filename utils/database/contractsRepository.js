import db from './client.js';

const upsertContractStmt = db.prepare(`
  INSERT INTO contracts (
    contract_id,
    name,
    release,
    season,
    egg,
    max_coop_size,
    coop_duration_seconds,
    egg_goal,
    minutes_per_token
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(contract_id) DO UPDATE SET
    name = excluded.name,
    release = excluded.release,
    season = excluded.season,
    egg = excluded.egg,
    max_coop_size = excluded.max_coop_size,
    coop_duration_seconds = excluded.coop_duration_seconds,
    egg_goal = excluded.egg_goal,
    minutes_per_token = excluded.minutes_per_token
`);

const getAllContractsStmt = db.prepare(`
  SELECT
    contract_id AS id,
    name,
    season,
    egg,
    release,
    max_coop_size,
    coop_duration_seconds,
    egg_goal,
    minutes_per_token
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
      const maxCoopSize = Number.isFinite(row.maxCoopSize) ? row.maxCoopSize : null;
      const coopDurationSeconds = Number.isFinite(row.coopDurationSeconds) ? row.coopDurationSeconds : null;
      const eggGoal = Number.isFinite(row.eggGoal) ? row.eggGoal : null;
      const minutesPerToken = Number.isFinite(row.minutesPerToken) ? row.minutesPerToken : null;

      upsertContractStmt.run(
        id,
        name,
        release,
        season,
        egg,
        maxCoopSize,
        coopDurationSeconds,
        eggGoal,
        minutesPerToken
      );
    }
  });

  tx(rows);
}

export function getStoredContracts() {
  return getAllContractsStmt
    .all()
    .map(({ id, name, season, egg, release, max_coop_size, coop_duration_seconds, egg_goal, minutes_per_token }) => ({
      id,
      name,
      season,
      egg,
      release,
      maxCoopSize: max_coop_size,
      coopDurationSeconds: coop_duration_seconds,
      eggGoal: egg_goal,
      minutesPerToken: minutes_per_token,
    }));
}

export function getContractRelease(contractId) {
  if (!contractId) return null;
  const row = getContractReleaseStmt.get(String(contractId).trim());
  return row ? row.release : null;
}
