import { z } from 'zod';

// Text shown to readers. Chinese is required; English is filled in later.
export const Text = z.strictObject({
  zh: z.string().min(1),
  en: z.string().min(1).optional(),
});

const TextList = z.strictObject({
  zh: z.array(z.string().min(1)).default([]),
  en: z.array(z.string().min(1)).optional(),
});

// "8.0", "8.0.22", "3.6"
const Version = z.string().regex(/^\d+(\.\d+){0,2}$/, 'version must look like 8.0 or 8.0.22');

const Command = z.strictObject({
  cmd: z.string().min(1),
  since: Version.optional(), // first version that has it
  until: Version.optional(), // first version that no longer has it (renamed or removed)
  note: Text.optional(),
});

const FieldPair = z.strictObject({
  mysql: z.string().min(1),
  mongodb: z.string().min(1),
  note: Text.optional(),
});

// What to look at instead, used mainly when there is no equivalent.
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

export const Mapping = z
  .strictObject({
    schema_version: z.literal(1),
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id must be kebab-case'),
    category: z.string().min(1),
    status: z.enum(['active', 'deprecated']).default('active'),
    replaced_by: z.string().optional(),
    title: Text,
    summary: Text,
    keywords: TextList.default({ zh: [] }),
    equivalence: z.enum(['exact', 'approx', 'none']),
    mysql: z.array(Command).min(1),
    mongodb: z.array(Command).default([]),
    field_map: z.array(FieldPair).default([]),
    differences: z.array(Text).default([]),
    alternatives: z.array(Alternative).default([]),
    refs: z.array(Ref).default([]),
    related: z.array(z.string()).default([]),
  })
  .superRefine((m, ctx) => {
    if (m.equivalence === 'none') {
      if (m.mongodb.length > 0) {
        ctx.addIssue({ code: 'custom', path: ['mongodb'], message: 'equivalence "none" must not list MongoDB commands; use alternatives' });
      }
      if (m.differences.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['differences'], message: 'equivalence "none" must explain why in differences' });
      }
    } else if (m.mongodb.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['mongodb'], message: `equivalence "${m.equivalence}" needs at least one MongoDB command` });
    }
  });

export const Category = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: Text,
  desc: Text,
});

export const Redirect = z.strictObject({
  from: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'from must be category/id'),
  to: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'to must be category/id'),
});

export const Site = z.strictObject({
  featured: z.array(z.string()).default([]),
});

export type Text = z.infer<typeof Text>;
export type Mapping = z.infer<typeof Mapping>;
export type Category = z.infer<typeof Category>;
export type Redirect = z.infer<typeof Redirect>;
export type Site = z.infer<typeof Site>;
