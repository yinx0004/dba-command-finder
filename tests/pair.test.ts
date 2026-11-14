import { describe, expect, it } from 'vitest';
import { equivalence, fieldRows } from '../src/lib/pair';
import type { DatabaseEntry } from '../src/lib/schema';

const db = (support: DatabaseEntry['support'], fields: DatabaseEntry['fields'] = {}): DatabaseEntry => ({
  support,
  commands: support === 'none' ? [] : [{ cmd: 'x' }],
  fields,
  notes: [],
  alternatives: [],
  refs: [],
});

describe('equivalence', () => {
  it('derives the pair label from each side', () => {
    expect(equivalence(db('full'), db('full'))).toBe('exact');
    expect(equivalence(db('full'), db('partial'))).toBe('approx');
    expect(equivalence(db('partial'), db('full'))).toBe('approx');
    expect(equivalence(db('full'), db('none'))).toBe('none');
    expect(equivalence(db('full'), undefined)).toBe('missing');
    expect(equivalence(db('none'), db('full'))).toBe('only');
    expect(equivalence(db('none'), db('partial'))).toBe('only');
  });
});

describe('fieldRows', () => {
  it('lines up both databases on the task fields and prefers the target note', () => {
    const rows = fieldRows(
      {
        fields: [{ id: 'session_id', name: { zh: '会话 ID' } }, { id: 'elapsed' }, { id: 'unused' }],
        databases: {
          mysql: db('full', { session_id: 'Id', elapsed: { name: 'Time', note: { zh: '秒' } } }),
          mongodb: db('partial', { session_id: { name: 'opid', note: { zh: '用 opid 终止' } } }),
        },
      },
      'mysql',
      'mongodb',
    );
    expect(rows).toEqual([
      { id: 'session_id', name: { zh: '会话 ID' }, source: 'Id', target: 'opid', note: { zh: '用 opid 终止' } },
      { id: 'elapsed', name: undefined, source: 'Time', target: undefined, note: { zh: '秒' } },
    ]);
  });
});
