import {
  addCoop as addCoopRecord,
  removecoop as removeCoopRecord,
  getAllCoops,
  getAllPushCoops,
  getAllCoopsForSeason,
  getAllPushCoopsForSeason,
  linkMembersToCoop,
  removePlayersFromCoop,
  setPush,
  setCoopReport,
  getCoopReport,
  setAltRelationship,
  removeAltRelationship,
  getPushReportsForSeason,
  getPastCoops,
  getPastCoopsByCoop,
  getMembersByIgns,
} from '../utils/database/index.js';
import { extractDiscordIds, extractDiscordId, isValidHttpUrl } from './discord.js';
import { isKnownContract, refreshContracts, listCoops as listCoopsForContract } from './contractService.js';
import { checkAllFromContractID, fetchCoopContributors } from '../utils/coopchecker.js';

function normalizeCoopPath(input) {
  if (!input) return { error: 'missing-input' };

  input = input.trim();

  const isFullUrl = /^https?:\/\//i.test(input);
  let pathname;

  if (isFullUrl) {
    const asUrl = new URL(input);
    pathname = asUrl.pathname || '';
  } else {
    pathname = input;
  }

  if (pathname.startsWith('/')) pathname = pathname.slice(1);
  return parseContractCoop(pathname);
}

function parseContractCoop(raw) {
  const trimmed = String(raw).trim().replace(/^\//, '');
  const [contract, coop, ...rest] = trimmed.split('/').filter(Boolean);
  if (!contract || !coop || rest.length > 0) {
    return { error: 'invalid-path' };
  }
  return { contract: contract.trim(), coop: coop.trim() };
}

async function ensureKnownContract(contractId) {
  if (!contractId) return false;
  if (await isKnownContract(contractId)) return true;
  await refreshContracts();
  return isKnownContract(contractId);
}

async function ensureCoopExists(contract, coop) {
  const normalizedContract = contract?.trim();
  const normalizedCoop = coop?.trim();
  if (!normalizedContract || !normalizedCoop) {
    return { ok: false, reason: 'invalid-input' };
  }

  const existing = listCoopsForContract(normalizedContract);
  if (existing.includes(normalizedCoop)) {
    return { ok: true, created: false };
  }

  const addResult = addCoopRecord(normalizedContract, normalizedCoop, false);
  if (addResult.added) {
    return { ok: true, created: true };
  }

  return { ok: false, reason: addResult.reason ?? 'unknown-error' };
}

export async function addCoopFromInput({ rawInput, push = false }) {
  const parsed = normalizeCoopPath(rawInput);
  if (parsed.error) {
    return { ok: false, reason: parsed.error };
  }

  const { contract, coop } = parsed;
  if (!(await ensureKnownContract(contract))) {
    return { ok: false, reason: 'unknown-contract', contract };
  }

  const result = addCoopRecord(contract, coop, push);
  if (result.added) {
    return { ok: true, contract, coop };
  }

  return { ok: false, reason: result.reason ?? 'unknown-error', contract, coop };
}

export async function addCoopIfMissing(contract, coop, push = false) {
  const ensureResult = await ensureCoopExists(contract, coop);
  if (!ensureResult.ok) {
    return ensureResult;
  }
  if (ensureResult.created && push) {
    setPush(contract, coop, push);
  }
  return { ok: true, created: ensureResult.created };
}

export async function addPlayersToCoop({ contract, coop, userInput }) {
  const normalizedContract = contract?.trim();
  const normalizedCoop = coop?.trim();
  if (!normalizedContract || !normalizedCoop) {
    return { ok: false, reason: 'invalid-input' };
  }

  const userIds = extractDiscordIds(userInput);
  if (userIds.length === 0) {
    return { ok: false, reason: 'no-users' };
  }

  const ensure = await ensureCoopExists(normalizedContract, normalizedCoop);
  if (!ensure.ok) {
    return ensure;
  }

  const linkResult = linkMembersToCoop(normalizedContract, normalizedCoop, userIds);
  return {
    ok: true,
    newlyLinked: linkResult.linkedIds ?? [],
    alreadyLinked: linkResult.alreadyIds ?? [],
    contract: normalizedContract,
    coop: normalizedCoop,
  };
}

export function removePlayersFromCoopService({ contract, coop, userInput }) {
  const normalizedContract = contract?.trim();
  const normalizedCoop = coop?.trim();
  if (!normalizedContract || !normalizedCoop) {
    return { ok: false, reason: 'invalid-input' };
  }

  const userIds = extractDiscordIds(userInput);
  if (userIds.length === 0) {
    return { ok: false, reason: 'no-users' };
  }

  const result = removePlayersFromCoop(normalizedContract, normalizedCoop, userIds);
  return {
    ok: true,
    removedCount: result.removed ?? 0,
    removedIds: result.removedIds ?? [],
    contract: normalizedContract,
    coop: normalizedCoop,
  };
}

export function updatePushFlag({ contract, coop, push }) {
  const normalizedContract = contract?.trim();
  const normalizedCoop = coop?.trim();
  if (!normalizedContract || !normalizedCoop || typeof push !== 'boolean') {
    return { ok: false, reason: 'invalid-input' };
  }

  const result = setPush(normalizedContract, normalizedCoop, push);
  if (result.already) {
    return { ok: true, already: true };
  }

  if (!result.updated) {
    return { ok: false, reason: result.reason ?? 'unknown-error' };
  }

  return { ok: true, already: false };
}

export function removeCoop({ contract, coop }) {
  const normalizedContract = contract?.trim();
  const normalizedCoop = coop?.trim();
  if (!normalizedContract || !normalizedCoop) {
    return { ok: false, reason: 'invalid-input' };
  }

  const result = removeCoopRecord(normalizedContract, normalizedCoop);
  return {
    ok: !!result.removed,
    reason: result.reason,
  };
}

export async function saveCoopReport({ contract, coop, reportUrl }) {
  const normalizedContract = contract?.trim();
  const normalizedCoop = coop?.trim();

  if (!normalizedContract || !normalizedCoop) {
    return { ok: false, reason: 'invalid-input' };
  }

  if (!isValidHttpUrl(reportUrl)) {
    return { ok: false, reason: 'invalid-url' };
  }

  const ensure = await ensureCoopExists(normalizedContract, normalizedCoop);
  if (!ensure.ok) {
    return ensure;
  }

  const existingReport = getCoopReport(normalizedContract, normalizedCoop);
  if (existingReport) {
    return { ok: false, reason: 'exists' };
  }

  const result = setCoopReport(normalizedContract, normalizedCoop, reportUrl.trim());
  if (!result.updated) {
    return { ok: false, reason: result.reason ?? 'unknown-error' };
  }

  return { ok: true };
}

export function clearCoopReport({ contract, coop }) {
  const normalizedContract = contract?.trim();
  const normalizedCoop = coop?.trim();
  if (!normalizedContract || !normalizedCoop) {
    return { ok: false, reason: 'invalid-input' };
  }

  const existingReport = getCoopReport(normalizedContract, normalizedCoop);
  if (!existingReport) {
    return { ok: false, reason: 'missing-report' };
  }

  const result = setCoopReport(normalizedContract, normalizedCoop, null);
  if (!result.updated) {
    return { ok: false, reason: result.reason ?? 'unknown-error' };
  }

  return { ok: true };
}

export function linkAltAccount({ main, alt }) {
  const mainId = extractDiscordId(main);
  const altId = extractDiscordId(alt);
  if (!mainId || !altId) {
    return { ok: false, reason: 'invalid-input' };
  }

  const result = setAltRelationship(mainId, altId);
  return {
    ok: !!result.updated,
    reason: result.reason,
    details: result.updated ? result : null,
  };
}

export function unlinkAltAccount({ main, alt }) {
  const mainId = extractDiscordId(main);
  const altId = extractDiscordId(alt);
  if (!mainId || !altId) {
    return { ok: false, reason: 'invalid-input' };
  }

  const result = removeAltRelationship(mainId, altId);
  return {
    ok: !!result.updated,
    reason: result.reason,
    details: result.updated ? result : null,
  };
}

export function fetchPushReports(season) {
  if (!season) return [];
  return getPushReportsForSeason(season);
}

export function fetchPastCoops({ pushOnly = false, season = null } = {}) {
  return getPastCoopsByCoop(pushOnly, season);
}

export function fetchPastCoopRuns({ pushOnly = false } = {}) {
  return getPastCoops(pushOnly);
}

export function listCoops(contractId) {
  return listCoopsForContract(contractId);
}

export function listAllCoops({ pushOnly = false, season = null } = {}) {
  if (season && pushOnly) {
    return getAllPushCoopsForSeason(season);
  }

  if (season) {
    return getAllCoopsForSeason(season);
  }

  return pushOnly ? getAllPushCoops() : getAllCoops();
}

function normalizeIgnName(value) {
  if (value == null) return '';
  return String(value).trim();
}

const DEPARTED_NAME = '[departed]';

function normalizeCoopIdentifiers(contract, coop) {
  const normalizedContract = contract?.trim();
  const normalizedCoop = coop?.trim();
  if (!normalizedContract || !normalizedCoop) {
    return { ok: false, reason: 'invalid-input' };
  }
  return { ok: true, contract: normalizedContract, coop: normalizedCoop };
}

function extractUniqueIgns(contributors) {
  const uniqueIgns = [];
  const seenIgns = new Set();
  let departedCount = 0;

  for (const contributor of Array.isArray(contributors) ? contributors : []) {
    const ign = normalizeIgnName(contributor?.userName);
    if (!ign) continue;
    if (ign.toLowerCase() === DEPARTED_NAME) {
      departedCount += 1;
      continue;
    }

    const lower = ign.toLowerCase();
    if (seenIgns.has(lower)) continue;
    seenIgns.add(lower);
    uniqueIgns.push({ ign, lower });
  }

  return { uniqueIgns, departedCount };
}

function mapMembersByIgn(rows) {
  const membersByIgn = new Map();
  for (const row of rows) {
    if (!row?.ign) continue;
    const lower = row.ign.trim().toLowerCase();
    if (!membersByIgn.has(lower)) {
      membersByIgn.set(lower, []);
    }
    membersByIgn.get(lower).push(row);
  }
  return membersByIgn;
}

function splitMatches(uniqueIgns, membersByIgn) {
  const matched = [];
  const missing = [];

  for (const entry of uniqueIgns) {
    const candidates = membersByIgn.get(entry.lower);
    if (candidates && candidates.length > 0) {
      const member = candidates[0];
      if (member?.discord_id) {
        matched.push({ ign: entry.ign, discordId: member.discord_id });
        continue;
      }
    }
    missing.push(entry.ign);
  }

  return { matched, missing };
}

function applyLinkStatuses(matched, linkResult) {
  const linkedSet = new Set(linkResult.linkedIds ?? []);
  const alreadySet = new Set(linkResult.alreadyIds ?? []);

  return matched.map(entry => {
    let status = 'unchanged';

    if (linkedSet.has(entry.discordId)) {
      status = 'linked';
    } else if (alreadySet.has(entry.discordId)) {
      status = 'already';
    }

    return {
      ign: entry.ign,
      discordId: entry.discordId,
      status,
    };
  });
}

export async function autoPopulateCoopMembers(contract, coop) {
  const normalized = normalizeCoopIdentifiers(contract, coop);
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason, matched: [], missing: [] };
  }

  let contributors;
  try {
    contributors = await fetchCoopContributors(normalized.contract, normalized.coop);
  } catch (err) {
    console.error('Failed to fetch coop contributors', normalized.contract, normalized.coop, err);
    return { ok: false, reason: 'fetch-failed', matched: [], missing: [] };
  }

  const { uniqueIgns, departedCount } = extractUniqueIgns(contributors);

  if (uniqueIgns.length === 0) {
    return { ok: true, matched: [], missing: [], departedCount };
  }

  const memberRows = getMembersByIgns(uniqueIgns.map(entry => entry.ign));
  const membersByIgn = mapMembersByIgn(memberRows);
  const { matched, missing } = splitMatches(uniqueIgns, membersByIgn);

  const uniqueDiscordIds = [...new Set(matched.map(item => item.discordId).filter(Boolean))];
  let linkResult = { linkedIds: [], alreadyIds: [] };

  if (uniqueDiscordIds.length > 0) {
    linkResult = linkMembersToCoop(normalized.contract, normalized.coop, uniqueDiscordIds);
  }

  const matchedDetailed = applyLinkStatuses(matched, linkResult);

  return { ok: true, matched: matchedDetailed, missing, departedCount };
}

export async function findFreeCoopCodes(contractId, coopCodes = []) {
  if (!contractId) {
    return { filteredResults: [], coopCodes: [] };
  }
  return checkAllFromContractID(contractId, coopCodes);
}

export default {
  addCoopFromInput,
  addCoopIfMissing,
  addPlayersToCoop,
  removePlayersFromCoopService,
  updatePushFlag,
  removeCoop,
  saveCoopReport,
  clearCoopReport,
  linkAltAccount,
  unlinkAltAccount,
  fetchPushReports,
  fetchPastCoops,
  fetchPastCoopRuns,
  listCoops,
  listAllCoops,
  findFreeCoopCodes,
  autoPopulateCoopMembers,
};
