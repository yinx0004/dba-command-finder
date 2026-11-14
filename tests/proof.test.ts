import { describe, expect, it } from 'vitest';
import type { Verification } from '../lab/plan';
import { loadDataset } from '../src/lib/data';
import { cmdOnLine, commandRuns, fieldCheck, runTotals } from '../src/lib/proof';
import type { Command } from '../src/lib/schema';

const ds = loadDataset();
const entry = (id: string) => ds.mappings.find((m) => m.id === id)!;
const cmd = (c: Partial<Command>): Command => ({ cmd: 'X', ...c }) as Command;

// A made-up lab run shaped like lab/verification.json: replication-status on three MySQL and two MongoDB versions.
const v: Verification = {
  generatedAt: '2026-11-14T05:30:00.000Z',
  runs: [
    { db: 'mysql', version: '8.4', server: '8.4.11' },
    { db: 'mysql', version: '5.7', server: '5.7.44' },
    { db: 'mysql', version: '8.0', server: '8.0.46' },
    { db: 'mongodb', version: '6.0', server: '6.0.28' },
    { db: 'mongodb', version: '7.0', server: '7.0.48' },
  ],
  entries: {
    'replication-status': {
      mysql: {
        versions: ['5.7', '8.0', '8.4'],
        commands: {
          'SHOW SLAVE STATUS\\G': { verified: ['5.7', '8.0'], skipped: false },
          'SHOW REPLICA STATUS\\G': { verified: ['8.0', '8.4'], skipped: false },
        },
        fields: { lag: { verified: [] } },
      },
      mongodb: {
        versions: ['6.0', '7.0'],
        commands: {
          'rs.status()': { verified: ['6.0', '7.0'], skipped: false },
          'rs.printSecondaryReplicationInfo()': { verified: ['6.0', '7.0'], skipped: false },
          'rs.printSlaveReplicationInfo()': { verified: [], skipped: false },
        },
        fields: { health: { verified: ['6.0', '7.0'] }, source: { verified: ['6.0', '7.0'] } },
      },
    },
  },
};

describe('a command on a version line', () => {
  it('reads the version range', () => {
    const slave = cmd({ deprecated_in: '8.0.22', removed_in: '8.4' });
    expect(cmdOnLine(slave, '5.7')).toEqual({ state: 'ok' });
    expect(cmdOnLine(slave, '8.0')).toEqual({ state: 'deprecated', version: '8.0.22' });
    expect(cmdOnLine(slave, '8.4')).toEqual({ state: 'removed', version: '8.4' });

    const replica = cmd({ since: '8.0.22' });
    expect(cmdOnLine(replica, '5.7')).toEqual({ state: 'not-yet', version: '8.0.22' });
    expect(cmdOnLine(replica, '8.0')).toEqual({ state: 'ok', since: '8.0.22' });
    expect(cmdOnLine(replica, '8.4')).toEqual({ state: 'ok' });
  });

  it('notes a removal partway through a line', () => {
    expect(cmdOnLine(cmd({ removed_in: '8.0.30' }), '8.0')).toEqual({ state: 'ok', removed: '8.0.30' });
    expect(cmdOnLine(cmd({ removed_in: '8.0.30' }), '8.4')).toEqual({ state: 'removed', version: '8.0.30' });
  });
});

describe('command runs', () => {
  const rs = entry('replication-status');
  const mysql = (c: string) => rs.databases.mysql.commands.find((x) => x.cmd === c)!;
  const mongo = (c: string) => rs.databases.mongodb!.commands.find((x) => x.cmd === c)!;

  it('lists every lab run of the database, oldest first', () => {
    expect(commandRuns(v, rs.id, 'mysql', mysql('SHOW SLAVE STATUS\\G'))).toEqual([
      { line: '5.7', server: '5.7.44', outcome: 'ok' },
      { line: '8.0', server: '8.0.46', outcome: 'ok' },
      { line: '8.4', server: '8.4.11', outcome: 'fails-as-expected' },
    ]);
    expect(commandRuns(v, rs.id, 'mysql', mysql('SHOW REPLICA STATUS\\G')).map((r) => r.outcome)).toEqual(['fails-as-expected', 'ok', 'ok']);
    expect(commandRuns(v, rs.id, 'mongodb', mongo('rs.printSlaveReplicationInfo()')).map((r) => r.outcome)).toEqual([
      'fails-as-expected',
      'fails-as-expected',
    ]);
  });

  it('does not claim an expected failure the lab did not confirm', () => {
    const dirty: Verification = structuredClone(v);
    dirty.entries['replication-status'].mysql.versions = ['5.7', '8.0'];
    expect(commandRuns(dirty, rs.id, 'mysql', mysql('SHOW SLAVE STATUS\\G'))[2].outcome).toBe('not-run');
  });

  it('marks commands the lab skips', () => {
    const skipped: Verification = structuredClone(v);
    skipped.entries['replication-status'].mongodb.commands['rs.status()'].skipped = true;
    expect(commandRuns(skipped, rs.id, 'mongodb', mongo('rs.status()')).map((r) => r.outcome)).toEqual(['skipped', 'skipped']);
  });

  it('is empty without lab results', () => {
    expect(commandRuns(null, rs.id, 'mysql', mysql('SHOW SLAVE STATUS\\G'))).toEqual([]);
  });
});

describe('field checks', () => {
  const rs = entry('replication-status');

  it('says why a field was not checked', () => {
    // MySQL's replication fields only appear on a replica, and the entry says so in verify.skip_fields.
    expect(fieldCheck(v, rs, 'mysql', 'lag')).toEqual({ state: 'skipped', reason: rs.databases.mysql.verify!.skip_fields });
    // MongoDB's lag is a calculation, not a field name.
    expect(fieldCheck(v, rs, 'mongodb', 'lag')).toEqual({ state: 'prose' });
  });

  it('lists the versions a field was found on', () => {
    expect(fieldCheck(v, rs, 'mongodb', 'health')).toEqual({ state: 'checked', versions: ['6.0', '7.0'] });
    expect(fieldCheck(v, rs, 'mongodb', 'last_error')).toEqual({ state: 'unchecked' });
    expect(fieldCheck(null, rs, 'mongodb', 'health')).toEqual({ state: 'unchecked' });
  });

  it('knows nothing about fields a database does not map', () => {
    expect(fieldCheck(v, rs, 'mongodb', 'nope')).toBeUndefined();
  });
});

describe('run totals', () => {
  it('has one row per lab run, in database order then by version', () => {
    const rows = runTotals(ds, v);
    expect(rows.map((r) => `${r.name} ${r.line} ${r.server}`)).toEqual([
      'MySQL 5.7 5.7.44',
      'MySQL 8.0 8.0.46',
      'MySQL 8.4 8.4.11',
      'MongoDB 6.0 6.0.28',
      'MongoDB 7.0 7.0.48',
    ]);
    expect(rows[0]).toMatchObject({ commands: 1, fields: 0 });
    expect(rows[1]).toMatchObject({ commands: 2, fields: 0 });
    expect(rows[3]).toMatchObject({ commands: 2, fields: 2 });
  });

  it('is empty without lab results', () => {
    expect(runTotals(ds, null)).toEqual([]);
  });
});
