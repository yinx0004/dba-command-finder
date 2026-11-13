import fs from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/lib/data';
import { toSearchDocs } from '../src/lib/docs';
import { createSearcher, normalize, queryTokens } from '../src/lib/search';

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
