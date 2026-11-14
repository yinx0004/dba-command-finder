import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/lib/data';
import { homeStats, labExcerpt, labStatus } from '../src/lib/home';
import { ciRunUrl, GITHUB } from '../src/lib/site';
import type { Verification } from '../lab/plan';

const ds = loadDataset();

describe('home stats', () => {
  it('counts from the data', () => {
    const s = homeStats(ds);
    expect(s.entries).toBe(ds.mappings.length);
    expect(s.versions).toBe(6);
    expect(s.labCommands).toBeGreaterThan(0);
    expect(s.labCommands).toBeLessThanOrEqual(ds.mappings.flatMap((m) => Object.values(m.databases).flatMap((d) => d.commands)).length);
  });
});

describe('lab excerpt', () => {
  it('is empty without lab results', () => {
    expect(labExcerpt(ds, null)).toBeNull();
  });

  it('shows the newest version and how each picked command behaved there', () => {
    const v: Verification = {
      generatedAt: '2026-11-14T05:30:00.000Z',
      runs: [
        { db: 'mysql', version: '8.0', server: '8.0.46' },
        { db: 'mysql', version: '8.4', server: '8.4.11' },
      ],
      entries: {
        'replication-status': {
          mysql: {
            versions: ['8.0', '8.4'],
            commands: { 'SHOW REPLICA STATUS\\G': { verified: ['8.0', '8.4'], skipped: false }, 'SHOW SLAVE STATUS\\G': { verified: ['8.0'], skipped: false } },
            fields: {},
          },
        },
      },
    };
    const ex = labExcerpt(ds, v)!;
    expect(ex.date).toBe('2026-11-14');
    expect(ex.lines.slice(0, 3)).toEqual([
      { kind: 'run', db: 'mysql', server: '8.4.11' },
      { kind: 'cmd', cmd: 'SHOW REPLICA STATUS\\G', failsAsExpected: false },
      { kind: 'cmd', cmd: 'SHOW SLAVE STATUS\\G', failsAsExpected: true },
    ]);
    // most entries have no results in this made-up file, so not everything ran as expected
    expect(ex.allAsExpected).toBe(false);
  });
});

describe('lab status', () => {
  it('is empty without lab results', () => {
    expect(labStatus(ds, null)).toBeNull();
    expect(labStatus(ds, { generatedAt: '2026-11-14T05:30:00.000Z', runs: [], entries: {} })).toBeNull();
  });

  it('is clean only when every entry ran clean on every version', () => {
    const runs = [{ db: 'mysql', version: '8.4', server: '8.4.11' }];
    const s = labStatus(ds, { generatedAt: '2026-11-14T05:30:00.000Z', runs, entries: {} })!;
    expect(s).toEqual({ date: '2026-11-14', versions: 1, allAsExpected: false });
  });
});

describe('CI run link', () => {
  it('points at the run that built the site, else the list of runs', () => {
    expect(ciRunUrl('123')).toBe(`${GITHUB}/actions/runs/123`);
    expect(ciRunUrl('')).toBe(`${GITHUB}/actions`);
  });
});
