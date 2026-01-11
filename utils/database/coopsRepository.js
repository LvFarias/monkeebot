import db from './client.js';
import { getContractRelease } from './contractsRepository.js';
import { ensureMemberRecord, getMemberRecord, normalizeDiscordId } from './membersRepository.js';

const BASE_INSERT_COLUMNS = ['contract', 'coop', 'created_at', 'push', 'report'];

const insertCoopStmt = db.prepare(
  `INSERT INTO coops (${BASE_INSERT_COLUMNS.join(', ')}) VALUES (${BASE_INSERT_COLUMNS.map(() => '?').join(', ')})`
);

const findCoopStmt = db.prepare('SELECT id FROM coops WHERE contract = ? AND coop = ?');
const listByContractStmt = db.prepare(`
  SELECT coop, contract, COUNT(*) AS cnt
  FROM coops
  WHERE (push = 1 OR ? = 0)
  GROUP BY coop, contract
  ORDER BY cnt DESC, coop ASC
`);

const removeCoopStmt = db.prepare('DELETE FROM coops WHERE contract = ? AND coop = ?');
const getCoopsForContractStmt = db.prepare('SELECT coop FROM coops WHERE contract = ? ORDER BY coop ASC');
const setPushStmt = db.prepare('UPDATE coops SET push = ? WHERE contract = ? AND coop = ?');
const getPushValueStmt = db.prepare('SELECT push FROM coops WHERE contract = ? AND coop = ?');
const setReportStmt = db.prepare('UPDATE coops SET report = ? WHERE contract = ? AND coop = ?');
const getReportStmt = db.prepare('SELECT report FROM coops WHERE contract = ? AND coop = ?');

const getAllCoopsBaseStmt = db.prepare('SELECT contract, coop FROM coops ORDER BY contract ASC, coop ASC');
const getAllCoopsPushStmt = db.prepare('SELECT contract, coop FROM coops WHERE push = 1 ORDER BY contract ASC, coop ASC');
const listRecentCoopsStmt = db.prepare('SELECT contract, coop FROM coops ORDER BY id DESC LIMIT ?');

const findCoopIdStmt = db.prepare('SELECT id FROM coops WHERE contract = ? AND coop = ?');
const linkMemberCoopStmt = db.prepare('INSERT OR IGNORE INTO member_coops (member_id, coop_id) VALUES (?, ?)');
const getMembersByCoopStmt = db.prepare(`
  SELECT m.discord_id
  FROM members m
  JOIN member_coops mc ON m.internal_id = mc.member_id
  WHERE mc.coop_id = ?
  ORDER BY m.discord_id ASC
`);
const deleteMemberCoopStmt = db.prepare('DELETE FROM member_coops WHERE member_id = ? AND coop_id = ?');

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function sanitizeContract(value) {
  return normalizeText(value);
}

function sanitizeCoop(value) {
  return normalizeText(value);
}

export function addCoop(contract, coop, push = false, report = null) {
  const normalizedContract = sanitizeContract(contract);
  const normalizedCoop = sanitizeCoop(coop);

  if (!normalizedContract || !normalizedCoop) {
    return { added: false, reason: 'invalid-input' };
  }

  const existing = findCoopStmt.get(normalizedContract, normalizedCoop);
  if (existing) {
    return { added: false, reason: 'exists' };
  }

  const release = getContractRelease(normalizedContract);
  const createdAt = typeof release === 'number' ? release : Math.floor(Date.now() / 1000);

  try {
    const values = [
      normalizedContract,
      normalizedCoop,
      createdAt,
      push ? 1 : 0,
      report == null ? null : String(report),
    ];

    insertCoopStmt.run(...values);
    return { added: true };
  } catch (err) {
    return { added: false, reason: err.message };
  }
}

export function removecoop(contract, coop) {
  const normalizedContract = sanitizeContract(contract);
  const normalizedCoop = sanitizeCoop(coop);

  if (!normalizedContract || !normalizedCoop) {
    return { removed: false, reason: 'invalid-input' };
  }

  const info = removeCoopStmt.run(normalizedContract, normalizedCoop);
  if (info.changes > 0) {
    return { removed: true };
  }

  return { removed: false, reason: 'not-found' };
}

