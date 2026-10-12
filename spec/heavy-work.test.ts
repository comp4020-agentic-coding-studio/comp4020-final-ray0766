import { afterEach, expect, inject, it } from 'vitest';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HeavyWork } from '../src/server/heavy-work.ts';
import { openStore } from '../src/server/store.ts';

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
});

it('still welcomes a new player, home and station included, when the worker cannot run', async () => {
  const [inline, prepared] = twins(), id = 'arrival-without-worker';
  const a = inline.create(id);
  const broken = new HeavyWork({ script: new URL('data:text/javascript,throw new Error("The worker could not start.")') }); workers.push(broken);
  prepared.useHeavyWork(broken);
  const b = await prepared.createPrepared(id);
  expect(b.planetId).toBe(a.planetId);
  expect(saved(prepared, b.planetId)).toEqual(saved(inline, a.planetId));
  expect(station(prepared, b.planetId)).toEqual(station(inline, a.planetId));
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
