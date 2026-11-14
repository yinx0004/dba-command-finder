// Version arithmetic shared by the schema, the pages and the lab. Kept free of Node APIs.

/** Compares "8.0.22" with "8.4": negative, zero or positive. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface VersionRange {
  since?: string;
  removed_in?: string;
}

/** Whether a command should work on a server of this version. */
export function availableIn(c: VersionRange, version: string): boolean {
  if (c.since && compareVersions(version, c.since) < 0) return false;
  if (c.removed_in && compareVersions(version, c.removed_in) >= 0) return false;
  return true;
}

// --- Version lines, for readers who pick "8.0" rather than an exact patch release ---

/** "8.0.22" -> "8.0" */
export function lineOf(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}

/**
 * How a command stands for a reader on a version line (e.g. "8.0", meaning some 8.0.x):
 *   available      works on every release of the line
 *   since-patch    added partway through the line ("需要 8.0.22 及以上")
 *   removed-patch  removed partway through the line
 *   unavailable    not on this line at all: added in a later line, or removed by its first release
 */
export type LineStatus =
  | { state: 'available' }
  | { state: 'since-patch'; version: string }
  | { state: 'removed-patch'; version: string }
  | { state: 'unavailable'; reason: 'not-yet' | 'removed'; version: string };

export function onLine(c: VersionRange, line: string): LineStatus {
  if (c.removed_in) {
    const cmp = compareVersions(lineOf(c.removed_in), line);
    if (cmp < 0 || (cmp === 0 && compareVersions(c.removed_in, line) === 0)) {
      return { state: 'unavailable', reason: 'removed', version: c.removed_in };
    }
  }
  if (c.since) {
    const cmp = compareVersions(lineOf(c.since), line);
    if (cmp > 0) return { state: 'unavailable', reason: 'not-yet', version: c.since };
    if (cmp === 0 && compareVersions(c.since, line) > 0) return { state: 'since-patch', version: c.since };
  }
  if (c.removed_in && lineOf(c.removed_in) === line) return { state: 'removed-patch', version: c.removed_in };
  return { state: 'available' };
}

/** The first command a reader on this line can use: fully available ones first, then patch-dependent ones. */
export function firstUsable<T extends VersionRange>(cmds: T[], line: string | undefined): T | undefined {
  if (!line) return cmds[0];
  const rank = (c: T) => ({ available: 0, 'since-patch': 1, 'removed-patch': 1, unavailable: 9 })[onLine(c, line).state];
  return cmds
    .map((c, i) => ({ c, i, r: rank(c) }))
    .filter((x) => x.r < 9)
    .sort((a, b) => a.r - b.r || a.i - b.i)[0]?.c;
}
