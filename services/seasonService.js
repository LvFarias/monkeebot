import { getSeasonHelpers, getAllSeasons } from '../utils/database/index.js';

export async function fetchSeasonHelpers({ season, pushOnly = true, seasonalOnly = true }) {
  return getSeasonHelpers({ season, pushOnly, seasonalOnly });
}

export function listSeasons() {
  return getAllSeasons();
}

export default {
  fetchSeasonHelpers,
  listSeasons,
};
