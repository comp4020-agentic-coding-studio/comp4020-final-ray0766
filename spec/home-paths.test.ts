import { afterEach, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { openStore } from '../src/server/store.ts';
import { planetStore } from '../src/server/planets.ts';
import { HOME_ENVIRONMENT, starterManifest } from '../src/shared/home-layout.ts';
import { defaultHomeInterior, HOME_SAMPLE_RADIUS } from '../src/shared/home.ts';
import { MAX_OBJECTS } from '../src/shared/planets.ts';
import { SPAWN } from '../src/shared/world.ts';
import { encodeBlueprint } from '../src/assets/claude-geometry/blueprint/codec.ts';
import type { Blueprint } from '../src/assets/claude-geometry/blueprint/model.ts';
import { canonicalJson } from '../src/assets/claude-geometry/core/doc.ts';
import { decodeSnapshot } from '../src/shared/timeline-codec.ts';

type Store = ReturnType<typeof openStore>;
const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
const changes = (store: Store) => Number(store.db.prepare('SELECT total_changes() AS n').get()!.n);
const rows = (store: Store, table: string) => store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
const tables = (store: Store) => Object.fromEntries(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => [String(row.name), rows(store, String(row.name))]));

/** A synthetic pre-path v2 save, built in memory without reading any saved DB. */
function legacy() {
  const store = openStore(':memory:', { homeSample: true }); stores.push(store);
  const planet = String(store.db.prepare("SELECT id FROM planets WHERE kind='garden' AND owner_id IS NULL ORDER BY rowid LIMIT 1").get()!.id), plan = starterManifest(HOME_SAMPLE_RADIUS);
  store.db.prepare('INSERT INTO players(id,position,moved_at,planet_id) VALUES(?,?,?,?)').run('owner', JSON.stringify(SPAWN), Date.now(), planet);
  store.db.prepare('UPDATE planets SET owner_id=? WHERE id=?').run('owner', planet);
  let building = '';
  for (const [index, site] of [plan.home, ...plan.infrastructure].entries()) {
    const blueprint: Blueprint = { ...site.blueprint, id: randomUUID() as Blueprint['id'], name: `My original building ${index}`, groups: [{ name: `My original part group ${index}`, members: site.blueprint.parts.slice(0, 2).map(part => part.n) }] };
    const saved = store.saveBlueprint('owner', { document: JSON.parse(encodeBlueprint(blueprint)), expectedVersion: 0 }), id = randomUUID();
    store.createObject('owner', { planetId: planet, objectId: id, kind: 'structure', position: site.position, rotation: site.rotation, blueprintHash: saved.hash });
    if (index === 0) building = id;
  }
  const room = { ...defaultHomeInterior(), version: 7, material: 'sage' };
  store.db.prepare('INSERT INTO home_interiors(planet_id,building_id,interior_id,document) VALUES(?,?,?,?)').run(planet, building, randomUUID(), JSON.stringify(room));
  const manifest = { generator: 'home-neighbourhood', version: 2, seed: 20261008, radius: HOME_SAMPLE_RADIUS, environment: HOME_ENVIRONMENT, catalogueVersion: 'home-kit-v1', routes: plan.routes, homeBuildingId: building, objects: store.universe('owner').currentPlanet.objects };
  store.db.prepare('INSERT INTO home_manifests(planet_id,version,document,hash) VALUES(?,2,?,?)').run(planet, JSON.stringify(manifest), createHash('sha256').update(canonicalJson(manifest)).digest('hex'));
  store.universe('owner');
  return { store, planet, building };
}
const applyBody = (store: Store, planetId: string) => { const preview = store.previewHomePaths('owner', { planetId }); return { planetId, expectedRevision: preview.expectedRevision, hash: preview.hash, visitEpoch: store.state('owner').location!.visitEpoch }; };