export function getCoopsForContract(contract) {
  const normalizedContract = sanitizeContract(contract);
  if (!normalizedContract) return [];
  return getCoopsForContractStmt.all(normalizedContract).map(row => row.coop);
}

export function setPush(contract, coop, push) {
  const normalizedContract = sanitizeContract(contract);
  const normalizedCoop = sanitizeCoop(coop);

  if (!normalizedContract || !normalizedCoop) {
    return { updated: false, reason: 'invalid-input' };
  }

  try {
    const row = getPushValueStmt.get(normalizedContract, normalizedCoop);
    if (!row) {
      return { updated: false, reason: 'not-found' };
    }

    const desired = push ? 1 : 0;
    const current = Number(row.push) === 1 ? 1 : 0;
    if (current === desired) {
      return { updated: false, already: true };
    }

    const info = setPushStmt.run(desired, normalizedContract, normalizedCoop);
    if (info.changes > 0) {
      return { updated: true };
    }
    return { updated: false, reason: 'no-change' };
  } catch (err) {
    return { updated: false, reason: err.message };
  }
}

export function setCoopReport(contract, coop, report) {
  const normalizedContract = sanitizeContract(contract);
  const normalizedCoop = sanitizeCoop(coop);

  if (!normalizedContract || !normalizedCoop) {
    return { updated: false, reason: 'invalid-input' };
  }

  try {
    const value = report == null ? null : String(report);
    const info = setReportStmt.run(value, normalizedContract, normalizedCoop);
    if (info.changes > 0) {
      return { updated: true };
    }
    return { updated: false, reason: 'not-found' };
  } catch (err) {
    return { updated: false, reason: err.message };
  }
}

export function getCoopReport(contract, coop) {
  const normalizedContract = sanitizeContract(contract);
  const normalizedCoop = sanitizeCoop(coop);
  if (!normalizedContract || !normalizedCoop) return null;

  try {
    const row = getReportStmt.get(normalizedContract, normalizedCoop);
    return row ? row.report : null;
  } catch (err) {
    console.error('Failed to fetch coop report', err);
    return null;
  }
}

function mapCoopRow(row) {
  return { contract: row.contract, coop: row.coop };
}

function fetchCoops({ season = null, requirePush = false } = {}) {
  if (!season) {
    const stmt = requirePush ? getAllCoopsPushStmt : getAllCoopsBaseStmt;
    return stmt.all().map(mapCoopRow);
  }

  let query = `
    SELECT c.contract, c.coop
    FROM coops c
    JOIN contracts k ON c.contract = k.contract_id
    WHERE k.season = ?
  `;
  const params = [season];

  if (requirePush) {
    query += ' AND c.push = 1';
  }

  query += ' ORDER BY c.contract ASC, c.coop ASC';

  return db.prepare(query).all(...params).map(mapCoopRow);
}

export function getAllCoops() {
  return fetchCoops({ requirePush: false });
}

export function getAllPushCoops() {
  return fetchCoops({ requirePush: true });
}

export function getAllCoopsForSeason(season) {
  if (!season) {
    return getAllCoops();
  }
  return fetchCoops({ season, requirePush: false });
}

export function getAllPushCoopsForSeason(season) {
  if (!season) {
    return getAllPushCoops();
  }
  return fetchCoops({ season, requirePush: true });
}

export function listRecentCoops(limit = 50) {
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 50;
  return listRecentCoopsStmt
    .all(normalizedLimit)
    .map(row => ({ contract: row.contract, coop: row.coop }));
}

export function getPastCoops(pushOnly = false) {
  return listByContractStmt.all(pushOnly ? 1 : 0);
}

export function getPastCoopsByCoop(pushOnly = false, season = null) {
  let query = `
    SELECT c.coop, COUNT(*) AS cnt
    FROM coops c
  `;
  const params = [];

  if (season) {
    query += `
      JOIN contracts k ON c.contract = k.contract_id
      WHERE k.season = ?
    `;
    params.push(season);
  } else {
    query += ' WHERE 1=1';
  }

  if (pushOnly) {
    query += ' AND c.push = 1';
  }

  query += `
    GROUP BY c.coop
    ORDER BY cnt DESC, c.coop ASC
  `;

  return db.prepare(query).all(...params);
}

