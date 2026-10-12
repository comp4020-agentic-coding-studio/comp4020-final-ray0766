import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/server/store.ts';
import { migrateTeleport } from '../src/server/teleport.ts';
import { planetCenter } from '../src/shared/flight.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import { portPoint } from '../src/shared/ports.ts';
import { stationSites } from '../src/shared/teleport.ts';
import { distance } from '../src/shared/world.ts';
import { placementProblem } from '../src/shared/planets.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import type { Vec3 } from '../src/shared/world.ts';

type Store = ReturnType<typeof openStore>;
const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
const open = (path: string) => { const store = openStore(path, { integratedWorld: true }); stores.push(store); return store; };
const fresh = () => join(mkdtempSync(join(tmpdir(), 'teleport-')), 'save.sqlite');
const epoch = (s: Store, id: string) => s.state(id).location!.visitEpoch;
const marks = (s: Store, id: string) => (s.universe(id).teleportMarks ?? []).map(m => m.planetId);
/** Fixture: stand the player on a saved spot of their current planet; the ground store re-seats it. */
const standAt = (s: Store, id: string, point: Vec3) => {
  s.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(point), id);
  s.db.prepare('DELETE FROM ground_states WHERE player_id=?').run(id);
  expect(s.state(id).ground!.grounded).toBe(true);
};
const atStation = (s: Store, id: string) => standAt(s, id, stationSites(s.universe(id).currentPlanet)[0].interact);
const go = (s: Store, id: string, planetId: string, requestId: string = randomUUID()) => s.teleport(id, { planetId, requestId, visitEpoch: epoch(s, id) });
/** Real takeoff and landing; only the long flight in between is a saved fixture (stopped beside the target). */
function flyAndLand(s: Store, id: string, planetId: string, speed = 0) {
  const here = s.state(id).planetId; standAt(s, id, portPoint(here));
  s.takeoff(id, { planetId: here, journey: s.state(id).flight.journey, visitEpoch: epoch(s, id) });
  const target = s.universe(id).planets.find(p => p.id === planetId)!, f = s.state(id).flight;
  const position = planetCenter(target.slot).map((v, i) => v + [0, (target.radius ?? 10) + 6, 0][i]);
  s.db.prepare('UPDATE players SET flight=? WHERE id=?').run(JSON.stringify({ ...f, position, speed }), id);
  return s.land(id, { planetId, journey: f.journey, visitEpoch: epoch(s, id) });
}
const unchanged = (s: Store, id: string) => { const before = s.state(id); return () => expect(s.state(id)).toEqual(before); };
/** Saved arrival is the expected point, standing on its support, not inside any body. */
function safelyAt(s: Store, id: string, expected: Vec3) {
  const state = s.state(id), view = s.universe(id).currentPlanet, world = new GroundWorld(view), radius = view.radius!;
  expect(distance(state.position, expected, radius)).toBeLessThan(.01);
  const pose = { position: state.position, ...state.ground! };
  expect(pose.grounded).toBe(true);
  expect(world.blocked(pose)).toBe(false);
  expect(Math.abs(world.support(state.position, pose.radius + .26).radius - pose.radius)).toBeLessThan(.025);
}

it('marks a planet only after a completed landing; a fly-by or a known id never unlocks it', () => {
  const s = open(fresh()); s.create('ana'); s.create('ben');
  const benHome = s.universe('ben').ownedPlanetId!;
  expect(marks(s, 'ana')).toEqual([]);
  atStation(s, 'ana');
  const same = unchanged(s, 'ana');
  expect(() => go(s, 'ana', benHome)).toThrow('Fly to this planet and land there once');
  same();
  // Too fast to land: the ship passes the planet and nothing is marked.
  expect(() => flyAndLand(s, 'ana', benHome, 12)).toThrow('slow');
  expect(marks(s, 'ana')).toEqual([]);
  s.db.prepare("UPDATE players SET flight=json_set(flight,'$.speed',0) WHERE id=?").run('ana');
  s.land('ana', { planetId: benHome, journey: s.state('ana').flight.journey, visitEpoch: epoch(s, 'ana') });
  expect(s.universe('ana').teleportMarks).toEqual([expect.objectContaining({ planetId: benHome, source: 'landing' })]);
});

