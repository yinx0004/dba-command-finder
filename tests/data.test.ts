import { describe, expect, it } from 'vitest';
import { checkDataset, loadDataset, type RawDataset } from '../src/lib/data';

describe('data/', () => {
  it('loads with no problems', () => {
    const ds = loadDataset();
    expect(ds.mappings.length).toBeGreaterThan(0);
  });
});

const category = { id: 'session', name: { zh: '会话' }, desc: { zh: '会话' } };

function mapping(over: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    id: 'a',
    category: 'session',
    title: { zh: 'A' },
    summary: { zh: 'A' },
    equivalence: 'approx',
    mysql: [{ cmd: 'SHOW A;' }],
    mongodb: [{ cmd: 'db.a()' }],
    ...over,
  };
}

function raw(mappings: { file: string; data: unknown }[], extra: Partial<RawDataset> = {}): RawDataset {
  return { mappings, categories: [category], redirects: [], site: {}, ...extra };
}

const problems = (r: RawDataset) => checkDataset(r).problems;

describe('checkDataset', () => {
  it('accepts a valid entry', () => {
    expect(problems(raw([{ file: 'data/mappings/session/a.yaml', data: mapping() }]))).toEqual([]);
  });

  it('requires the id to match the file name and the category to match the folder', () => {
    const p = problems(raw([{ file: 'data/mappings/lock/b.yaml', data: mapping() }]));
    expect(p.join('\n')).toMatch(/must match the file name "b"/);
    expect(p.join('\n')).toMatch(/must match the folder "lock"/);
  });

  it('rejects unknown fields and bad versions', () => {
    const p = problems(raw([{ file: 'data/mappings/session/a.yaml', data: mapping({ extra: 1, mysql: [{ cmd: 'X', since: 8 }] }) }]));
    expect(p.length).toBeGreaterThanOrEqual(2);
  });

  it('enforces the equivalence rules', () => {
    const noneWithCmd = problems(raw([{ file: 'data/mappings/session/a.yaml', data: mapping({ equivalence: 'none', differences: [{ zh: 'x' }] }) }]));
    expect(noneWithCmd.join('\n')).toMatch(/must not list MongoDB commands/);
    const noneNoWhy = problems(raw([{ file: 'data/mappings/session/a.yaml', data: mapping({ equivalence: 'none', mongodb: [] }) }]));
    expect(noneNoWhy.join('\n')).toMatch(/must explain why/);
    const approxEmpty = problems(raw([{ file: 'data/mappings/session/a.yaml', data: mapping({ mongodb: [] }) }]));
    expect(approxEmpty.join('\n')).toMatch(/needs at least one MongoDB command/);
  });

  it('checks cross references', () => {
    const p = problems(
      raw(
        [{ file: 'data/mappings/session/a.yaml', data: mapping({ related: ['a', 'missing'], replaced_by: 'gone' }) }],
        { site: { featured: ['nope'] } },
      ),
    );
    const text = p.join('\n');
    expect(text).toMatch(/related lists itself/);
    expect(text).toMatch(/related "missing" does not exist/);
    expect(text).toMatch(/replaced_by is only allowed when status is deprecated/);
    expect(text).toMatch(/featured "nope" does not exist/);
  });

  it('checks redirects', () => {
    const p = problems(
      raw([{ file: 'data/mappings/session/a.yaml', data: mapping() }], {
        redirects: [
          { from: 'session/a', to: 'session/a' },
          { from: 'session/old', to: 'session/missing' },
        ],
      }),
    );
    const text = p.join('\n');
    expect(text).toMatch(/"session\/a" still exists/);
    expect(text).toMatch(/target "session\/missing" does not exist/);
  });

  it('rejects entries that still have template placeholders', () => {
    const p = problems(raw([{ file: 'data/mappings/session/a.yaml', data: mapping({ title: { zh: 'TODO 一句话' } }) }]));
    expect(p.join('\n')).toMatch(/TODO placeholders/);
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
    );
    expect(p.join('\n')).toMatch(/already used/);
  });
});
