// The reader's chosen version line per database ("" = all versions), shared by the version bar,
// the pages and the search box. Browser-only; every storage access is guarded because it can throw.

export type Pref = Record<string, string>; // database id -> version line

const KEY = 'dba-versions';
const EVENT = 'dba:versions';

/** Saved choice, overridden by ?mysql=5.7&mongodb=6.0 in the URL. Unknown lines are ignored. */
export function readPref(options: Record<string, string[]>): Pref {
  const pref: Pref = {};
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Pref;
    for (const [db, line] of Object.entries(saved)) if (options[db]?.includes(line)) pref[db] = line;
  } catch {
    /* storage unavailable */
  }
  try {
    const params = new URLSearchParams(window.location.search);
    for (const db of Object.keys(options)) {
      const line = params.get(db);
      if (line !== null) pref[db] = options[db].includes(line) ? line : '';
    }
  } catch {
    /* no URL */
  }
  return pref;
}

/** Saves the choice, keeps version params already in the URL in step, and tells the page. */
export function writePref(pref: Pref): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pref));
  } catch {
    /* storage unavailable */
  }
  try {
    const url = new URL(window.location.href);
    let touched = false;
    for (const [db, line] of Object.entries(pref)) {
      if (!url.searchParams.has(db)) continue;
      touched = true;
      if (line) url.searchParams.set(db, line);
      else url.searchParams.delete(db);
    }
    if (touched) window.history.replaceState(null, '', url);
  } catch {
    /* history unavailable */
  }
  window.dispatchEvent(new CustomEvent<Pref>(EVENT, { detail: pref }));
}

export function onPrefChange(fn: (pref: Pref) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<Pref>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Fills "{line}" / "{v}" in a label template. */
export function fmt(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
}
