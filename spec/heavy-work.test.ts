import { afterEach, expect, inject, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HeavyWork, PAUSED } from '../src/server/heavy-work.ts';
import { openStore } from '../src/server/store.ts';
import { workerScript } from '../src/server/worker-script.ts';

// One player's arrival must not hold everyone else's movement and presence:
// new homes and station searches run on a worker thread, and the server
// re-checks the saved planet before it writes what the worker prepared.

type Store = ReturnType<typeof openStore>;
const stores: Store[] = [], workers: HeavyWork[] = [];
afterEach(async () => { for (const store of stores.splice(0)) store.close(); for (const work of workers.splice(0)) await work.close(); });
const open = (path: string) => { const store = openStore(path, { integratedWorld: true }); stores.push(store); return store; };
const work = () => { const w = new HeavyWork(); workers.push(w); return w; };
/** Two copies of one fresh save, so both offer the same first fresh planet. */
function twins() {
  const dir = mkdtempSync(join(tmpdir(), 'heavy-')), base = join(dir, 'base.sqlite');
  open(base).close(); stores.splice(0);
  for (const name of ['inline.sqlite', 'prepared.sqlite']) copyFileSync(base, join(dir, name));
  return [open(join(dir, 'inline.sqlite')), open(join(dir, 'prepared.sqlite'))] as const;
}
const saved = (s: Store, planetId: string) => s.db.prepare('SELECT kind,position,rotation,blueprint_hash AS hash FROM planet_objects WHERE planet_id=? ORDER BY kind,position,rotation').all(planetId).map(row => ({ ...row }));
/** History minus random identifiers and clock: order, verb, design and anchor of every event. */
const history = (s: Store, planetId: string) => s.db.prepare('SELECT document FROM history_events WHERE planet_id=? ORDER BY seq').all(planetId).map(row => { const { event } = JSON.parse(String(row.document)); return [event.seq, event.type, event.spec, event.anchor, event.objectVersion]; });
const station = (s: Store, planetId: string) => ({ ...s.db.prepare("SELECT o.position,o.rotation,h.status FROM home_stations h LEFT JOIN planet_objects o ON o.id=h.object_id WHERE h.planet_id=?").get(planetId) });

// Creates the same home twice, inline in a cold process and on a newly started worker: about 3.5 s here beside the
// full suite, and past the default 5 s on the x86-64 CI runner (run 38434626581), which is about twice as slow.
it('prepares a new home and its station on the worker with exactly the result of creating them inline', async () => {
  const [inline, prepared] = twins(), id = 'arrival-identity';
  const a = inline.create(id);
  prepared.useHeavyWork(work());
  const b = await prepared.createPrepared(id);
  expect(b.planetId).toBe(a.planetId);
  expect(b.position).toEqual(a.position);
  expect(b.environment).toBe(a.environment);
  expect(saved(prepared, b.planetId)).toEqual(saved(inline, a.planetId));
  expect(saved(prepared, b.planetId).length).toBeGreaterThan(20);
  expect(history(prepared, b.planetId)).toEqual(history(inline, a.planetId));
  expect(history(prepared, b.planetId).length).toBeGreaterThan(20);
  expect(station(prepared, b.planetId)).toEqual(station(inline, a.planetId));
  expect(station(prepared, b.planetId).status).toBe('placed');
}, 20_000);

it('turns a new player away with a 503 and writes nothing when the worker fails, then pauses instead of retrying it', async () => {
  const [inline, prepared] = twins(), free = inline.create('reference').planetId;
  const broken = new HeavyWork({ pauseMs: 300, script: new URL('data:text/javascript,throw new Error("The worker could not start.")') }); workers.push(broken);
  prepared.useHeavyWork(broken);
  await expect(prepared.createPrepared('turned-away')).rejects.toMatchObject({ status: 503 });
  // Nothing half-made: no player, the planet still unclaimed and untouched.
  expect(prepared.has('turned-away')).toBe(false);
  expect(prepared.db.prepare('SELECT owner_id FROM planets WHERE id=?').get(free)!.owner_id).toBeNull();
  expect(saved(prepared, free)).toEqual([]);
  expect(broken.starts).toBe(1);
  // Retrying at once is refused without starting the worker again.
  await expect(prepared.createPrepared('turned-away')).rejects.toMatchObject({ status: 503, message: PAUSED });
  expect(broken.starts).toBe(1);
  // After the pause (300 ms) the worker is tried once more; the next pause is twice as long.
  await new Promise(resolve => setTimeout(resolve, 350));
  await expect(prepared.createPrepared('turned-away')).rejects.toMatchObject({ status: 503 });
  expect(broken.starts).toBe(2);
  await new Promise(resolve => setTimeout(resolve, 350));
  await expect(prepared.createPrepared('turned-away')).rejects.toMatchObject({ status: 503, message: PAUSED });
  expect(broken.starts).toBe(2);
  expect(prepared.has('turned-away')).toBe(false);
});

