import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openStore } from '../src/server/store.ts';
import { planetStore } from '../src/server/planets.ts';
import { blueprintStore } from '../src/server/blueprints.ts';
import { historyStore } from '../src/server/history.ts';
import { homeStore } from '../src/server/home.ts';
import { homeSetupStore } from '../src/server/home-setup.ts';
import { HOME_DOOR_PART, HOME_ENVIRONMENT, starterHome, starterManifest } from '../src/shared/home-layout.ts';
import { HOME_SAMPLE_RADIUS } from '../src/shared/home.ts';
import { MAX_BLUEPRINTS, MAX_STRUCTURES, structureFit } from '../src/shared/blueprints.ts';
import { MAX_OBJECTS } from '../src/shared/planets.ts';
import { SPAWN } from '../src/shared/world.ts';
import { encodeBlueprint } from '../src/shared/blueprint-codec.ts';
import type { Blueprint } from '../src/shared/blueprint-model.ts';
import { partTransform, pivotOf } from '../src/shared/blueprint-model.ts';
import { localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { decodeSnapshot } from '../src/shared/timeline-codec.ts';

type Store = ReturnType<typeof openStore>;
const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
const rows = (store: Store, table: string) => store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
const tables = (store: Store) => Object.fromEntries(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => [String(row.name), rows(store, String(row.name))]));
const changes = (store: Store) => Number(store.db.prepare('SELECT total_changes() AS n').get()!.n);

/** Synthetic old owner: real tables and placement rules, no existing DB is read. */
function legacy(withBuilding = true) {
  const store = openStore(':memory:', { homeSample: true }); stores.push(store);
  // The owning integration migration supplies this additive column in schema 15.
  if (!store.db.prepare('PRAGMA table_info(home_interiors)').all().some(column => column.name === 'door_part')) store.db.exec('ALTER TABLE home_interiors ADD COLUMN door_part INTEGER NOT NULL DEFAULT 1');
  const planetId = String(store.db.prepare("SELECT id FROM planets WHERE kind='garden' AND owner_id IS NULL ORDER BY rowid LIMIT 1").get()!.id);
  store.db.prepare('INSERT INTO players(id,position,moved_at,planet_id) VALUES(?,?,?,?)').run('owner', JSON.stringify(SPAWN), Date.now(), planetId);
  store.db.prepare('UPDATE planets SET owner_id=?,environment=?,sample_radius=? WHERE id=?').run('owner', HOME_ENVIRONMENT, HOME_SAMPLE_RADIUS, planetId);
  const blueprints = blueprintStore(store.db), history = historyStore(store.db), planets = planetStore(store.db, blueprints, history);
  const homes = homeStore(store.db, planets, blueprints, history, true), setup = homeSetupStore(store.db, planets, blueprints, homes, true);
  let buildingId = '', hash = '';
  if (withBuilding) {
    const site = starterManifest(HOME_SAMPLE_RADIUS).home;
    const blueprint: Blueprint = { ...site.blueprint, id: randomUUID() as Blueprint['id'], name: 'Keep my original cottage name', groups: [{ name: 'My original deck group', members: [10, 11] }], parts: site.blueprint.parts.map(part => part.n === HOME_DOOR_PART ? { ...part, n: 777 } : part) };
    hash = blueprints.save('owner', { document: JSON.parse(encodeBlueprint(blueprint)), expectedVersion: 0 }).hash;
    buildingId = randomUUID();
    planets.create('owner', { planetId, objectId: buildingId, kind: 'structure', position: site.position, rotation: site.rotation, blueprintHash: hash });
  }
  const confirmBody = (mode: 'bind' | 'add') => {
    const preview = setup.preview('owner', { planetId });
    return { planetId, mode, expectedRevision: preview.expectedRevision, hash: preview.hash, visitEpoch: homes.location('owner').visitEpoch, ...(mode === 'bind' ? { buildingId, partNumber: 777 } : {}) };
  };
  return { store, planetId, planets, homes, blueprints, history, setup, buildingId, hash, confirmBody };
}

