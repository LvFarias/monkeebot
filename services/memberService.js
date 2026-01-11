import {
  ensureMemberRecord,
  getMemberRecord,
  getMembersByIgns,
  updateMemberIgnByInternalId,
  updateMemberActiveByInternalId,
} from '../utils/database/index.js';

function normalizeDiscordId(value) {
  if (!value) return '';
  return String(value).trim();
}

function normalizeIgn(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function setIgnForMember({ targetDiscordId, ign }) {
  const discordId = normalizeDiscordId(targetDiscordId);
  if (!discordId) {
    return { ok: false, reason: 'invalid-id' };
  }

  const normalizedIgn = normalizeIgn(ign);
  if (!normalizedIgn) {
    return { ok: false, reason: 'invalid-ign' };
  }

  const duplicates = getMembersByIgns([normalizedIgn]).filter(
    row => row.discord_id !== discordId,
  );
  if (duplicates.length > 0) {
    return {
      ok: false,
      reason: 'conflict',
      conflictDiscordIds: duplicates.map(row => row.discord_id),
    };
  }

  const { record, created } = ensureMemberRecord(discordId);
  if (!record) {
    return { ok: false, reason: 'not-found' };
  }

  const existingIgn = record.ign == null ? null : normalizeIgn(record.ign);
  if (existingIgn === normalizedIgn) {
    return {
      ok: true,
      status: 'unchanged',
      discordId,
      ign: record.ign ?? normalizedIgn,
    };
  }

  const updateResult = updateMemberIgnByInternalId(record.internal_id, normalizedIgn);
  const refreshed = getMemberRecord(discordId);
  const refreshedIgn = refreshed?.ign == null ? null : normalizeIgn(refreshed.ign);
  if (refreshedIgn !== normalizedIgn) {
    return { ok: false, reason: 'unknown-error' };
  }

  const status = created
    ? 'created'
    : ['unchanged', 'updated'][Number(updateResult.changes > 0)];

  return {
    ok: true,
    status,
    discordId,
    ign: normalizedIgn,
  };
}

export function setMembersActiveStatus({ targetDiscordIds = [], active } = {}) {
  const normalizedIds = Array.isArray(targetDiscordIds)
    ? [...new Set(targetDiscordIds.map(normalizeDiscordId).filter(Boolean))]
    : [];

  if (normalizedIds.length === 0) {
    return { ok: false, reason: 'no-targets' };
  }

  if (active !== true && active !== false) {
    return { ok: false, reason: 'invalid-active' };
  }

  const desired = active ? 1 : 0;
  const summary = {
    ok: true,
    active,
    updated: [],
    unchanged: [],
    created: [],
    failures: [],
  };

  for (const id of normalizedIds) {
    const { record, created } = ensureMemberRecord(id);
    if (!record) {
      summary.failures.push({ discordId: id, reason: 'ensure-failed' });
      continue;
    }

    const currentActive = Number(record.is_active) === 1 ? 1 : 0;
    if (currentActive === desired) {
      summary.unchanged.push(id);
      if (created) {
        summary.created.push(id);
      }
      continue;
    }

    updateMemberActiveByInternalId(record.internal_id, desired);
    const refreshed = getMemberRecord(id);
    if (Number(refreshed?.is_active) === desired) {
      summary.updated.push(id);
      if (created) {
        summary.created.push(id);
      }
      continue;
    }

    summary.failures.push({ discordId: id, reason: 'update-failed' });
  }

  return summary;
}

export function syncMembersFromApiEntries(entries = []) {
  const summary = {
    total: 0,
    processed: 0,
    updated: 0,
    unchanged: 0,
    conflicts: [],
    invalid: [],
    missing: [],
    skipped: [],
    failures: [],
  };

  if (!Array.isArray(entries) || entries.length === 0) {
    return summary;
  }

  for (const entry of entries) {
    processMemberEntry(entry, summary);
  }

  return summary;
}

export default { setIgnForMember, setMembersActiveStatus, syncMembersFromApiEntries };

function processMemberEntry(entry, summary) {
  const discordId = normalizeDiscordId(entry?.ID);
  const ign = normalizeIgn(entry?.IGN);

  if (!discordId) {
    summary.invalid.push({ discordId, ign });
    return;
  }

  summary.total += 1;

  if (!ign) {
    summary.invalid.push({ discordId, ign });
    return;
  }

  const existingRecord = getMemberRecord(discordId);
  if (!existingRecord) {
    summary.skipped.push({ discordId, ign });
    return;
  }

  const result = setIgnForMember({ targetDiscordId: discordId, ign });
  if (!result.ok) {
    handleSyncFailure({ result, summary, discordId, ign });
    return;
  }

  summary.processed += 1;
  if (result.status === 'updated') {
    summary.updated += 1;
    return;
  }

  summary.unchanged += 1;
}

function handleSyncFailure({ result, summary, discordId, ign }) {
  if (result.reason === 'conflict') {
    summary.conflicts.push({
      discordId,
      ign,
      conflictDiscordIds: result.conflictDiscordIds ?? [],
    });
    return;
  }

  if (result.reason === 'invalid-ign') {
    summary.invalid.push({ discordId, ign });
    return;
  }

  summary.failures.push({
    discordId,
    ign,
    reason: result.reason ?? 'unknown-error',
  });
}
