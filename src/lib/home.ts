// Facts for the home page, all computed from the data and the lab's results, never written by hand.
import type { Dataset } from './data';
import type { Verification } from '../../lab/plan';
import { labSkip } from './roles';

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

export interface LabStatus {
  date: string; // YYYY-MM-DD of the lab run
  versions: number;
  /** every command behaved as expected on every version the lab ran */
  allAsExpected: boolean;
}

/** When the lab last ran and whether everything behaved as expected; null without lab results. */
export function labStatus(ds: Dataset, v: Verification | null): LabStatus | null {
  if (!v || v.runs.length === 0) return null;
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
  return { date: v.generatedAt.slice(0, 10), versions: v.runs.length, allAsExpected };
}
