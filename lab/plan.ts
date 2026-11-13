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

/** A database name the lab can create for one entry: letters, digits, underscores. */
export function labDatabase(id: string): string {
  return `lab_${id.replace(/[^a-z0-9]/gi, '_')}`;
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
      const v = ((out.entries[id] ??= {})[run.db] ??= { versions: [], commands: {} });
      // A version counts for the entry only if something actually ran there and nothing failed.
      const ran = entry.commands.some((c) => c.status !== 'skip');
      const clean = !entry.setupError && entry.commands.every((c) => c.status !== 'fail');
      if (ran && clean) v.versions.push(run.version);
      for (const c of entry.commands) {
        const slot = (v.commands[c.cmd] ??= { verified: [], skipped: false });
        if (c.status === 'skip') slot.skipped = true;
        else if (c.status === 'pass' && c.expect === 'ok' && !entry.setupError) slot.verified.push(run.version);
      }
    }
  }
  out.runs.sort((a, b) => a.db.localeCompare(b.db) || byVersion(a.version, b.version));
  for (const dbs of Object.values(out.entries)) {
    for (const v of Object.values(dbs)) {
      v.versions.sort(byVersion);
      for (const slot of Object.values(v.commands)) slot.verified.sort(byVersion);
    }
  }
  return out;
}
