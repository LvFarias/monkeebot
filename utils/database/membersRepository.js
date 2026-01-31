import db from './client.js';
import { DEFAULT_MAMABIRD_IDS } from './schema.js';

const findMemberStmt = db.prepare('SELECT internal_id, discord_id, ign, main_id, sheet_tab, is_mamabird, is_active FROM members WHERE discord_id = ?');
const findMemberSheetTabNameStmt = db.prepare('SELECT sheet_tab FROM members WHERE discord_id = ?');
const insertMemberStmt = db.prepare('INSERT INTO members (discord_id) VALUES (?)');
const countMemberChildrenStmt = db.prepare('SELECT COUNT(*) AS cnt FROM members WHERE main_id = ?');
const setMemberMainStmt = db.prepare('UPDATE members SET main_id = ? WHERE internal_id = ?');
const getMamaBirdStmt = db.prepare('SELECT is_mamabird FROM members WHERE discord_id = ?');
const setMamaBirdStmt = db.prepare('UPDATE members SET is_mamabird = ? WHERE internal_id = ?');
const listMamaBirdsStmt = db.prepare('SELECT discord_id FROM members WHERE is_mamabird = 1 ORDER BY discord_id ASC');
const listMembersWithoutIgnStmt = db.prepare('SELECT discord_id FROM members WHERE ign IS NULL AND is_active = 1 ORDER BY discord_id ASC');
const listMembersWithIgnStmt = db.prepare('SELECT discord_id, ign FROM members WHERE ign IS NOT NULL AND is_active = 1 ORDER BY discord_id ASC');
const listAllMemberStmt = db.prepare('SELECT * FROM members WHERE is_active = 1 ORDER BY sheet_tab ASC');
const updateMemberIgnStmt = db.prepare('UPDATE members SET ign = ? WHERE internal_id = ?');
const setMemberActiveStmt = db.prepare('UPDATE members SET is_active = ? WHERE internal_id = ?');
const setMemberPushedStmt = db.prepare('UPDATE members SET is_pushed = ? WHERE discord_id = ?');
const upsertBnPlayersStmt = db.prepare(`
  INSERT INTO members (discord_id, discord_name, ign, main_id, is_mamabird, is_pushed, sheet_tab, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(discord_id) DO UPDATE SET
    discord_name = excluded.discord_name,
    sheet_tab = excluded.sheet_tab,
    is_active = excluded.is_active;
`);

export function upsertMember(row) {
  upsertBnPlayersStmt.run(
    row.discordId,
    row.discordName,
    row.ign,
    row.mainId,
    row.isMamaBird ? 1 : 0,
    row.isPushed ? 1 : 0,
    row.tabName,
    row.isActive ? 1 : 0,
  );
}