it('previews deterministically without writes and binds any selected open-door number without rewriting old content', () => {
  const { store, planetId, setup, buildingId, confirmBody } = legacy(), before = tables(store), count = changes(store);
  const preview = setup.preview('owner', { planetId });
  expect(preview.candidates).toContainEqual({ buildingId, partNumber: 777, buildingName: 'Keep my original cottage name' });
  expect(preview.addition).toBeDefined();
  expect(setup.preview('owner', { planetId })).toEqual(preview);
  expect(tables(store)).toEqual(before); expect(changes(store)).toBe(count);
  const result = setup.confirm('owner', confirmBody('bind'));
  expect(result).toMatchObject({ planetId, buildingId });
  expect(rows(store, 'home_interiors')).toMatchObject([{ planet_id: planetId, building_id: buildingId, interior_id: result.interiorId, door_part: 777, variant: 'custom' }]);
  for (const table of ['planet_objects', 'blueprint_library', 'blueprint_contents', 'history_events', 'history_snapshots', 'history_heads', 'home_manifests', 'player_ships', 'visits']) expect(rows(store, table)).toEqual(before[table]);
  expect(setup.preview('owner', { planetId })).toMatchObject({ existingHome: true, candidates: [] });
  const bound = tables(store);
  expect(() => setup.confirm('owner', confirmBody('bind'))).toThrow('already');
  expect(tables(store)).toEqual(bound);
});

it('adds one ordinary editable structure and private blueprint in the original terrain and records exactly one history creation', () => {
  const { store, planetId, setup, planets, homes, blueprints, history, confirmBody } = legacy();
  // The new name must be distinct without changing the old named/grouped entry.
  const duplicateName = { ...starterHome(), id: randomUUID() as Blueprint['id'] };
  blueprints.save('owner', { document: JSON.parse(encodeBlueprint(duplicateName)), expectedVersion: 0 });
  const before = tables(store), preview = setup.preview('owner', { planetId }), priorHead = history.page('owner', planetId).head;
  expect(preview.addition!.blueprint.name).toBe(`${duplicateName.name} (2)`);
  const result = setup.confirm('owner', confirmBody('add')), view = planets.view('owner', planetId), placed = view.objects.find(object => object.id === result.buildingId)!;
  expect(view.objects).toHaveLength(before.planet_objects.length + 1);
  expect(view.environment).toBe(HOME_ENVIRONMENT);
  placed.position.forEach((coordinate, axis) => expect(coordinate).toBeCloseTo(preview.addition!.position[axis], 12)); expect(placed.rotation).toBe(preview.addition!.rotation);
  expect(blueprints.list('owner').some(entry => entry.hash === placed.blueprintHash && entry.blueprint.name === preview.addition!.blueprint.name)).toBe(true);
  expect(history.page('owner', planetId).head).toBe(priorHead + 1);
  const replay = decodeSnapshot(history.snapshot('owner', planetId).document);
  expect(replay.ok && replay.value.objects[result.buildingId].spec).toEqual({ kind: 'structure', blueprintHash: placed.blueprintHash });
  for (const old of before.planet_objects) expect(rows(store, 'planet_objects')).toContainEqual(old);
  for (const old of before.blueprint_library) expect(rows(store, 'blueprint_library')).toContainEqual(old);
  expect(rows(store, 'home_manifests')).toEqual(before.home_manifests);
  const ownLibrary = blueprints.list('owner').find(entry => entry.hash === placed.blueprintHash)!;
  blueprints.save('owner', { document: JSON.parse(encodeBlueprint({ ...ownLibrary.blueprint, name: 'My renamed new home' })), expectedVersion: ownLibrary.version });
  planets.update('owner', { planetId, objectId: placed.id, position: placed.position, rotation: .05, expectedVersion: placed.version });
  expect(homes.descriptor('owner')!.buildingId).toBe(placed.id);
  expect(rows(store, 'home_interiors')).toHaveLength(1);
});

it('rejects stale revisions, changed libraries, invalid doors, epochs and forged fields with zero writes', () => {
  const { store, planetId, setup, blueprints, confirmBody } = legacy(), body = confirmBody('bind');
  for (const patch of [{ expectedRevision: body.expectedRevision - 1 }, { hash: '0'.repeat(64) }, { partNumber: 10 }, { buildingId: randomUUID() }, { visitEpoch: 3 }, { ownerId: 'forged' }]) {
    const before = tables(store), count = changes(store);
    expect(() => setup.confirm('owner', { ...body, ...patch })).toThrow();
    expect(tables(store)).toEqual(before); expect(changes(store)).toBe(count);
  }
  const entry = blueprints.list('owner')[0];
  blueprints.save('owner', { document: JSON.parse(encodeBlueprint({ ...entry.blueprint, name: 'A deliberately changed label' })), expectedVersion: entry.version });
  const before = tables(store), count = changes(store);
  expect(() => setup.confirm('owner', body)).toThrow('Preview');
  expect(() => setup.preview('owner', { planetId, seed: 123 })).toThrow('Unexpected');
  expect(tables(store)).toEqual(before); expect(changes(store)).toBe(count);
});

