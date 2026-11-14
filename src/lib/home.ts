// Facts for the home page, all computed from the data and the lab's results, never written by hand.
import type { Dataset } from './data';
import type { Verification } from '../../lab/plan';
import { labSkip } from './roles';
import { availableIn, compareVersions } from './version';

export interface HomeStats {
  entries: number;
  categories: number;
  /** commands the lab runs (not skipped) */
  labCommands: number;
  /** database versions the lab runs every command on */
  versions: number;
  /** commands with a since / deprecated_in / removed_in boundary */
  versionBound: number;
}

export function homeStats(ds: Dataset): HomeStats {
  let labCommands = 0;
  let versionBound = 0;
  const dbs = new Map(ds.databases.map((d) => [d.id, d]));
  for (const m of ds.mappings) {
    for (const [db, d] of Object.entries(m.databases)) {
      for (const c of d.commands) {
        if (!labSkip(c, dbs.get(db))) labCommands++;
        if (c.since || c.deprecated_in || c.removed_in) versionBound++;
      }
    }
  }
  return {
    entries: ds.mappings.length,
    categories: new Set(ds.mappings.map((m) => m.category)).size,
    labCommands,
    versions: ds.databases.reduce((n, d) => n + d.lab_versions.length, 0),
    versionBound,
  };
}

export type ExcerptLine = { kind: 'run'; db: string; server: string } | { kind: 'cmd'; cmd: string; failsAsExpected: boolean };

export interface LabExcerpt {
  date: string; // YYYY-MM-DD of the lab run
  lines: ExcerptLine[];
  versions: number;
  /** every command behaved as expected on every version the lab ran */
  allAsExpected: boolean;
}

/**
 * A few real lines of lab output for the home page: for each database in site.yaml's lab_excerpt,
 * its newest version the lab ran, and how the chosen commands behaved there.
 */
export function labExcerpt(ds: Dataset, v: Verification | null): LabExcerpt | null {
  if (!v || v.runs.length === 0) return null;
  const byId = new Map(ds.mappings.map((m) => [m.id, m]));
  const lines: ExcerptLine[] = [];
  const dbs = [...new Set(ds.site.lab_excerpt.map((p) => p.db))];
  for (const db of dbs) {
    const run = v.runs.filter((r) => r.db === db).sort((a, b) => compareVersions(b.version, a.version))[0];
    if (!run) continue;
    const cmdLines: ExcerptLine[] = [];
    for (const pick of ds.site.lab_excerpt.filter((p) => p.db === db)) {
      const entry = byId.get(pick.entry);
      const c = entry?.databases[db]?.commands.find((x) => x.cmd === pick.cmd);
      const ev = v.entries[pick.entry]?.[db];
      if (!c || !ev) continue;
      if (ev.commands[c.cmd]?.verified.includes(run.version)) cmdLines.push({ kind: 'cmd', cmd: c.cmd, failsAsExpected: false });
      else if (!availableIn(c, run.server) && ev.versions.includes(run.version)) cmdLines.push({ kind: 'cmd', cmd: c.cmd, failsAsExpected: true });
    }
    if (cmdLines.length) lines.push({ kind: 'run', db, server: run.server }, ...cmdLines);
  }

  // All as expected: every entry that runs something on a database counts every version of it as clean.
  const runsByDb = new Map<string, string[]>();
  for (const r of v.runs) runsByDb.set(r.db, [...(runsByDb.get(r.db) ?? []), r.version]);
  const dbDefs = new Map(ds.databases.map((d) => [d.id, d]));
  const allAsExpected = ds.mappings.every((m) =>
    Object.entries(m.databases).every(([db, d]) => {
      if (!d.commands.some((c) => !labSkip(c, dbDefs.get(db)))) return true;
      const ran = runsByDb.get(db) ?? [];
      const clean = v.entries[m.id]?.[db]?.versions ?? [];
      return ran.every((ver) => clean.includes(ver));
    }),
  );

  return { date: v.generatedAt.slice(0, 10), lines, versions: v.runs.length, allAsExpected };
}
