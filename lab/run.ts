// Runs every command on the pages against real databases in Docker.
//
//   npm run lab                                   all databases and versions in data/databases.yaml
//   npm run lab -- --db mysql --version 8.0       one of them
//   npm run lab -- --db mysql --only kill-session one entry
//   npm run lab -- --keep                         leave containers running afterwards
//   npm run lab -- --matrix                       print the CI job matrix as JSON
//
// Results go to lab/results/<db>-<version>.json; `npm run lab:merge` turns them into what the site reads.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadDataset } from '../src/lib/data';
import { ENGINES } from './engines';
import { expectation, fill, labDatabase, type CommandResult, type EntryResult, type RunResult } from './plan';

const RESULTS_DIR = path.resolve('lab/results');

const { values: args } = parseArgs({
  options: {
    db: { type: 'string' },
    version: { type: 'string' },
    only: { type: 'string' },
    keep: { type: 'boolean', default: false },
    matrix: { type: 'boolean', default: false },
  },
});

const ds = loadDataset();
const targets = ds.databases
  .flatMap((d) => d.lab_versions.map((version) => ({ db: d.id, version })))
  .filter((t) => (!args.db || t.db === args.db) && (!args.version || t.version === args.version));

if (args.matrix) {
  console.log(JSON.stringify(targets));
  process.exit(0);
}
if (targets.length === 0) {
  console.error(`nothing to run for --db ${args.db ?? '*'} --version ${args.version ?? '*'}; versions come from lab_versions in data/databases.yaml`);
  process.exit(2);
}

const tail = (s: string, lines = 6) => s.split('\n').slice(-lines).join('\n');
const mark = { pass: '✓', fail: '✗', skip: '–' } as const;

async function runOne(db: string, version: string): Promise<{ result: RunResult; failures: number }> {
  const make = ENGINES[db];
  if (!make) throw new Error(`the lab does not know how to run "${db}" yet (see lab/engines.ts)`);
  const engine = make(version);
  console.log(`\n▶ ${db} ${version} (${engine.image})`);
  await engine.start();
  let failures = 0;
  try {
    const server = await engine.serverVersion();
    console.log(`  server ${server}`);
    const entries: Record<string, EntryResult> = {};
    for (const m of ds.mappings) {
      const d = m.databases[db];
      if (!d || d.commands.length === 0 || (args.only && m.id !== args.only)) continue;
      const database = labDatabase(m.id);
      const vars = d.verify?.vars ?? {};
      const entry: EntryResult = { commands: [] };
      entries[m.id] = entry;

      await engine.createDatabase(database);
      if (d.verify?.setup) {
        const f = fill(d.verify.setup, vars);
        const r = f.missing.length ? { ok: false, out: `unfilled placeholders: ${f.missing.join(', ')}` } : await engine.exec(f.text, database);
        if (!r.ok) entry.setupError = tail(r.out);
      }

      for (const c of d.commands) {
        let res: CommandResult;
        if (c.skip) {
          res = { cmd: c.cmd, status: 'skip', detail: c.skip.zh };
        } else {
          const expect = expectation(c, server);
          const f = fill(c.cmd, vars);
          if (entry.setupError) {
            res = { cmd: c.cmd, expect, status: 'fail', detail: `setup failed:\n${entry.setupError}` };
          } else if (f.missing.length) {
            res = { cmd: c.cmd, expect, status: 'fail', detail: `unfilled placeholders <${f.missing.join('>, <')}>: add them to verify.vars, or skip the command with a reason` };
          } else {
            const r = await engine.exec(f.text, database);
            const pass = r.ok === (expect === 'ok');
            res = {
              cmd: c.cmd,
              expect,
              status: pass ? 'pass' : 'fail',
              detail: pass
                ? undefined
                : expect === 'ok'
                  ? `should work on ${server} but failed:\n${tail(r.out)}`
                  : `should fail on ${server} (outside since/removed_in) but worked`,
            };
          }
        }
        if (res.status === 'fail') failures++;
        entry.commands.push(res);
        const note = res.status === 'pass' && res.expect === 'error' ? '  (fails as expected)' : '';
        console.log(`  ${mark[res.status]} ${m.id.padEnd(22)} ${c.cmd}${note}`);
        if (res.status === 'fail') console.log(`      ${res.detail!.replace(/\n/g, '\n      ')}`);
      }

      if (d.verify?.teardown) await engine.exec(fill(d.verify.teardown, vars).text, database);
    }
    return { result: { db, version, server, image: engine.image, ranAt: new Date().toISOString(), entries }, failures };
  } finally {
    if (!args.keep) await engine.stop();
  }
}

let failed = 0;
fs.mkdirSync(RESULTS_DIR, { recursive: true });
for (const t of targets) {
  try {
    const { result, failures } = await runOne(t.db, t.version);
    // A partial run (--only) must not replace the full results the site is built from.
    if (!args.only) fs.writeFileSync(path.join(RESULTS_DIR, `${t.db}-${t.version}.json`), JSON.stringify(result, null, 2) + '\n');
    console.log(`  ${failures ? `✗ ${failures} failed` : '✓ all as expected'}`);
    failed += failures;
  } catch (e) {
    console.error(`  ✗ ${t.db} ${t.version} could not run: ${(e as Error).message}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
