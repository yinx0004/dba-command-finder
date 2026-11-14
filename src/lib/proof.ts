// What the lab proved, shaped for the pages: per-version results of each command, whether each output
// field was checked, and totals per database version. Everything comes from data/ and lab/verification.json.
import { fieldPaths, type Verification } from '../../lab/plan';
import type { Dataset, Entry } from './data';
import type { Command, Text } from './schema';
import { availableIn, compareVersions, lineOf, onLine } from './version';

// --- Which version lines can run a command ---

/**
 * How a command stands on a version line, in the words the "各版本能不能用" table uses:
 *   ok          runs there; `since` is set when it arrived partway through the line (8.0.22 on 8.0),
 *               `removed` when it goes away partway through it
 *   deprecated  still runs, but is outdated from `version` on
 *   not-yet     arrives in a later line, at `version`
 *   removed     gone from `version` on
 */
export type CmdOnLine =
  | { state: 'ok'; since?: string; removed?: string }
  | { state: 'deprecated'; version: string }
  | { state: 'not-yet'; version: string }
  | { state: 'removed'; version: string };

export function cmdOnLine(c: Command, line: string): CmdOnLine {
  const s = onLine(c, line);
  if (s.state === 'unavailable') return { state: s.reason, version: s.version };
  if (c.deprecated_in && compareVersions(line, lineOf(c.deprecated_in)) >= 0) return { state: 'deprecated', version: c.deprecated_in };
  if (s.state === 'since-patch') return { state: 'ok', since: s.version };
  if (s.state === 'removed-patch') return { state: 'ok', removed: s.version };
  return { state: 'ok' };
}

// --- What the lab saw ---

/**
 * How one command fared on one lab run:
 *   ok                 ran and succeeded
 *   fails-as-expected  outside its version range, and the lab confirmed it errors there
 *   skipped            the lab does not run it (needs a sharded cluster, etc.)
 *   not-run            no result for it on this run
 */
export type RunOutcome = 'ok' | 'fails-as-expected' | 'skipped' | 'not-run';

export interface CommandRun {
  line: string; // the lab version, e.g. "8.0"
  server: string; // what the server reported, e.g. "8.0.46"
  outcome: RunOutcome;
}

/** The lab runs of a database, oldest first. */
function runsOf(v: Verification | null, db: string) {
  return (v?.runs ?? []).filter((r) => r.db === db).sort((a, b) => compareVersions(a.version, b.version));
}

/** Version line -> the server version the lab ran it on, e.g. "8.0" -> "8.0.46". */
export function labServers(v: Verification | null, db: string): Record<string, string> {
  return Object.fromEntries(runsOf(v, db).map((r) => [r.version, r.server]));
}

/** One result per lab run of the database, oldest first; empty without lab results. */
export function commandRuns(v: Verification | null, entryId: string, db: string, c: Command): CommandRun[] {
  const ev = v?.entries[entryId]?.[db];
  const slot = ev?.commands[c.cmd];
  return runsOf(v, db).map((run): CommandRun => {
    let outcome: RunOutcome = 'not-run';
    if (slot?.skipped) outcome = 'skipped';
    else if (slot?.verified.includes(run.version)) outcome = 'ok';
    // The lab requires a command outside its range to error, and an entry is clean on a version only if it did.
    else if (slot && !availableIn(c, run.server) && ev!.versions.includes(run.version)) outcome = 'fails-as-expected';
    return { line: run.version, server: run.server, outcome };
  });
}

/**
 * Whether the lab checked that an output field shows up:
 *   checked    found in the output on these versions
 *   skipped    cannot be checked in the lab, with the reason from the data (e.g. needs a replica)
 *   prose      the name is a description or a calculation, not a field to look for
 *   unchecked  a plain name with no result yet
 */
export type FieldCheck =
  | { state: 'checked'; versions: string[] }
  | { state: 'skipped'; reason: Text }
  | { state: 'prose' }
  | { state: 'unchecked' };

export function fieldCheck(v: Verification | null, entry: Entry, db: string, fieldId: string): FieldCheck | undefined {
  const d = entry.databases[db];
  const f = d?.fields[fieldId];
  if (!d || !f) return undefined;
  const skip = (typeof f === 'string' ? undefined : f.skip) ?? d.verify?.skip_fields;
  if (skip) return { state: 'skipped', reason: skip };
  if (!fieldPaths(typeof f === 'string' ? f : f.name)) return { state: 'prose' };
  const versions = v?.entries[entry.id]?.[db]?.fields[fieldId]?.verified ?? [];
  return versions.length ? { state: 'checked', versions } : { state: 'unchecked' };
}

// --- Totals for the "最近一次验证" table ---

export interface RunTotals {
  db: string;
  name: string; // "MySQL"
  line: string; // "8.0"
  server: string; // "8.0.46"
  /** commands that ran successfully on this version */
  commands: number;
  /** output fields found in the output on this version */
  fields: number;
}

/** One row per lab run, in the order of data/databases.yaml and then by version. */
export function runTotals(ds: Dataset, v: Verification | null): RunTotals[] {
  if (!v) return [];
  return ds.databases.flatMap((d) =>
    runsOf(v, d.id).map((run) => {
      let commands = 0;
      let fields = 0;
      for (const dbs of Object.values(v.entries)) {
        const ev = dbs[d.id];
        if (!ev) continue;
        for (const c of Object.values(ev.commands)) if (c.verified.includes(run.version)) commands++;
        for (const f of Object.values(ev.fields ?? {})) if (f.verified.includes(run.version)) fields++;
      }
      return { db: d.id, name: d.name, line: run.version, server: run.server, commands, fields };
    }),
  );
}
