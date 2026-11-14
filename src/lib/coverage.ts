// Rows of the coverage matrix (home page, category pages): for each database of the pair, one strip
// segment per lab version saying whether the task can be done there, and a sentence on what changes.
import type { Entry } from './data';
import { versionedCmds } from './docs';
import { t, UI, type Lang } from './i18n';
import { equivalence, type Equivalence } from './pair';
import { cmdOnLine } from './proof';
import type { Database, DatabaseEntry } from './schema';
import { compareVersions, lineOf } from './version';

export type Seg = DatabaseEntry['support'];

/** One segment per version line: the side's support where some command runs, 'none' where none does. */
export function strip(d: DatabaseEntry | undefined, lines: string[]): Seg[] {
  return lines.map((line) => {
    if (!d || d.support === 'none') return 'none';
    const runs = d.commands.some((c) => {
      const s = cmdOnLine(c, line).state;
      return s === 'ok' || s === 'deprecated';
    });
    return runs ? d.support : 'none';
  });
}

/**
 * What changes across the lab's versions, in one sentence ("SHOW REPLICA STATUS：8.0.22 起"); for a side
 * that cannot do the task, why. Boundaries before the first lab version are left out: nobody reading has them.
 */
export function stripNote(d: DatabaseEntry | undefined, lines: string[], lang: Lang): string {
  if (!d) return '';
  if (d.support === 'none') return d.notes[0] ? t(d.notes[0], lang) : '';
  const a = UI[lang].proof.avail;
  const after = (x?: string) => !!x && compareVersions(lineOf(x), lines[0]) > 0;
  const bare = (cmd: string) => cmd.replace(/\s*(\\G|;)\s*$/, '');
  return d.commands
    .filter((c) => after(c.since) || after(c.deprecated_in) || after(c.removed_in))
    .map((c) => {
      const when = [after(c.since) && a.since(c.since!), after(c.deprecated_in) && a.deprecatedAt(c.deprecated_in!), after(c.removed_in) && a.removedAt(c.removed_in!)];
      return `${bare(c.cmd)}：${when.filter(Boolean).join('，')}`;
    })
    .join('；');
}

export interface CoverageCell {
  db: string; // id
  name: string; // "MySQL"
  segs: Seg[];
  note: string;
  /** every command with its version range, for picking the one the reader's version can use; '' when none */
  pick: string;
  /** the first command, shown until the reader's version picks one */
  cmd: string;
  /** whether the entry has this database written up at all */
  written: boolean;
}

export interface CoverageRow {
  id: string;
  title: string;
  slug: string;
  eq: Equivalence;
  deprecated: boolean;
  cells: CoverageCell[];
}

export function coverageRow(m: Entry, dbs: Database[], lang: Lang): CoverageRow {
  return {
    id: m.id,
    title: t(m.title, lang),
    slug: m.slug,
    eq: equivalence(m.databases[dbs[0].id], m.databases[dbs[1].id]),
    deprecated: m.status === 'deprecated',
    cells: dbs.map((db) => {
      const d = m.databases[db.id];
      const has = d && d.support !== 'none' && d.commands.length > 0;
      return {
        db: db.id,
        name: db.name,
        segs: strip(d, db.lab_versions),
        note: stripNote(d, db.lab_versions, lang),
        pick: has ? JSON.stringify(versionedCmds(d)) : '',
        cmd: has ? d.commands[0].cmd : '',
        written: !!d,
      };
    }),
  };
}