it.each(['objects', 'structures', 'library'] as const)('respects the existing %s budget while permitting an existing-door binding', kind => {
  const { store, planetId, setup, blueprints, confirmBody, buildingId } = legacy();
  if (kind === 'library') {
    for (let i = blueprints.list('owner').length; i < MAX_BLUEPRINTS; i++) blueprints.save('owner', { document: JSON.parse(encodeBlueprint({ ...starterHome(), id: randomUUID() as Blueprint['id'], name: `Saved design ${i}` })), expectedVersion: 0 });
  } else if (kind === 'objects') {
    for (let i = 1; i < MAX_OBJECTS; i++) store.db.prepare("INSERT INTO planet_objects(id,planet_id,kind,position,rotation) VALUES(?,?,'path',?,0)").run(randomUUID(), planetId, JSON.stringify([0, -1, 0]));
  } else {
    // Synthetic full structure table tests capacity independently of site search.
    for (let i = 1; i < MAX_STRUCTURES; i++) store.db.prepare('INSERT INTO planet_objects(id,planet_id,kind,position,rotation,blueprint_hash,radius,height) SELECT ?,planet_id,kind,position,rotation,blueprint_hash,radius,height FROM planet_objects WHERE id=?').run(randomUUID(), buildingId);
  }
  const preview = setup.preview('owner', { planetId }), before = tables(store), count = changes(store);
  expect(preview.addition).toBeUndefined(); expect(preview.reason).toContain('already');
  expect(() => setup.confirm('owner', confirmBody('add'))).toThrow('already');
  expect(tables(store)).toEqual(before); expect(changes(store)).toBe(count);
  expect(setup.confirm('owner', confirmBody('bind')).buildingId).toBe(buildingId);
});

it('checks owner, landed and exterior state without writes', () => {
  const { store, planetId, planets, homes, setup, buildingId, confirmBody } = legacy();
  store.db.prepare('INSERT INTO players(id,position,moved_at,planet_id) VALUES(?,?,?,?)').run('visitor', JSON.stringify(SPAWN), Date.now(), planetId);
  const body = confirmBody('bind');
  let before = tables(store), count = changes(store);
  expect(() => setup.preview('visitor', { planetId })).toThrow('owner');
  expect(() => setup.confirm('visitor', body)).toThrow('owner');
  expect(tables(store)).toEqual(before); expect(changes(store)).toBe(count);
  store.db.prepare('UPDATE players SET flight=? WHERE id=?').run(JSON.stringify({ mode: 'space' }), 'owner');
  before = tables(store); count = changes(store);
  expect(() => setup.preview('owner', { planetId })).toThrow('Land');
  expect(tables(store)).toEqual(before); expect(changes(store)).toBe(count);
  store.db.prepare('UPDATE players SET flight=NULL WHERE id=?').run('owner');
  setup.confirm('owner', confirmBody('bind'));
  const home = homes.descriptor('owner')!;
  store.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(home.door.position), 'owner');
  homes.enter('owner', { planetId, buildingId, visitEpoch: homes.location('owner').visitEpoch });
  before = tables(store); count = changes(store);
  expect(() => setup.preview('owner', { planetId })).toThrow('Leave');
  expect(tables(store)).toEqual(before); expect(changes(store)).toBe(count);
  expect(planets.view('owner', planetId).objects).toHaveLength(1);
});

it('refuses to bind a doorway occupied by a saved disconnected visitor without writes', () => {
  const { store, planetId, planets, blueprints, setup, buildingId, confirmBody } = legacy(), body = confirmBody('bind');
  const planet = planets.view('owner', planetId), building = planet.objects.find(object => object.id === buildingId)!;
  const parts = blueprints.parts(building.blueprintHash), transform = partTransform(parts.find(part => part.n === 777)!, pivotOf(parts));
  const fit = structureFit(parts, building.position, building.rotation, fieldOf(planet.environment, planet.radius));
  const point = localToDir({ dir: building.position, yaw: building.rotation }, fit.baseRadius, [transform.position[0], transform.position[1], transform.position[2] + .12]);
  store.db.prepare('INSERT INTO players(id,position,moved_at,planet_id) VALUES(?,?,?,?)').run('offline-visitor', JSON.stringify(point), 0, planetId);
  const before = tables(store), count = changes(store);
  expect(() => setup.confirm('owner', body)).toThrow('doorway');
  expect(tables(store)).toEqual(before); expect(changes(store)).toBe(count);
});

