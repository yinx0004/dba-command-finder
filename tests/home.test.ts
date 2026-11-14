import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/lib/data';
import { homeStats, labStatus } from '../src/lib/home';
import { ciRunUrl, GITHUB } from '../src/lib/site';

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
