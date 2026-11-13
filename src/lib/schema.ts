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
  // Why the lab does not run this command (e.g. it needs a second connection). Shown on the page.
  skip: Text.optional(),
});

// How the lab prepares a database before running this entry's commands.
const Verify = z.strictObject({
  setup: z.string().min(1).optional(), // run first, in an empty database of its own
  vars: z.record(z.string().regex(/^[a-z][a-z0-9_.]*$/i), z.string()).default({}), // fills <name> placeholders
  teardown: z.string().min(1).optional(), // run last; errors are ignored
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
const FieldName = z.union([z.string().min(1), z.strictObject({ name: z.string().min(1), note: Text.optional() })]);

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
    for (const [db, d] of Object.entries(m.databases)) {
      for (const key of Object.keys(d.fields)) {
        if (!ids.has(key)) ctx.addIssue({ code: 'custom', path: ['databases', db, 'fields', key], message: `field "${key}" is not declared in fields` });
      }
    }
  });

export const Database = z.strictObject({
  id: Slug,
  name: z.string().min(1),
  // Versions the lab runs every command against; also the CI job matrix.
  lab_versions: z.array(Version).default([]),
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
});

export type Text = z.infer<typeof Text>;
export type Command = z.infer<typeof Command>;
export type DatabaseEntry = z.infer<typeof DatabaseEntry>;
export type Mapping = z.infer<typeof Mapping>;
export type Database = z.infer<typeof Database>;
export type Category = z.infer<typeof Category>;
export type Redirect = z.infer<typeof Redirect>;
export type Site = z.infer<typeof Site>;
