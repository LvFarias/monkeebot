import axios from 'axios';
import protobuf from 'protobufjs';
import { DateTime } from 'luxon';
import { getStoredContracts, getMeta, setMeta, upsertContracts } from './database/index.js';

const CONTRACT_ARCHIVE_URL = 'https://raw.githubusercontent.com/carpetsage/egg/main/periodicals/data/contracts.json';
const META_LAST_FETCH_KEY = 'lastContractFetch';
const REFRESH_ZONE = 'America/Los_Angeles';
const REFRESH_HOUR = 9;
const REFRESH_MINUTE = 3;
const REFRESH_WEEKDAYS = new Set([1, 3, 5]); // Monday, Wednesday, Friday

let cachedProtoRoot = null;

const SEASON_ORDER = ['winter', 'spring', 'summer', 'fall'];
const THREE_WEEKS = { weeks: 3 };
const ONE_WEEK = { weeks: 1 };

const SEASON_REGEX = /^(winter|spring|summer|fall)[ _-]?(\d{4})$/;

async function loadContractProto() {
  if (cachedProtoRoot) return cachedProtoRoot;
  cachedProtoRoot = await protobuf.load('./ei.proto');
  return cachedProtoRoot;
}

function mapRemoteContract(obj, ContractType, eggEnum) {
  const decoded = ContractType.decode(Buffer.from(obj.proto, 'base64'));
  const name = decoded.name || 'Unknown';
  const release = decoded.startTime || 0;
  const season = decoded.seasonId || '';
  const size = decoded.maxCoopSize || 0;
  let egg = eggEnum.valuesById[decoded.egg] || 'UNKNOWN';

  if (decoded.egg === 200) {
    egg = decoded.customEggId.toUpperCase().replaceAll('-', '_') || 'UNKNOWN';
  }

  return { id: obj.id, name, release, season, egg, size };
}

async function fetchAndCacheContracts() {
  const response = await axios.get(CONTRACT_ARCHIVE_URL);
  if (!Array.isArray(response.data)) return [];

  const root = await loadContractProto();
  const ContractType = root.lookupType('Contract');
  const eggEnum = root.lookupEnum('Egg');

  const rows = response.data.map(obj => mapRemoteContract(obj, ContractType, eggEnum));
  upsertContracts(rows);
  return rows;
}

function mostRecentTrigger(now) {
  for (let i = 0; i < 7; i += 1) {
    const candidate = now.minus({ days: i }).set({
      hour: REFRESH_HOUR,
      minute: REFRESH_MINUTE,
      second: 0,
      millisecond: 0,
    });

    if (candidate <= now && REFRESH_WEEKDAYS.has(candidate.weekday)) {
      return candidate;
    }
  }

  return null;
}

function shouldRefreshContracts(now, lastFetch) {
  const lastTrigger = mostRecentTrigger(now);
  if (!lastTrigger) {
    return !lastFetch;
  }

  if (!lastFetch) {
    return now >= lastTrigger;
  }

  return lastFetch < lastTrigger;
}

function normalizeSeason(value) {
  if (!value || typeof value !== 'string') return null;
  const match = SEASON_REGEX.exec(value.trim().toLowerCase());
  if (!match) return null;
  const [, name, year] = match;
  return `${name}_${year}`;
}

function parseReleaseDate(value) {
  const seconds = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(seconds)) return null;
  const dateTime = DateTime.fromSeconds(seconds, { zone: 'utc' });
  return dateTime.isValid ? dateTime : null;
}

function seasonRank(normalizedSeason) {
  if (!normalizedSeason) return null;
  const [name, yearStr] = normalizedSeason.split('_');
  const year = Number(yearStr);
  const index = SEASON_ORDER.indexOf(name);
  if (!Number.isFinite(year) || index === -1) return null;
  return { year, index };
}

function previousSeason(seasonKey) {
  const normalized = normalizeSeason(seasonKey);
  if (!normalized) return null;

  const [name, yearStr] = normalized.split('_');
  const year = Number(yearStr);
  const index = SEASON_ORDER.indexOf(name);
  if (!Number.isFinite(year) || index === -1) return null;

  if (index === 0) {
    return `fall_${year - 1}`;
  }

  const prevName = SEASON_ORDER[index - 1];
  return `${prevName}_${year}`;
}

