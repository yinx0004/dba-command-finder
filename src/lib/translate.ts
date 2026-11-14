// What the home page's translator needs about each entry, built once at build time and shipped to the
// browser: both sides' commands with their version ranges and lab results, notes, alternatives, fields.
import type { Verification } from '../../lab/plan';
import type { Dataset } from './data';
import { t, type Lang } from './i18n';
import { commandRuns, fieldCheck, type RunOutcome } from './proof';
import { labSkip } from './roles';
import type { DatabaseEntry } from './schema';

export interface TCmd {
  cmd: string;
  since?: string;
  deprecated_in?: string;
  removed_in?: string;
  /** lab runs that proved something: [version line, server, outcome] */
  runs: [string, string, RunOutcome][];
  /** why the lab does not run it */
  skip?: string;
}

export interface TSide {
  support: DatabaseEntry['support'];
  cmds: TCmd[];
  notes: string[];
  alternatives: { title: string; cmd?: string }[];
}

export interface TEntry {
  slug: string;
  title: string;
  /** database id -> its side; absent when not written up */
  sides: Record<string, TSide>;
  /** output fields: meaning, then each side's name and whether the lab found it ('' when not) */
  fields: { name: string; names: Record<string, string>; checked: Record<string, string> }[];
}

/** dbs: the databases the site shows, the pair's source first (entries without it are left out). */
export function translateEntries(ds: Dataset, v: Verification | null, lang: Lang, dbs: string[]): Record<string, TEntry> {
  const defs = new Map(ds.databases.map((d) => [d.id, d]));
  const out: Record<string, TEntry> = {};
  for (const m of ds.mappings) {
    if (!m.databases[dbs[0]]) continue;
    const sides: Record<string, TSide> = {};
    for (const db of dbs) {
      const d = m.databases[db];
      if (!d) continue;
      sides[db] = {
        support: d.support,
        cmds: d.commands.map((c) => {
          const skip = labSkip(c, defs.get(db));
          const runs = skip
            ? []
            : commandRuns(v, m.id, db, c)
                .filter((r) => r.outcome === 'ok' || r.outcome === 'fails-as-expected')
                .map((r): [string, string, RunOutcome] => [r.line, r.server, r.outcome]);
          return { cmd: c.cmd, since: c.since, deprecated_in: c.deprecated_in, removed_in: c.removed_in, runs, ...(skip ? { skip: t(skip, lang) } : {}) };
        }),
        notes: d.notes.map((n) => t(n, lang)),
        alternatives: d.alternatives.map((a) => ({ title: t(a.title, lang), ...(a.cmd ? { cmd: a.cmd } : {}) })),
      };
    }
    const fields = m.fields
      .map((f) => {
        const names: Record<string, string> = {};
        const checked: Record<string, string> = {};
        for (const db of dbs) {
          const raw = m.databases[db]?.fields[f.id];
          if (!raw) continue;
          names[db] = typeof raw === 'string' ? raw : raw.name;
          const c = fieldCheck(v, m, db, f.id);
          checked[db] = c?.state === 'checked' ? c.versions.join(' · ') : '';
        }
        return { name: f.name ? t(f.name, lang) : f.id, names, checked };
      })
      .filter((f) => Object.keys(f.names).length > 0);
    out[m.id] = { slug: m.slug, title: t(m.title, lang), sides, fields };
  }
  return out;
}
