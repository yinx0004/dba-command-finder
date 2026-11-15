// SQL is written with its keywords in capitals, so commands read the same across entries. Function names and
// types follow each database's manual (MySQL: COUNT(), BIGINT; PostgreSQL: count(), bigint), and identifiers keep
// their real names, since MySQL echoes them back as the output's column names; neither is checked here.
import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/lib/data';

const ds = loadDataset();

// Statements that start an SQL command, as opposed to a shell command or a psql meta-command.
const STATEMENT =
  /^(SELECT|SHOW|SET|ALTER|CREATE|DROP|GRANT|REVOKE|KILL|FLUSH|OPTIMIZE|ANALYZE|CHECK|EXPLAIN|INSERT|UPDATE|DELETE|TRUNCATE|RENAME|LOAD|COPY|VACUUM|REINDEX|CLUSTER|CHECKPOINT|BEGIN|START|STOP|LOCK|UNLOCK|PURGE|INSTALL|UNINSTALL|RESET|CHANGE|PREPARE|DESC|DESCRIBE|CALL|WITH|USE|REPAIR|CHECKSUM|COMMIT|ROLLBACK|REFRESH|COMMENT|DISCARD)\b/i;

// Words that are only ever keywords in these commands. Left out on purpose: words that are also a function
// (left, right, replace), a setting's value (on, off) or a column (data, user, status, end).
const KEYWORDS = [
  'select', 'from', 'where', 'and', 'or', 'not', 'as', 'in', 'is', 'null', 'order', 'by', 'group', 'having',
  'limit', 'offset', 'join', 'inner', 'outer', 'show', 'set', 'alter', 'create', 'drop', 'grant', 'revoke',
  'with', 'case', 'when', 'then', 'else', 'distinct', 'union', 'between', 'like', 'exists', 'insert', 'into',
  'values', 'update', 'delete', 'explain', 'interval', 'table', 'index', 'desc', 'asc', 'using', 'concurrently',
  'truncate', 'vacuum', 'global', 'session',
];
const KEYWORD = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'gi');

/** The parts of a command that are SQL, with strings, quoted names, placeholders and comments taken out. */
function bare(sql: string): string {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/'(?:[^']|'')*'|"[^"]*"|`[^`]*`/g, ' ')
    .replace(/<[^<>\s]+>/g, ' ')
    .replace(/--.*$/gm, ' ')
    .replace(/@@\w+\.(\w+)/g, (m) => m.split('.')[0]); // @@GLOBAL.time_zone: the scope is a keyword, the name is not
}

function sqlCommands() {
  const out: { where: string; cmd: string }[] = [];
  for (const m of ds.mappings) {
    for (const db of ['mysql', 'postgresql']) {
      const side = m.databases[db];
      if (!side) continue;
      const cmds = [...side.commands.filter((c) => !c.shell).map((c) => c.cmd), ...(side.alternatives ?? []).map((a) => a.cmd ?? '')];
      for (const cmd of cmds) if (STATEMENT.test(cmd.trim())) out.push({ where: `${m.id} (${db})`, cmd });
    }
  }
  return out;
}

describe('SQL keyword case', () => {
  const cmds = sqlCommands();

  it('finds the SQL commands', () => {
    expect(cmds.length).toBeGreaterThan(300);
  });

  it('writes keywords in capitals', () => {
    const lower = cmds.flatMap(({ where, cmd }) => {
      const words = (bare(cmd).match(KEYWORD) ?? []).filter((w) => w !== w.toUpperCase());
      return words.length ? [`${where}: ${[...new Set(words)].join(', ')} in ${cmd}`] : [];
    });
    expect(lower).toEqual([]);
  });

  it('would catch a lowercase keyword', () => {
    expect(bare("select a from t where b = 'from'").match(KEYWORD)).toEqual(['select', 'from', 'where']);
    expect(bare('SELECT @@global.time_zone').match(KEYWORD)).toEqual(['SELECT', 'global']);
    expect(bare('SELECT * FROM <table>').match(KEYWORD)).toEqual(['SELECT', 'FROM']);
  });
});
