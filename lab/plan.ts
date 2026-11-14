// What the lab expects from each command. Pure functions, unit tested in tests/lab.test.ts.
import type { Command } from '../src/lib/schema';
import { availableIn } from '../src/lib/version';

const PLACEHOLDER = /<([a-z][a-z0-9_.]*)>/gi;

/** Replaces <name> placeholders from vars; reports any left unfilled. `<>` and `a < b` are left alone. */
export function fill(text: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(PLACEHOLDER, (whole, name: string) => {
    if (name in vars) return vars[name];
    missing.add(name);
    return whole;
  });
  return { text: out, missing: [...missing] };
}

export type Expect = 'ok' | 'error';

/** Inside its version range a command must work; before `since` or from `removed_in` on it must fail. */
export function expectation(c: Pick<Command, 'since' | 'removed_in'>, serverVersion: string): Expect {
  return availableIn(c, serverVersion) ? 'ok' : 'error';
}

/** "8.0.44-log" or "8.0.44" -> "8.0.44" */
export function parseServerVersion(raw: string): string {
  const m = /(\d+\.\d+\.\d+)/.exec(raw);
  if (!m) throw new Error(`cannot read a version from ${JSON.stringify(raw)}`);
  return m[1];
}

// Error replies redis-cli prints when its output is not a terminal; it still exits 0 after them.
const REDIS_ERROR = /^(ERR|WRONGTYPE|NOPERM|NOAUTH|WRONGPASS|NOSCRIPT|NOTBUSY|NOREPLICAS|NOPROTO|READONLY|MASTERDOWN|EXECABORT|BUSY|BUSYKEY|LOADING|MISCONF|OOM|UNKILLABLE|CLUSTERDOWN|CROSSSLOT|TRYAGAIN|MOVED|ASK)\b/m;

/** Whether redis-cli's output contains an error reply, which is how a Redis command fails. */
export function redisFailed(output: string): boolean {
  return REDIS_ERROR.test(output);
}

/** A database name the lab can create for one entry: letters, digits, underscores. */
export function labDatabase(id: string): string {
  return `lab_${id.replace(/[^a-z0-9]/gi, '_')}`;
}

// Letters, digits, _ and $; a hyphen inside a name too (Redis parameters such as proto-max-bulk-len).
const SEGMENT = String.raw`[A-Za-z_$][\w$]*(?:-[\w$]+)*(?:\[\])?`;
const PATH = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})*$`);

/**
 * The paths the lab can look for in a field name, or null when the name is prose
 * ("COLLSCAN 阶段", "Innodb_buffer_pool_*"). "waitingForLock / desc" names two fields;
 * "members[].stateStr" is the path members -> stateStr.
 */
export function fieldPaths(name: string): string[][] | null {
  const parts = name.split(/\s+\/\s+/).map((p) => p.trim());
  if (!parts.every((p) => PATH.test(p))) return null;
  return parts.map((p) => p.replace(/\[\]/g, '').split('.'));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether every segment of the path shows up as a whole word in the output (a column, key or variable name). */
export function outputHasPath(output: string, path: string[]): boolean {
  return path.every((seg) => new RegExp(`(^|[^\\w$])${escapeRe(seg)}([^\\w$]|$)`, 'm').test(output));
}

export type FieldStatus = 'pass' | 'fail' | 'skip' | 'unchecked';

export interface FieldResult {
  id: string; // the task's field id
  name: string; // this database's name for it
  status: FieldStatus;
  detail?: string;
}

export type CommandStatus = 'pass' | 'fail' | 'skip';

export interface CommandResult {
  cmd: string; // as written in the YAML, which is how the pages look it up
  expect?: Expect;
  status: CommandStatus;
  detail?: string; // why it failed, or why it was skipped
}

export interface EntryResult {
  setupError?: string;
  commands: CommandResult[];
  fields?: FieldResult[];
}

export interface RunResult {
  db: string;
  version: string; // matrix version, e.g. "8.0"
  server: string; // what the server reported, e.g. "8.0.44"
  image: string;
  ranAt: string;
  entries: Record<string, EntryResult>;
}

export interface EntryVerification {
  /** versions where every command of this entry behaved as expected */
  versions: string[];
  /** command text -> versions where it ran successfully, and whether the lab skips it */
  commands: Record<string, { verified: string[]; skipped: boolean }>;
  /** field id -> versions where the field showed up in the output */
  fields: Record<string, { verified: string[] }>;
}

/** Shape the site reads at build time. */
export interface Verification {
  generatedAt: string;
  runs: { db: string; version: string; server: string }[];
  /** entry id -> database -> what the lab found */
  entries: Record<string, Record<string, EntryVerification>>;
}

const byVersion = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Folds per-version runs into one file. A command counts as verified on a version only if it ran there as expected. */
export function merge(runs: RunResult[], now = new Date()): Verification {
  const out: Verification = { generatedAt: now.toISOString(), runs: [], entries: {} };
  for (const run of runs) {
    out.runs.push({ db: run.db, version: run.version, server: run.server });
    for (const [id, entry] of Object.entries(run.entries)) {
      const v = ((out.entries[id] ??= {})[run.db] ??= { versions: [], commands: {}, fields: {} });
      v.fields ??= {};
      // A version counts for the entry only if something actually ran there and nothing failed.
      const ran = entry.commands.some((c) => c.status !== 'skip');
      const clean =
        !entry.setupError && entry.commands.every((c) => c.status !== 'fail') && (entry.fields ?? []).every((f) => f.status !== 'fail');
      if (ran && clean) v.versions.push(run.version);
      for (const c of entry.commands) {
        const slot = (v.commands[c.cmd] ??= { verified: [], skipped: false });
        if (c.status === 'skip') slot.skipped = true;
        else if (c.status === 'pass' && c.expect === 'ok' && !entry.setupError) slot.verified.push(run.version);
      }
      for (const f of entry.fields ?? []) {
        const slot = (v.fields[f.id] ??= { verified: [] });
        if (f.status === 'pass') slot.verified.push(run.version);
      }
    }
  }
  out.runs.sort((a, b) => a.db.localeCompare(b.db) || byVersion(a.version, b.version));
  for (const dbs of Object.values(out.entries)) {
    for (const v of Object.values(dbs)) {
      v.versions.sort(byVersion);
      for (const slot of Object.values(v.commands)) slot.verified.sort(byVersion);
      for (const slot of Object.values(v.fields)) slot.verified.sort(byVersion);
    }
  }
  return out;
}
