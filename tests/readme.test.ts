// The README's badges spell out versions by hand; these keep them in step with the data and package.json.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/lib/data';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ds = loadDataset();
const labbed = ds.databases.filter((d) => d.lab_versions.length > 0);
const badge = (label: string, message: string) =>
  `https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(message)}-`;
const major = (range: string) => range.replace(/^[^\d]*/, '').split('.')[0];

describe('README badges', () => {
  it('list every database the lab runs, with its versions', () => {
    for (const d of labbed) expect(readme).toContain(badge(d.name, d.lab_versions.join(' | ')));
  });

  it('count the versions the lab runs', () => {
    const n = labbed.reduce((sum, d) => sum + d.lab_versions.length, 0);
    expect(readme).toContain(badge('lab', `${n} versions verified`));
  });

  it('match the stack in package.json', () => {
    expect(readme).toContain(badge('Astro', major(pkg.dependencies.astro)));
    expect(readme).toContain(badge('React', major(pkg.dependencies.react)));
    expect(readme).toContain(badge('Node', `≥${pkg.engines.node.replace(/^>=/, '').replace(/\.0$/, '')}`));
  });
});
