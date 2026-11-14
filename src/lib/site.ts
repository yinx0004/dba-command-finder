import { execFileSync } from 'node:child_process';
import type { Lang } from './i18n';

export const REPO = 'yinx0004/dba-command-finder';
export const GITHUB = `https://github.com/${REPO}`;

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/** Site-relative link that respects the GitHub Pages base path. */
export function href(path = ''): string {
  return BASE + path.replace(/^\//, '');
}

export const langHome = (lang: Lang) => href(`${lang}/`);
export const categoryHref = (lang: Lang, category: string) => href(`${lang}/${category}/`);
export const entryHref = (lang: Lang, slug: string) => href(`${lang}/${slug}/`);

/** The CI run that built this site (GitHub Actions sets GITHUB_RUN_ID), else the list of runs. */
export function ciRunUrl(runId = process.env.GITHUB_RUN_ID): string {
  return runId ? `${GITHUB}/actions/runs/${runId}` : `${GITHUB}/actions`;
}

export const editUrl =(file: string) => `${GITHUB}/edit/main/${file}`;
export const newIssueUrl = (title = '') => `${GITHUB}/issues/new${title ? `?title=${encodeURIComponent(title)}` : ''}`;

/** Date of the last commit that touched a file, or '' outside a git checkout. */
export function lastUpdated(file: string): string {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}
