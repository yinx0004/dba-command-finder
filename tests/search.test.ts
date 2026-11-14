import fs from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/lib/data';
import { toSearchDocs } from '../src/lib/docs';
import { categoryChips, createSearcher, filterByCategory, normalize, queryTokens } from '../src/lib/search';

describe('normalize', () => {
  it('drops terminators, optional words and case', () => {
    expect(normalize('SHOW FULL PROCESSLIST;')).toBe('show processlist');
    expect(normalize('show slave status\\G')).toBe('show slave status');
    expect(normalize('SHOW GLOBAL STATUS')).toBe('show status');
  });
  it('splits Chinese from Latin', () => {
    expect(normalize('slave延迟')).toBe('slave 延迟');
  });
  it('drops filler words from queries', () => {
    expect(queryTokens('mongodb 怎么看锁等待')).toEqual(['锁等待']);
  });
});

interface Case {
  q: string;
  top?: string;
  top_any?: string[];
  empty?: boolean;
}

const cases = load(fs.readFileSync(new URL('./search-golden.yaml', import.meta.url), 'utf8')) as Case[];
const docs = toSearchDocs(loadDataset(), 'zh');
const searcher = createSearcher(docs);
const ids = new Set(docs.map((d) => d.id));

describe('search golden cases', () => {
  it.each(cases)('$q', (c) => {
    for (const id of [c.top, ...(c.top_any ?? [])].filter(Boolean) as string[]) {
      expect(ids, `golden file names unknown id "${id}"`).toContain(id);
    }
    const got = searcher.search(c.q).map((d) => d.id);
    if (c.empty) expect(got).toEqual([]);
    else if (c.top) expect(got[0], `results: ${got.join(', ')}`).toBe(c.top);
    else expect(c.top_any, `results: ${got.join(', ')}`).toContain(got[0]);
  });
});

describe('category chips', () => {
  const r = (categoryId: string) => ({ categoryId });
  const results = [r('lock'), r('session'), r('lock'), r('log')];

  it('lists all plus the categories present, in site order', () => {
    expect(categoryChips(results, ['session', 'log', 'replication', 'lock'])).toEqual([
      { id: '', count: 4 },
      { id: 'session', count: 1 },
      { id: 'log', count: 1 },
      { id: 'lock', count: 2 },
    ]);
  });

  it('filters by a category, falling back to all when it has no results', () => {
    expect(filterByCategory(results, 'lock')).toEqual({ category: 'lock', shown: [r('lock'), r('lock')] });
    expect(filterByCategory(results, 'replication')).toEqual({ category: '', shown: results });
    expect(filterByCategory(results, '')).toEqual({ category: '', shown: results });
  });
});
