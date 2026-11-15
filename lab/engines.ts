// How the lab starts each database in Docker and runs a command exactly as the page shows it.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseServerVersion, redisFailed } from './plan';

const run = promisify(execFile);

export interface ExecResult {
  ok: boolean;
  out: string;
}

async function sh(args: string[], timeoutMs = 60_000): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await run('docker', args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
    return { ok: true, out: (stdout + stderr).trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return { ok: false, out: ((err.stdout ?? '') + (err.stderr ?? '') || err.message).trim() };
  }
}

/** Like sh, with text fed to the command's standard input. */
function shIn(args: string[], input: string, timeoutMs = 60_000): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile('docker', args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = (stdout + stderr).trim();
      resolve({ ok: !err, out: err && !out ? err.message : out });
    });
    child.stdin?.end(input);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Engine {
  image: string;
  /** starts a fresh container and waits until it accepts commands */
  start(): Promise<void>;
  serverVersion(): Promise<string>;
  createDatabase(name: string): Promise<ExecResult>;
  /** runs one command or script in the given database, through the database's own command-line client */
  exec(text: string, database: string): Promise<ExecResult>;
  /** runs a command-line tool (mysqldump, mongodump, ...) in a shell inside the container, from /tmp */
  shell(text: string): Promise<ExecResult>;
  stop(): Promise<void>;
}

const inShell = (name: string, text: string) => sh(['exec', '-w', '/tmp', name, 'bash', '-c', text], 300_000);

async function startContainer(name: string, args: string[]): Promise<void> {
  await sh(['rm', '-fv', name]);
  const r = await sh(['run', '-d', '--name', name, ...args], 600_000);
  if (!r.ok) throw new Error(`docker run failed: ${r.out}`);
}

async function waitFor(name: string, probe: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) return;
    const state = await sh(['inspect', '-f', '{{.State.Status}}', name]);
    if (state.out !== 'running') {
      const logs = await sh(['logs', '--tail', '20', name]);
      const fatal = /"s":"F".*?"msg":"([^"]+)"/.exec(logs.out)?.[1];
      throw new Error(`${name} stopped while starting${fatal ? `: ${fatal}` : `\n${logs.out}`}`);
    }
    await sleep(1000);
  }
  throw new Error(`${name} was not ready after ${timeoutMs / 1000}s`);
}

// Test-only password for a throwaway container that is never exposed outside Docker.
const MYSQL_PASSWORD = 'lab';

export function mysql(version: string): Engine {
  const name = `dbalab-mysql-${version}`;
  const image = `mysql:${version}`;
  // 5.7 images are amd64 only; this also lets them run (emulated) on Apple Silicon.
  const platform = version === '5.7' ? ['--platform', 'linux/amd64'] : [];
  const client = (database?: string) => [
    'exec', '-e', `MYSQL_PWD=${MYSQL_PASSWORD}`, name,
    'mysql', '-h127.0.0.1', '-uroot', ...(database ? ['-D', database] : []),
  ];
  return {
    image,
    async start() {
      // Binary logging on for every version (5.7 has it off by default), so binlog commands are tested on all of them.
      await startContainer(name, [...platform, '-e', `MYSQL_ROOT_PASSWORD=${MYSQL_PASSWORD}`, image, '--server-id=1', '--log-bin=binlog']);
      // TCP only answers once the entrypoint's temporary init server has been replaced by the real one.
      await waitFor(name, async () => (await sh([...client(), '-e', 'SELECT 1'])).ok, 300_000);
      // Lets mysqldump and friends run as the page shows them, without connection flags.
      const cnf = await inShell(name, `printf '[client]\\nuser=root\\npassword=${MYSQL_PASSWORD}\\nhost=127.0.0.1\\n' > ~/.my.cnf`);
      if (!cnf.ok) throw new Error(`could not write ~/.my.cnf: ${cnf.out}`);
    },
    async serverVersion() {
      const r = await sh([...client(), '-N', '-s', '-e', 'SELECT VERSION()']);
      if (!r.ok) throw new Error(r.out);
      return parseServerVersion(r.out);
    },
    createDatabase: (db) => sh([...client(), '-e', `CREATE DATABASE IF NOT EXISTS \`${db}\``]),
    exec: async (text, db) => {
      // A server that does not know an optimizer hint (e.g. /*+ INDEX() */ on 5.7) ignores it with a
      // syntax-error warning instead of failing, so that warning counts as a failure.
      const r = await sh([...client(db), '--show-warnings', '-e', text]);
      return r.ok && /Warning \(Code 1064\)/.test(r.out) ? { ...r, ok: false } : r;
    },
    shell: (text) => inShell(name, text),
    stop: async () => void (await sh(['rm', '-fv', name])),
  };
}

