// The home page's translator: paste a command (or say what you want to do) on one side, get the other
// database's commands for the reader's version, with what the lab proved about them.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cmdOnLine, type CmdOnLine } from '../lib/proof';
import { createSearcher, type SearchDoc } from '../lib/search';
import type { TCmd, TEntry, TSide } from '../lib/translate';
import { looksLikeCommand, matchCommand, pickForLine, sideEq } from '../lib/translate-match';
import { fmt, onPrefChange, readPref, writePref, type Pref } from '../lib/version-pref';

type Labels = Record<string, string> & {
  badge: Record<string, string>;
  avail: Record<string, string>;
};

interface Db {
  id: string;
  name: string;
  vers: string[];
  /** color: source blue, target green, then a third, fourth and fifth color */
  role: 'source' | 'target' | 'third' | 'fourth' | 'fifth';
}

interface Props {
  docs: SearchDoc[];
  entries: Record<string, TEntry>;
  /** the databases the site shows, the pair first */
  dbs: Db[];
  tries: string[];
  /** link prefix for entries, e.g. "/dba-command-finder/zh/" */
  entryBase: string;
  /** new-issue URL up to "?title=" */
  issueBase: string;
  L: Labels;
}

function readParam(name: string): string {
  try {
    return new URLSearchParams(window.location.search).get(name) ?? '';
  } catch {
    return '';
  }
}