it('refuses unmarked, missing and current destinations and leaves the traveller where they stand', () => {
  const s = open(fresh()); s.create('ana'); s.create('ben');
  const home = s.universe('ana').ownedPlanetId!, benHome = s.universe('ben').ownedPlanetId!;
  const stay = unchanged(s, 'ana');
  expect(() => go(s, 'ana', 'hub')).toThrow('Walk up to a teleport station first.');
  stay();
  atStation(s, 'ana'); const still = unchanged(s, 'ana');
  expect(() => go(s, 'ana', benHome)).toThrow('Fly to this planet');
  expect(() => go(s, 'ana', 'p-' + randomUUID())).toThrow('That planet could not be found.');
  expect(() => go(s, 'ana', home)).toThrow('You are already on this planet.');
  expect(() => s.teleport('ana', { planetId: 'hub', requestId: 'not-a-uuid', visitEpoch: epoch(s, 'ana') })).toThrow('request identifier');
  expect(() => s.teleport('ana', { planetId: 'hub', requestId: randomUUID(), visitEpoch: epoch(s, 'ana'), ownerId: 'forged' })).toThrow('Unexpected teleport field.');
  still();
});

it('keeps marks across a restart and the same identity coming back', () => {
  const path = fresh(); let s = open(path); s.create('ana'); s.create('ben');
  const benHome = s.universe('ben').ownedPlanetId!;
  flyAndLand(s, 'ana', benHome);
  s.close(); stores.splice(stores.indexOf(s), 1);
  s = open(path);
  expect(marks(s, 'ana')).toEqual([benHome]);
  expect(marks(s, 'ben')).toEqual([]);
});

it('travels home → harbour → marked planet → home, arriving beside stations or at the landing pad', () => {
  const s = open(fresh()); s.create('ana'); s.create('ben');
  const home = s.universe('ana').ownedPlanetId!, benHome = s.universe('ben').ownedPlanetId!;
  flyAndLand(s, 'ana', benHome); flyAndLand(s, 'ana', home);
  atStation(s, 'ana'); go(s, 'ana', 'hub');
  expect(s.state('ana').planetId).toBe('hub');
  safelyAt(s, 'ana', stationSites(s.universe('ana').currentPlanet)[0].arrival);
  atStation(s, 'ana'); go(s, 'ana', benHome);
  expect(s.state('ana').planetId).toBe(benHome);
  safelyAt(s, 'ana', portPoint(benHome));
  atStation(s, 'ana'); go(s, 'ana', home);
  expect(s.state('ana').planetId).toBe(home);
  safelyAt(s, 'ana', stationSites(s.universe('ana').currentPlanet)[0].arrival);
  expect(s.state('ana').location).toMatchObject({ kind: 'exterior', planetId: home });
}, 30_000);

it('travels once for a repeated request and refuses a second click that carries the old visit', () => {
  const s = open(fresh()); s.create('ana');
  atStation(s, 'ana');
  const requestId = randomUUID(), body = { planetId: 'hub', requestId, visitEpoch: epoch(s, 'ana') };
  s.teleport('ana', { ...body });
  const arrived = s.state('ana');
  expect(s.teleport('ana', { ...body }).player).toEqual(arrived);
  expect(() => s.teleport('ana', { ...body, requestId: randomUUID() })).toThrow('home visit changed');
  expect(s.state('ana')).toEqual(arrived);
});

it('never adds a mark when a station is dismantled or rebuilt', () => {
  const s = open(fresh()); s.create('ana');
  const home = s.universe('ana').currentPlanet, station = home.objects.find(o => stationSites({ ...home, objects: [o] }).length)!;
  s.removeObject('ana', { planetId: home.id, objectId: station.id, expectedVersion: station.version });
  expect(stationSites(s.universe('ana').currentPlanet)).toEqual([]);
  const preview = s.previewStation('ana', { planetId: home.id });
  expect(preview.sites.length).toBeGreaterThan(0);
  s.confirmStation('ana', { planetId: home.id, expectedRevision: preview.expectedRevision, hash: preview.hash, visitEpoch: epoch(s, 'ana'), site: 0 });
  expect(stationSites(s.universe('ana').currentPlanet)).toHaveLength(1);
  expect(marks(s, 'ana')).toEqual([]);
}, 30_000);

