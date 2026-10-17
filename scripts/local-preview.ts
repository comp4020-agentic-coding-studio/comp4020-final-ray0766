import { spawn, execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export interface LocalConfig { version: number; canonicalRoot: string; branch: string; port: number; database: string }
interface Running extends LocalConfig { pid: number; release: string; commit: string; startedAt: string }
const script = fileURLToPath(import.meta.url), root = resolve(dirname(script), '..');

export function validateConfig(config: LocalConfig, directory: string, env: NodeJS.ProcessEnv = {}) {
  if (config.version !== 1 || resolve(config.canonicalRoot) !== resolve(directory) || config.branch !== 'integration/midpoint' || config.port !== 8098 || resolve(config.database) !== resolve(directory, '.data/midpoint/little-worlds.sqlite')) throw Error('Use the canonical midpoint directory and its preserved local configuration.');
  if (env.HOME_SAMPLE !== undefined || env.TEST_LEGACY_WORLD !== undefined || env.DATABASE_PATH && resolve(env.DATABASE_PATH) !== resolve(config.database)) throw Error('Remove sample/legacy or alternative database overrides before starting the midpoint.');
}
export function matchesProcess(directory: string, runtime: string, cwd: string, command: string) {
  return cwd.split('\n').includes('n' + runtime) && command.includes(resolve(directory, 'scripts/local-server.ts'));
}
function config(): LocalConfig {
  const path = resolve(root, '.data/midpoint/config.json');
  if (!existsSync(path)) throw Error('Midpoint configuration is missing. Restore its private backup; do not create an empty replacement database.');
  const value = JSON.parse(readFileSync(path, 'utf8')) as LocalConfig;
  validateConfig(value, realpathSync(root)); return value;
}
const base = resolve(root, '.data/midpoint'), runtime = resolve(base, 'runtime'), statePath = resolve(base, 'server.json');
function state(): Running | null { return existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) as Running : null; }
function owned(value: Running | null): value is Running {
  if (!value || value.canonicalRoot !== root || value.database !== resolve(base, 'little-worlds.sqlite') || value.port !== 8098 || !Number.isSafeInteger(value.pid) || value.pid <= 1) return false;
  try {
    return matchesProcess(root, runtime, execFileSync('lsof', ['-a', '-p', String(value.pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }), execFileSync('ps', ['-p', String(value.pid), '-o', 'command='], { encoding: 'utf8' }));
  } catch { return false; }
}
async function healthy(port: number) {
  try { const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1000) }); return response.ok && (await response.json()).profile === 'integrated'; }
  catch { return false; }
}
async function free(port: number) {
  await new Promise<void>((yes, no) => {
    const probe = createServer().once('error', () => no(Error(`Port ${port} is occupied; no other service was stopped.`))).listen(port, '127.0.0.1', () => probe.close(() => yes()));
  });
}
function link(target: string, path: string) {
  if (existsSync(path) && !lstatSync(path).isSymbolicLink()) throw Error('Refusing to replace a non-link runtime file: ' + path);
  const pending = path + '.next-' + process.pid; symlinkSync(target, pending); renameSync(pending, path);
}
async function stop() {
  const running = state();
  if (!owned(running)) { console.log('No owned midpoint process is running; no process stopped.'); return; }
  process.kill(running.pid, 'SIGTERM');
  for (let n = 0; n < 40; n++) {
    if (!owned(running)) { console.log('Midpoint stopped. Saved data retained.'); return; }
    await new Promise(yes => setTimeout(yes, 100));
  }
  throw Error('Owned server is still stopping; no replacement started.');
}
async function start(restart: boolean) {
  const settings = config(); validateConfig(settings, root, process.env);
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  if (branch !== settings.branch) throw Error('Continue development on integration/midpoint in the canonical directory.');
  const previous = state();
  if (owned(previous) && !restart) { console.log(`Already running: http://127.0.0.1:${settings.port}`); return; }
  if (!owned(previous)) await free(settings.port);
  if (!existsSync(settings.database)) throw Error('Preserved midpoint database is missing; refusing to create an empty world.');
  const db = new DatabaseSync(settings.database, { readOnly: true });
  try {
    if (![16,17].includes(Number(db.prepare('PRAGMA user_version').get()!.user_version)) || !(Number(db.prepare('SELECT version FROM integration_config WHERE id=1').get()?.version) >= 1) || Number(db.prepare('SELECT enabled FROM home_sample_config WHERE id=1').get()?.enabled) !== 0) throw Error('The midpoint requires the preserved integrated database, not a sample or legacy database.');
  } finally { db.close(); }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const release = resolve(base, 'releases', Date.now() + '-' + commit.slice(0, 7)); mkdirSync(release, { recursive: true });
  // A failed build leaves the current service untouched. Old releases remain recoverable.
  execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--configLoader', 'runner', '--outDir', resolve(release, 'dist')], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, [resolve(root, 'scripts/build-worker.ts'), resolve(release, 'build/worker')], { cwd: root, stdio: 'inherit' });
  if (owned(previous)) await stop();
  await free(settings.port); mkdirSync(runtime, { recursive: true });
  for (const name of ['src', 'node_modules', 'README.md', 'ASSET-CREDITS.md']) link(resolve(root, name), resolve(runtime, name));
  link(resolve(release, 'dist'), resolve(runtime, 'dist')); link(resolve(release, 'build'), resolve(runtime, 'build'));
  const env = { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(settings.port), DATABASE_PATH: settings.database, LOCAL_MIDPOINT_ROOT: root };
  const child = spawn(process.execPath, [resolve(root, 'scripts/local-server.ts')], { cwd: runtime, env, detached: true, stdio: 'ignore' });
  if (!child.pid) throw Error('Could not start the local server.');
  const running: Running = { ...settings, pid: child.pid, release, commit, startedAt: new Date().toISOString() };
  writeFileSync(statePath, JSON.stringify(running, null, 2) + '\n', { mode: 0o600 }); child.unref();
  for (let n = 0; n < 100; n++) {
    if (await healthy(settings.port)) { console.log(`Midpoint ready: http://127.0.0.1:${settings.port}\nDatabase: ${settings.database}\nUse this directory and integration/midpoint for subsequent work.`); return; }
    try { process.kill(child.pid, 0); } catch { break; }
    await new Promise(yes => setTimeout(yes, 100));
  }
  // Only this newly spawned child can be stopped on failed startup.
  child.kill('SIGTERM'); throw Error('Startup failed. Inspect .data/midpoint/server.log; the preserved database was not replaced.');
}
async function main() {
  const action = process.argv[2] ?? 'start';
  if (action === 'stop') { config(); await stop(); }
  else if (action === 'status') { const settings = config(), running = state(); console.log(JSON.stringify({ directory: root, branch: settings.branch, database: settings.database, port: settings.port, running: owned(running), healthy: owned(running) && await healthy(settings.port), process: owned(running) ? running.pid : null }, null, 2)); }
  else if (action === 'start' || action === 'restart') await start(action === 'restart');
  else throw Error('Use: node scripts/local-preview.ts [start|restart|status|stop]');
}
if (process.argv[1] && resolve(process.argv[1]) === script) await main().catch(error => { console.error(error instanceof Error ? error.message : 'Local preview failed'); process.exitCode = 1; });
