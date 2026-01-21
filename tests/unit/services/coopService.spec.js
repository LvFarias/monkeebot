import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/database/index.js', () => ({
  addCoop: vi.fn(),
  removecoop: vi.fn(),
  getAllCoops: vi.fn(),
  getAllPushCoops: vi.fn(),
  getAllCoopsForSeason: vi.fn(),
  getAllPushCoopsForSeason: vi.fn(),
  linkMembersToCoop: vi.fn(),
  removePlayersFromCoop: vi.fn(),
  setPush: vi.fn(),
  setCoopReport: vi.fn(),
  getCoopReport: vi.fn(),
  setAltRelationship: vi.fn(),
  removeAltRelationship: vi.fn(),
  getPushReportsForSeason: vi.fn(),
  getPastCoops: vi.fn(),
  getPastCoopsByCoop: vi.fn(),
  getMembersByIgns: vi.fn(),
}));

vi.mock('../../../services/discord.js', () => ({
  extractDiscordIds: vi.fn(),
  extractDiscordId: vi.fn(),
  isValidHttpUrl: vi.fn(),
}));

vi.mock('../../../services/contractService.js', () => ({
  isKnownContract: vi.fn(),
  refreshContracts: vi.fn(),
  listCoops: vi.fn(),
}));

vi.mock('../../../utils/coopchecker.js', () => ({
  checkAllFromContractID: vi.fn(),
  fetchCoopContributors: vi.fn(),
}));

import {
  addCoopFromInput,
  addCoopIfMissing,
  addPlayersToCoop,
  updatePushFlag,
  saveCoopReport,
  clearCoopReport,
  autoPopulateCoopMembers,
  findFreeCoopCodes,
} from '../../../services/coopService.js';
import {
  addCoop as addCoopRecord,
  setPush,
  getCoopReport,
  setCoopReport,
  linkMembersToCoop,
  getMembersByIgns,
} from '../../../utils/database/index.js';
import { extractDiscordIds, isValidHttpUrl } from '../../../services/discord.js';
import { isKnownContract, refreshContracts, listCoops } from '../../../services/contractService.js';
import { fetchCoopContributors, checkAllFromContractID } from '../../../utils/coopchecker.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('services/coopService addCoopFromInput', () => {
  it('rejects invalid paths', async () => {
    const result = await addCoopFromInput({ rawInput: 'a/b/c' });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown contracts', async () => {
    isKnownContract.mockResolvedValue(false);
    refreshContracts.mockResolvedValue([]);

    const result = await addCoopFromInput({ rawInput: 'c1/coop1' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown-contract');
  });

  it('adds coops when valid', async () => {
    isKnownContract.mockResolvedValue(true);
    addCoopRecord.mockReturnValue({ added: true });

    const result = await addCoopFromInput({ rawInput: 'c1/coop1' });

    expect(result.ok).toBe(true);
    expect(result.contract).toBe('c1');
  });
});

describe('services/coopService addCoopIfMissing', () => {
  it('sets push when created', async () => {
    isKnownContract.mockResolvedValue(true);
    listCoops.mockReturnValue([]);
    addCoopRecord.mockReturnValue({ added: true });

    const result = await addCoopIfMissing('c1', 'coop1', true);

    expect(result.ok).toBe(true);
    expect(setPush).toHaveBeenCalled();
  });
});

