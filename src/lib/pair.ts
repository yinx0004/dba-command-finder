// Compares two databases for one task. Kept free of Node APIs.
import type { DatabaseEntry, Mapping, Text } from './schema';

/**
 * exact    both databases fully support the task
 * approx   the target can do it, with differences
 * none     the target cannot do it
 * missing  the target has not been written up for this task yet
 */
export type Equivalence = 'exact' | 'approx' | 'none' | 'missing';

export function equivalence(source: DatabaseEntry | undefined, target: DatabaseEntry | undefined): Equivalence {
  if (!target) return 'missing';
  if (target.support === 'none') return 'none';
  if (source?.support === 'full' && target.support === 'full') return 'exact';
  return 'approx';
}

export interface FieldRow {
  id: string;
  name?: Text;
  source?: string;
  target?: string;
  /** the target's note wins: it is what a reader moving to the target needs */
  note?: Text;
}

function nameOf(f: DatabaseEntry['fields'][string] | undefined): { name?: string; note?: Text } {
  if (!f) return {};
  return typeof f === 'string' ? { name: f } : f;
}

/** Field-by-field comparison, built from each database's mapping onto the task's fields. */
export function fieldRows(m: Pick<Mapping, 'fields' | 'databases'>, source: string, target: string): FieldRow[] {
  const s = m.databases[source];
  const t = m.databases[target];
  return m.fields
    .map((f) => {
      const sf = nameOf(s?.fields[f.id]);
      const tf = nameOf(t?.fields[f.id]);
      return { id: f.id, name: f.name, source: sf.name, target: tf.name, note: tf.note ?? sf.note };
    })
    .filter((r) => r.source || r.target);
}
