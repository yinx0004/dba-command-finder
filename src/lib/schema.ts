import { z } from 'zod';
import { compareVersions } from './version';

// Text shown to readers. Chinese is required; English is filled in later.
export const Text = z.strictObject({
  zh: z.string().min(1),
  en: z.string().min(1).optional(),
});

const TextList = z.strictObject({
  zh: z.array(z.string().min(1)).default([]),
  en: z.array(z.string().min(1)).optional(),
});

const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case');
const FieldId = z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, 'must be snake_case');

// "8.0", "8.0.22", "3.6"
const Version = z.string().regex(/^\d+(\.\d+){0,2}$/, 'version must look like 8.0 or 8.0.22');

const Command = z.strictObject({
  cmd: z.string().min(1),
  since: Version.optional(), // first version that has it
  deprecated_in: Version.optional(), // still works from here on, but shown as outdated
  removed_in: Version.optional(), // first version where it no longer works; the lab expects it to fail
  note: Text.optional(),
  // A command-line tool (mysqldump, mongodump, ...) run in a shell, not a statement for the database's client.
  shell: z.boolean().optional(),
  // Why the lab does not run this command (e.g. it needs a second connection). Shown on the page.
  skip: Text.optional(),
  // Which of the database's processes it runs on (roles in data/databases.yaml), e.g. [mongod, mongos].
  // Shown next to the command. The lab runs it only if one of them is a role the lab starts.
  on: z.array(Slug).min(1).optional(),
});

// How the lab prepares a database before running this entry's commands.
// <db> is always filled with the entry's own empty lab database unless vars sets it.
const Verify = z.strictObject({
  setup: z.string().min(1).optional(), // run first through the database's client, in that database
  setup_shell: z.string().min(1).optional(), // then this in a shell, e.g. to make a dump to restore
  vars: z.record(z.string().regex(/^[a-z][a-z0-9_.]*$/i), z.string()).default({}), // fills <name> placeholders
  teardown: z.string().min(1).optional(), // run last; errors are ignored
  // Why the output fields cannot be checked here (e.g. they only appear on a replica).
  skip_fields: Text.optional(),
});

// What to look at instead, used mainly when a database cannot do the task.
const Alternative = z.strictObject({
  title: Text,
  cmd: z.string().min(1).optional(),
  note: Text.optional(),
  see: z.string().optional(), // id of another mapping
});

const Ref = z.strictObject({
  title: z.string().min(1),
  url: z.url(),
});

// How one database's output names a field of the task: "opid", or with a note.
// The lab checks that plain names and dotted paths ("connections.current") appear in the commands' output;
// skip says why one cannot be checked (e.g. it only appears with authentication on).
const FieldName = z.union([
  z.string().min(1),
  // since: the first version whose output has this field; the lab only checks it from there on.
  z.strictObject({ name: z.string().min(1), note: Text.optional(), skip: Text.optional(), since: Version.optional() }),
]);

/**
 * How one database does the task.
 *   full     does it completely
 *   partial  does it, with differences worth knowing (explained in notes)
 *   none     cannot do it; notes explain why, alternatives say what to look at instead
 * A database missing from `databases` simply has not been written up yet.
 */
export const DatabaseEntry = z
  .strictObject({
    support: z.enum(['full', 'partial', 'none']),
    commands: z.array(Command).default([]),
    fields: z.record(FieldId, FieldName).default({}),
    notes: z.array(Text).default([]),
    alternatives: z.array(Alternative).default([]),
    refs: z.array(Ref).default([]),
    verify: Verify.optional(),
  })
  .superRefine((d, ctx) => {
    d.commands.forEach((c, i) => {
      const order = [c.since, c.deprecated_in, c.removed_in].filter((v): v is string => !!v);
      for (let k = 1; k < order.length; k++) {
        if (compareVersions(order[k - 1], order[k]) >= 0) {
          ctx.addIssue({ code: 'custom', path: ['commands', i], message: 'versions must increase: since < deprecated_in < removed_in' });
        }
      }
    });
    if (d.support === 'none') {
      if (d.commands.length > 0) ctx.addIssue({ code: 'custom', path: ['commands'], message: 'support "none" must not list commands; use alternatives' });
      if (d.notes.length === 0) ctx.addIssue({ code: 'custom', path: ['notes'], message: 'support "none" must explain why in notes' });
    } else {
      if (d.commands.length === 0) ctx.addIssue({ code: 'custom', path: ['commands'], message: `support "${d.support}" needs at least one command` });
      if (d.support === 'partial' && d.notes.length === 0) ctx.addIssue({ code: 'custom', path: ['notes'], message: 'support "partial" must say what differs in notes' });
    }
  });