describe('services/coopService addPlayersToCoop', () => {
  it('validates input', async () => {
    const result = await addPlayersToCoop({ contract: '', coop: 'c', userInput: 'x' });
    expect(result.ok).toBe(false);
  });

  it('rejects when no users are provided', async () => {
    extractDiscordIds.mockReturnValue([]);
    const result = await addPlayersToCoop({ contract: 'c', coop: 'x', userInput: 'bad' });
    expect(result.reason).toBe('no-users');
  });

  it('fails when coop does not exist', async () => {
    extractDiscordIds.mockReturnValue(['1']);
    isKnownContract.mockResolvedValue(true);
    listCoops.mockReturnValue([]);

    const result = await addPlayersToCoop({ contract: 'c', coop: 'x', userInput: '<@1>' });
    expect(result.reason).toBe('coop-not-found');
  });

  it('links users when coop exists', async () => {
    extractDiscordIds.mockReturnValue(['1', '2']);
    isKnownContract.mockResolvedValue(true);
    listCoops.mockReturnValue(['x']);
    linkMembersToCoop.mockReturnValue({ linkedIds: ['1'], alreadyIds: ['2'] });

    const result = await addPlayersToCoop({ contract: 'c', coop: 'x', userInput: '<@1> <@2>' });
    expect(result.ok).toBe(true);
    expect(result.newlyLinked).toEqual(['1']);
  });
});

describe('services/coopService updatePushFlag', () => {
  it('rejects invalid inputs', () => {
    expect(updatePushFlag({ contract: 'c', coop: 'x', push: 'no' }).ok).toBe(false);
  });

  it('handles already-set push', () => {
    setPush.mockReturnValue({ already: true });
    const result = updatePushFlag({ contract: 'c', coop: 'x', push: true });
    expect(result.already).toBe(true);
  });
});

describe('services/coopService saveCoopReport and clearCoopReport', () => {
  it('validates report urls', async () => {
    isValidHttpUrl.mockReturnValue(false);
    const result = await saveCoopReport({ contract: 'c', coop: 'x', reportUrl: 'bad' });
    expect(result.reason).toBe('invalid-url');
  });

  it('rejects existing reports', async () => {
    isValidHttpUrl.mockReturnValue(true);
    isKnownContract.mockResolvedValue(true);
    listCoops.mockReturnValue(['x']);
    getCoopReport.mockReturnValue('http://x');

    const result = await saveCoopReport({ contract: 'c', coop: 'x', reportUrl: 'http://x' });
    expect(result.reason).toBe('exists');
  });

  it('clears missing reports with error', () => {
    getCoopReport.mockReturnValue(null);
    const result = clearCoopReport({ contract: 'c', coop: 'x' });
    expect(result.reason).toBe('missing-report');
  });

  it('clears existing reports', () => {
    getCoopReport.mockReturnValue('http://x');
    setCoopReport.mockReturnValue({ updated: true });
    const result = clearCoopReport({ contract: 'c', coop: 'x' });
    expect(result.ok).toBe(true);
  });
});

describe('services/coopService autoPopulateCoopMembers', () => {
  it('rejects invalid inputs', async () => {
    const result = await autoPopulateCoopMembers('', '');
    expect(result.ok).toBe(false);
  });

  it('handles fetch failures', async () => {
    fetchCoopContributors.mockRejectedValue(new Error('boom'));
    const result = await autoPopulateCoopMembers('c', 'x');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('fetch-failed');
  });

  it('matches igns and links members', async () => {
    fetchCoopContributors.mockResolvedValue([
      { userName: 'aoo' },
      { userName: '[departed]' },
      { userName: 'foo' },
    ]);
    getMembersByIgns.mockReturnValue([{ ign: 'aoo', discord_id: '111' }]);
    linkMembersToCoop.mockReturnValue({ linkedIds: ['111'], alreadyIds: [] });

    const result = await autoPopulateCoopMembers('c', 'x');
    expect(result.ok).toBe(true);
    expect(result.matched[0].status).toBe('linked');
    expect(result.missing).toEqual(['foo']);
    expect(result.departedCount).toBe(1);
  });
});

describe('services/coopService findFreeCoopCodes', () => {
  it('returns empty results without contract', async () => {
    await expect(findFreeCoopCodes()).resolves.toEqual({ filteredResults: [], coopCodes: [] });
  });

  it('delegates to coopchecker', async () => {
    checkAllFromContractID.mockResolvedValue({ filteredResults: ['aa'], coopCodes: ['aa'] });
    const result = await findFreeCoopCodes('c1', ['aa']);
    expect(result.filteredResults).toEqual(['aa']);
  });
});