it('rolls back new content, library, object, history and home if final binding fails', () => {
  const { store, setup, confirmBody } = legacy(false), body = confirmBody('add');
  store.db.exec("CREATE TRIGGER reject_setup BEFORE INSERT ON home_interiors BEGIN SELECT RAISE(ABORT,'injected home bind failure'); END;");
  const before = tables(store);
  expect(() => setup.confirm('owner', body)).toThrow('injected home bind failure');
  expect(tables(store)).toEqual(before);
});

it('refuses an unbuildable synthetic surface without changing its terrain or saved content', () => {
  const { store, planetId, setup, confirmBody } = legacy(false);
  // A valid but tiny test sphere makes every unscaled 5×5 starter footprint
  // exceed the foundation limit. Production integration always uses 21.6.
  store.db.prepare('UPDATE planets SET sample_radius=1,world_radius=NULL,environment=NULL WHERE id=?').run(planetId);
  const before = tables(store), count = changes(store), preview = setup.preview('owner', { planetId });
  expect(preview.addition).toBeUndefined(); expect(preview.reason).toContain('No safe space');
  expect(() => setup.confirm('owner', confirmBody('add'))).toThrow('No safe space');
  expect(tables(store)).toEqual(before); expect(changes(store)).toBe(count);
});

// Up to 3.9 s on the x86-64 CI runner across runs 38434626581-38454559718, against the default 5 s.
it('initialises one normal identity once, keeps one planet and interior, and excludes previously occupied unclaimed worlds', () => {
  const store = openStore(':memory:', { integratedWorld: true }); stores.push(store);
  const occupied = String(store.db.prepare("SELECT id FROM planets WHERE kind='garden' AND owner_id IS NULL ORDER BY rowid LIMIT 1").get()!.id);
  store.db.prepare('INSERT INTO players(id,position,moved_at,planet_id) VALUES(?,?,0,?)').run('old-unowned', JSON.stringify(SPAWN), occupied);
  const playerBefore = store.db.prepare('SELECT * FROM players WHERE id=?').get('old-unowned');
  const first = store.create('new-normal'), universe = store.universe('new-normal');
  expect(store.homeSample).toBe(false); expect(store.integratedWorld).toBe(true);
  expect(universe.ownedPlanetId).not.toBe(occupied);
  expect(universe.currentPlanet.radius).toBe(HOME_SAMPLE_RADIUS);
  expect(universe.planets.every(planet => planet.radius === HOME_SAMPLE_RADIUS)).toBe(true);
  expect(first.home?.canEdit).toBe(true);
  expect(rows(store, 'home_interiors').filter(row => row.planet_id === universe.ownedPlanetId)).toHaveLength(1);
  const documents = ['home_interiors', 'home_manifests', 'planet_objects', 'blueprint_library'].map(table => rows(store, table));
  for (let i = 0; i < 3; i++) expect(store.universe('new-normal').ownedPlanetId).toBe(universe.ownedPlanetId);
  expect(['home_interiors', 'home_manifests', 'planet_objects', 'blueprint_library'].map(table => rows(store, table))).toEqual(documents);
  expect(store.db.prepare('SELECT * FROM players WHERE id=?').get('old-unowned')).toEqual(playerBefore);
  expect(store.db.prepare('SELECT owner_id FROM planets WHERE id=?').get(occupied)!.owner_id).toBeNull();
  expect(store.universe('old-unowned').ownedPlanetId).toBeNull();
  expect(store.state('old-unowned').home).toBeNull();
  expect(() => store.claim('new-normal', occupied)).toThrow('already');
  expect(rows(store, 'home_interiors')).toHaveLength(1);
  const claimed = store.claim('old-unowned', occupied);
  // Claiming makes it this identity's home: its one teleport station is placed, and nothing else.
  const station = String(store.db.prepare("SELECT object_id FROM home_stations WHERE planet_id=? AND status='placed'").get(occupied)!.object_id);
  expect(claimed.player.home).toBeNull(); expect(claimed.currentPlanet.objects.map(object => object.id)).toEqual([station]);
  const plan = store.previewHomeSetup('old-unowned', { planetId: occupied });
  const confirmed = store.confirmHomeSetup('old-unowned', { planetId: occupied, expectedRevision: plan.expectedRevision, hash: plan.hash, visitEpoch: claimed.player.location!.visitEpoch, mode: 'add' });
  expect(confirmed.player.home?.canEdit).toBe(true);
  expect(confirmed.currentPlanet.objects).toHaveLength(2);
  expect(confirmed.currentPlanet.homeManifest).toBeUndefined();
  expect(rows(store, 'home_interiors')).toHaveLength(2);
},15_000);