function findLatestSeason(contracts) {
  let latestSeason = null;
  let latestScore = null;

  for (const contract of contracts) {
    const score = seasonRank(contract.normalizedSeason);
    if (!score) continue;

    if (!latestScore) {
      latestScore = score;
      latestSeason = contract.normalizedSeason;
      continue;
    }

    const isNewerYear = score.year > latestScore.year;
    const isSameYearLaterSeason = score.year === latestScore.year && score.index > latestScore.index;
    if (isNewerYear || isSameYearLaterSeason) {
      latestScore = score;
      latestSeason = contract.normalizedSeason;
    }
  }

  return latestSeason;
}

function getSeasonalSeasons(latestSeason) {
  if (!latestSeason) return new Set();
  const seasons = new Set();
  seasons.add(latestSeason);

  const prev = previousSeason(latestSeason);
  if (prev) {
    seasons.add(prev);
  }

  return seasons;
}

function prepareRecentContracts(now) {
  const cutoff = now.minus(THREE_WEEKS);

  return getStoredContracts()
    .map(contract => {
      const releaseDate = parseReleaseDate(contract.release);
      return {
        ...contract,
        releaseDate,
        normalizedSeason: normalizeSeason(contract.season),
      };
    })
    .filter(contract => contract.releaseDate && contract.releaseDate >= cutoff);
}

export async function activeContracts() {
  await getAllContracts();
  const now = DateTime.now().setZone('utc');
  const oneWeekAgo = now.minus(ONE_WEEK);

  const recentContracts = prepareRecentContracts(now);
  const latestSeason = findLatestSeason(recentContracts);
  const seasonalSeasons = getSeasonalSeasons(latestSeason);

  const seasonal = [];
  const leggacy = [];

  for (const contract of recentContracts) {
    const isSeasonal = contract.normalizedSeason && seasonalSeasons.has(contract.normalizedSeason);
    if (isSeasonal) {
      seasonal.push(contract);
      continue;
    }

    if (contract.releaseDate >= oneWeekAgo) {
      leggacy.push(contract);
    }
  }

  const sortByReleaseDesc = (a, b) => {
    const aMillis = a.releaseDate?.toMillis() ?? 0;
    const bMillis = b.releaseDate?.toMillis() ?? 0;
    return bMillis - aMillis;
  };

  const format = contract => [contract.name || contract.id || 'Unknown', contract.id];

  const sortedSeasonal = [...seasonal].sort(sortByReleaseDesc);
  const sortedLegacy = [...leggacy].sort(sortByReleaseDesc);

  return {
    seasonal: sortedSeasonal.map(format),
    leggacy: sortedLegacy.map(format),
  };
}

export async function getAllContracts({ forceRefresh = false } = {}) {
  const now = DateTime.now().setZone(REFRESH_ZONE);
  const lastFetchISO = getMeta(META_LAST_FETCH_KEY);
  const lastFetchValue = lastFetchISO ? DateTime.fromISO(lastFetchISO).setZone(REFRESH_ZONE) : null;
  const lastFetch = lastFetchValue && lastFetchValue.isValid ? lastFetchValue : null;

  if (!forceRefresh && !shouldRefreshContracts(now, lastFetch)) {
    return getStoredContracts();
  }

  try {
    const rows = await fetchAndCacheContracts();
    setMeta(META_LAST_FETCH_KEY, now.toISO());
    return rows.length > 0 ? rows : getStoredContracts();
  } catch (err) {
    console.error('Error fetching contracts archive:', err.message);
    return getStoredContracts();
  }
}

export async function refreshContractsCache() {
  const now = DateTime.now().setZone(REFRESH_ZONE);
  try {
    const rows = await fetchAndCacheContracts();
    setMeta(META_LAST_FETCH_KEY, now.toISO());
    return rows;
  } catch (err) {
    console.error('Failed to refresh contracts cache:', err.message);
    throw err;
  }
}
