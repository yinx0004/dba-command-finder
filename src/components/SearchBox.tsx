import { useEffect, useMemo, useRef, useState } from 'react';
import type { Equivalence } from '../lib/pair';
import { createSearcher, type SearchDoc } from '../lib/search';

interface Labels {
  searchLabel: string;
  placeholder: string;
  tryLabel: string;
  found: string; // "找到 {n} 条"
  noResultTitle: string;
  noResultBody: string;
  submitMapping: string;
  noResultTail: string;
  noEquivalent: string;
  eq: Record<Equivalence, string>;
}

interface Props {
  docs: SearchDoc[];
  sourceName: string;
  targetName: string;
  tries: string[];
  /** link prefix for entries, e.g. "/dba-command-finder/zh/" */
  entryBase: string;
  submitUrl: string;
  labels: Labels;
}

function readQuery(): string {
  try {
    return new URLSearchParams(window.location.search).get('q') ?? '';
  } catch {
    return '';
  }
}

export default function SearchBox({ docs, sourceName, targetName, tries, entryBase, submitUrl, labels }: Props) {
  const searcher = useMemo(() => createSearcher(docs), [docs]);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // Restore ?q= so a search can be shared as a link.
  useEffect(() => {
    const initial = readQuery();
    if (initial) setQ(initial);
  }, []);

  const results = useMemo(() => searcher.search(q), [searcher, q]);
  const searching = q.trim() !== '';

  useEffect(() => {
    if (searching) document.body.dataset.searching = '';
    else delete document.body.dataset.searching;
    try {
      const url = new URL(window.location.href);
      if (searching) url.searchParams.set('q', q);
      else url.searchParams.delete('q');
      window.history.replaceState(null, '', url);
    } catch {
      /* ignore: history may be unavailable in some embeds */
    }
  }, [q, searching]);

  return (
    <div>
      <div className="searchbox">
        <label htmlFor="q" className="sr-only">
          {labels.searchLabel}
        </label>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--muted)' }}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={input}
          id="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.placeholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
        />
      </div>
      <div className="tries">
        <span>{labels.tryLabel}</span>
        {tries.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setQ(t);
              input.current?.focus();
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {searching && (
        <section className="results" aria-live="polite">
          {results.length > 0 ? (
            <>
              <p className="muted" style={{ margin: '0 0 2px', fontSize: 14 }}>
                {labels.found.replace('{n}', String(results.length))}
              </p>
              {results.map((d) => (
                <a key={d.slug} className="card result" href={`${entryBase}${d.slug}/`}>
                  <div className="row-title">
                    <strong>{d.title}</strong>
                    <span className="tag">{d.category}</span>
                    <span className={`badge badge-${d.equivalence}`}>{labels.eq[d.equivalence]}</span>
                  </div>
                  <div className="pair">
                    <div>
                      <span className="side side-source">{sourceName}</span>
                      <span>{d.source}</span>
                    </div>
                    <div>
                      <span className="side side-target">{targetName}</span>
                      <span>{d.target || (d.equivalence === 'none' ? labels.noEquivalent : labels.eq.missing)}</span>
                    </div>
                  </div>
                </a>
              ))}
            </>
          ) : (
            <div className="empty">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{labels.noResultTitle}</div>
              <div className="muted">
                {labels.noResultBody} <a href={submitUrl}>{labels.submitMapping}</a>
                {labels.noResultTail}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