export function linkMembersToCoop(contract, coop, members = []) {
  const normalizedContract = sanitizeContract(contract);
  const normalizedCoop = sanitizeCoop(coop);

  if (!normalizedContract || !normalizedCoop || !Array.isArray(members) || members.length === 0) {
    return { linked: 0, reason: 'invalid-input' };
  }

  const coopRow = findCoopIdStmt.get(normalizedContract, normalizedCoop);
  if (!coopRow) {
    return { linked: 0, reason: 'coop-not-found' };
  }

  const coopId = coopRow.id;
  let linkedCount = 0;
  const linkedIds = [];
  const alreadyIds = [];

  const tx = db.transaction((discordIds) => {
    for (const rawId of discordIds) {
      const discordId = normalizeDiscordId(rawId);
      if (!discordId) continue;

      const { record } = ensureMemberRecord(discordId);
      if (!record) continue;

      const result = linkMemberCoopStmt.run(record.internal_id, coopId);
      if (result.changes > 0) {
        linkedCount += 1;
        linkedIds.push(discordId);
      } else {
        alreadyIds.push(discordId);
      }
    }
  });

  tx(members);

  return { linked: linkedCount, linkedIds, alreadyIds };
}

export function getMembersForCoop(contract, coop) {
  const normalizedContract = sanitizeContract(contract);
  const normalizedCoop = sanitizeCoop(coop);
  if (!normalizedContract || !normalizedCoop) return [];

  const coopRow = findCoopIdStmt.get(normalizedContract, normalizedCoop);
  if (!coopRow) return [];

  return getMembersByCoopStmt.all(coopRow.id).map(row => row.discord_id);
}

export function removePlayersFromCoop(contract, coop, discordIds = []) {
  if (!Array.isArray(discordIds) || discordIds.length === 0) {
    return { removed: 0, removedIds: [] };
  }

  const normalizedContract = sanitizeContract(contract);
  const normalizedCoop = sanitizeCoop(coop);
  if (!normalizedContract || !normalizedCoop) {
    return { removed: 0, removedIds: [] };
  }

  const coopRow = findCoopIdStmt.get(normalizedContract, normalizedCoop);
  if (!coopRow) {
    return { removed: 0, removedIds: [] };
  }

  const coopId = coopRow.id;
  let removedCount = 0;
  const removedIds = [];

  const tx = db.transaction((ids) => {
    for (const rawId of ids) {
      const discordId = normalizeDiscordId(rawId);
      if (!discordId) continue;

      const member = getMemberRecord(discordId);
      if (!member) continue;

      const result = deleteMemberCoopStmt.run(member.internal_id, coopId);
      if (result.changes > 0) {
        removedCount += 1;
        removedIds.push(discordId);
      }
    }
  });

  tx(discordIds);

  return { removed: removedCount, removedIds };
}

function parseSeasonKey(seasonKey) {
  if (!seasonKey) return null;
  const match = /^([a-z]+)_(\d{4})$/i.exec(String(seasonKey).trim());
  if (!match) return null;
  return { label: match[1].toLowerCase(), year: Number(match[2]) };
}

function toUtcSeconds(year, monthIndex, day) {
  return Math.floor(Date.UTC(year, monthIndex, day, 0, 0, 0) / 1000);
}

function getAstronomicalSeasonRange(seasonKey) {
  const parsed = parseSeasonKey(seasonKey);
  if (!parsed || Number.isNaN(parsed.year)) return null;

  const { label, year } = parsed;
  const normalizedLabel = label === 'autumn' ? 'fall' : label;

  switch (normalizedLabel) {
    case 'spring':
      return { start: toUtcSeconds(year, 2, 20), endExclusive: toUtcSeconds(year, 5, 21) };
    case 'summer':
      return { start: toUtcSeconds(year, 5, 21), endExclusive: toUtcSeconds(year, 8, 22) };
    case 'fall':
      return { start: toUtcSeconds(year, 8, 22), endExclusive: toUtcSeconds(year, 11, 22) };
    case 'winter':
      return { start: toUtcSeconds(year, 11, 21), endExclusive: toUtcSeconds(year + 1, 2, 20) };
    default:
      return null;
  }
}