/** Fixture: make a home look as it was saved before this update — no gate and no station receipt. */
function beforeStations(s: Store, id: string, also?: (home: ReturnType<Store['universe']>['currentPlanet']) => void) {
  const home = s.universe(id).currentPlanet, gate = home.objects.find(o => stationSites({ ...home, objects: [o] }).length)!;
  s.removeObject(id, { planetId: home.id, objectId: gate.id, expectedVersion: gate.version });
  also?.(home);
  // Last, so no read in between can already place the gate.
  s.db.prepare('DELETE FROM home_stations WHERE planet_id=?').run(home.id);
  return home.id;
}
it('gives an older home one gate when its owner is there, clear of saved buildings, and never rebuilds a dismantled one', () => {
  const s = open(fresh()); s.create('ana');
  const home = beforeStations(s, 'ana'), count = () => s.db.prepare('SELECT count(*) AS n FROM planet_objects WHERE planet_id=?').get(home)!.n;
  const before = count();
  // Away at the harbour (every read on the way included), the home is left alone.
  flyAndLand(s, 'ana', 'hub'); s.universe('ana');
  expect(count()).toBe(before);
  flyAndLand(s, 'ana', home);
  const view = s.universe('ana').currentPlanet, gate = view.objects.find(o => stationSites({ ...view, objects: [o] }).length)!;
  expect(gate).toBeDefined();
  const others = view.objects.filter(o => o.id !== gate.id), field = fieldOf(view.environment, view.radius!);
  expect(placementProblem('structure', gate.position, others, undefined, gate.radius, view.radius!, 2, { rotation: gate.rotation, blueprintHash: gate.blueprintHash, blueprints: view.blueprints!, field, terrainSeating: true })).toBeNull();
  expect(s.db.prepare('SELECT status,object_id FROM home_stations WHERE planet_id=?').get(home)).toMatchObject({ status: 'placed', object_id: gate.id });
  s.removeObject('ana', { planetId: home, objectId: gate.id, expectedVersion: gate.version });
  expect(stationSites(s.universe('ana').currentPlanet)).toEqual([]);
  expect(marks(s, 'ana')).toEqual(['hub', home]);
}, 30_000);

it('records why a full home has no gate and offers no site until there is room', () => {
  const s = open(fresh()); s.create('ana');
  // Fill the structure budget with saved rows (count only; nothing is placed for a walk here).
  const home = beforeStations(s, 'ana', view => {
    const kept = view.objects.filter(o => o.kind === 'structure' && !stationSites({ ...view, objects: [o] }).length), sample = kept[0];
    for (let i = kept.length; i < 8; i++)
      s.db.prepare("INSERT INTO planet_objects(id,planet_id,kind,position,rotation,blueprint_hash,radius,height) VALUES(?,?,'structure',?,0,?,?,?)").run(randomUUID(), view.id, JSON.stringify([0, -1, 0]), sample.blueprintHash!, sample.radius!, sample.height!);
  });
  const before = s.db.prepare('SELECT count(*) AS n FROM planet_objects WHERE planet_id=?').get(home)!.n;
  s.universe('ana');
  expect(s.db.prepare('SELECT status,reason FROM home_stations WHERE planet_id=?').get(home)).toMatchObject({ status: 'needs-site', reason: expect.stringContaining('8 structures') });
  expect(s.db.prepare('SELECT count(*) AS n FROM planet_objects WHERE planet_id=?').get(home)!.n).toBe(before);
  const preview = s.previewStation('ana', { planetId: home });
  expect(preview.sites).toEqual([]); expect(preview.reason).toContain('Remove one to make room');
});

it('back-fills old saves only from a completed flight landing on the current planet', () => {
  const s = open(fresh()); s.create('ana'); s.create('ben'); s.create('cy');
  const benHome = s.universe('ben').ownedPlanetId!, cyHome = s.universe('cy').ownedPlanetId!;
  // ana last arrived on ben's planet by a flight landing; a visits row for cy's planet proves nothing.
  s.db.prepare('UPDATE players SET planet_id=?,flight=? WHERE id=?').run(benHome, JSON.stringify({ mode: 'ground', journey: 3, position: [0, 0, 0], yaw: 0, pitch: 0, speed: 0, sequence: 0, targetId: benHome }), 'ana');
  s.db.prepare('INSERT INTO visits(player_id,planet_id,position) VALUES(?,?,?)').run('ana', cyHome, JSON.stringify(portPoint(cyHome)));
  // ben is on cy's planet with a bearing to it, but never flew (journey 0).
  s.db.prepare('UPDATE players SET planet_id=?,flight=? WHERE id=?').run(cyHome, JSON.stringify({ mode: 'ground', journey: 0, position: [0, 0, 0], yaw: 0, pitch: 0, speed: 0, sequence: 0, targetId: cyHome }), 'ben');
  s.db.exec('DELETE FROM teleport_marks');
  migrateTeleport(s.db, 1);
  expect(s.db.prepare('SELECT player_id,planet_id,source FROM teleport_marks ORDER BY player_id').all().map(r => ({ ...r }))).toEqual([{ player_id: 'ana', planet_id: benHome, source: 'history' }]);
});
