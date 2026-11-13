import type { Dataset, Entry } from './data';
import { t, tList, type Lang } from './i18n';
import { equivalence } from './pair';
import { normalize, type SearchDoc } from './search';

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
    const keywords = [...tList(m.keywords, lang), ...(lang === 'zh' ? (m.keywords.en ?? []) : m.keywords.zh)];
    const s = m.databases[source];
    const tg = m.databases[target];
    return {
      id: m.id,
      slug: m.slug,
      title: t(m.title, lang),
      category,
      equivalence: equivalence(s, tg),
      deprecated: m.status === 'deprecated',
      source: s.commands[0]?.cmd ?? '',
      target: tg?.commands[0]?.cmd ?? '',
      n_cmds: Object.values(m.databases).flatMap((d) => d.commands.map((c) => normalize(c.cmd))),
      n_title: normalize(t(m.title, lang)),
      n_keywords: keywords.map(normalize),
      n_category: normalize(category),
      n_summary: normalize(t(m.summary, lang)),
    };
  });
}
