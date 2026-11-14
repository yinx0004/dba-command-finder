import { describe, expect, it } from 'vitest';
import { labSkip, roleNames } from '../src/lib/roles';
import type { Command, Database } from '../src/lib/schema';

const mongodb: Database = {
  id: 'mongodb',
  name: 'MongoDB',
  lab_versions: ['7.0'],
  roles: [
    { id: 'mongod', name: 'mongod', lab: true },
    { id: 'mongos', name: 'mongos', lab: false },
    { id: 'configsvr', name: 'config server', lab: false },
  ],
  roles_unverified: { zh: '需要分片集群' },
};
const cmd = (over: Partial<Command> = {}): Command => ({ cmd: 'db.a()', ...over });

describe('roles', () => {
  it('runs commands with no roles, or with a role the lab starts', () => {
    expect(labSkip(cmd(), mongodb)).toBeUndefined();
    expect(labSkip(cmd({ on: ['mongos', 'mongod'] }), mongodb)).toBeUndefined();
  });

  it('skips commands only for roles the lab does not start, saying why', () => {
    expect(labSkip(cmd({ on: ['mongos'] }), mongodb)).toEqual({ zh: '需要分片集群' });
    expect(labSkip(cmd({ on: ['mongos', 'configsvr'] }), mongodb)).toEqual({ zh: '需要分片集群' });
  });

  it("prefers the command's own skip", () => {
    expect(labSkip(cmd({ skip: { zh: '需要第二个连接' }, on: ['mongod'] }), mongodb)).toEqual({ zh: '需要第二个连接' });
  });

  it('names roles in the order the database lists them', () => {
    expect(roleNames(cmd({ on: ['configsvr', 'mongod', 'mongos'] }), mongodb)).toEqual(['mongod', 'mongos', 'config server']);
    expect(roleNames(cmd(), mongodb)).toEqual([]);
  });
});