it('previews a legacy v2 route as a deterministic pure read with ordinary unscaled Path instances', () => {
  const { store, planet } = legacy(), before = tables(store), count = changes(store);
  const preview = store.previewHomePaths('owner', { planetId: planet });
  expect(preview.manifestVersion).toBe(2); expect(preview.added).toBeGreaterThan(0);
  expect(preview.objects.every(object => object.kind === 'path' && object.version === 1 && object.radius === undefined && object.height === undefined)).toBe(true);
  expect(preview.totalObjects).toBe(preview.currentObjects + preview.added);
  expect(preview.totalObjects).toBeLessThanOrEqual(MAX_OBJECTS);
  expect(store.previewHomePaths('owner', { planetId: planet })).toEqual(preview);
  expect(changes(store)).toBe(count); expect(tables(store)).toEqual(before);
});

it('adds ordinary editable Paths without rewriting existing objects, library labels, furniture or the manifest', () => {
  const { store, planet } = legacy(), before = store.universe('owner'), ids = new Set(before.currentPlanet.objects.map(object => object.id));
  const protectedTables = ['blueprint_library', 'blueprint_contents', 'home_interiors', 'home_manifests'];
  const protectedRows = protectedTables.map(table => rows(store, table)), oldObjectRows = rows(store, 'planet_objects');
  const preview = store.previewHomePaths('owner', { planetId: planet }), result = store.applyHomePaths('owner', applyBody(store, planet));
  const added = result.currentPlanet.objects.filter(object => !ids.has(object.id));
  expect(added).toHaveLength(preview.added);
  for (const [index, object] of added.entries()) {
    expect(object.kind).toBe('path'); expect(object.rotation).toBe(preview.objects[index].rotation);
    object.position.forEach((coordinate, axis) => expect(coordinate).toBeCloseTo(preview.objects[index].position[axis], 12));
  }
  expect(rows(store, 'planet_objects').filter(row => ids.has(String(row.id)))).toEqual(oldObjectRows);
  expect(protectedTables.map(table => rows(store, table))).toEqual(protectedRows);
  expect(added.length).toBeGreaterThan(1);
  const first = added[0], second = added[1];
  const ordinaryId = randomUUID(), ordinary = store.createObject('owner', { planetId: planet, objectId: ordinaryId, kind: 'path', position: first.position, rotation: first.rotation }).currentPlanet.objects.find(object => object.id === ordinaryId)!;
  for (const object of added) { expect(object.assetVersion).toBe(ordinary.assetVersion); expect(object.radius).toBe(ordinary.radius); expect(object.height).toBe(ordinary.height); }
  const moved = store.updateObject('owner', { planetId: planet, objectId: first.id, position: second.position, rotation: .3, expectedVersion: first.version });
  const movedPath = moved.currentPlanet.objects.find(object => object.id === first.id)!;
  expect(movedPath).toMatchObject({ kind: 'path', rotation: .3, version: 2 });
  expect(movedPath.assetVersion).toBe(ordinary.assetVersion);
  movedPath.position.forEach((coordinate, axis) => expect(coordinate).toBeCloseTo(second.position[axis], 12));
  const removed = store.removeObject('owner', { planetId: planet, objectId: first.id, expectedVersion: 2 });
  expect(removed.currentPlanet.objects.some(object => object.id === first.id)).toBe(false);
  expect(rows(store, 'planet_objects').filter(row => ids.has(String(row.id)))).toEqual(oldObjectRows);
  expect(protectedTables.map(table => rows(store, table))).toEqual(protectedRows);
  const snapshot = decodeSnapshot(store.historySnapshot('owner', planet).document);
  expect(snapshot.ok).toBe(true);
  if (snapshot.ok) { expect(snapshot.value.objects[first.id]).toBeUndefined(); expect(snapshot.value.objects[second.id].spec).toEqual({ kind: 'prop', prop: 'path' }); }
});

