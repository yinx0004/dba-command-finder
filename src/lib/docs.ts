import type { Dataset, Entry } from './data';
import { t, tList, type Lang } from './i18n';
import { equivalence } from './pair';
import { roleNames } from './roles';
import type { Database, DatabaseEntry } from './schema';
import { normalize, type SearchDoc, type VersionedCmd } from './search';

/** One side's commands with their version ranges, for picking the one a reader's version can use. */
export function versionedCmds(d: DatabaseEntry | undefined): VersionedCmd[] {
  return (d?.commands ?? []).map((c) => ({ cmd: c.cmd, since: c.since, removed_in: c.removed_in }));
}

/** Which color a database is drawn in: the pair's source blue, its target green, any other in a third color. */
export type Role = 'source' | 'target' | 'third';

/** The databases the site shows: the pair first, then the others the lab runs, in data/databases.yaml order. */
export function siteDbs(ds: Dataset): { def: Database; role: Role }[] {
  const { source, target } = ds.site.pair;
  const order = [source, target, ...ds.databases.map((d) => d.id).filter((id) => id !== source && id !== target)];
  return order
    .map((id) => ds.databases.find((d) => d.id === id)!)
    .filter((d) => d.lab_versions.length)
    .map((def, i) => ({ def, role: i === 0 ? 'source' : i === 1 ? 'target' : 'third' }));
}

/** Mappings the site's pair can show: those written up for the source database. */
export function pairMappings(ds: Dataset): Entry[] {
  return ds.mappings.filter((m) => m.databases[ds.site.pair.source]);
}

/** Flattens the dataset into what the search box needs, for the site's pair, in one language. */
export function toSearchDocs(ds: Dataset, lang: Lang): SearchDoc[] {
  const { source, target } = ds.site.pair;
  const catName = new Map(ds.categories.map((c) => [c.id, t(c.name, lang)]));
  return pairMappings(ds).map((m) => {
    const category = catName.get(m.category) ?? m.category;
    // Role names ("mongos", "config server") make "mongos 连接数" find entries written per role.
    const roles = Object.entries(m.databases).flatMap(([db, d]) => {
      const def = ds.databases.find((x) => x.id === db);
      return d.commands.flatMap((c) => roleNames(c, def));
    });
    const keywords = [...tList(m.keywords, lang), ...(lang === 'zh' ? (m.keywords.en ?? []) : m.keywords.zh), ...new Set(roles)];
    const s = m.databases[source];
    const tg = m.databases[target];
    return {
      id: m.id,
      slug: m.slug,
      title: t(m.title, lang),
      category,
      categoryId: m.category,
      equivalence: equivalence(s, tg),
      deprecated: m.status === 'deprecated',
      source: s.commands[0]?.cmd ?? '',
      target: tg?.commands[0]?.cmd ?? '',
      sourceCmds: versionedCmds(s),
      targetCmds: versionedCmds(tg),
      n_cmds: Object.values(m.databases).flatMap((d) => d.commands.map((c) => normalize(c.cmd))),
      n_title: normalize(t(m.title, lang)),
      n_keywords: keywords.map(normalize),
      n_category: normalize(category),
      n_summary: normalize(t(m.summary, lang)),
    };
  });
}
