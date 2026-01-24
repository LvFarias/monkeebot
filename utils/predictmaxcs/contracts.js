export function findContractMatch(contracts, query) {
  if (!Array.isArray(contracts) || !query) return null;
  const trimmed = String(query).trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();

  const exactId = contracts.find(contract => String(contract.id).toLowerCase() === normalized);
  if (exactId) return exactId;

  const exactName = contracts.find(contract => String(contract.name || '').toLowerCase() === normalized);
  if (exactName) return exactName;

  return contracts.find(contract =>
    String(contract.id || '').toLowerCase().includes(normalized)
    || String(contract.name || '').toLowerCase().includes(normalized)
  ) ?? null;
}
