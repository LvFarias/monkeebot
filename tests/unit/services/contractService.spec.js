import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAllContractsMock = vi.fn();
const activeContractsMock = vi.fn();
const getCoopsForContractMock = vi.fn();

vi.mock('../../../utils/contracts.js', () => ({
  getAllContracts: (...args) => getAllContractsMock(...args),
  activeContracts: (...args) => activeContractsMock(...args),
}));

vi.mock('../../../utils/database/index.js', () => ({
  getCoopsForContract: (...args) => getCoopsForContractMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('services/contractService', () => {
  it('returns false for missing contract ids', async () => {
    const { isKnownContract } = await import('../../../services/contractService.js');
    await expect(isKnownContract('')).resolves.toBe(false);
  });

  it('uses cached contracts for known ids', async () => {
    getAllContractsMock.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

    const { isKnownContract, listContractIds } = await import('../../../services/contractService.js');

    await expect(isKnownContract('c1')).resolves.toBe(true);
    const ids = await listContractIds();
    expect(ids).toEqual(['c1', 'c2']);
  });

  it('refreshes contracts when requested', async () => {
    getAllContractsMock.mockResolvedValue([{ id: 'c1' }]);

    const { refreshContracts } = await import('../../../services/contractService.js');

    await refreshContracts();
    expect(getAllContractsMock).toHaveBeenCalledWith({ forceRefresh: true });
  });

  it('lists coops for a contract', async () => {
    getAllContractsMock.mockResolvedValue([]);
    getCoopsForContractMock.mockReturnValue(['coop1']);

    const { listCoops } = await import('../../../services/contractService.js');

    expect(listCoops('c1')).toEqual(['coop1']);
  });

  it('returns active contracts from utils', async () => {
    activeContractsMock.mockResolvedValue({ seasonal: [], leggacy: [] });

    const { fetchActiveContracts } = await import('../../../services/contractService.js');

    await expect(fetchActiveContracts()).resolves.toEqual({ seasonal: [], leggacy: [] });
  });
});
