import axios from 'axios';
import { listMembersWithIgn } from '../utils/database/index.js';

const LEADERBOARD_ENDPOINT = 'https://ei_worker.tylertms.workers.dev/leaderboard';
const DEFAULT_EID = process.env.EID;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_UNMATCHED_SUMMARY = 10;

function normalizeAlias(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function sanitizeEntries(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const entries = Array.isArray(payload.topEntriesList) ? payload.topEntriesList : [];

  return entries
    .map(entry => {
      const alias = typeof entry?.alias === 'string' ? entry.alias.trim() : '';
      const rank = Number.parseInt(entry?.rank, 10);
      const score = Number.parseInt(entry?.score, 10);
      if (!alias || Number.isNaN(rank)) {
        return null;
      }
      return {
        alias,
        rank,
        score: Number.isNaN(score) ? 0 : score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank);
}

export async function fetchLeaderboardEntries({ scope }) {
  const trimmedScope = typeof scope === 'string' ? scope.trim() : '';
  if (!trimmedScope) {
    throw new Error('Scope is required');
  }

  const url = new URL(LEADERBOARD_ENDPOINT);
  url.searchParams.set('EID', DEFAULT_EID);
  url.searchParams.set('scope', trimmedScope);
  url.searchParams.set('grade', 5);

  try {
    const response = await axios.get(url.toString(), { timeout: REQUEST_TIMEOUT_MS });
    return sanitizeEntries(response.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch leaderboard: ${message}`);
  }
}

export async function buildLeaderboardReport({ scope }) {
  const trimmedScope = typeof scope === 'string' ? scope.trim() : '';
  if (!trimmedScope) {
    throw new Error('Scope is required');
  }

  const [entries, members] = await Promise.all([
    fetchLeaderboardEntries({ scope: trimmedScope, grade: 5 }),
    Promise.resolve(listMembersWithIgn()),
  ]);

  const aliasLookup = new Map();
  const matchedAliases = new Set();

  for (const entry of entries) {
    aliasLookup.set(normalizeAlias(entry.alias), entry);
  }

  const matches = [];
  const unmatchedMembers = [];

  for (const member of members) {
    const normalizedIgn = normalizeAlias(member.ign);
    if (!normalizedIgn) continue;
    const entry = aliasLookup.get(normalizedIgn);
    if (entry) {
      matches.push({
        rank: entry.rank,
        score: entry.score,
        alias: entry.alias,
        discordId: member.discord_id,
        ign: member.ign,
      });
      matchedAliases.add(normalizedIgn);
    } else {
      unmatchedMembers.push({
        discordId: member.discord_id,
        ign: member.ign,
      });
    }
  }

  matches.sort((a, b) => a.rank - b.rank);

  const missingEntries = entries
    .filter(entry => !matchedAliases.has(normalizeAlias(entry.alias)))
    .slice(0, MAX_UNMATCHED_SUMMARY)
    .map(entry => ({
      rank: entry.rank,
      alias: entry.alias,
      score: entry.score,
    }));

  return {
    scope: trimmedScope,
    leaderboardSize: entries.length,
    totalMembers: members.length,
    matches,
    unmatchedMembers,
    missingEntries,
  };
}

export default {
  fetchLeaderboardEntries,
  buildLeaderboardReport,
};
