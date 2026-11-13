import type { Dataset } from './data';
import { t, tList, type Lang } from './i18n';
import { normalize, type SearchDoc } from './search';

/** Flattens the dataset into what the search box needs, in one language. */
export function toSearchDocs(ds: Dataset, lang: Lang): SearchDoc[] {
  const catName = new Map(ds.categories.map((c) => [c.id, t(c.name, lang)]));
  return ds.mappings.map((m) => {
    const category = catName.get(m.category) ?? m.category;
    const keywords = [...tList(m.keywords, lang), ...(lang === 'zh' ? (m.keywords.en ?? []) : m.keywords.zh)];
    return {
      id: m.id,
      slug: m.slug,
      title: t(m.title, lang),
      category,
      equivalence: m.equivalence,
      deprecated: m.status === 'deprecated',
      mysql: m.mysql[0].cmd,
      mongodb: m.mongodb[0]?.cmd ?? '',
      n_cmds: [...m.mysql, ...m.mongodb].map((c) => normalize(c.cmd)),
      n_title: normalize(t(m.title, lang)),
      n_keywords: keywords.map(normalize),
      n_category: normalize(category),
      n_summary: normalize(t(m.summary, lang)),
    };
  });
}
