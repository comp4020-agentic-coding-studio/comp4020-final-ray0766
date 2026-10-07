import { expect, inject, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore } from '../src/server/store.ts';
import { industrialCabin } from '../src/assets/claude-geometry/blueprint/samples.ts';
import { encodeBlueprint } from '../src/assets/claude-geometry/blueprint/codec.ts';
import { STARTERS, encodeShipDesign } from '../src/assets/claude-geometry/ship/design.ts';
import { defaultEnvironment, encodeEnvironment } from '../src/assets/claude-geometry/terrain/env.ts';
import { normalize } from '../src/shared/world.ts';
import type { Universe } from '../src/shared/planets.ts';

type Store = ReturnType<typeof openStore>;
type Body = Record<string, unknown>;
const tables = ['players', 'planets', 'visits', 'planet_objects', 'object_tombstones',
  'blueprint_contents', 'blueprint_library', 'player_ships', 'ground_states',
  'history_heads', 'history_events', 'history_snapshots'];
const rows = (s: Store) => tables.map(table => s.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
const blueprint = (changed = false) => {
  const bp = industrialCabin();
  if (changed) bp.parts = bp.parts.filter(part => part.part !== 'roof.plant');
  return bp;
};
function setup(path = ':memory:') {
  const s = openStore(path);
  s.create('owner'); s.create('visitor');
  const planet = s.universe('owner').planets.find(p => p.kind === 'garden')!.id;
  s.claim('owner', planet); s.visit('owner', planet); s.visit('visitor', planet);
  s.saveBlueprint('owner', { document: encodeBlueprint(blueprint()), expectedVersion: 0 });
  s.saveShip('owner', { document: encodeShipDesign(STARTERS[0]), version: 0 });
  return { s, planet };
}
const writes = [
  {
    name: 'blueprint',
    body: (_planet: string, alternate = false): Body => ({
      document: encodeBlueprint({ ...blueprint(true), name: alternate ? 'Other tab' : 'Edited cabin' }), expectedVersion: 1,
    }),
    save: (s: Store, body: Body) => s.saveBlueprint('owner', body),
    // The new content and library update have both happened before this failure.
    trigger: 'AFTER UPDATE ON blueprint_library',
  },
  {
    name: 'ship',
    body: (_planet: string, alternate = false): Body => ({ document: encodeShipDesign(STARTERS[alternate ? 2 : 1]), version: 1 }),
    save: (s: Store, body: Body) => s.saveShip('owner', body),
    trigger: 'AFTER UPDATE OF revision ON players',
  },
  {
    name: 'terrain',
    body: (planet: string, alternate = false): Body => ({ planetId: planet,
      environment: encodeEnvironment(defaultEnvironment('desert', alternate ? 2 : 1)), expectedRevision: 1 }),
    save: (s: Store, body: Body) => s.terrain('owner', body),
    // Fails after the environment update and deletion of both visitors' ground states.
    trigger: 'AFTER UPDATE OF revision ON players',
  },
];

it('saves unplaced blueprint geometry edits and retries without discarding immutable content', () => {
  const { s } = setup();
  try {
    const old = s.library('owner')[0], request = writes[0].body('');
    const saved = s.saveBlueprint('owner', request);
    expect(saved.version).toBe(2); expect(saved.hash).not.toBe(old.hash);
    expect(s.saveBlueprint('owner', request)).toEqual(saved);
    expect(s.db.prepare('SELECT count(*) AS n FROM blueprint_contents').get()!.n).toBe(2);
    expect(s.library('owner')).toEqual([saved]);
    expect(() => s.saveBlueprint('owner', { document: encodeBlueprint(blueprint()), expectedVersion: 0 })).toThrow('another tab');
    expect(s.library('owner')).toEqual([saved]);
  } finally { s.close(); }
});

it('keeps historical geometry readable after removing its last placement and editing the library', () => {
  const { s, planet } = setup();
  try {
    const old = s.library('owner')[0], objectId = randomUUID();
    s.createObject('owner', { planetId: planet, objectId, kind: 'structure', blueprintHash: old.hash,
      position: normalize([.55, 1, .4]), rotation: 0 });
    const snapshot = s.historySnapshot('owner', planet, 1);
    s.removeObject('owner', { planetId: planet, objectId, expectedVersion: 1 });
    s.saveBlueprint('owner', writes[0].body(planet));
    const replay = s.historySnapshot('owner', planet, 1);
    expect(replay.document).toBe(snapshot.document);
    expect(replay.blueprints).toEqual({ [old.hash]: old.blueprint.parts });
    expect(s.historyPage('owner', planet).head).toBe(2);
    expect(s.universe('owner').currentPlanet.objects).toEqual([]);
    expect(() => s.db.prepare('DELETE FROM blueprint_contents WHERE hash=?').run(old.hash)).toThrow('immutable');
  } finally { s.close(); }
});

for (const write of writes) {
  it.each(['ABORT', 'ROLLBACK'])(`${write.name} preserves every old row and the original error after a late %s failure`, failure => {
    const dir = mkdtempSync(join(tmpdir(), 'save-recovery-')), path = join(dir, 'world.sqlite');
    const fixture = setup(path); let s = fixture.s;
    try {
      const request = write.body(fixture.planet), before = rows(s);
      s.db.exec(`CREATE TRIGGER fail_save ${write.trigger} BEGIN SELECT RAISE(${failure}, 'injected save failure'); END`);
      expect(() => write.save(s, request)).toThrow('injected save failure');
      expect(s.db.isTransaction).toBe(false); expect(rows(s)).toEqual(before);
      s.db.exec('DROP TRIGGER fail_save');
      s.close(); s = openStore(path);
      expect(rows(s)).toEqual(before);
      write.save(s, request);
      const saved = rows(s);
      write.save(s, request); expect(rows(s)).toEqual(saved);
      s.close(); s = openStore(path);
      expect(rows(s)).toEqual(saved);
      expect(s.db.prepare('PRAGMA user_version').get()!.user_version).toBe(10);
      expect(s.db.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');
    } finally { s.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it(`${write.name} rejects a stale connection and safely retries after a database lock`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'save-contention-')), path = join(dir, 'world.sqlite');
    const { s, planet } = setup(path), other = openStore(path);
    try {
      other.db.exec('PRAGMA busy_timeout=1');
      const request = write.body(planet), competing = write.body(planet, true), before = rows(other);
      s.db.exec('BEGIN IMMEDIATE');
      expect(() => write.save(other, request)).toThrow('locked');
      expect(other.db.isTransaction).toBe(false); expect(rows(other)).toEqual(before);
      s.db.exec('ROLLBACK');
      write.save(s, request);
      const saved = rows(s);
      expect(() => write.save(other, competing)).toThrow('another tab');
      write.save(other, request); expect(rows(other)).toEqual(saved);
      expect(rows(s)).toEqual(saved);
    } finally {
      if (s.db.isTransaction) s.db.exec('ROLLBACK');
      other.close(); s.close(); rmSync(dir, { recursive: true, force: true });
    }
  });
}

it('HTTP blueprint and ship saves collapse concurrent duplicates and reject a competing stale draft', async () => {
  const base = inject('baseUrl'), response = await fetch(base + '/api/state');
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const post = (route: string, body: Body) => fetch(base + '/api/' + route, {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const universe: Universe = await (await fetch(base + '/api/universe', { headers: { cookie } })).json();
  const planet = universe.planets.find(p => p.kind === 'garden' && !p.claimed)!.id;
  expect((await post('planets/claim', { planetId: planet })).status).toBe(200);
  const bp = blueprint();
  expect((await post('blueprints/save', { document: encodeBlueprint(bp), expectedVersion: 0 })).status).toBe(200);
  const requests = [
    { route: 'blueprints/save', version: (value: { version: number }) => value.version,
      first: writes[0].body(planet), second: writes[0].body(planet, true), expected: 2 },
    { route: 'ship/save', version: (value: { ship: { version: number } }) => value.ship.version,
      first: { ...writes[1].body(planet), version: 0 }, second: { ...writes[1].body(planet, true), version: 0 }, expected: 1 },
  ];
  for (const request of requests) {
    const duplicate = await Promise.all([post(request.route, request.first), post(request.route, request.first)]);
    expect(duplicate.map(r => r.status)).toEqual([200, 200]);
    const [a, b] = await Promise.all(duplicate.map(r => r.json()));
    expect(a).toEqual(b); expect(request.version(a)).toBe(request.expected);
    const retry = await post(request.route, request.first);
    expect(retry.status).toBe(200); expect(await retry.json()).toEqual(a);
    expect((await post(request.route, request.second)).status).toBe(409);
  }
});
