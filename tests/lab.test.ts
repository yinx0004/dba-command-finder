import { describe, expect, it } from 'vitest';
import { expectation, fieldPaths, fill, labDatabase, merge, outputHasPath, parseServerVersion, redisFailed, type RunResult } from '../lab/plan';
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

describe('field checks', () => {
  it('turns field names into paths, or null for prose', () => {
    expect(fieldPaths('opid')).toEqual([['opid']]);
    expect(fieldPaths('connections.current')).toEqual([['connections', 'current']]);
    expect(fieldPaths('waitingForLock / desc')).toEqual([['waitingForLock'], ['desc']]);
    expect(fieldPaths('members[].stateStr / health')).toEqual([['members', 'stateStr'], ['health']]);
    expect(fieldPaths('COLLSCAN 阶段')).toBeNull();
    expect(fieldPaths('Innodb_buffer_pool_*')).toBeNull();
    expect(fieldPaths('Com_select / Com_insert / …')).toBeNull();
  });

  it('finds whole names in MySQL and mongosh output', () => {
    const mysql = 'Id\tUser\tHost\tdb\tCommand\tTime\tState\tInfo\n8\troot\tlocalhost\tNULL\tQuery\t0\tinit\tSHOW PROCESSLIST';
    expect(outputHasPath(mysql, ['Time'])).toBe(true);
    expect(outputHasPath(mysql, ['Tim'])).toBe(false);
    const mongo = "{ inprog: [ { opid: 302, secs_running: Long('0'), command: { currentOp: 1 } } ], ok: 1 }";
    expect(outputHasPath(mongo, ['secs_running'])).toBe(true);
    expect(outputHasPath(mongo, ['inprog', 'opid'])).toBe(true);
    expect(outputHasPath(mongo, ['microsecs_running'])).toBe(false);
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

  it('records where each field was found, and a missing field fails the version', () => {
    const v = merge([
      run('5.7', { a: { commands: [{ cmd: 'X', expect: 'ok', status: 'pass' }], fields: [{ id: 'f', name: 'F', status: 'pass' }] } }),
      run('8.4', { a: { commands: [{ cmd: 'X', expect: 'ok', status: 'pass' }], fields: [{ id: 'f', name: 'F', status: 'fail' }] } }),
    ]);
    expect(v.entries.a.mysql.fields.f.verified).toEqual(['5.7']);
    expect(v.entries.a.mysql.versions).toEqual(['5.7']);
  });
});

describe('redis parameter names', () => {
  it('reads a hyphenated name as a field', () => {
    expect(fieldPaths('proto-max-bulk-len')).toEqual([['proto-max-bulk-len']]);
    expect(fieldPaths('maxclients / rejected_connections')).toEqual([['maxclients'], ['rejected_connections']]);
    expect(fieldPaths('-oops')).toBeNull();
  });
});

describe('redis replies', () => {
  it('fails on an error reply, which redis-cli does not signal by its exit code', () => {
    expect(redisFailed("ERR unknown subcommand 'NO-EVICT'. Try CLIENT HELP.")).toBe(true);
    expect(redisFailed('PONG\nWRONGTYPE Operation against a key holding the wrong kind of value')).toBe(true);
    expect(redisFailed("NOPERM User app has no permissions to run the 'config|get' command")).toBe(true);
  });

  it('passes ordinary output, including values that mention errors', () => {
    expect(redisFailed('PONG')).toBe(false);
    expect(redisFailed('maxclients\n10000')).toBe(false);
    expect(redisFailed('errorstat_ERR:count=1\ntotal_error_replies:1')).toBe(false);
    expect(redisFailed('id=3 addr=127.0.0.1:52342 laddr=127.0.0.1:6379 fd=8 name= age=0 cmd=client|list')).toBe(false);
  });
});
