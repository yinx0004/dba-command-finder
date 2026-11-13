// Shared by the browser search box and the golden tests, so what is tested is what ships.
// Keep this file free of Node APIs.
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Equivalence } from './pair';

/** One mapping, flattened for search and for rendering a result row of the site's database pair. */
export interface SearchDoc {
  id: string;
  slug: string; // category/id
  title: string;
  category: string; // display name
  equivalence: Equivalence;
  deprecated: boolean;
  source: string; // first source command, as shown
  target: string; // first target command, as shown ('' when none or not written up)
  // normalized fields used for matching; commands of every database, so any of them finds the task
  n_cmds: string[];
  n_title: string;
  n_keywords: string[];
  n_category: string;
  n_summary: string;
}

const CJK = '\\u3400-\\u9fff\\uf900-\\ufaff';

/**
 * Lower-cases and strips what does not change meaning, so that
 * "SHOW FULL PROCESSLIST;" and "show processlist" compare equal.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\\g\b/g, ' ') // mysql \G terminator
    .replace(/[;(){}\[\]<>'"`,:=]/g, ' ')
    .replace(new RegExp(`([${CJK}])([a-z0-9_.$])`, 'g'), '$1 $2') // "slave延迟" -> "slave 延迟"
    .replace(new RegExp(`([a-z0-9_.$])([${CJK}])`, 'g'), '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^show (full|global|session) /, 'show ');
}

// Words people type around the thing they are looking for.
const QUERY_NOISE_WORDS = new Set(['mysql', 'mongodb', 'mongo', 'mongosh', 'how', 'to', 'in']);
const QUERY_NOISE_CJK = /怎么|如何|怎样|查看|命令|什么|一下|对应|看|的|里|中|在/g;

export function queryTokens(q: string): string[] {
  return normalize(q)
    .replace(QUERY_NOISE_CJK, ' ')
    .split(' ')
    .filter((t) => t && !QUERY_NOISE_WORDS.has(t));
}

const FUSE_OPTIONS: IFuseOptions<SearchDoc> = {
  includeScore: true,
  ignoreLocation: true,
  ignoreFieldNorm: true,
  threshold: 0.3,
  minMatchCharLength: 1,
  keys: [
    { name: 'n_cmds', weight: 3 },
    { name: 'n_title', weight: 2 },
    { name: 'n_keywords', weight: 2 },
    { name: 'n_category', weight: 1 },
    { name: 'n_summary', weight: 0.5 },
  ],
};

export interface Searcher {
  search(q: string, limit?: number): SearchDoc[];
}

export function createSearcher(docs: SearchDoc[]): Searcher {
  const fuse = new Fuse(docs, FUSE_OPTIONS);
  return {
    search(q, limit = 20) {
      const tokens = queryTokens(q);
      if (tokens.length === 0) return [];
      const scores = new Map<string, number>();
      const add = (results: ReturnType<typeof fuse.search>, weight: number) => {
        for (const r of results) {
          const s = (1 - (r.score ?? 1)) * weight;
          scores.set(r.item.slug, (scores.get(r.item.slug) ?? 0) + s);
        }
      };
      // The whole query, so an exact command phrase ranks first...
      add(fuse.search(tokens.join(' ')), 1);
      // ...plus each word, so word order and extra words do not lose the match.
      if (tokens.length > 1) {
        for (const t of tokens) add(fuse.search(t), 1 / tokens.length);
      }
      const bySlug = new Map(docs.map((d) => [d.slug, d]));
      return [...scores.entries()]
        .map(([slug, score]) => {
          const doc = bySlug.get(slug)!;
          return { doc, score: doc.deprecated ? score / 2 : score };
        })
        .filter((x) => x.score >= 0.35)
        .sort((a, b) => b.score - a.score || a.doc.slug.localeCompare(b.doc.slug))
        .slice(0, limit)
        .map((x) => x.doc);
    },
  };
}
