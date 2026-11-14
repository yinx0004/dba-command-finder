import { describe, expect, it } from 'vitest';
import { coverageRow, strip, stripNote } from '../src/lib/coverage';
import { loadDataset } from '../src/lib/data';

const ds = loadDataset();
const m = (id: string) => ds.mappings.find((x) => x.id === id)!;
const mysql = ds.databases.find((d) => d.id === 'mysql')!;
const mongodb = ds.databases.find((d) => d.id === 'mongodb')!;

describe('version strips', () => {
  it('has one segment per lab version', () => {
    // Invisible indexes arrive in MySQL 8.0.
    expect(strip(m('invisible-index').databases.mysql, mysql.lab_versions)).toEqual(['none', 'full', 'full']);
    // A partial side stays partial where it runs.
    expect(strip(m('replication-status').databases.mongodb, mongodb.lab_versions)).toEqual(['partial', 'partial', 'partial']);
    // A side that cannot do the task is empty everywhere.
    expect(strip(m('account-lock').databases.mongodb, mongodb.lab_versions)).toEqual(['none', 'none', 'none']);
    expect(strip(undefined, mysql.lab_versions)).toEqual(['none', 'none', 'none']);
  });
});

describe('strip notes', () => {
  it('names what changes within the lab versions', () => {
    expect(stripNote(m('replication-status').databases.mysql, mysql.lab_versions, 'zh')).toBe(
      'SHOW SLAVE STATUS：8.0.22 起废弃，8.4 起移除；SHOW REPLICA STATUS：8.0.22 起',
    );
  });

  it('leaves out boundaries older than every lab version', () => {
    // rs.printSecondaryReplicationInfo() arrived in 4.4; the lab starts at 6.0.
    expect(stripNote(m('replication-status').databases.mongodb, mongodb.lab_versions, 'zh')).toBe('');
  });

  it('says why a side cannot do the task', () => {
    expect(stripNote(m('account-lock').databases.mongodb, mongodb.lab_versions, 'zh')).toMatch(/^没有锁定账号的开关/);
  });
});

describe('coverage rows', () => {
  it('carries the commands for the version filter', () => {
    const row = coverageRow(m('replication-status'), [mysql, mongodb], 'zh');
    expect(row).toMatchObject({ slug: 'replication/replication-status', eq: 'approx' });
    expect(row.cells[0].cmd).toBe('SHOW SLAVE STATUS\\G');
    expect(JSON.parse(row.cells[0].pick)).toHaveLength(2);
  });

  it('has no command for a side that cannot do the task', () => {
    const row = coverageRow(m('account-lock'), [mysql, mongodb], 'zh');
    expect(row.eq).toBe('none');
    expect(row.cells[1]).toMatchObject({ cmd: '', pick: '' });
  });
});
