// The translator's decisions, kept apart from the component so they can be tested:
// which command the reader pasted, which commands a version can run, and how the two sides compare.
import type { Equivalence } from './pair';
import { cmdOnLine, type CmdOnLine } from './proof';
import { normalize } from './search';
import type { TCmd, TEntry, TSide } from './translate';

/**
 * The command of the entry the reader typed, on either side: an exact match first, then a command
 * whose fixed part ("ALTER TABLE" before "<table>") starts the input, or that the input starts.
 */
export function matchCommand(q: string, entry: TEntry, dbs: string[]): { db: string; cmd: TCmd } | undefined {
  const nq = normalize(q);
  if (nq.length < 3) return undefined;
  const all = dbs.flatMap((db) => (entry.sides[db]?.cmds ?? []).map((cmd) => ({ db, cmd })));
  const exact = all.find((x) => normalize(x.cmd.cmd) === nq);
  if (exact) return exact;
  return all.find((x) => {
    const full = normalize(x.cmd.cmd);
    const head = normalize(x.cmd.cmd.split('<')[0]);
    return (head.length >= 4 && nq.startsWith(head)) || (nq.length >= 4 && full.startsWith(nq));
  });
}

// Statement words and shell prefixes: input that starts with one of these, or has code punctuation, is a command.
const COMMAND_START = /^(show|select|set|alter|create|drop|kill|grant|revoke|flush|optimize|analyze|purge|install|truncate|explain|db\.|rs\.|sh\.)\b/i;

/** Whether the input reads as a command rather than a description of a task. */
export function looksLikeCommand(q: string): boolean {
  const s = q.trim();
  return COMMAND_START.test(s) || /[;(){}@\\]/.test(s);
}

export interface Picked {
  cmd: TCmd;
  on: CmdOnLine;
}

/**
 * A side's commands for a version line: usable ones (current before deprecated), then the ones it cannot run.
 * Without a line, a command is usable when some lab version runs it; one no lab version runs is judged on the newest.
 */
export function pickForLine(side: TSide, line: string, vers: string[]): { usable: Picked[]; unusable: Picked[] } {
  const runs = (s: CmdOnLine) => s.state === 'ok' || s.state === 'deprecated';
  const all = side.cmds.map((cmd) => {
    if (line) return { cmd, on: cmdOnLine(cmd, line) };
    const anywhere = vers.length === 0 || vers.some((v) => runs(cmdOnLine(cmd, v)));
    return { cmd, on: anywhere ? ({ state: 'ok' } as CmdOnLine) : cmdOnLine(cmd, vers[vers.length - 1]) };
  });
  return {
    usable: [...all.filter((x) => x.on.state === 'ok'), ...all.filter((x) => x.on.state === 'deprecated')],
    unusable: all.filter((x) => x.on.state === 'not-yet' || x.on.state === 'removed'),
  };
}

/** How the target side compares with the source side, whichever way the reader is translating. */
export function sideEq(from: TSide | undefined, to: TSide | undefined): Equivalence {
  if (!to) return 'missing';
  if (to.support === 'none') return 'none';
  if (from?.support === 'none') return 'only';
  if (from?.support === 'full' && to.support === 'full') return 'exact';
  return 'approx';
}
