import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Which preparation worker to start. The bundled JavaScript (scripts/build-worker.ts) is
 * used only while every source file that went into it is unchanged; otherwise, or when it was
 * never built, the TypeScript worker runs, which is correct but costs more memory. A stale
 * bundle would prepare homes with old logic that the server's re-checks cannot see. */
export function workerScript(root = process.cwd(), dir = 'build/worker'): { url: URL; bundled: boolean; reason?: string } {
  const typescript = new URL('./heavy-worker.ts', import.meta.url);
  let manifest: { entry: string; inputs: string[]; hash: string };
  try { manifest = JSON.parse(readFileSync(resolve(root, dir, 'heavy-worker.json'), 'utf8')); }
  catch { return { url: typescript, bundled: false, reason: 'no bundled worker was built' }; }
  const hash = createHash('sha256');
  try { for (const file of manifest.inputs) hash.update(file).update('\0').update(readFileSync(resolve(root, file))).update('\0'); }
  catch { return { url: typescript, bundled: false, reason: 'a source of the bundled worker is missing' }; }
  if (hash.digest('hex') !== manifest.hash) return { url: typescript, bundled: false, reason: 'the bundled worker is older than its sources' };
  return { url: pathToFileURL(resolve(root, dir, manifest.entry)), bundled: true };
}
