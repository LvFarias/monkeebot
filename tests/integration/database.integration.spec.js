import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let db;
let addCoop;
let getCoopsForContract;
let setPush;
let setCoopReport;
let getCoopReport;
let getAllCoopsForSeason;
let linkMembersToCoop;
let getMembersForCoop;
let removePlayersFromCoop;
let upsertContracts;
let ensureMemberRecord;
let updateMemberIgnByInternalId;
let updateMemberActiveByInternalId;
let getMembersByIgns;
let setAltRelationship;
let getSeasonHelpers;
let getAllSeasons;

let dbPath;

beforeAll(async () => {
  dbPath = path.join(os.tmpdir(), `monkee-int-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  process.env.COOPS_DB_PATH = dbPath;

  await import('../../utils/database/schema.js');
  ({ default: db } = await import('../../utils/database/client.js'));

  ({
    addCoop,
    getCoopsForContract,
    setPush,
    setCoopReport,
    getCoopReport,
    getAllCoopsForSeason,
    linkMembersToCoop,
    getMembersForCoop,
    removePlayersFromCoop,
    getSeasonHelpers,
    getAllSeasons,
  } = await import('../../utils/database/coopsRepository.js'));

  ({ upsertContracts } = await import('../../utils/database/contractsRepository.js'));

  ({
    ensureMemberRecord,
    updateMemberIgnByInternalId,
    updateMemberActiveByInternalId,
    getMembersByIgns,
    setAltRelationship,
  } = await import('../../utils/database/membersRepository.js'));
});

beforeEach(() => {
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

describe('integration/database repositories', () => {
  it('creates and updates coops with reports', () => {
    upsertContracts([
      { id: 'c1', name: 'A', release: 100, season: 'fall_2024', egg: 'egg' },
    ]);

    const added = addCoop('c1', 'coopA', true, 'report1');
    expect(added.added).toBe(true);

    expect(getCoopsForContract('c1')).toEqual(['coopA']);

    const pushResult = setPush('c1', 'coopA', false);
    expect(pushResult.updated).toBe(true);

    const reportResult = setCoopReport('c1', 'coopA', 'https://example.test');
    expect(reportResult.updated).toBe(true);
    expect(getCoopReport('c1', 'coopA')).toBe('https://example.test');

    expect(getAllCoopsForSeason('fall_2024')).toEqual([{ contract: 'c1', coop: 'coopA' }]);
  });

  it('links and removes members from coops', () => {
    upsertContracts([{ id: 'c1', name: 'A', release: 100, season: 'fall_2024', egg: 'egg' }]);
    addCoop('c1', 'coopA', true);

    const linkResult = linkMembersToCoop('c1', 'coopA', ['111', '222']);
    expect(linkResult.linked).toBe(2);

    expect(getMembersForCoop('c1', 'coopA')).toEqual(['111', '222']);

    const removed = removePlayersFromCoop('c1', 'coopA', ['111']);
    expect(removed.removed).toBe(1);
    expect(getMembersForCoop('c1', 'coopA')).toEqual(['222']);
  });

  it('updates member igns and queries by ign', () => {
    const { record } = ensureMemberRecord('111');
    const updatedIgn = updateMemberIgnByInternalId(record.internal_id, 'aoo');
    expect(updatedIgn.changes).toBe(1);

    const updatedActive = updateMemberActiveByInternalId(record.internal_id, true);
    expect(updatedActive.changes).toBe(1);

    expect(getMembersByIgns([' aoo '])).toEqual([
      { internal_id: record.internal_id, discord_id: '111', ign: 'aoo' },
    ]);
  });

  it('aggregates season helpers across main and alt members', () => {
    upsertContracts([{ id: 'c1', name: 'A', release: 100, season: 'fall_2024', egg: 'egg' }]);
    addCoop('c1', 'coopA', true);

    const main = ensureMemberRecord('100');
    const alt = ensureMemberRecord('200');

    updateMemberActiveByInternalId(main.record.internal_id, true);
    updateMemberActiveByInternalId(alt.record.internal_id, true);

    const link = setAltRelationship('100', '200');
    expect(link.updated).toBe(true);

    linkMembersToCoop('c1', 'coopA', ['100', '200']);

    const helpers = getSeasonHelpers({ season: 'fall_2024', pushOnly: true, seasonalOnly: true });
    expect(helpers.length).toBe(1);
    expect(helpers[0].discord_id).toBe('100');
    expect(helpers[0].count).toBe(2);
    expect(helpers[0].breakdown.length).toBe(2);
  });

  it('returns ordered seasons from contracts', () => {
    upsertContracts([
      { id: 'c1', name: 'A', release: 100, season: 'spring_2024', egg: 'egg' },
      { id: 'c2', name: 'B', release: 200, season: 'fall_2023', egg: 'egg' },
      { id: 'c3', name: 'C', release: 300, season: 'summer_2024', egg: 'egg' },
      { id: 'c4', name: 'D', release: 400, season: 'winter_2024', egg: 'egg' },
      { id: 'c5', name: 'E', release: 500, season: 'fall_2024', egg: 'egg' },
    ]);

    expect(getAllSeasons()).toEqual(['fall_2024', 'summer_2024', 'spring_2024', 'winter_2024', 'fall_2023']);
  });
});