export function mongodb(version: string): Engine {
  const name = `dbalab-mongodb-${version}`;
  const image = `mongo:${version}`;
  const shell = (database: string, script: string) => [
    'exec', name, 'mongosh', '--quiet', `mongodb://localhost/${database}?directConnection=true`, '--eval', script,
  ];
  return {
    image,
    async start() {
      // A single-node replica set, so rs.* commands and $currentOp behave as on a real deployment.
      await startContainer(name, [image, '--replSet', 'rs0', '--bind_ip_all']);
      await waitFor(name, async () => (await sh(shell('admin', 'db.adminCommand({ ping: 1 }).ok'))).ok, 120_000);
      await sh(shell('admin', 'try { rs.initiate() } catch (e) { if (e.codeName !== "AlreadyInitialized") throw e }'));
      await waitFor(name, async () => (await sh(shell('admin', 'db.hello().isWritablePrimary'))).out.endsWith('true'), 120_000);
    },
    async serverVersion() {
      const r = await sh(shell('admin', 'db.version()'));
      if (!r.ok) throw new Error(r.out);
      return parseServerVersion(r.out);
    },
    // Databases appear on first write; setup scripts create what they need.
    createDatabase: async () => ({ ok: true, out: '' }),
    exec: (text, db) => sh(shell(db, text)),
    shell: (text) => inShell(name, text),
    stop: async () => void (await sh(['rm', '-fv', name])),
  };
}

export function redis(version: string): Engine {
  const name = `dbalab-redis-${version}`;
  const image = `redis:${version}`;
  const cli = ['exec', '-i', name, 'redis-cli'];
  return {
    image,
    async start() {
      // A standalone server started from a config file, as deployments are, so CONFIG REWRITE works.
      // Through the image's own entrypoint, which in 8.0 also loads the bundled modules (the FT.* query engine).
      // Cluster and Sentinel commands are marked by role and skipped.
      await startContainer(name, [image, 'sh', '-c', 'touch /data/redis.conf && exec docker-entrypoint.sh redis-server /data/redis.conf']);
      await waitFor(name, async () => (await sh(['exec', name, 'redis-cli', 'PING'])).out === 'PONG', 60_000);
    },
    async serverVersion() {
      const r = await sh(['exec', name, 'redis-cli', 'INFO', 'server']);
      const v = /redis_version:(\S+)/.exec(r.out)?.[1];
      if (!r.ok || !v) throw new Error(r.out);
      return parseServerVersion(v);
    },
    // Redis has numbered databases rather than named ones; every entry uses database 0.
    createDatabase: async () => ({ ok: true, out: '' }),
    // Commands go in on standard input, one per line, quoted as on the page; an error reply means failure.
    async exec(text) {
      const r = await shIn(cli, text.endsWith('\n') ? text : text + '\n');
      return { ok: r.ok && !redisFailed(r.out), out: r.out };
    },
    shell: (text) => inShell(name, text),
    stop: async () => void (await sh(['rm', '-fv', name])),
  };
}

// Test-only password for a throwaway container that is never exposed outside Docker.
const PG_PASSWORD = 'lab';

