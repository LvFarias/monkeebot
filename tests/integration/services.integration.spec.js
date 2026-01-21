import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const contractsMock = {
  getAllContracts: vi.fn(),
  activeContracts: vi.fn(),
};

const coopcheckerMock = {
  checkAllFromContractID: vi.fn(),
  fetchCoopContributors: vi.fn(),
};

const axiosMock = {
  get: vi.fn(),
};

vi.mock('../../utils/contracts.js', () => contractsMock);
vi.mock('../../utils/coopchecker.js', () => coopcheckerMock);
vi.mock('axios', () => ({ default: axiosMock }));

let db;
let dbPath;
let upsertContracts;
let memberService;
let coopService;
let leaderboardService;
let contractService;
let seasonService;
let mamabirdService;
let dbIndex;

beforeAll(async () => {
  dbPath = path.join(os.tmpdir(), `monkee-int-svc-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  process.env.COOPS_DB_PATH = dbPath;
  process.env.EID = 'test-eid';

  contractsMock.getAllContracts.mockResolvedValue([
    { id: 'c1', name: 'A', release: 100, season: 'fall_2024', egg: 'egg' },
  ]);
  contractsMock.activeContracts.mockResolvedValue([]);

  await import('../../utils/database/schema.js');
  ({ default: db } = await import('../../utils/database/client.js'));

  ({ upsertContracts } = await import('../../utils/database/contractsRepository.js'));
  dbIndex = await import('../../utils/database/index.js');
  memberService = await import('../../services/memberService.js');
  coopService = await import('../../services/coopService.js');
  leaderboardService = await import('../../services/leaderboardService.js');
  contractService = await import('../../services/contractService.js');
  seasonService = await import('../../services/seasonService.js');
  mamabirdService = await import('../../services/mamabirdService.js');
});

beforeEach(() => {
  coopcheckerMock.checkAllFromContractID.mockReset();
  coopcheckerMock.fetchCoopContributors.mockReset();
  axiosMock.get.mockReset();

  db.exec('DELETE FROM member_coops;');
  db.exec('DELETE FROM coops;');
  db.exec('DELETE FROM members;');
  db.exec('DELETE FROM contracts;');
  db.exec('DELETE FROM meta;');
});

afterAll(() => {
  if (db?.close) {
    db.close();
  }
  if (dbPath && fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true });
  }
});

describe('integration/services', () => {
  it('sets igns and detects conflicts', () => {
    const first = memberService.setIgnForMember({ targetDiscordId: '111', ign: 'aoo' });
    expect(first.ok).toBe(true);
    expect(first.status).toBe('created');

    const conflict = memberService.setIgnForMember({ targetDiscordId: '222', ign: 'aoo' });
    expect(conflict.ok).toBe(false);
    expect(conflict.reason).toBe('conflict');
    expect(conflict.conflictDiscordIds).toEqual(['111']);
  });

  it('updates active status for members', () => {
    const result = memberService.setMembersActiveStatus({
      targetDiscordIds: ['111', '222', '111', ''],
      active: true,
    });

    expect(result.ok).toBe(true);
    expect(result.updated.sort()).toEqual(['111', '222']);
    expect(result.created.sort()).toEqual(['111', '222']);
  });

  it('handles member sync edge cases', () => {
    memberService.setIgnForMember({ targetDiscordId: '111', ign: 'boo' });
    memberService.setIgnForMember({ targetDiscordId: '222', ign: 'coo' });

    const summary = memberService.syncMembersFromApiEntries([
      { ID: null, IGN: 'joo' },
      { ID: '333', IGN: '' },
      { ID: '444', IGN: 'koo' },
      { ID: '111', IGN: 'boo' },
      { ID: '111', IGN: 'doo' },
      { ID: '222', IGN: 'doo' },
    ]);

    expect(summary.invalid.length).toBe(2);
    expect(summary.skipped.length).toBe(1);
    expect(summary.updated).toBe(1);
    expect(summary.unchanged).toBe(1);
    expect(summary.conflicts.length).toBe(1);
  });

  it('handles member service validation and failures', () => {
    expect(memberService.setIgnForMember({ targetDiscordId: '', ign: 'aoo' }).reason).toBe('invalid-id');
    expect(memberService.setIgnForMember({ targetDiscordId: '111', ign: ' ' }).reason).toBe('invalid-ign');

    const noTargets = memberService.setMembersActiveStatus({ targetDiscordIds: [], active: true });
    expect(noTargets.reason).toBe('no-targets');

    const invalidActive = memberService.setMembersActiveStatus({ targetDiscordIds: ['111'], active: null });
    expect(invalidActive.reason).toBe('invalid-active');

    memberService.setIgnForMember({ targetDiscordId: '555', ign: 'loo' });
    const getMemberSpy = vi.spyOn(dbIndex, 'getMemberRecord');
    getMemberSpy.mockImplementation((discordId) => {
      const normalizedId = typeof discordId === 'object' && discordId !== null
        ? (discordId.discordId ?? discordId.discord_id ?? discordId.id ?? discordId.ID ?? '')
        : discordId;
      if (String(normalizedId).trim() === '555') {
        return { internal_id: 1, discord_id: '555', ign: 'loo', is_active: 0 };
      }
      return null;
    });

    const unknown = memberService.setIgnForMember({ targetDiscordId: '555', ign: 'koo' });
    expect(unknown.reason).toBe('unknown-error');
    getMemberSpy.mockRestore();

    const activeSpy = vi.spyOn(dbIndex, 'getMemberRecord');
    activeSpy.mockImplementation((discordId) => {
      const normalizedId = typeof discordId === 'object' && discordId !== null
        ? (discordId.discordId ?? discordId.discord_id ?? discordId.id ?? discordId.ID ?? '')
        : discordId;
      if (String(normalizedId).trim() === '777') {
        return { internal_id: 2, discord_id: '777', ign: null, is_active: 0 };
      }
      return null;
    });

    const failUpdate = memberService.setMembersActiveStatus({ targetDiscordIds: ['777'], active: true });
    expect(failUpdate.failures.length).toBe(1);
    activeSpy.mockRestore();
  });

  it('creates coops and saves reports', async () => {
    upsertContracts([
      { id: 'c1', name: 'A', release: 100, season: 'fall_2024', egg: 'egg' },
    ]);

    const added = await coopService.addCoopFromInput({
      rawInput: 'https://example.test/c1/coopA',
      push: true,
    });
    expect(added.ok).toBe(true);

    const report = await coopService.saveCoopReport({
      contract: 'c1',
      coop: 'coopA',
      reportUrl: 'https://report.test/r/1',
    });
    expect(report.ok).toBe(true);

    const list = coopService.listAllCoops({ season: 'fall_2024' });
    expect(list).toEqual([{ contract: 'c1', coop: 'coopA' }]);
  });

  it('handles coop service errors and report flow', async () => {
    const invalid = await coopService.addCoopFromInput({ rawInput: '' });
    expect(invalid.reason).toBe('missing-input');

    const unknown = await coopService.addCoopFromInput({ rawInput: 'unknown/coopA' });
    expect(unknown.reason).toBe('unknown-contract');

    upsertContracts([{ id: 'c1', name: 'A', release: 100, season: 'fall_2024', egg: 'egg' }]);
    await coopService.addCoopIfMissing('c1', 'coopC', true);

    const badUrl = await coopService.saveCoopReport({ contract: 'c1', coop: 'coopC', reportUrl: 'notaurl' });
    expect(badUrl.reason).toBe('invalid-url');

    const saved = await coopService.saveCoopReport({ contract: 'c1', coop: 'coopC', reportUrl: 'https://ok.test' });
    expect(saved.ok).toBe(true);

    const exists = await coopService.saveCoopReport({ contract: 'c1', coop: 'coopC', reportUrl: 'https://ok.test' });
    expect(exists.reason).toBe('exists');

    const clearMissing = coopService.clearCoopReport({ contract: 'c1', coop: 'missing' });
    expect(clearMissing.reason).toBe('missing-report');

    const cleared = coopService.clearCoopReport({ contract: 'c1', coop: 'coopC' });
    expect(cleared.ok).toBe(true);
  });

  it('lists coops and past runs with filters', async () => {
    contractsMock.getAllContracts.mockResolvedValueOnce([
      { id: 'c1', name: 'A', release: 100, season: 'fall_2024', egg: 'egg' },
      { id: 'c2', name: 'B', release: 200, season: 'fall_2024', egg: 'egg' },
    ]);
    await contractService.refreshContracts();

    upsertContracts([
      { id: 'c1', name: 'A', release: 100, season: 'fall_2024', egg: 'egg' },
      { id: 'c2', name: 'B', release: 200, season: 'fall_2024', egg: 'egg' },
    ]);

    dbIndex.addCoop('c1', 'coop1', true);
    dbIndex.addCoop('c1', 'coop2', false);
    dbIndex.addCoop('c2', 'coop1', true);

    const allSeason = coopService.listAllCoops({ season: 'fall_2024' });
    const pushSeason = coopService.listAllCoops({ season: 'fall_2024', pushOnly: true });

    expect(allSeason.length).toBe(3);
    expect(pushSeason.length).toBe(2);

    const pastAll = coopService.fetchPastCoops({ pushOnly: false, season: 'fall_2024' });
    const pastPush = coopService.fetchPastCoops({ pushOnly: true, season: 'fall_2024' });

    expect(pastAll.length).toBe(2);
    expect(pastPush.length).toBe(1);
  });

  it('auto-populates coop members from contributors', async () => {
    upsertContracts([
      { id: 'c1', name: 'A', release: 100, season: 'fall_2024', egg: 'egg' },
    ]);

    await coopService.addCoopIfMissing('c1', 'coopB', true);

    memberService.setIgnForMember({ targetDiscordId: '111', ign: 'boo' });
    memberService.setIgnForMember({ targetDiscordId: '222', ign: 'coo' });

    coopcheckerMock.fetchCoopContributors.mockResolvedValue([
      { userName: 'boo' },
      { userName: 'coo' },
      { userName: '[departed]' },
      { userName: 'boo' },
    ]);

    const result = await coopService.autoPopulateCoopMembers('c1', 'coopB');
    expect(result.ok).toBe(true);
    expect(result.matched.length).toBe(2);
    expect(result.missing.length).toBe(0);
    expect(result.departedCount).toBe(1);
  });

  it('handles auto-populate fetch failures', async () => {
    coopcheckerMock.fetchCoopContributors.mockRejectedValue(new Error('boom'));
    const result = await coopService.autoPopulateCoopMembers('c1', 'coopX');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('fetch-failed');
  });

  it('builds leaderboard report with member matches', async () => {
    memberService.setIgnForMember({ targetDiscordId: '333', ign: 'doo' });
    memberService.setIgnForMember({ targetDiscordId: '444', ign: 'eoo' });
    memberService.setMembersActiveStatus({ targetDiscordIds: ['333', '444'], active: true });

    axiosMock.get.mockResolvedValue({
      data: {
        topEntriesList: [
          { alias: 'doo', rank: 1, score: 100 },
          { alias: 'hoo', rank: 2, score: 200 },
        ],
      },
    });

    const report = await leaderboardService.buildLeaderboardReport({ scope: 'season' });
    expect(report.matches.length).toBe(1);
    expect(report.unmatchedMembers.length).toBe(1);
    expect(report.missingEntries.length).toBe(1);
    expect(report.matches[0].discordId).toBe('333');
  });

  it('handles leaderboard errors and empty payloads', async () => {
    await expect(leaderboardService.buildLeaderboardReport({ scope: '' })).rejects.toThrow('Scope is required');

    axiosMock.get.mockRejectedValue(new Error('nope'));
    await expect(leaderboardService.fetchLeaderboardEntries({ scope: 'season' })).rejects.toThrow('Failed to fetch leaderboard');

    axiosMock.get.mockResolvedValue({ data: {} });
    const report = await leaderboardService.buildLeaderboardReport({ scope: 'season' });
    expect(report.matches.length).toBe(0);
    expect(report.missingEntries.length).toBe(0);
  });

  it('exposes contract and season services', async () => {
    contractsMock.getAllContracts.mockResolvedValue([
      { id: 'c3', name: 'C', release: 300, season: 'summer_2024', egg: 'egg' },
    ]);

    const refreshed = await contractService.refreshContracts();
    expect(refreshed.length).toBe(1);

    const ids = await contractService.listContractIds();
    expect(ids).toEqual(['c3']);

    contractsMock.activeContracts.mockResolvedValueOnce([{ id: 'c3' }]);
    const active = await contractService.fetchActiveContracts();
    expect(active.length).toBe(1);

    contractsMock.getAllContracts.mockResolvedValueOnce([
      { id: 'c1', name: 'A', release: 100, season: 'fall_2024', egg: 'egg' },
    ]);
    await contractService.refreshContracts();

    upsertContracts([
      { id: 'c1', name: 'A', release: 100, season: 'fall_2024', egg: 'egg' },
    ]);
    dbIndex.addCoop('c1', 'coopS', true);

    db.exec("UPDATE coops SET push = 1 WHERE contract = 'c1' AND coop = 'coopS'");

    const { record } = dbIndex.ensureMemberRecord('12345678901234567');
    db.exec("UPDATE members SET is_active = 1 WHERE internal_id = " + record.internal_id);
    const linkResult = dbIndex.linkMembersToCoop('c1', 'coopS', ['12345678901234567']);
    expect(linkResult.linked).toBe(1);

    const helpers = await seasonService.fetchSeasonHelpers({ season: 'fall_2024', pushOnly: true, seasonalOnly: true });
    expect(helpers.length).toBe(1);

    const seasons = seasonService.listSeasons();
    expect(seasons).toEqual(['fall_2024']);
  });

  it('handles mamabird permissions', () => {
    const invalid = mamabirdService.grantMamaBird('');
    expect(invalid.reason).toBe('invalid-id');

    const granted = mamabirdService.grantMamaBird('999');
    expect(granted.ok).toBe(true);
    expect(mamabirdService.checkMamaBird('999')).toBe(true);

    const revoked = mamabirdService.revokeMamaBird('999');
    expect(revoked.ok).toBe(true);
    expect(mamabirdService.checkMamaBird('999')).toBe(false);
  });
});
