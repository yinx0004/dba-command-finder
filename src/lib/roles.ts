// Which process a command runs on (mongod, mongos, ...), and what that means for the lab.
import type { Command, Database, Text } from './schema';

/**
 * Why the lab does not run this command, or undefined when it does: the command's own skip,
 * or it only runs on roles the lab does not start (e.g. mongos, when the lab has no sharded cluster).
 */
export function labSkip(c: Command, db: Database | undefined): Text | undefined {
  if (c.skip) return c.skip;
  if (!c.on || !db) return undefined;
  const lab = db.roles.filter((r) => r.lab).map((r) => r.id);
  return c.on.some((r) => lab.includes(r)) ? undefined : db.roles_unverified;
}

/** Display names of the roles a command runs on, in the order data/databases.yaml lists them. */
export function roleNames(c: Command, db: Database | undefined): string[] {
  if (!c.on || !db) return [];
  return db.roles.filter((r) => c.on!.includes(r.id)).map((r) => r.name);
}
