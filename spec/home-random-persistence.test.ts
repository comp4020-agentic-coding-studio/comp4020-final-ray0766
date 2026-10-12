import { afterEach, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STATION_HASH } from '../src/server/station-blueprint.ts';
import { openStore } from '../src/server/store.ts';
import { homeGenerationSeed } from '../src/server/home.ts';
import { HOME_ENVIRONMENT, starterManifest } from '../src/shared/home-layout.ts';
import { HOME_GENERATION_BUDGET, HOME_GENERATION_VERSION } from '../src/shared/home-generation.ts';
import { SHORT_STREET_ENVIRONMENT } from '../src/shared/district-layout.ts';
import { defaultHomeInterior, HOME_SAMPLE_RADIUS } from '../src/shared/home.ts';
import { encodeBlueprint } from '../src/shared/blueprint-codec.ts';
import type { Blueprint } from '../src/shared/blueprint-model.ts';
import { canonicalJson } from '../src/assets/claude-geometry/core/doc.ts';
import { decodeSnapshot } from '../src/shared/timeline-codec.ts';

const stores: ReturnType<typeof openStore>[] = [];
const dirs: string[] = [];
const sample = (path = ':memory:') => { const s = openStore(path, { homeSample: true }); stores.push(s); return s; };
const databasePath = () => { const dir = mkdtempSync(join(tmpdir(), 'home-random-')); dirs.push(dir); return join(dir, 'isolated.sqlite'); };
const receipt = (s: ReturnType<typeof openStore>, planet: string) => s.db.prepare('SELECT version,document,hash FROM home_manifests WHERE planet_id=?').get(planet)!;
const enter = (s: ReturnType<typeof openStore>, id: string) => { const p = s.state(id); return s.enterHome(id, { planetId: p.planetId, buildingId: p.home!.buildingId, visitEpoch: p.location!.visitEpoch }); };
afterEach(() => { for (const s of stores.splice(0)) { try { s.close(); } catch { /* Closed before persistence checks. */ } } for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('stores one generated layout per owned planet with concrete IDs, hashes and enough editing budget', () => {
  const s = sample(), seeds = new Set<number>();
  for (let i = 0; i < 6; i++) {
    const id = `owner-${i}`;
    s.create(id);
    const u = s.universe(id), manifest = u.currentPlanet.homeManifest!;
    expect(manifest).toMatchObject({ generator: 'home-neighbourhood', version: HOME_GENERATION_VERSION, seed: homeGenerationSeed(u.ownedPlanetId!), radius: HOME_SAMPLE_RADIUS, environment: u.currentPlanet.environment, catalogueVersion: 'village-kit-v1' });
    expect(u.player.home!.variant).toBe('custom');
    // The teleport station is placed beside the generated layout, recorded in its own receipt.
    const station = String(s.db.prepare("SELECT object_id FROM home_stations WHERE planet_id=? AND status='placed'").get(u.ownedPlanetId!)!.object_id);
    expect(u.currentPlanet.objects.find(object => object.id === station)?.blueprintHash).toBe(STATION_HASH);
    expect(manifest.objects).toEqual(u.currentPlanet.objects.filter(object => object.id !== station));
    expect(manifest.routes.find(route => route.id === 'home')!.points.length).toBeGreaterThanOrEqual(2);
    expect(manifest.objects.length).toBeLessThanOrEqual(HOME_GENERATION_BUDGET.maxObjects);
    const structures = u.currentPlanet.objects.filter(object => object.kind === 'structure'), generated = structures.filter(object => object.id !== station);
    expect(generated.length).toBeGreaterThanOrEqual(2);
    expect(generated.length).toBeLessThanOrEqual(HOME_GENERATION_BUDGET.maxStructures);
    expect(s.library(id)).toHaveLength(structures.length);
    for (const object of structures) expect(s.library(id).some(entry => entry.hash === object.blueprintHash)).toBe(true);
    expect(s.db.prepare('SELECT count(*) AS n FROM home_interiors WHERE planet_id=?').get(u.ownedPlanetId!)!.n).toBe(1);
    expect(s.db.prepare('SELECT count(*) AS n FROM planets WHERE owner_id=?').get(id)!.n).toBe(1);
    expect(u.player.ground!.sceneRevision).toBe(u.currentPlanet.revision);
    expect(s.historySnapshot(id, u.ownedPlanetId!).environment).toBe(manifest.environment);
    seeds.add(manifest.seed);
  }
  expect(seeds.size).toBe(6);
  expect(s.universe('owner-0').planets.every(planet => planet.radius === HOME_SAMPLE_RADIUS)).toBe(true);
  expect(() => s.claim('owner-0', s.universe('owner-1').ownedPlanetId)).toThrow();
}, 15_000);

it('reopens edited infrastructure and room contents without rerolling or replacing their creation receipt', () => {
  const path = databasePath(), s = sample(path);
  s.create('owner');
  const first = s.universe('owner'), planet = first.ownedPlanetId!, home = first.player.home!, originalReceipt = receipt(s, planet);
  const infrastructure = first.currentPlanet.objects.find(object => object.kind === 'structure' && object.id !== home.buildingId
    &&first.currentPlanet.blueprints?.[object.blueprintHash!]?.some(part=>part.part==='furniture.bench'))!;
  const entry = s.library('owner').find(entry => entry.hash === infrastructure.blueprintHash)!;
  const bench = entry.blueprint.parts.find(part => part.part === 'furniture.bench')!;
  const blueprint: Blueprint = { ...entry.blueprint, name: 'My named resting place', groups: [{ name: 'Keep my floor label', members: entry.blueprint.parts.slice(0, 2).map(part => part.n) }], parts: entry.blueprint.parts.filter(part => part.n !== bench.n) };
  const saved = s.saveBlueprint('owner', { document: JSON.parse(encodeBlueprint(blueprint)), expectedVersion: entry.version });
  s.replaceObject('owner', { planetId: planet, objectId: infrastructure.id, expectedVersion: infrastructure.version, blueprintHash: saved.hash });
  const prop = first.currentPlanet.objects.find(object => object.kind === 'flowers')!;
  s.removeObject('owner', { planetId: planet, objectId: prop.id, expectedVersion: prop.version });
  enter(s, 'owner');
  s.saveHome('owner', { buildingId: home.buildingId, expectedVersion: 1, material: 'sage', items: home.interior.items });
  const before = s.universe('owner'), library = s.library('owner');
  expect(receipt(s, planet)).toEqual(originalReceipt);
  s.close();
  const again = sample(path);
  expect(again.migrationBackup).toBeNull();
  expect(again.universe('owner')).toEqual(before);
  expect(again.library('owner')).toEqual(library);
  expect(receipt(again, planet)).toEqual(originalReceipt);
  expect(again.universe('owner').currentPlanet.objects.some(object => object.id === prop.id)).toBe(false);
  const inside = again.state('owner');
  again.exitHome('owner', { buildingId: home.buildingId, visitEpoch: inside.location!.visitEpoch });
  again.claim('owner', planet);
  expect(receipt(again, planet)).toEqual(originalReceipt);
  expect(again.state('owner').home).toMatchObject({ buildingId: home.buildingId, interiorId: home.interiorId, interior: { material: 'sage', version: 2 } });
  const snapshot = decodeSnapshot(again.historySnapshot('owner', planet).document);
  expect(snapshot.ok).toBe(true);
  if (snapshot.ok) {
    expect(snapshot.value.objects[infrastructure.id].spec).toMatchObject({ blueprintHash: saved.hash });
    expect(snapshot.value.objects[prop.id]).toBeUndefined();
  }
});

it('persists legal fallback terrain atomically with object history and ground state', () => {
  const path = databasePath(), s = sample(path);
  const planet = String(s.db.prepare("SELECT id FROM planets WHERE kind='garden' AND owner_id IS NULL ORDER BY rowid LIMIT 1").get()!.id);
  s.db.prepare('UPDATE planets SET environment=? WHERE id=?').run('{broken-terrain', planet);
  s.create('owner');
  const u = s.universe('owner'), manifest = u.currentPlanet.homeManifest!;
  expect(u.ownedPlanetId).toBe(planet);
  expect(manifest).toMatchObject({ fallback: true, fallbackReason: 'invalid-environment', environment: SHORT_STREET_ENVIRONMENT });
  expect(u.player.environment).toBe(SHORT_STREET_ENVIRONMENT);
  expect(u.player.ground!.sceneRevision).toBe(u.currentPlanet.revision);
  expect(s.db.prepare('SELECT DISTINCT environment FROM history_events WHERE planet_id=?').all(planet)).toEqual([{ environment: SHORT_STREET_ENVIRONMENT }]);
  expect(s.historySnapshot('owner', planet).environment).toBe(SHORT_STREET_ENVIRONMENT);
  const saved = s.universe('owner'), originalReceipt = receipt(s, planet);
  s.close();
  const again = sample(path);
  expect(again.universe('owner')).toEqual(saved);
  expect(receipt(again, planet)).toEqual(originalReceipt);
});

it('rolls back identity, claim, generated objects and terrain if the receipt cannot be committed', () => {
  const s = sample();
  const planet = String(s.db.prepare("SELECT id FROM planets WHERE kind='garden' AND owner_id IS NULL ORDER BY rowid LIMIT 1").get()!.id);
  s.db.prepare('UPDATE planets SET environment=? WHERE id=?').run('{broken-terrain', planet);
  const before = s.db.prepare('SELECT * FROM planets ORDER BY rowid').all();
  s.db.exec("CREATE TRIGGER reject_generated_receipt BEFORE INSERT ON home_manifests BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END;");
  expect(() => s.create('owner')).toThrow('injected receipt failure');
  expect(s.db.prepare('SELECT * FROM planets ORDER BY rowid').all()).toEqual(before);
  for (const table of ['players', 'planet_objects', 'blueprint_library', 'home_interiors', 'home_manifests', 'history_events']) expect(s.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, table).toBe(0);
});

it.each([
  { generator: 'home-sample', version: 1, catalogueVersion: 'home-kit-v1' },
  { generator: 'home-neighbourhood', version: 5, catalogueVersion: 'district-kit-v2' },
])('keeps a synthetic v$version receipt, user labels and its sole saved room byte-for-byte on reopen and claim', metadata => {
  // Construct an old-format fixture in this test's temporary database only.
  // This never reads or copies the active fixed-sample database.
  const path = databasePath(), s = sample(path);
  const planet = String(s.db.prepare("SELECT id FROM planets WHERE kind='garden' AND owner_id IS NULL ORDER BY rowid LIMIT 1").get()!.id);
  const plan = starterManifest(HOME_SAMPLE_RADIUS), building = randomUUID(), interior = randomUUID();
  s.db.prepare('INSERT INTO players(id,position,moved_at,planet_id) VALUES(?,?,?,?)').run('old-owner', JSON.stringify(plan.home.position), Date.now(), planet);
  s.db.prepare('UPDATE planets SET owner_id=? WHERE id=?').run('old-owner', planet);
  const blueprint = { ...plan.home.blueprint, name: 'Original cabin name', groups: [{ name: 'Original porch label', members: [1, 10] }] };
  const saved = s.saveBlueprint('old-owner', { document: JSON.parse(encodeBlueprint(blueprint)), expectedVersion: 0 });
  s.createObject('old-owner', { planetId: planet, objectId: building, kind: 'structure', position: plan.home.position, rotation: plan.home.rotation, blueprintHash: saved.hash });
  const room = { ...defaultHomeInterior(), version: 7, material: 'blue' };
  s.db.prepare('INSERT INTO home_interiors(planet_id,building_id,interior_id,document) VALUES(?,?,?,?)').run(planet, building, interior, JSON.stringify(room));
  const manifest = { ...metadata, seed: 20261008, radius: HOME_SAMPLE_RADIUS, environment: HOME_ENVIRONMENT, routes: plan.routes, homeBuildingId: building, objects: s.universe('old-owner').currentPlanet.objects.map(({ id, kind, blueprintHash, position, rotation }) => ({ id, kind, blueprintHash, position, rotation })) };
  s.db.prepare('INSERT INTO home_manifests(planet_id,version,document,hash) VALUES(?,?,?,?)').run(planet, metadata.version, JSON.stringify(manifest), createHash('sha256').update(canonicalJson(manifest)).digest('hex'));
  const tables = ['players', 'planets', 'planet_objects', 'blueprint_contents', 'blueprint_library', 'home_interiors', 'home_manifests', 'history_heads', 'history_events', 'history_snapshots'];
  const rows = (store: typeof s) => Object.fromEntries(tables.map(table => [table, store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const state = s.universe('old-owner'), before = rows(s);
  s.close();
  const again = sample(path);
  again.claim('old-owner', planet);
  expect(again.universe('old-owner')).toEqual(state);
  expect(rows(again)).toEqual(before);
  expect(again.state('old-owner').home).toMatchObject({ buildingId: building, interiorId: interior, interior: room });
  expect(again.library('old-owner')[0].blueprint).toMatchObject({ name: 'Original cabin name', groups: [{ name: 'Original porch label', members: [1, 10] }] });
});
