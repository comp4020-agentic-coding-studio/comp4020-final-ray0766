// Local transport only. Production still runs src/server/index.ts unchanged.
import { appendFileSync, existsSync, readFileSync, renameSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'node:util';
import { pathToFileURL } from 'node:url';

const root = process.env.LOCAL_MIDPOINT_ROOT;
if (!root || resolve(process.cwd()) !== resolve(root, '.data/midpoint/runtime') || process.env.DATABASE_PATH !== resolve(root, '.data/midpoint/little-worlds.sqlite') || process.env.HOST !== '127.0.0.1' || process.env.PORT !== '8098') throw Error('Run the canonical local-preview entry point.');
const settings = JSON.parse(readFileSync(resolve(root, '.data/midpoint/config.json'), 'utf8'));
if (settings.canonicalRoot !== root || settings.database !== process.env.DATABASE_PATH) throw Error('Midpoint configuration mismatch.');
const path = resolve(root, '.data/midpoint/server.log');
// Bound the local stdout/stderr transport too; the business journal has its
// own 2 × 1 MiB retention and private observation key beside SQLite.
function log(level: string, values: unknown[]) {
  const line = `${new Date().toISOString()} ${level} ${format(...values).slice(0, 4096)}\n`;
  if (existsSync(path) && statSync(path).size + Buffer.byteLength(line) > 262144) renameSync(path, path + '.1');
  appendFileSync(path, line, { mode: 0o600 });
}
console.log = (...values: unknown[]) => log('INFO', values);
console.warn = (...values: unknown[]) => log('WARN', values);
console.error = (...values: unknown[]) => log('ERROR', values);
try { await import(pathToFileURL(resolve(root, 'src/server/index.ts')).href); }
catch (error) { console.error(error instanceof Error ? error.message : 'Local server startup failed'); process.exitCode = 1; }
