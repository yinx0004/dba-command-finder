import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { Category, Database, Mapping, Redirect, Site } from './schema';
import type { z } from 'zod';

export const DATA_DIR = path.resolve(process.cwd(), 'data');

export type Entry = Mapping & {
  /** "category/id", also the URL path under a language */
  slug: string;
  /** path of the YAML file relative to the repo root */
  file: string;
};

export interface Dataset {
  mappings: Entry[];
  databases: Database[];
  categories: Category[];
  redirects: Redirect[];
  site: Site;
}

export interface RawMappingFile {
  file: string; // e.g. data/mappings/session/kill-session.yaml
  data: unknown;
}

export interface RawDataset {
  mappings: RawMappingFile[];
  databases: unknown;
  categories: unknown;
  redirects: unknown;
  site: unknown;
}

export class DataError extends Error {
  constructor(public problems: string[]) {
    super(`data/ has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
  }
}

function readYaml(file: string): unknown {
  return load(fs.readFileSync(file, 'utf8'));
}

export function readRaw(dir = DATA_DIR): RawDataset {
  const root = path.dirname(dir);
  const mappingsDir = path.join(dir, 'mappings');
  const mappings: RawMappingFile[] = [];
  for (const cat of fs.readdirSync(mappingsDir, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(mappingsDir, cat.name)).sort()) {
      if (!f.endsWith('.yaml')) continue;
      const abs = path.join(mappingsDir, cat.name, f);
      mappings.push({ file: path.relative(root, abs), data: readYaml(abs) });
    }
  }
  const opt = (name: string) => {
    const p = path.join(dir, name);
    return fs.existsSync(p) ? readYaml(p) : undefined;
  };
  return {
    mappings,
    databases: opt('databases.yaml'),
    categories: opt('categories.yaml'),
    redirects: opt('redirects.yaml'),
    site: opt('site.yaml'),
  };
}

function issues(prefix: string, err: z.ZodError): string[] {
  return err.issues.map((i) => `${prefix}: ${i.path.join('.') || '(root)'}: ${i.message}`);
}

function parseList<T>(schema: z.ZodType<T>, value: unknown, file: string, problems: string[]): T[] {
  const parsed = schema.array().safeParse(value ?? []);
  if (parsed.success) return parsed.data;
  problems.push(...issues(file, parsed.error));
  return [];
}

function uniqueIds(items: { id: string }[], file: string, problems: string[]): Set<string> {
  const ids = new Set<string>();
  for (const x of items) {
    if (ids.has(x.id)) problems.push(`${file}: duplicate id "${x.id}"`);
    ids.add(x.id);
  }
  return ids;
}

/** Validates everything that a schema alone cannot: file names, cross references, redirects. */
export function checkDataset(raw: RawDataset): { dataset: Dataset; problems: string[] } {
  const problems: string[] = [];

  const databases = parseList(Database, raw.databases, 'data/databases.yaml', problems);
  const dbIds = uniqueIds(databases, 'data/databases.yaml', problems);
  const categories = parseList(Category, raw.categories, 'data/categories.yaml', problems);
  const catIds = uniqueIds(categories, 'data/categories.yaml', problems);
  const redirects = parseList(Redirect, raw.redirects, 'data/redirects.yaml', problems);

  const siteParsed = Site.safeParse(raw.site ?? {});
  const site: Site = siteParsed.success ? siteParsed.data : { pair: { source: '', target: '' }, featured: [] };
  if (!siteParsed.success) problems.push(...issues('data/site.yaml', siteParsed.error));
  for (const db of [site.pair.source, site.pair.target]) {
    if (siteParsed.success && !dbIds.has(db)) problems.push(`data/site.yaml: pair database "${db}" is not in data/databases.yaml`);
  }

  const mappings: Entry[] = [];
  const byId = new Map<string, Entry>();
  for (const { file, data } of raw.mappings) {
    const parsed = Mapping.safeParse(data);
    if (!parsed.success) {
      problems.push(...issues(file, parsed.error));
      continue;
    }
    const m = parsed.data;
    if (JSON.stringify(data).includes('TODO')) problems.push(`${file}: still has TODO placeholders`);
    const parts = file.split(/[\\/]/);
    const fileId = parts[parts.length - 1].replace(/\.yaml$/, '');
    const dirCat = parts[parts.length - 2];
    if (m.id !== fileId) problems.push(`${file}: id "${m.id}" must match the file name "${fileId}"`);
    if (m.category !== dirCat) problems.push(`${file}: category "${m.category}" must match the folder "${dirCat}"`);
    if (!catIds.has(m.category)) problems.push(`${file}: category "${m.category}" is not in data/categories.yaml`);
    for (const db of Object.keys(m.databases)) {
      if (!dbIds.has(db)) problems.push(`${file}: database "${db}" is not in data/databases.yaml`);
    }
    if (byId.has(m.id)) {
      problems.push(`${file}: id "${m.id}" is already used by ${byId.get(m.id)!.file}`);
      continue;
    }
    const entry: Entry = { ...m, slug: `${m.category}/${m.id}`, file };
    byId.set(m.id, entry);
    mappings.push(entry);
  }

  for (const m of mappings) {
    for (const r of m.related) {
      if (r === m.id) problems.push(`${m.file}: related lists itself`);
      else if (!byId.has(r)) problems.push(`${m.file}: related "${r}" does not exist`);
    }
    if (m.replaced_by) {
      if (m.status !== 'deprecated') problems.push(`${m.file}: replaced_by is only allowed when status is deprecated`);
      if (!byId.has(m.replaced_by)) problems.push(`${m.file}: replaced_by "${m.replaced_by}" does not exist`);
    }
    for (const [db, d] of Object.entries(m.databases)) {
      for (const a of d.alternatives) {
        if (a.see && !byId.has(a.see)) problems.push(`${m.file}: databases.${db} alternatives see "${a.see}" does not exist`);
      }
    }
  }

  const slugs = new Set(mappings.map((m) => m.slug));
  const froms = new Set<string>();
  for (const r of redirects) {
    if (froms.has(r.from)) problems.push(`data/redirects.yaml: "${r.from}" is redirected twice`);
    froms.add(r.from);
    if (slugs.has(r.from)) problems.push(`data/redirects.yaml: "${r.from}" still exists, so it cannot be redirected`);
    if (!slugs.has(r.to)) problems.push(`data/redirects.yaml: target "${r.to}" does not exist`);
  }

  for (const p of site.lab_excerpt) {
    const m = byId.get(p.entry);
    if (!m) problems.push(`data/site.yaml: lab_excerpt entry "${p.entry}" does not exist`);
    else if (!m.databases[p.db]?.commands.some((c) => c.cmd === p.cmd)) {
      problems.push(`data/site.yaml: lab_excerpt command ${JSON.stringify(p.cmd)} is not in ${p.entry} / ${p.db}`);
    }
  }

  for (const id of site.featured) {
    const m = byId.get(id);
    if (!m) problems.push(`data/site.yaml: featured "${id}" does not exist`);
    else if (!m.databases[site.pair.source]) problems.push(`data/site.yaml: featured "${id}" has no ${site.pair.source} entry`);
  }

  const catOrder = new Map(categories.map((c, i) => [c.id, i]));
  mappings.sort((a, b) => (catOrder.get(a.category) ?? 99) - (catOrder.get(b.category) ?? 99) || a.id.localeCompare(b.id));

  return { dataset: { mappings, databases, categories, redirects, site }, problems };
}

const cache = new Map<string, Dataset>();

/** Loads and checks data/, throwing on any problem so a bad entry fails the build. */
export function loadDataset(dir = DATA_DIR): Dataset {
  const hit = cache.get(dir);
  if (hit) return hit;
  const { dataset, problems } = checkDataset(readRaw(dir));
  if (problems.length) throw new DataError(problems);
  cache.set(dir, dataset);
  return dataset;
}
