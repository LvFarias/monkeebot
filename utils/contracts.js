import { DateTime } from 'luxon';
import { getStoredContracts } from './database/index.js';

const SEASON_ORDER = ['winter', 'spring', 'summer', 'fall'];
const THREE_WEEKS = { weeks: 3 };
const ONE_WEEK = { weeks: 1 };

const SEASON_REGEX = /^(winter|spring|summer|fall)[ _-]?(\d{4})$/;

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
  return getStoredContracts();
}

export async function refreshContractsCache() {
  return getStoredContracts();
}
