import { describe, expect, it } from 'vitest';
import { expectation, fill, labDatabase, merge, parseServerVersion, type RunResult } from '../lab/plan';
import { availableIn, compareVersions } from '../src/lib/version';

describe('versions', () => {
  it('compares dotted versions, treating missing parts as 0', () => {
    expect(compareVersions('8.0.22', '8.4')).toBeLessThan(0);
    expect(compareVersions('8.4', '8.4.0')).toBe(0);
    expect(compareVersions('8.0.46', '8.0.22')).toBeGreaterThan(0);
    expect(compareVersions('5.7.44', '8.0')).toBeLessThan(0);
  });

  it('knows when a command exists', () => {
    expect(availableIn({ since: '8.0.22' }, '8.0.46')).toBe(true);
    expect(availableIn({ since: '8.0.22' }, '5.7.44')).toBe(false);
    expect(availableIn({ removed_in: '8.4' }, '8.0.46')).toBe(true);
    expect(availableIn({ removed_in: '8.4' }, '8.4.0')).toBe(false);
    expect(expectation({ removed_in: '8.0' }, '5.7.44')).toBe('ok');
    expect(expectation({ removed_in: '8.0' }, '8.0.46')).toBe('error');
  });

  it('reads server version strings', () => {
    expect(parseServerVersion('5.7.44-log')).toBe('5.7.44');
    expect(parseServerVersion('8.0.46\n')).toBe('8.0.46');
    expect(() => parseServerVersion('nope')).toThrow();
  });
});

describe('fill', () => {
  it('replaces placeholders and reports missing ones', () => {
    expect(fill('SHOW INDEX FROM <table>;', { table: 't' })).toEqual({ text: 'SHOW INDEX FROM t;', missing: [] });
    expect(fill('KILL <processlist_id>;', {})).toEqual({ text: 'KILL <processlist_id>;', missing: ['processlist_id'] });
    expect(fill('{ id: <lsid.id> }', { 'lsid.id': 'UUID()' }).text).toBe('{ id: UUID() }');
  });

  it('leaves SQL operators alone', () => {
    const sql = "SELECT * FROM t WHERE COMMAND <> 'Sleep' AND a < b AND c > 0;";
    expect(fill(sql, {})).toEqual({ text: sql, missing: [] });
  });

  it('makes a safe database name', () => {
    expect(labDatabase('list-active-sessions')).toBe('lab_list_active_sessions');
  });
});

describe('merge', () => {
  const run = (version: string, entries: RunResult['entries']): RunResult => ({
    db: 'mysql',
    version,
    server: `${version}.1`,
    image: `mysql:${version}`,
    ranAt: '2026-01-01T00:00:00Z',
    entries,
  });

  it('counts a command as verified only where it was expected to work and did', () => {
    const v = merge([
      run('5.7', { a: { commands: [{ cmd: 'OLD', expect: 'ok', status: 'pass' }, { cmd: 'NEW', expect: 'error', status: 'pass' }] } }),
      run('8.4', { a: { commands: [{ cmd: 'OLD', expect: 'error', status: 'pass' }, { cmd: 'NEW', expect: 'ok', status: 'pass' }] } }),
    ]);
    expect(v.entries.a.mysql.commands.OLD.verified).toEqual(['5.7']);
    expect(v.entries.a.mysql.commands.NEW.verified).toEqual(['8.4']);
    expect(v.entries.a.mysql.versions).toEqual(['5.7', '8.4']);
  });

  it('does not count a version for an entry when something failed or nothing ran', () => {
    const v = merge([
      run('5.7', {
        failed: { commands: [{ cmd: 'X', expect: 'ok', status: 'fail' }] },
        skipped: { commands: [{ cmd: 'KILL <id>;', status: 'skip' }] },
        broken: { setupError: 'boom', commands: [{ cmd: 'Y', expect: 'ok', status: 'fail' }] },
      }),
    ]);
    expect(v.entries.failed.mysql.versions).toEqual([]);
    expect(v.entries.skipped.mysql.versions).toEqual([]);
    expect(v.entries.skipped.mysql.commands['KILL <id>;']).toEqual({ verified: [], skipped: true });
    expect(v.entries.broken.mysql.versions).toEqual([]);
  });
});
