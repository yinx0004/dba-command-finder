// How the lab starts each database in Docker and runs a command exactly as the page shows it.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseServerVersion } from './plan';

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
    exec: (text, db) => sh([...client(db), '-e', text]),
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

export const ENGINES: Record<string, (version: string) => Engine> = { mysql, mongodb };