it('keeps a new home complete when only its station search fails, and leaves the station for a later visit', async () => {
  const [inline, prepared] = twins(), id = 'station-later';
  const a = inline.create(id);
  // A worker that makes homes but stops on any station search.
  const generator = pathToFileURL(resolve('src/shared/home-generation.ts')).href;
  const script = new URL('data:text/javascript,' + encodeURIComponent(`import { parentPort } from 'node:worker_threads';
const { generateHomeManifest } = await import(${JSON.stringify(generator)});
parentPort.on('message', ({ id, kind, input }) => { if (kind !== 'home') process.exit(3); parentPort.postMessage({ id, value: generateHomeManifest(input.radius, input.seed, input.environment ?? undefined), fits: [] }); });`));
  const halfway = new HeavyWork({ script }); workers.push(halfway);
  prepared.useHeavyWork(halfway);
  const b = await prepared.createPrepared(id);
  expect(b.home).toBeTruthy();
  expect(b.position).toEqual(a.position);
  // Every home object is there; only the station, and its receipt, are not yet.
  const stationHash = (s: Store, planetId: string) => s.db.prepare('SELECT o.blueprint_hash AS hash FROM home_stations h JOIN planet_objects o ON o.id=h.object_id WHERE h.planet_id=?').get(planetId)!.hash;
  const hash = stationHash(inline, a.planetId);
  expect(saved(prepared, b.planetId)).toEqual(saved(inline, a.planetId).filter(o => o.hash !== hash));
  expect(prepared.db.prepare('SELECT 1 FROM home_stations WHERE planet_id=?').get(b.planetId)).toBeUndefined();
});

it('prepares exactly the same arrival with the bundled JavaScript worker', async () => {
  // The bundle is built here, so this does not depend on a prior pnpm build.
  const out = relative(process.cwd(), mkdtempSync(join(tmpdir(), 'worker-bundle-')));
  execFileSync(process.execPath, ['scripts/build-worker.ts', out], { stdio: 'ignore' });
  const script = workerScript(process.cwd(), out);
  expect(script.bundled).toBe(true);
  const [inline, prepared] = twins(), id = 'bundled-arrival';
  const a = inline.create(id);
  const bundled = new HeavyWork({ script: script.url }); workers.push(bundled);
  prepared.useHeavyWork(bundled);
  const b = await prepared.createPrepared(id);
  expect(b.position).toEqual(a.position);
  expect(saved(prepared, b.planetId)).toEqual(saved(inline, a.planetId));
  expect(history(prepared, b.planetId)).toEqual(history(inline, a.planetId));
  expect(station(prepared, b.planetId)).toEqual(station(inline, a.planetId));
}, 60_000);

it('uses the bundled worker only while every source that went into it is unchanged', () => {
  const root = mkdtempSync(join(tmpdir(), 'worker-root-')), source = join(root, 'src', 'a.ts');
  mkdirSync(join(root, 'src')); mkdirSync(join(root, 'build', 'worker'), { recursive: true });
  expect(workerScript(root)).toMatchObject({ bundled: false, reason: 'no bundled worker was built' });
  writeFileSync(source, 'export const a = 1;');
  const hash = createHash('sha256').update('src/a.ts').update('\0').update(readFileSync(source)).update('\0').digest('hex');
  writeFileSync(join(root, 'build', 'worker', 'heavy-worker.json'), JSON.stringify({ entry: 'heavy-worker.mjs', inputs: ['src/a.ts'], hash }));
  expect(workerScript(root).bundled).toBe(true);
  writeFileSync(source, 'export const a = 2;');
  expect(workerScript(root)).toMatchObject({ bundled: false, reason: 'the bundled worker is older than its sources' });
  rmSync(source);
  expect(workerScript(root)).toMatchObject({ bundled: false, reason: 'a source of the bundled worker is missing' });
});

it('prepares a planet for landing only when this flight could land there', async () => {
  const [store] = twins(), w = new HeavyWork(); workers.push(w);
  store.useHeavyWork(w);
  const id = 'grounded-pilot', home = store.create(id).planetId;
  const other = store.db.prepare("SELECT id FROM planets WHERE kind='garden' AND id<>? LIMIT 1").get(home)!.id as string;
  // Standing at home, not flying: refused by the landing checks, and no planet is prepared.
  await expect(store.prepareLanding(id, { planetId: other, journey: 0, visitEpoch: store.state(id).location!.visitEpoch })).rejects.toMatchObject({ status: 409 });
  expect(w.starts).toBe(0);
});

it('shares one job between requests for the same key, reports worker failures and turns work away beyond its queue', async () => {
  const w = new HeavyWork({ limit: 2 }); workers.push(w);
  // No legal neighbourhood fits these inputs, so the worker reports the generator's own refusal.
  const input = { radius: 11, seed: 7, environment: null };
  const first = w.run('home', 'home:same', input), again = w.run('home', 'home:same', input);
  expect(again).toBe(first);
  const second = w.run('home', 'home:other', { ...input, seed: 8 });
  await expect(w.run('home', 'home:third', { ...input, seed: 9 })).rejects.toMatchObject({ status: 503 });
  await expect(first).rejects.toThrow('No legal home neighbourhood');
  await Promise.allSettled([second]);
  expect(w.pending).toBe(0);
});

it('keeps answering other requests while a new player arrives', async () => {
  const base = inject('baseUrl');
  const arrival = fetch(base + '/api/state').then(response => response.json());
  let arrived = false; void arrival.then(() => { arrived = true; });
  const waits: number[] = [];
  while (!arrived) {
    const sent = performance.now();
    await fetch(base + '/healthz');
    waits.push(performance.now() - sent);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  expect((await arrival).home).toBeTruthy();
  expect(Math.max(...waits)).toBeLessThan(250);
  // Only meaningful when the arrival took long enough to probe during it.
  expect(waits.length).toBeGreaterThan(3);
}, 30_000);
