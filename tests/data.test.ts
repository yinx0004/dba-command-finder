import { describe, expect, it } from 'vitest';
import { checkDataset, loadDataset, type RawDataset } from '../src/lib/data';

describe('data/', () => {
  it('loads with no problems', () => {
    const ds = loadDataset();
    expect(ds.mappings.length).toBeGreaterThan(0);
  });
});

const category = { id: 'session', name: { zh: '会话' }, desc: { zh: '会话' } };
const databases = [
  { id: 'mysql', name: 'MySQL' },
  { id: 'mongodb', name: 'MongoDB' },
];

function mapping(over: Record<string, unknown> = {}) {
  return {
    schema_version: 2,
    id: 'a',
    category: 'session',
    title: { zh: 'A' },
    summary: { zh: 'A' },
    databases: {
      mysql: { support: 'full', commands: [{ cmd: 'SHOW A;' }] },
      mongodb: { support: 'partial', commands: [{ cmd: 'db.a()' }], notes: [{ zh: '不同' }] },
    },
    ...over,
  };
}

function raw(mappings: { file: string; data: unknown }[], extra: Partial<RawDataset> = {}): RawDataset {
  return {
    mappings,
    databases,
    categories: [category],
    redirects: [],
    site: { pair: { source: 'mysql', target: 'mongodb' } },
    ...extra,
  };
}

const problems = (r: RawDataset) => checkDataset(r).problems;
const one = (data: unknown) => problems(raw([{ file: 'data/mappings/session/a.yaml', data }])).join('\n');

describe('checkDataset', () => {
  it('accepts a valid entry', () => {
    expect(one(mapping())).toBe('');
  });

  it('requires the id to match the file name and the category to match the folder', () => {
    const p = problems(raw([{ file: 'data/mappings/lock/b.yaml', data: mapping() }])).join('\n');
    expect(p).toMatch(/must match the file name "b"/);
    expect(p).toMatch(/must match the folder "lock"/);
  });

  it('rejects unknown fields and bad versions', () => {
    const p = one(mapping({ extra: 1, databases: { mysql: { support: 'full', commands: [{ cmd: 'X', since: 8 }] } } }));
    expect(p.split('\n').length).toBeGreaterThanOrEqual(2);
  });

  it('enforces the support rules', () => {
    const db = (mongodb: unknown) => mapping({ databases: { mysql: { support: 'full', commands: [{ cmd: 'X' }] }, mongodb } });
    expect(one(db({ support: 'none', commands: [{ cmd: 'y' }], notes: [{ zh: 'x' }] }))).toMatch(/must not list commands/);
    expect(one(db({ support: 'none' }))).toMatch(/must explain why/);
    expect(one(db({ support: 'full' }))).toMatch(/needs at least one command/);
    expect(one(db({ support: 'partial', commands: [{ cmd: 'y' }] }))).toMatch(/must say what differs/);
    const noneBoth = mapping({
      databases: { mysql: { support: 'none', notes: [{ zh: 'x' }] }, mongodb: { support: 'none', notes: [{ zh: 'y' }] } },
    });
    expect(one(noneBoth)).toMatch(/at least one database must be able to do the task/);
    const onlyTarget = mapping({
      databases: { mysql: { support: 'none', notes: [{ zh: 'x' }] }, mongodb: { support: 'full', commands: [{ cmd: 'y' }] } },
    });
    expect(one(onlyTarget)).toBe('');
  });

  it('checks databases against the registry and fields against the task', () => {
    const badField = one(
      mapping({
        fields: [{ id: 'elapsed' }],
        databases: { mysql: { support: 'full', commands: [{ cmd: 'X' }], fields: { elapsed: 'Time', oops: 'Y' } } },
      }),
    );
    expect(badField).toMatch(/field "oops" is not declared/);
    const badDb = one(mapping({ databases: { oracle: { support: 'full', commands: [{ cmd: 'Z' }] } } }));
    expect(badDb).toMatch(/database "oracle" is not in data\/databases.yaml/);
  });

  it('checks command roles against the database', () => {
    const roled = [
      { id: 'mysql', name: 'MySQL' },
      {
        id: 'mongodb',
        name: 'MongoDB',
        roles: [
          { id: 'mongod', name: 'mongod', lab: true },
          { id: 'mongos', name: 'mongos' },
        ],
        roles_unverified: { zh: '需要分片集群' },
      },
    ];
    const withOn = (on: string[], db = 'mongodb') =>
      problems(
        raw(
          [
            {
              file: 'data/mappings/session/a.yaml',
              data: mapping({
                databases: {
                  mysql: { support: 'full', commands: [{ cmd: 'SHOW A;' }] },
                  [db]: { support: 'partial', commands: [{ cmd: 'db.a()', on }], notes: [{ zh: '不同' }] },
                },
              }),
            },
          ],
          { databases: roled },
        ),
      ).join('\n');
    expect(withOn(['mongod', 'mongos'])).toBe('');
    expect(withOn(['configsvr'])).toMatch(/role "configsvr" is not a role of mongodb/);
    expect(withOn(['mongos', 'mongos'])).toMatch(/listed twice/);
    expect(withOn(['mongod'], 'mysql')).toMatch(/role "mongod" is not a role of mysql/);
    const noLab = problems(raw([], { databases: [{ id: 'x', name: 'X', roles: [{ id: 'a', name: 'a' }], roles_unverified: { zh: '?' } }] }));
    expect(noLab.join('\n')).toMatch(/at least one role must be lab: true/);
    const noWhy = problems(raw([], { databases: [{ id: 'x', name: 'X', roles: [{ id: 'a', name: 'a', lab: true }, { id: 'b', name: 'b' }] }] }));
    expect(noWhy.join('\n')).toMatch(/roles_unverified/);
  });

  it('checks the site pair', () => {
    const p = problems(raw([], { site: { pair: { source: 'mysql', target: 'redis' } } })).join('\n');
    expect(p).toMatch(/pair database "redis"/);
  });

  it('checks cross references', () => {
    const p = problems(
      raw([{ file: 'data/mappings/session/a.yaml', data: mapping({ related: ['a', 'missing'], replaced_by: 'gone' }) }], {
        site: { pair: { source: 'mysql', target: 'mongodb' }, featured: ['nope'] },
      }),
    ).join('\n');
    expect(p).toMatch(/related lists itself/);
    expect(p).toMatch(/related "missing" does not exist/);
    expect(p).toMatch(/replaced_by is only allowed when status is deprecated/);
    expect(p).toMatch(/featured "nope" does not exist/);
  });

  it('checks redirects', () => {
    const p = problems(
      raw([{ file: 'data/mappings/session/a.yaml', data: mapping() }], {
        redirects: [
          { from: 'session/a', to: 'session/a' },
          { from: 'session/old', to: 'session/missing' },
        ],
      }),
    ).join('\n');
    expect(p).toMatch(/"session\/a" still exists/);
    expect(p).toMatch(/target "session\/missing" does not exist/);
  });

  it('rejects entries that still have template placeholders', () => {
    expect(one(mapping({ title: { zh: 'TODO 一句话' } }))).toMatch(/TODO placeholders/);
  });

  it('rejects duplicate ids across categories', () => {
    const p = problems(
      raw(
        [
          { file: 'data/mappings/session/a.yaml', data: mapping() },
          { file: 'data/mappings/lock/a.yaml', data: mapping({ category: 'lock' }) },
        ],
        { categories: [category, { id: 'lock', name: { zh: '锁' }, desc: { zh: '锁' } }] },
      ),
    ).join('\n');
    expect(p).toMatch(/already used/);
  });
});