export function getSeasonHelpers({ season, pushOnly = true, seasonalOnly = true } = {}) {
  if (!season) return [];

  let contractRows;
  if (seasonalOnly) {
    contractRows = db
      .prepare('SELECT contract_id FROM contracts WHERE season = ?')
      .all(season);
  } else {
    const range = getAstronomicalSeasonRange(season);
    if (!range) return [];
    contractRows = db
      .prepare('SELECT contract_id FROM contracts WHERE release >= ? AND release < ?')
      .all(range.start, range.endExclusive);
  }

  const contractIds = contractRows
    .map(row => String(row.contract_id || '').trim())
    .filter(Boolean);

  if (contractIds.length === 0) return [];

  const placeholders = contractIds.map(() => '?').join(',');
  const filterClause = pushOnly ? 'c.push = 1 AND ' : '';

  const rows = db.prepare(`
    WITH RECURSIVE root_map(member_internal_id, member_discord_id, root_internal_id, root_discord_id) AS (
      SELECT m.internal_id, m.discord_id, m.internal_id, m.discord_id
      FROM members m
      WHERE m.main_id IS NULL
        AND m.is_active = 1
      UNION ALL
      SELECT child.internal_id, child.discord_id, rm.root_internal_id, rm.root_discord_id
      FROM members child
      JOIN root_map rm ON child.main_id = rm.member_internal_id
      WHERE child.is_active = 1
    )
    SELECT
      rm.root_internal_id,
      rm.root_discord_id,
      rm.member_internal_id,
      rm.member_discord_id,
      COUNT(*) AS contribution_count
    FROM root_map rm
    JOIN member_coops mc ON rm.member_internal_id = mc.member_id
    JOIN coops c ON mc.coop_id = c.id
    WHERE ${filterClause}TRIM(CAST(c.contract AS TEXT)) IN (${placeholders})
    GROUP BY rm.root_internal_id, rm.root_discord_id, rm.member_internal_id, rm.member_discord_id
  `).all(...contractIds);

  const aggregates = new Map();

  for (const row of rows) {
    const rootDiscord = row.root_discord_id;
    if (!rootDiscord) continue;

    if (!aggregates.has(rootDiscord)) {
      aggregates.set(rootDiscord, {
        discord_id: rootDiscord,
        count: 0,
        breakdown: [],
      });
    }

    const entry = aggregates.get(rootDiscord);
    entry.count += row.contribution_count;
    entry.breakdown.push({
      discord_id: row.member_discord_id,
      count: row.contribution_count,
      isMain: row.root_internal_id === row.member_internal_id,
    });
  }

  return Array.from(aggregates.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
}

export function getPushHelpersForSeason(season) {
  return getSeasonHelpers({ season, pushOnly: true });
}

export function getAllSeasons() {
  const rows = db.prepare(`
    SELECT DISTINCT season
    FROM contracts
    WHERE season IS NOT NULL AND TRIM(season) != ''
    ORDER BY season DESC
  `).all();

  const order = ['fall', 'summer', 'spring', 'winter'];

  return rows
    .map(row => String(row.season).trim())
    .filter(Boolean)
    .sort((a, b) => {
      const [seasonA, yearA] = a.split('_');
      const [seasonB, yearB] = b.split('_');
      const yearDiff = Number(yearB) - Number(yearA);
      if (yearDiff !== 0) return yearDiff;
      return order.indexOf(seasonA) - order.indexOf(seasonB);
    });
}

export function getPushReportsForSeason(season) {
  if (!season) return [];

  const rows = db.prepare(`
    SELECT c.contract, c.coop, c.report, k.name, k.egg
    FROM coops c
    JOIN contracts k ON c.contract = k.contract_id
    WHERE c.push = 1
      AND k.season = ?
    ORDER BY k.release DESC, c.coop ASC
  `).all(season);

  return rows.map(row => ({
    contract: String(row.contract || '').trim(),
    coop: String(row.coop || '').trim(),
    report: row.report == null ? null : String(row.report),
    name: row.name == null ? null : String(row.name),
    egg: row.egg == null ? null : String(row.egg),
  }));
}
