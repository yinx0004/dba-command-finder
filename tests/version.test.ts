import { describe, expect, it } from 'vitest';
import { firstUsable, lineOf, onLine } from '../src/lib/version';

describe('version lines', () => {
  it('reads the line of a version', () => {
    expect(lineOf('8.0.22')).toBe('8.0');
    expect(lineOf('8.4')).toBe('8.4');
  });

  it('judges a command for a whole line', () => {
    // SHOW REPLICA STATUS, since 8.0.22
    expect(onLine({ since: '8.0.22' }, '5.7')).toEqual({ state: 'unavailable', reason: 'not-yet', version: '8.0.22' });
    expect(onLine({ since: '8.0.22' }, '8.0')).toEqual({ state: 'since-patch', version: '8.0.22' });
    expect(onLine({ since: '8.0.22' }, '8.4')).toEqual({ state: 'available' });
    // INNODB_LOCK_WAITS, removed in 8.0 (from its first release)
    expect(onLine({ removed_in: '8.0' }, '5.7')).toEqual({ state: 'available' });
    expect(onLine({ removed_in: '8.0' }, '8.0')).toEqual({ state: 'unavailable', reason: 'removed', version: '8.0' });
    expect(onLine({ removed_in: '8.0' }, '8.4')).toEqual({ state: 'unavailable', reason: 'removed', version: '8.0' });
    // removed partway through a line
    expect(onLine({ removed_in: '8.0.30' }, '8.0')).toEqual({ state: 'removed-patch', version: '8.0.30' });
    // SHOW BINARY LOG STATUS, since 8.2.0
    expect(onLine({ since: '8.2.0' }, '8.0')).toEqual({ state: 'unavailable', reason: 'not-yet', version: '8.2.0' });
    expect(onLine({ since: '8.2.0' }, '8.4')).toEqual({ state: 'available' });
    expect(onLine({}, '5.7')).toEqual({ state: 'available' });
  });

  it('picks the first command a reader can use', () => {
    const cmds = [
      { cmd: 'SHOW SLAVE STATUS\\G', removed_in: '8.4' },
      { cmd: 'SHOW REPLICA STATUS\\G', since: '8.0.22' },
    ];
    expect(firstUsable(cmds, undefined)?.cmd).toBe('SHOW SLAVE STATUS\\G');
    expect(firstUsable(cmds, '5.7')?.cmd).toBe('SHOW SLAVE STATUS\\G');
    expect(firstUsable(cmds, '8.0')?.cmd).toBe('SHOW SLAVE STATUS\\G');
    expect(firstUsable(cmds, '8.4')?.cmd).toBe('SHOW REPLICA STATUS\\G');
    expect(firstUsable([{ cmd: 'X', since: '8.0' }], '5.7')).toBeUndefined();
  });
});
