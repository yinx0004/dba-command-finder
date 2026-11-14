import { describe, expect, it } from 'vitest';
import type { Verification } from '../lab/plan';
import { loadDataset } from '../src/lib/data';
import { siteDbs } from '../src/lib/docs';
import { translateEntries } from '../src/lib/translate';
import { looksLikeCommand, matchCommand, pickForLine, sideEq } from '../src/lib/translate-match';

const ds = loadDataset();
const v: Verification = {
  generatedAt: '2026-11-14T05:30:00.000Z',
  runs: [
    { db: 'mysql', version: '5.7', server: '5.7.44' },
    { db: 'mysql', version: '8.4', server: '8.4.11' },
  ],
  entries: {
    'replication-status': {
      mysql: {
        versions: ['5.7', '8.4'],
        commands: { 'SHOW SLAVE STATUS\\G': { verified: ['5.7'], skipped: false }, 'SHOW REPLICA STATUS\\G': { verified: ['8.4'], skipped: false } },
        fields: {},
      },
    },
  },
};
const entries = translateEntries(ds, v, 'zh', ['mysql', 'mongodb']);
const dbs = ['mysql', 'mongodb'];

describe('translator data', () => {
  it('carries both sides with version ranges and lab runs', () => {
    const rs = entries['replication-status'];
    expect(rs.slug).toBe('replication/replication-status');
    const slave = rs.sides.mysql.cmds.find((c) => c.cmd === 'SHOW SLAVE STATUS\\G')!;
    expect(slave).toMatchObject({ deprecated_in: '8.0.22', removed_in: '8.4' });
    expect(slave.runs).toEqual([
      ['5.7', '5.7.44', 'ok'],
      ['8.4', '8.4.11', 'fails-as-expected'],
    ]);
    expect(rs.sides.mongodb.support).toBe('partial');
    expect(rs.fields.length).toBeGreaterThan(0);
  });

  it('says why the lab skips a command', () => {
    const skipped = Object.values(entries)
      .flatMap((e) => Object.values(e.sides).flatMap((s) => s.cmds))
      .filter((c) => c.skip);
    expect(skipped.length).toBeGreaterThan(0);
    for (const c of skipped) expect(c.runs).toEqual([]);
  });

  it('has an entry for every task of the pair', () => {
    expect(Object.keys(entries).length).toBe(ds.mappings.filter((m) => m.databases.mysql).length);
  });
});

describe('recognizing a pasted command', () => {
  it('finds the exact command on either side', () => {
    expect(matchCommand('SHOW SLAVE STATUS\\G', entries['replication-status'], dbs)).toMatchObject({ db: 'mysql', cmd: { cmd: 'SHOW SLAVE STATUS\\G' } });
    expect(matchCommand('rs.status()', entries['replication-status'], dbs)).toMatchObject({ db: 'mongodb', cmd: { cmd: 'rs.status()' } });
    expect(matchCommand('show processlist', entries['list-active-sessions'], dbs)).toMatchObject({ db: 'mysql', cmd: { cmd: 'SHOW FULL PROCESSLIST;' } });
  });

  it('matches a filled-in command by its fixed part', () => {
    expect(matchCommand('ALTER TABLE orders ALTER INDEX idx_a INVISIBLE;', entries['invisible-index'], dbs)).toMatchObject({ db: 'mysql' });
  });

  it('does not take a task description for a command', () => {
    expect(matchCommand('锁等待', entries['lock-waits'], dbs)).toBeUndefined();
    expect(matchCommand('sh', entries['lock-waits'], dbs)).toBeUndefined();
  });
});

describe('commands for a version', () => {
  const mysql = entries['replication-status'].sides.mysql;
  const V = ['5.7', '8.0', '8.4'];

  it('keeps what the version can run, current before deprecated', () => {
    const at84 = pickForLine(mysql, '8.4', V);
    expect(at84.usable.map((p) => p.cmd.cmd)).toEqual(['SHOW REPLICA STATUS\\G']);
    expect(at84.unusable.map((p) => [p.cmd.cmd, p.on.state])).toEqual([['SHOW SLAVE STATUS\\G', 'removed']]);
    expect(pickForLine(mysql, '8.0', V).usable.map((p) => p.on.state)).toEqual(['ok', 'deprecated']);
    expect(pickForLine(mysql, '5.7', V).unusable.map((p) => p.on.state)).toEqual(['not-yet']);
  });

  it('without a version, keeps what some lab version runs', () => {
    expect(pickForLine(mysql, '', V).usable).toHaveLength(mysql.cmds.length);
    // rs.printSlaveReplicationInfo() is gone from every MongoDB version the lab runs.
    const mongo = pickForLine(entries['replication-status'].sides.mongodb, '', ['6.0', '7.0', '8.0']);
    expect(mongo.unusable.map((p) => [p.cmd.cmd, p.on.state])).toEqual([['rs.printSlaveReplicationInfo()', 'removed']]);
  });
});

describe('comparing the two sides', () => {
  const side = (support: 'full' | 'partial' | 'none') => ({ support, cmds: [], notes: [], alternatives: [] });
  it('reads from the side being translated to', () => {
    expect(sideEq(side('full'), side('full'))).toBe('exact');
    expect(sideEq(side('full'), side('partial'))).toBe('approx');
    expect(sideEq(side('full'), side('none'))).toBe('none');
    expect(sideEq(side('none'), side('full'))).toBe('only');
    expect(sideEq(side('full'), undefined)).toBe('missing');
  });
});

describe('telling commands from task descriptions', () => {
  it('reads statements and shell calls as commands', () => {
    for (const q of ['SHOW ENGINE PERFORMANCE_SCHEMA STATUS;', 'kill 12345', 'db.currentOp()', 'rs.status()', 'SELECT @@port']) expect(looksLikeCommand(q)).toBe(true);
  });
  it('reads words as a task', () => {
    for (const q of ['锁等待', 'replication lag', '修改最大连接数', 'slave', 'mysql 慢查询', 'lock wait']) expect(looksLikeCommand(q)).toBe(false);
  });
});

describe('the databases the site shows', () => {
  it('puts the pair first, then the others the lab runs, each with its color', () => {
    expect(siteDbs(ds).map((x) => `${x.def.id}:${x.role}`)).toEqual(['mysql:source', 'mongodb:target', 'redis:third']);
  });

  it('gives the translator every database, fields included', () => {
    const all = translateEntries(ds, null, 'zh', siteDbs(ds).map((x) => x.def.id));
    expect(Object.keys(all['list-active-sessions'].sides)).toEqual(['mysql', 'mongodb', 'redis']);
    const id = all['list-active-sessions'].fields.find((f) => f.names.redis === 'id');
    expect(id?.names).toMatchObject({ redis: 'id' });
  });
});
