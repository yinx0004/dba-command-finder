// Folds lab/results/*.json into lab/verification.json, which the site reads at build time.
import fs from 'node:fs';
import path from 'node:path';
import { merge, type RunResult } from './plan';

const dir = path.resolve('lab/results');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
if (files.length === 0) {
  console.error('no lab results in lab/results; run `npm run lab` first');
  process.exit(1);
}
const runs = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RunResult);
const out = merge(runs);
fs.writeFileSync(path.resolve('lab/verification.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`lab/verification.json: ${out.runs.map((r) => `${r.db} ${r.version} (${r.server})`).join(', ')}`);
