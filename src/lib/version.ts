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
