import { getAllContracts, activeContracts } from '../utils/contracts.js';
import { getCoopsForContract } from '../utils/database/index.js';

let cachedContracts = null;
let cachedContractIds = null;

async function ensureContractCache({ forceRefresh = false } = {}) {
  const contracts = (await getAllContracts({ forceRefresh })) ?? [];
  cachedContracts = contracts;
  cachedContractIds = new Set(contracts.map(c => c.id).filter(Boolean));
  return cachedContracts;
}

export async function isKnownContract(contractId) {
  if (!contractId) return false;
  await ensureContractCache();
  return cachedContractIds.has(contractId.trim());
}

export async function listContractIds() {
  await ensureContractCache();
  return Array.from(cachedContractIds.values());
}

export async function fetchContractSummaries() {
  return ensureContractCache();
}

export async function refreshContracts() {
  const contracts = await ensureContractCache({ forceRefresh: true });
  return contracts;
}

export function listCoops(contractId) {
  if (!contractId) return [];
  return getCoopsForContract(contractId.trim());
}

export async function fetchActiveContracts() {
  return activeContracts();
}

export default {
  isKnownContract,
  listContractIds,
  fetchContractSummaries,
  refreshContracts,
  listCoops,
  fetchActiveContracts,
};