export default function Translator({ docs, entries, dbs, tries, entryBase, issueBase, L }: Props) {
  const searcher = useMemo(() => createSearcher(docs), [docs]);
  const options = useMemo(() => Object.fromEntries(dbs.map((d) => [d.id, d.vers])), [dbs]);
  const ids = dbs.map((d) => d.id);
  const [q, setQ] = useState(tries[0] ?? '');
  const [typed, setTyped] = useState(false);
  // The reader's choice of databases, [from, to]; a pasted command overrides "from".
  const [pick, setPick] = useState<[string, string]>([dbs[0].id, dbs[1].id]);
  const [pref, setPref] = useState<Pref>({});
  const [copied, setCopied] = useState('');
  // The task a database pick restated the input for: a command such as INFO replication belongs to several
  // tasks, and the translation should stay on the one the reader was looking at. Typing clears it.
  const [anchor, setAnchor] = useState('');

  useEffect(() => {
    setPref(readPref(options));
    return onPrefChange(setPref);
  }, [options]);

  // ?q= makes a translation shareable, and is where the header's search shortcut lands.
  useEffect(() => {
    const initial = readParam('q');
    if (initial) {
      setQ(initial);
      setTyped(true);
    }
  }, []);
  useEffect(() => {
    if (!typed) return;
    try {
      const url = new URL(window.location.href);
      if (q.trim()) url.searchParams.set('q', q);
      else url.searchParams.delete('q');
      window.history.replaceState(null, '', url);
    } catch {
      /* history unavailable */
    }
  }, [q, typed]);

  const results = useMemo(() => (q.trim() ? searcher.search(q, 6) : []), [searcher, q]);
  const anchored = anchor && entries[anchor] && matchCommand(q, entries[anchor], ids) ? anchor : '';
  const topId = anchored || results[0]?.id || '';
  const best: TEntry | undefined = topId ? entries[topId] : undefined;
  const match = best ? matchCommand(q, best, ids) : undefined;
  // A command none of the entries has is not "close enough" to another task: say so, and list what is near.
  const top = match || !looksLikeCommand(q) ? best : undefined;
  const nearby = top ? [] : results.slice(0, 3);
  // A pasted command decides which database it is from; the reader picks the other side.
  const fromId = match ? match.db : pick[0];
  const toId = pick[1] !== fromId ? pick[1] : pick[0] !== fromId ? pick[0] : ids.find((x) => x !== fromId)!;
  const from = dbs.find((d) => d.id === fromId)!;
  const to = dbs.find((d) => d.id === toId)!;
  const fromLine = pref[from.id] ?? '';
  const toLine = pref[to.id] ?? '';
  const fromSide = top?.sides[from.id];
  const toSide = top?.sides[to.id];
  const eq = top ? sideEq(fromSide, toSide) : undefined;
  const picks = toSide && eq !== 'none' ? pickForLine(toSide, toLine, to.vers) : undefined;

  const setLine = (db: string, line: string) => writePref({ ...readPref(options), [db]: line });
  const type = (text: string) => {
    setQ(text);
    setTyped(true);
  };
  // The same task's command in another database, for the reader's version of it; the task's title
  // when that database cannot do it (typing a description rather than a command lets "from" follow the pick).
  const restate = (entry: TEntry, id: string) => {
    const side = entry.sides[id];
    const db = dbs.find((d) => d.id === id)!;
    const cmd = side && side.support !== 'none' ? pickForLine(side, pref[id] ?? '', db.vers).usable[0]?.cmd.cmd : undefined;
    return cmd ?? entry.title;
  };
  const swap = () => {
    // A pasted command decides "from", so swapping also swaps the text to the other side's command.
    if (match && top) {
      setAnchor(topId);
      type(restate(top, toId));
    }
    setPick([toId, fromId]);
  };
  // Picking the database the other side shows swaps the two. Picking a new "from" while a command is
  // pasted restates it in that database, or the pasted command would keep deciding "from" and the pick would do nothing.
  const choose = (side: 0 | 1, id: string) => {
    if ((side === 0 && id === toId) || (side === 1 && id === fromId)) return swap();
    if (side === 1) return setPick([fromId, id]);
    if (match && top && id !== match.db) {
      setAnchor(topId);
      type(restate(top, id));
    }
    setPick([id, toId]);
  };
  const copy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const status = match && fromLine ? sourceStatus(match.cmd, fromSide!, from, fromLine, L) : undefined;
  const servers = (side?: TSide) => Object.fromEntries((side?.cmds ?? []).flatMap((c) => c.runs.map((r) => [r[0], r[1]])));

  return (
    <section className="tr" aria-label={L.inputLabel}>
      <div className="tr-grid">
        <div className="tr-pane">
          <PaneHead db={from} dbs={dbs} label={L.fromDb} onPick={(id) => choose(0, id)} line={fromLine} setLine={setLine} L={L}>
            <button type="button" className="tr-swap" onClick={swap}>
              {L.swap}
            </button>
          </PaneHead>
          <label htmlFor="tr-in" className="sr-only">
            {L.inputLabel}
          </label>
          <textarea
            id="tr-in"
            className="tr-input"
            value={q}
            onChange={(e) => {
              setAnchor('');
              type(e.target.value);
            }}
            placeholder={L.placeholder}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            rows={3}
          />
          <div className="tr-below">
            {q.trim() && (
              <p className={top ? 'tr-recog' : 'tr-recog tr-miss'}>
                {top ? fmt(match ? L.recognizedCmd : L.recognizedTask, { title: top.title }) : L.notFound}
                {status?.kind === 'ok' && <span className="tr-recog-ok"> · {status.body}</span>}
              </p>
            )}
            {status && status.kind !== 'ok' && (
              <div className={`tr-status tr-status-${status.kind}`}>
                <strong>{status.head}</strong>
                <span>{status.body}</span>
                {status.alt && <code>{status.alt}</code>}
              </div>
            )}
          </div>
        </div>

        <div className="tr-pane tr-pane-out">
          <PaneHead db={to} dbs={dbs} label={L.toDb} onPick={(id) => choose(1, id)} line={toLine} setLine={setLine} L={L}>
            {eq && <span className={`badge badge-${eq}`}>{fmt(L.badge[eq], { db: to.name })}</span>}
          </PaneHead>
          <div className="tr-out" aria-live="polite">
            {!q.trim() && <p className="tr-hint">{L.empty}</p>}
            {q.trim() && !top && (
              <>
                <p className="tr-hint">{L.notFoundBody}</p>
                {nearby.length > 0 && (
                  <div className="tr-extras">
                    <span className="tr-extras-title">{L.nearby}</span>
                    {nearby.map((d) => (
                      <a key={d.id} className="tr-extra" href={entryBase + d.slug + '/'}>
                        <span>{d.title}</span>
                        <code>{entries[d.id]?.sides[from.id]?.cmds[0]?.cmd ?? ''}</code>
                      </a>
                    ))}
                  </div>
                )}
                <a className="tr-submit" href={issueBase + encodeURIComponent(fmt(L.submitTitle, { q: q.trim(), db: from.name, line: fromLine || L.all }))}>
                  {L.submit}
                </a>
                <p className="tr-small">{L.submitNote}</p>
              </>
            )}
            {eq === 'missing' && <p className="tr-hint">{fmt(L.missing, { db: to.name })}</p>}
            {eq === 'none' && toSide && (
              <>
                <p className="tr-body">{toSide.notes[0] ?? fmt(L.noneBody, { db: to.name })}</p>
                {toSide.alternatives.some((a) => a.cmd) && (
                  <div className="tr-extras">
                    <span className="tr-extras-title">{L.alternatives}</span>
                    {toSide.alternatives
                      .filter((a) => a.cmd)
                      .map((a) => (
                        <div key={a.cmd} className="tr-extra">
                          <span>{a.title}</span>
                          <code>{a.cmd}</code>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
            {picks && (
              <>
                {picks.usable.map(({ cmd, on }) => (
                  <div key={cmd.cmd} className="tr-cmd">
                    <code>{cmd.cmd}</code>
                    <button type="button" className="copy" onClick={() => copy(cmd.cmd)}>
                      {copied === cmd.cmd ? L.copied : L.copy}
                    </button>
                    {on.state === 'deprecated' && <span className="tr-tag">{fmt(L.avail.deprecatedAt, { v: on.version })}</span>}
                  </div>
                ))}
                {picks.unusable.map(({ cmd, on }) => (
                  <div key={cmd.cmd} className="tr-cmd tr-cmd-gone">
                    <code>{cmd.cmd}</code>
                    <span className="tr-tag">{goneTag(on, toLine, L)}</span>
                  </div>
                ))}
                {(eq === 'approx' || eq === 'only') && toSide!.notes.length > 0 && (
                  <p className="tr-body">
                    <strong>{L.why}：</strong>
                    {toSide!.notes[0]}
                  </p>
                )}
              </>
            )}
            {top && (
              <a className="tr-open" href={entryBase + top.slug + '/'}>
                {L.openEntry}
              </a>
            )}
          </div>
        </div>
      </div>

      {top && (fromSide?.cmds.length || toSide?.cmds.length || top.fields.length) ? (
        <div className={`tr-ev${top.fields.length ? ' tr-ev-2' : ''}`}>
          {(fromSide?.cmds.length || toSide?.cmds.length) ? (
            <div className="tr-ev-col">
              <h3>{L.evVersions}</h3>
              {fromSide && fromSide.cmds.length > 0 && <VersionTable side={fromSide} db={from} line={fromLine} L={L} />}
              {toSide && toSide.cmds.length > 0 && <VersionTable side={toSide} db={to} line={toLine} L={L} />}
            </div>
          ) : null}
          {top.fields.length > 0 && (
            <div className="tr-ev-col">
              <h3>{L.evFields}</h3>
              {top.fields.slice(0, 4).map((f) => (
                <div key={f.name} className="tr-field">
                  <strong>{f.name}</strong>
                  {[from, to].map((d) =>
                    f.names[d.id] ? (
                      <span key={d.id} className="tr-field-row">
                        <span className="tr-field-db">{d.name}</span>
                        <code>{f.names[d.id]}</code>
                        {f.checked[d.id] ? (
                          <span className="tr-mark tr-mark-ok" title={fmt(L.fieldChecked, { v: f.checked[d.id] })}>
                            ✓
                          </span>
                        ) : (
                          <span className="tr-mark">{L.noFieldCheck}</span>
                        )}
                      </span>
                    ) : null,
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <p className="tr-tries">
        <span>{L.tries}</span>
        {tries.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => {
              setAnchor('');
              type(x);
            }}
          >
            {x}
          </button>
        ))}
      </p>
      {top && results.length > 1 && (
        <div className="tr-more">
          <h3>{L.otherMatches}</h3>
          {results
            .filter((d) => d.id !== topId)
            .slice(0, 4)
            .map((d) => {
            const e = entries[d.id];
            const a = e?.sides[from.id]?.cmds[0]?.cmd;
            const b = e?.sides[to.id]?.cmds[0]?.cmd;
            return (
              <a key={d.id} href={entryBase + d.slug + '/'} className="tr-more-row">
                <span>{d.title}</span>
                <code>{a ?? '—'}</code>
                <code>{b ?? '—'}</code>
              </a>
            );
          })}
        </div>
      )}

    </section>
  );
}

function PaneHead({
  db,
  dbs,
  label,
  onPick,
  line,
  setLine,
  L,
  children,
}: {
  db: Db;
  dbs: Db[];
  /** accessible name of the database picker */
  label: string;
  onPick: (id: string) => void;
  line: string;
  setLine: (db: string, line: string) => void;
  L: Labels;
  children?: ReactNode;
}) {
  return (
    <div className="tr-head">
      <select className={`tr-db side-${db.role}`} aria-label={label} value={db.id} onChange={(e) => onPick(e.target.value)}>
        {dbs.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <span className="seg" role="group" aria-label={fmt(L.versionsOf, { db: db.name })}>
        {['', ...db.vers].map((v) => (
          <button key={v || 'all'} type="button" data-line={v} aria-pressed={line === v} onClick={() => setLine(db.id, v)}>
            {v || L.all}
          </button>
        ))}
      </span>
      {children}
    </div>
  );
}

/** One database's commands against its lab versions: the server each ran on, or why it is not there. */
function VersionTable({ side, db, line, L }: { side: TSide; db: Db; line: string; L: Labels }) {
  return (
    <div className="tr-vt" style={{ ['--cols' as string]: db.vers.length }}>
      <span className={`tr-vt-db side-${db.role}`}>{db.name}</span>
      {db.vers.map((v) => (
        <span key={v} className={`tr-vt-head${v === line ? ' ver-mine' : ''}`}>
          {v}
        </span>
      ))}
      {side.cmds.slice(0, 4).map((c) => (
        <VersionRow key={c.cmd} c={c} vers={db.vers} line={line} L={L} />
      ))}
    </div>
  );
}

function VersionRow({ c, vers, line, L }: { c: TCmd; vers: string[]; line: string; L: Labels }) {
  return (
    <>
      <code className="tr-vt-cmd">{c.cmd}</code>
      {c.skip ? (
        <span className="tr-vt-skip">{fmt(L.skip, { why: c.skip })}</span>
      ) : (
        vers.map((v) => {
          const on = cmdOnLine(c, v);
          const server = c.runs.find((r) => r[0] === v)?.[1];
          const mark = { ok: '✓', deprecated: '⚠', 'not-yet': '—', removed: '✕' }[on.state];
          const note =
            on.state === 'ok'
              ? on.since
                ? fmt(L.avail.since, { v: on.since })
                : ''
              : on.state === 'deprecated'
                ? fmt(L.avail.deprecatedAt, { v: on.version })
                : on.state === 'not-yet'
                  ? fmt(L.avail.since, { v: on.version })
                  : fmt(L.avail.removedAt, { v: on.version });
          return (
            <span key={v} className={`tr-vt-cell tr-vt-${on.state}${v === line ? ' ver-mine' : ''}`}>
              <span className="tr-vt-run">
                {mark} {on.state === 'ok' || on.state === 'deprecated' ? (server ?? L.unproven) : ''}
              </span>
              {note && <span className="tr-vt-note">{note}</span>}
            </span>
          );
        })
      )}
    </>
  );
}

/** Why a command is struck: on the reader's line, or (no line chosen) when it went away or arrives. */
function goneTag(on: CmdOnLine, line: string, L: Labels): string {
  if (on.state === 'removed') return line ? fmt(L.gone, { line }) : fmt(L.avail.removedAt, { v: on.version });
  if (on.state === 'not-yet') return line ? fmt(L.notYet, { line, v: on.version }) : fmt(L.avail.since, { v: on.version });
  return '';
}

/** What the pasted command does on the reader's version of its database. */
function sourceStatus(c: TCmd, side: TSide, db: Db, line: string, L: Labels) {
  const on = cmdOnLine(c, line);
  const alt = pickForLine(side, line, db.vers).usable.find((p) => p.on.state === 'ok' && p.cmd.cmd !== c.cmd)?.cmd.cmd;
  if (on.state === 'ok') {
    const run = c.runs.find((r) => r[0] === line && r[2] === 'ok');
    return run ? { kind: 'ok', head: L.okHead, body: fmt(L.okInline, { db: db.name, server: run[1] }), alt: undefined } : undefined;
  }
  if (on.state === 'deprecated') {
    return { kind: 'dep', head: L.depHead, body: fmt(L.depBody, { v: on.version }) + (alt ? fmt(L.altBody, { line }) : ''), alt };
  }
  const head = fmt(on.state === 'removed' ? L.goneHead : L.notYetHead, { db: db.name, line });
  const body = (on.state === 'not-yet' ? fmt(L.notYetBody, { v: on.version }) : '') + (alt ? fmt(L.altBody, { line }) : '');
  return { kind: 'gone', head, body, alt };
}

