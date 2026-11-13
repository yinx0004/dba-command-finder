// Lab results for the pages. lab/verification.json is produced by `npm run lab` + `npm run lab:merge`
// (in CI, by the lab jobs); without it every page says the commands are not verified yet.
import fs from 'node:fs';
import path from 'node:path';
import type { EntryVerification, Verification } from '../../lab/plan';

const FILE = path.resolve('lab/verification.json');

let cached: Verification | null | undefined;

export function loadVerification(): Verification | null {
  if (cached !== undefined) return cached;
  cached = fs.existsSync(FILE) ? (JSON.parse(fs.readFileSync(FILE, 'utf8')) as Verification) : null;
  return cached;
}

/** What the lab found for one database of one entry, or undefined when it has not run. */
export function entryVerification(id: string, db: string): EntryVerification | undefined {
  return loadVerification()?.entries[id]?.[db];
}

export type { EntryVerification };
