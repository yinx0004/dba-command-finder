// Creates a new mapping from a template: npm run new -- <category>/<id>
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';

const arg = process.argv[2] ?? '';
const match = /^([a-z0-9-]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(arg);
if (!match) {
  console.error('usage: npm run new -- <category>/<id>   e.g. npm run new -- session/list-active-sessions');
  process.exit(1);
}
const [, category, id] = match;
const categories = load(fs.readFileSync('data/categories.yaml', 'utf8')).map((c) => c.id);
if (!categories.includes(category)) {
  console.error(`unknown category "${category}"; pick one of: ${categories.join(', ')} (or add it to data/categories.yaml)`);
  process.exit(1);
}
const file = path.join('data', 'mappings', category, `${id}.yaml`);
if (fs.existsSync(file)) {
  console.error(`${file} already exists`);
  process.exit(1);
}

const dbs = load(fs.readFileSync('data/databases.yaml', 'utf8')).map((d) => d.id);
const dbBlock = (db) => `  ${db}:
    support: full # full / partial / none
    commands:
      - cmd: TODO
        # since: '8.0'   # first version that has it
        # until: '8.0'   # first version that no longer has it
        # note: {zh: ...}
    # fields: {elapsed: Time}   # this database's name for each task field
    # notes: [{zh: ...}]        # required for partial and none
    # refs: [{title: ..., url: ...}]
`;

const template = `schema_version: 2
id: ${id}
category: ${category}
title: {zh: TODO 一句话说清要做的事}
summary: {zh: TODO 什么场景下会用到}
keywords:
  zh: []
  en: []
# fields:                      # the task's output fields, if it has any
#   - {id: elapsed, name: {zh: 已运行时间}}
databases:
${dbs.map(dbBlock).join('')}related: []
`;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, template);
console.log(`created ${file}`);