export function postgresql(version: string): Engine {
  const name = `dbalab-postgresql-${version}`;
  const image = `postgres:${version}`;
  // Stop at the first error, so the exit code says whether the command worked.
  const psql = (database: string) => ['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database, '-f', '-'];
  return {
    image,
    async start() {
      // pg_stat_statements needs loading at start-up, as on most production servers; wal_level=logical lets
      // the change-log entries decode WAL. PG* variables let psql, pg_dump and friends run as the page shows them.
      await startContainer(name, [
        '-e', `POSTGRES_PASSWORD=${PG_PASSWORD}`, '-e', `PGPASSWORD=${PG_PASSWORD}`, '-e', 'PGUSER=postgres', '-e', 'PGHOST=127.0.0.1',
        image, '-c', 'shared_preload_libraries=pg_stat_statements', '-c', 'wal_level=logical',
      ]);
      // TCP only answers once the entrypoint's init server has been replaced by the real one.
      await waitFor(name, async () => (await shIn(psql('postgres'), 'SELECT 1;\n')).ok, 120_000);
    },
    async serverVersion() {
      const r = await shIn(psql('postgres'), 'SHOW server_version;\n');
      // "18.7 (Debian 18.7-1.pgdg13+2)": PostgreSQL versions have two parts.
      const v = /(\d+\.\d+)/.exec(r.out)?.[1];
      if (!r.ok || !v) throw new Error(r.out);
      return v;
    },
    createDatabase: (db) => shIn(psql('postgres'), `CREATE DATABASE "${db}";\n`),
    exec: (text, db) => shIn(psql(db), text.endsWith('\n') ? text : text + '\n'),
    shell: (text) => inShell(name, text),
    stop: async () => void (await sh(['rm', '-fv', name])),
  };
}

/**
 * TiDB images are tagged by patch release only (v8.5.8, no v8.5): the newest patch of the line, from Docker Hub.
 */
async function latestTidbTag(line: string): Promise<string> {
  const url = `https://hub.docker.com/v2/repositories/pingcap/tidb/tags?page_size=100&name=v${line}.`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not list pingcap/tidb tags: HTTP ${res.status}`);
  const body = (await res.json()) as { results: { name: string }[] };
  const exact = new RegExp(`^v${line.replace('.', '\\.')}\\.(\\d+)$`);
  const patches = body.results.map((t) => exact.exec(t.name)?.[1]).filter((x): x is string => x !== undefined).map(Number);
  if (!patches.length) throw new Error(`no pingcap/tidb image for ${line}`);
  return `v${line}.${Math.max(...patches)}`;
}

export function tidb(version: string): Engine {
  const name = `dbalab-tidb-${version}`;
  // TiDB's image has no client, so a MySQL 8.4 container shares its network and runs mysql, mysqldump and friends.
  const clientName = `${name}-client`;
  let image = `pingcap/tidb:v${version}.x`;
  const client = (database?: string) => ['exec', clientName, 'mysql', ...(database ? ['-D', database] : [])];
  return {
    get image() {
      return image;
    },
    async start() {
      image = `pingcap/tidb:${await latestTidbTag(version)}`;
      // One tidb-server on its built-in storage (unistore): SQL, information_schema and the CLUSTER_* tables work;
      // commands for PD, TiKV or TiFlash, and the cluster tools, are marked by role and skipped.
      await startContainer(name, [image]);
      await sh(['rm', '-fv', clientName]);
      const c = await sh(['run', '-d', '--name', clientName, '--network', `container:${name}`, '--entrypoint', 'sleep', 'mysql:8.4', 'infinity'], 600_000);
      if (!c.ok) throw new Error(`client container failed: ${c.out}`);
      // Lets mysql and mysqldump run as the page shows them, without connection flags; LOAD DATA LOCAL INFILE
      // reads files from this container, which the client only allows with local-infile on.
      const cnf = await sh(['exec', clientName, 'bash', '-c', `printf '[client]\\nuser=root\\nhost=127.0.0.1\\nport=4000\\n[mysql]\\nlocal-infile=1\\n' > ~/.my.cnf`]);
      if (!cnf.ok) throw new Error(`could not write ~/.my.cnf: ${cnf.out}`);
      await waitFor(name, async () => (await sh([...client(), '-e', 'SELECT 1'])).ok, 120_000);
    },
    async serverVersion() {
      const r = await sh([...client(), '-N', '-s', '-e', 'SELECT tidb_version()']);
      const v = /Release Version: v(\d+\.\d+\.\d+)/.exec(r.out)?.[1];
      if (!r.ok || !v) throw new Error(r.out);
      return v;
    },
    createDatabase: (db) => sh([...client(), '-e', `CREATE DATABASE IF NOT EXISTS \`${db}\``]),
    exec: (text, db) => sh([...client(db), '-e', text]),
    shell: (text) => inShell(clientName, text),
    stop: async () => void (await sh(['rm', '-fv', clientName, name])),
  };
}

export const ENGINES: Record<string, (version: string) => Engine> = { mysql, mongodb, redis, postgresql, tidb };