it('rejects stale revisions, changed scene hashes and forged fields without writes', () => {
  const { store, planet, building } = legacy(), body = applyBody(store, planet), before = tables(store), count = changes(store);
  expect(() => store.applyHomePaths('owner', { ...body, expectedRevision: body.expectedRevision - 1 })).toThrow('Preview');
  expect(() => store.applyHomePaths('owner', { ...body, hash: '0'.repeat(64) })).toThrow('Preview');
  expect(() => store.applyHomePaths('owner', { ...body, objects: [] })).toThrow('Unexpected');
  expect(changes(store)).toBe(count); expect(tables(store)).toEqual(before);
  const house = store.universe('owner').currentPlanet.objects.find(object => object.id === building)!;
  store.updateObject('owner', { planetId: planet, objectId: building, position: house.position, rotation: .01, expectedVersion: house.version });
  const changed = tables(store), after = changes(store);
  expect(() => store.applyHomePaths('owner', body)).toThrow('Preview');
  expect(changes(store)).toBe(after); expect(tables(store)).toEqual(changed);
});

it('uses the ordinary 64-object budget and never applies a partial path beyond it', () => {
  const { store, planet } = legacy(), point = store.previewHomePaths('owner', { planetId: planet }).objects[0];
  // Use the same canonical player placement implementation as the endpoint;
  // avoid rebuilding a return-view ground scene for every fixture insertion.
  const ordinary = planetStore(store.db);
  for (let count = store.universe('owner').currentPlanet.objects.length; count < MAX_OBJECTS - 1; count++) ordinary.create('owner', { planetId: planet, objectId: randomUUID(), kind: 'path', position: point.position, rotation: point.rotation });
  const preview = store.previewHomePaths('owner', { planetId: planet });
  expect(preview).toMatchObject({ currentObjects: 63, added: 1, totalObjects: 64, capacity: 1, budgetLimited: true });
  const result = store.applyHomePaths('owner', applyBody(store, planet));
  expect(result.currentPlanet.objects).toHaveLength(64);
  const full = store.previewHomePaths('owner', { planetId: planet }); expect(full).toMatchObject({ currentObjects: 64, added: 0, capacity: 0, budgetLimited: true });
  const before = changes(store), state = tables(store);
  expect(() => store.applyHomePaths('owner', applyBody(store, planet))).toThrow('No more');
  expect(changes(store)).toBe(before); expect(tables(store)).toEqual(state);
}, 10_000);

it('rejects visitors and indoor owner actions before changing any saved data', () => {
  const { store, planet } = legacy(), body = applyBody(store, planet);
  store.create('visitor'); store.visit('visitor', planet);
  const visitor = store.state('visitor'), before = changes(store), state = tables(store);
  expect(() => store.previewHomePaths('visitor', { planetId: planet })).toThrow('owner');
  expect(() => store.applyHomePaths('visitor', { ...body, visitEpoch: visitor.location!.visitEpoch })).toThrow('owner');
  expect(changes(store)).toBe(before); expect(tables(store)).toEqual(state);
  const owner = store.state('owner');
  store.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(owner.home!.door.position), 'owner');
  store.enterHome('owner', { planetId: planet, buildingId: owner.home!.buildingId, visitEpoch: owner.location!.visitEpoch });
  const indoor = changes(store), inside = tables(store);
  expect(() => store.previewHomePaths('owner', { planetId: planet })).toThrow('Leave');
  expect(() => store.applyHomePaths('owner', { ...body, visitEpoch: store.state('owner').location!.visitEpoch })).toThrow('Leave');
  expect(changes(store)).toBe(indoor); expect(tables(store)).toEqual(inside);
}, 10_000);

it('rolls back the entire ordinary-object batch when a later path history append fails', () => {
  const { store, planet } = legacy(), body = applyBody(store, planet), sequence = Number(store.db.prepare('SELECT seq FROM history_heads WHERE planet_id=?').get(planet)!.seq);
  expect(store.previewHomePaths('owner', { planetId: planet }).added).toBeGreaterThan(1);
  store.db.exec(`CREATE TRIGGER reject_second_converted_path BEFORE INSERT ON history_events WHEN NEW.seq=${sequence + 2} BEGIN SELECT RAISE(ABORT,'injected path history failure'); END;`);
  const before = tables(store);
  expect(() => store.applyHomePaths('owner', body)).toThrow('injected path history failure');
  expect(tables(store)).toEqual(before);
});