export function normalizeDiscordId(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function getMemberRecord(discordId) {
  const id = normalizeDiscordId(discordId);
  if (!id) return null;
  return findMemberStmt.get(id) ?? null;
}

export function getMemberTabName(discordId) {
  const id = normalizeDiscordId(discordId);
  if (!id) return null;
  return findMemberSheetTabNameStmt.get(id) ?? null;
}

export function ensureMemberRecord(discordId) {
  const id = normalizeDiscordId(discordId);
  if (!id) return { record: null, created: false };

  let record = findMemberStmt.get(id);
  if (record) {
    return { record, created: false };
  }

  const info = insertMemberStmt.run(id);
  record = {
    internal_id: info.lastInsertRowid,
    discord_id: id,
    ign: null,
    main_id: null,
    is_mamabird: 0,
    is_active: 0,
  };
  return { record, created: true };
}

function normalizeIgn(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function getMembersByIgns(igns = []) {
  const normalized = igns
    .map(normalizeIgn)
    .filter(Boolean);

  if (normalized.length === 0) {
    return [];
  }

  const params = normalized.map(ign => ign.toLowerCase());
  const placeholders = params.map(() => '?').join(', ');

  const stmt = db.prepare(
    `SELECT internal_id, discord_id, ign FROM members WHERE ign IS NOT NULL AND LOWER(ign) IN (${placeholders})`
  );

  return stmt.all(...params).map(row => ({
    internal_id: row.internal_id,
    discord_id: row.discord_id,
    ign: row.ign == null ? null : String(row.ign),
  }));
}

export function updateMemberIgnByInternalId(internalId, ignValue) {
  if (!internalId) {
    return { changes: 0 };
  }

  const normalizedIgn = normalizeIgn(ignValue) || null;
  const info = updateMemberIgnStmt.run(normalizedIgn, internalId);
  return { changes: info.changes ?? 0 };
}

export function updateMemberActiveByInternalId(internalId, isActive) {
  if (!internalId) {
    return { changes: 0 };
  }

  const desired = isActive ? 1 : 0;
  const info = setMemberActiveStmt.run(desired, internalId);
  return { changes: info.changes ?? 0 };
}

export function updateMemberPushedByDiscordId(discordId, isPushed) {
  if (!discordId) {
    return { changes: 0 };
  }

  const desired = isPushed ? 1 : 0;
  const info = setMemberPushedStmt.run(desired, discordId);
  return { changes: info.changes ?? 0 };
}

export function getMemberInternalId(discordId) {
  const record = getMemberRecord(discordId);
  return record ? record.internal_id : null;
}

export function setAltRelationship(mainDiscordId, altDiscordId) {
  const mainEntry = ensureMemberRecord(mainDiscordId);
  const altEntry = ensureMemberRecord(altDiscordId);

  if (!mainEntry.record || !altEntry.record) {
    return { updated: false, reason: 'invalid-input' };
  }

  const main = mainEntry.record;
  const alt = altEntry.record;

  if (main.discord_id === alt.discord_id) {
    return { updated: false, reason: 'same-id' };
  }

  if (main.main_id && main.main_id !== null) {
    return { updated: false, reason: 'main-is-alt' };
  }

  if (alt.main_id && alt.main_id !== null) {
    if (alt.main_id === main.internal_id) {
      return { updated: false, reason: 'already-set' };
    }
    return { updated: false, reason: 'alt-already-linked' };
  }

  const childCount = countMemberChildrenStmt.get(alt.internal_id)?.cnt ?? 0;
  if (childCount > 0) {
    return { updated: false, reason: 'alt-has-children' };
  }

  const info = setMemberMainStmt.run(main.internal_id, alt.internal_id);
  if (info.changes > 0) {
    return {
      updated: true,
      main: { discord_id: main.discord_id, internal_id: main.internal_id },
      alt: { discord_id: alt.discord_id, internal_id: alt.internal_id },
    };
  }

  return { updated: false, reason: 'no-change' };
}

export function removeAltRelationship(mainDiscordId, altDiscordId) {
  const main = getMemberRecord(mainDiscordId);
  const alt = getMemberRecord(altDiscordId);

  if (!main || !alt) {
    return { updated: false, reason: 'not-found' };
  }

  if (alt.main_id !== main.internal_id) {
    return { updated: false, reason: 'not-linked' };
  }

  const info = setMemberMainStmt.run(null, alt.internal_id);
  if (info.changes > 0) {
    return {
      updated: true,
      main: { discord_id: main.discord_id, internal_id: main.internal_id },
      alt: { discord_id: alt.discord_id, internal_id: alt.internal_id },
    };
  }

  return { updated: false, reason: 'no-change' };
}

export function isMamaBird(discordId) {
  const id = normalizeDiscordId(discordId);
  if (!id) return false;
  const row = getMamaBirdStmt.get(id);
  return !!(row && Number(row.is_mamabird) === 1);
}

export function setMamaBirdStatus(discordId, isMama = true) {
  const { record } = ensureMemberRecord(discordId);
  if (!record) return { updated: false, reason: 'invalid-input' };

  const desired = isMama ? 1 : 0;
  if (Number(record.is_mamabird) === desired) {
    return { updated: true, unchanged: true };
  }

  const info = setMamaBirdStmt.run(desired, record.internal_id);
  if (info.changes > 0) {
    return { updated: true };
  }

  const current = getMamaBirdStmt.get(record.discord_id);
  if (current && Number(current.is_mamabird) === desired) {
    return { updated: true, unchanged: true };
  }

  return { updated: false, reason: 'no-change' };
}

export function getMamaBirds() {
  return listMamaBirdsStmt.all().map(row => row.discord_id);
}

export function listMembersWithoutIgn() {
  return listMembersWithoutIgnStmt
    .all()
    .map(row => row.discord_id)
    .filter(id => id != null && String(id).trim() !== '');
}

export function listMembersWithIgn() {
  return listMembersWithIgnStmt
    .all()
    .map(row => ({
      discord_id: row.discord_id,
      ign: row.ign == null ? null : String(row.ign),
    }))
    .filter(entry => entry.ign && entry.ign.trim() !== '');
}

export function listAllMembers() {
  return listAllMemberStmt.all();
}

for (const id of DEFAULT_MAMABIRD_IDS) {
  try {
    setMamaBirdStatus(id, true);
  } catch (err) {
    console.warn(`Failed to ensure default mamabird ${id}:`, err.message);
  }
}
