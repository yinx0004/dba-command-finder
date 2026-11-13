import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { load } from 'js-yaml';

const LANGS = ['zh'];
const BASE = '/dba-command-finder';

// Old URLs from data/redirects.yaml keep working after a mapping is renamed or merged.
// Astro adds the base to the source path but not to the destination.
const redirects = Object.fromEntries(
  (load(fs.readFileSync('data/redirects.yaml', 'utf8')) ?? []).flatMap((r) =>
    LANGS.map((lang) => [`/${lang}/${r.from}/`, `${BASE}/${lang}/${r.to}/`]),
  ),
);

export default defineConfig({
  site: 'https://www.solidstack.io',
  base: BASE,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [react(), sitemap()],
  redirects,
});