/** One DBA task, described once per database. Any two databases can be compared from it. */
export const Mapping = z
  .strictObject({
    schema_version: z.literal(2),
    id: Slug,
    category: z.string().min(1),
    status: z.enum(['active', 'deprecated']).default('active'),
    replaced_by: z.string().optional(),
    title: Text,
    summary: Text,
    keywords: TextList.default({ zh: [] }),
    // The task's output fields, independent of any database; each database maps its own names onto these ids.
    fields: z.array(z.strictObject({ id: FieldId, name: Text.optional() })).default([]),
    databases: z.record(Slug, DatabaseEntry).refine((d) => Object.keys(d).length > 0, 'at least one database'),
    related: z.array(z.string()).default([]),
  })
  .superRefine((m, ctx) => {
    const ids = new Set<string>();
    m.fields.forEach((f, i) => {
      if (ids.has(f.id)) ctx.addIssue({ code: 'custom', path: ['fields', i, 'id'], message: `duplicate field "${f.id}"` });
      ids.add(f.id);
    });
    if (Object.values(m.databases).every((d) => d.support === 'none')) {
      ctx.addIssue({ code: 'custom', path: ['databases'], message: 'at least one database must be able to do the task' });
    }
    for (const [db, d] of Object.entries(m.databases)) {
      for (const key of Object.keys(d.fields)) {
        if (!ids.has(key)) ctx.addIssue({ code: 'custom', path: ['databases', db, 'fields', key], message: `field "${key}" is not declared in fields` });
      }
    }
  });

// A kind of process a database runs as, e.g. mongod / mongos / config server.
const Role = z.strictObject({
  id: Slug,
  name: z.string().min(1),
  lab: z.boolean().default(false), // the lab starts this kind of process and runs commands on it
});

export const Database = z
  .strictObject({
    id: Slug,
    name: z.string().min(1),
    // Versions the lab runs every command against; also the CI job matrix.
    lab_versions: z.array(Version).default([]),
    roles: z.array(Role).default([]),
    // Why the lab skips commands that only run on roles it does not start. Shown on the page.
    roles_unverified: Text.optional(),
  })
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    d.roles.forEach((r, i) => {
      if (ids.has(r.id)) ctx.addIssue({ code: 'custom', path: ['roles', i, 'id'], message: `duplicate role "${r.id}"` });
      ids.add(r.id);
    });
    if (d.roles.length && !d.roles.some((r) => r.lab)) ctx.addIssue({ code: 'custom', path: ['roles'], message: 'at least one role must be lab: true' });
    if (d.roles.some((r) => !r.lab) && !d.roles_unverified) {
      ctx.addIssue({ code: 'custom', path: ['roles_unverified'], message: 'say why the lab skips commands on roles it does not start' });
    }
  });

export const Category = z.strictObject({
  id: Slug,
  name: Text,
  desc: Text,
});

export const Redirect = z.strictObject({
  from: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'from must be category/id'),
  to: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'to must be category/id'),
});

export const Site = z.strictObject({
  // The comparison the site shows. Becomes the default once readers can pick databases.
  pair: z.strictObject({ source: Slug, target: Slug }),
  featured: z.array(z.string()).default([]),
  // Commands whose real lab results the home page shows, grouped by database.
  lab_excerpt: z.array(z.strictObject({ entry: z.string(), db: Slug, cmd: z.string().min(1) })).default([]),
});

export type Text = z.infer<typeof Text>;
export type Command = z.infer<typeof Command>;
export type DatabaseEntry = z.infer<typeof DatabaseEntry>;
export type Mapping = z.infer<typeof Mapping>;
export type Database = z.infer<typeof Database>;
export type Category = z.infer<typeof Category>;
export type Redirect = z.infer<typeof Redirect>;
export type Site = z.infer<typeof Site>;
