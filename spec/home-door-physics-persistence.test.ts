import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Quaternion, Vector3 } from 'three';
import { openStore } from '../src/server/store.ts';
import { GroundWorld, FIXED_STEP } from '../src/shared/physics/world.ts';
import type { GroundPose, MotionStep } from '../src/shared/physics/world.ts';
import { homeDoorLeaf } from '../src/shared/home-door.ts';
import type { HomeDescriptor } from '../src/shared/home.ts';
import type { PlayerState, Vec3 } from '../src/shared/world.ts';
import { SPAWN } from '../src/shared/world.ts';

type Store = ReturnType<typeof openStore>;
const stores: Store[] = [], directories: string[] = [];
const connect = (path: string) => { const store = openStore(path, { homeSample: true }); stores.push(store); return store; };
function fixture(visitors = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'home-door-physics-')); directories.push(dir);
  const path = join(dir, 'sample.sqlite'), store = connect(path); store.create('owner');
  const planet = store.state('owner').planetId;
  for (let i = 0; i < visitors; i++) { const id = `visitor-${i}`; store.create(id); store.visit(id, planet); }
  return { store, path, planet };
}
afterEach(() => {
  for (const store of stores.splice(0)) { try { store.close(); } catch { /* Closed for reopen checks. */ } }
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const changes = (store: Store) => Number(store.db.prepare('SELECT total_changes() AS n').get()!.n);
const poseOf = (player: PlayerState): GroundPose => ({ position: player.position, radius: player.ground!.radius, verticalSpeed: player.ground!.verticalSpeed, grounded: player.ground!.grounded, jumpHeld: player.ground!.jumpHeld });
const toggle = (store: Store, open: boolean) => { const player = store.state('owner'); return store.setHomeDoor('owner', { buildingId: player.home!.buildingId, visitEpoch: player.location!.visitEpoch, expectedDoorVersion: player.home!.interior.doorVersion, open }); };
function geometry(home: HomeDescriptor, world: GroundWorld) {
  const frame = home.door.frame!, rotation = new Quaternion().fromArray(frame.quaternion), inverse = rotation.clone().invert(), origin = new Vector3(...frame.position);
  const point = (x: number, z: number) => new Vector3(x, 0, z).applyQuaternion(rotation).add(origin);
  const at = (x: number, z: number): Vec3 => point(x, z).normalize().toArray() as Vec3;
  const pose = (x: number, z: number): GroundPose => { const position = at(x, z), support = world.support(position, point(x, z).length() + .26); return { position, radius: support.radius, verticalSpeed: 0, grounded: true, jumpHeld: false }; };
  const local = (pose: GroundPose) => new Vector3(...pose.position).multiplyScalar(pose.radius).sub(origin).applyQuaternion(inverse);
  function walk(start: GroundPose, x: number, z: number) {
    let current = start;
    for (let i = 0; i < 100; i++) { const target = new Vector3(...at(x, z)), from = new Vector3(...current.position), distance = from.angleTo(target) * current.radius; const next = from.lerp(target, Math.min(1, 2.5 * FIXED_STEP / Math.max(.00001, distance))).normalize().toArray() as Vec3; current = world.move(current, next, FIXED_STEP); }
    return current;
  }
  return { at, pose, local, walk };
}
/** Test-only placement of acknowledged saves, never client-supplied pose authority. */
function place(store: Store, id: string, pose: GroundPose) {
  store.state(id);
  store.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(pose.position), id);
  store.db.prepare('UPDATE ground_states SET position=?,radius=?,vertical_speed=?,grounded=?,jump_held=? WHERE player_id=?').run(JSON.stringify(pose.position), pose.radius, pose.verticalSpeed, Number(pose.grounded), Number(!!pose.jumpHeld), id);
}
function enter(store: Store, id: string) {
  const player = store.state(id), home = player.home!;
  place(store, id, geometry(home, new GroundWorld(store.universe(id).currentPlanet)).pose(0, .9));
  const near = store.state(id);
  return store.enterHome(id, { planetId: near.planetId, buildingId: home.buildingId, visitEpoch: near.location!.visitEpoch }).player;
}

it('blocks real ground traversal when closed and restores the same opening after save and reopen', () => {
  const { store, path } = fixture(), before = store.universe('owner'), originalHome = before.player.home!;
  const openWorld = new GroundWorld(before.currentPlanet), open = geometry(originalHome, openWorld);
  expect(open.local(open.walk(open.pose(0, .9), 0, -.5)).z).toBeLessThan(-.25);
  const closed = toggle(store, false), closedWorld = new GroundWorld(closed.currentPlanet), physical = geometry(closed.player.home!, closedWorld);
  expect(closed.currentPlanet.revision).toBe(before.currentPlanet.revision + 1);
  expect(closed.currentPlanet.homeDoor).toMatchObject({ buildingId: originalHome.buildingId, open: false, version: 1 });
  expect(physical.local(physical.walk(physical.pose(0, .9), 0, -.5)).z).toBeGreaterThan(.25);
  expect(() => store.move('owner', physical.at(0, -.5), Date.now() + 1000, closed.player.planetId, undefined, closed.player.location!.visitEpoch)).toThrow('blocks');
  expect(store.state('owner').position).toEqual(closed.player.position);
  const closedDocument = store.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(originalHome.buildingId)!.document;
  store.close();
  const reopened = connect(path), saved = reopened.universe('owner'), savedWorld = new GroundWorld(saved.currentPlanet), restored = geometry(saved.player.home!, savedWorld);
  expect(reopened.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(originalHome.buildingId)!.document).toBe(closedDocument);
  expect(restored.local(restored.walk(restored.pose(0, .9), 0, -.5)).z).toBeGreaterThan(.25);
  const opened = toggle(reopened, true), nextWorld = new GroundWorld(opened.currentPlanet), passable = geometry(opened.player.home!, nextWorld);
  expect(passable.local(passable.walk(passable.pose(0, .9), 0, -.5)).z).toBeLessThan(-.25);
  expect(opened.player.home!.interiorId).toBe(originalHome.interiorId);
  expect(opened.currentPlanet.objects).toEqual(before.currentPlanet.objects);
}, 10_000);

it('blocks a valid flat-room path at the closed leaf and accepts it after opening', () => {
  const { store } = fixture(), inside = enter(store, 'owner'), home = inside.home!, location = inside.location!;
  if (location.kind !== 'interior') throw new Error('Expected an indoor test position.');
  const target: Vec3 = [0, 0, home.interior.room.depth / 2 - .2];
  const move = { buildingId: home.buildingId, visitEpoch: location.visitEpoch, sequence: location.sequence + 1, position: target, yaw: 0 };
  toggle(store, false);
  const before = changes(store);
  expect(() => store.moveHome('owner', move, Date.now() + 1000)).toThrow('blocks');
  expect(changes(store)).toBe(before); expect(store.state('owner').location).toEqual(location);
  toggle(store, true);
  const moved = store.moveHome('owner', move, Date.now() + 1000).location!;
  expect(moved.kind === 'interior' ? moved.position : null).toEqual(target);
}, 10_000);

it('refuses a door sweep occupied by any saved exterior or interior visitor with zero writes', () => {
  const { store } = fixture(2), home = store.state('owner').home!, world = new GroundWorld(store.universe('owner').currentPlanet), frame = geometry(home, world), leaf = homeDoorLeaf(false);
  // No presence heartbeat is registered: disconnected saved visitors still count.
  const doorway = frame.pose(leaf.center[0], leaf.center[2]);
  expect(world.blocked(doorway)).toBe(false);
  place(store, 'visitor-1', doorway);
  const exterior = store.state('visitor-1'), before = changes(store), document = store.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(home.buildingId)!.document;
  expect(() => toggle(store, false)).toThrow();
  expect(changes(store)).toBe(before);
  expect(store.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(home.buildingId)!.document).toBe(document);
  expect(store.state('visitor-1').position).toEqual(exterior.position);
  const inside = enter(store, 'visitor-1'), location = inside.location!;
  if (location.kind !== 'interior') throw new Error('Expected the test visitor inside the home.');
  const atDoor = { ...location, position: [0, 0, inside.home!.interior.room.depth / 2 - .2] };
  store.db.prepare('UPDATE home_locations SET document=? WHERE player_id=?').run(JSON.stringify(atDoor), 'visitor-1');
  const insideBefore = changes(store);
  expect(() => toggle(store, false)).toThrow();
  expect(changes(store)).toBe(insideBefore);
  expect(store.state('visitor-1').location).toEqual(atDoor);
}, 15_000);

it('refuses opening onto an exterior visitor occupying the open leaf without changing door or player state', () => {
  const { store } = fixture(1); toggle(store, false);
  const current = store.universe('owner'), world = new GroundWorld(current.currentPlanet), frame = geometry(current.player.home!, world), leaf = homeDoorLeaf(true);
  const occupied = frame.pose(leaf.center[0], leaf.center[2] - .18);
  expect(world.blocked(occupied)).toBe(false);
  place(store, 'visitor-0', occupied);
  const visitor = store.state('visitor-0'), before = changes(store);
  expect(() => toggle(store, true)).toThrow();
  expect(changes(store)).toBe(before);
  expect(store.state('visitor-0').position).toEqual(visitor.position);
  expect(store.state('owner').home!.interior).toMatchObject({ doorOpen: false, doorVersion: 1 });
}, 10_000);

it('fences pre-toggle movement while preserving valid standing and airborne saves exactly', () => {
  const { store, planet } = fixture(2), world = new GroundWorld(store.universe('owner').currentPlanet);
  const standing = world.pose(SPAWN), airborne = { ...standing, radius: standing.radius + 1, verticalSpeed: 2.3, grounded: false, jumpHeld: true };
  expect(world.blocked(standing)).toBe(false); expect(world.blocked(airborne)).toBe(false);
  place(store, 'visitor-0', standing); place(store, 'visitor-1', airborne);
  const beforeStanding = store.state('visitor-0'), beforeAirborne = store.state('visitor-1');
  const oldMotion = { physicsVersion: beforeStanding.ground!.physicsVersion, sequence: beforeStanding.ground!.sequence + 1, steps: [[...beforeStanding.position, FIXED_STEP] as MotionStep] };
  const closed = toggle(store, false), afterStanding = store.state('visitor-0'), afterAirborne = store.state('visitor-1');
  expect(poseOf(afterStanding)).toEqual(poseOf(beforeStanding)); expect(poseOf(afterAirborne)).toEqual(poseOf(beforeAirborne));
  expect(afterStanding.ground!.sceneRevision).toBe(closed.currentPlanet.revision);
  expect(afterStanding.ground!.sequence).toBeGreaterThan(beforeStanding.ground!.sequence);
  const settled = changes(store);
  expect(() => store.move('visitor-0', beforeStanding.position, Date.now() + 500, planet, oldMotion, beforeStanding.location!.visitEpoch)).toThrow('newer');
  expect(changes(store)).toBe(settled);
  toggle(store, true);
  expect(poseOf(store.state('visitor-0'))).toEqual(poseOf(beforeStanding)); expect(poseOf(store.state('visitor-1'))).toEqual(poseOf(beforeAirborne));
}, 15_000);

it('moves the paired collision with the house and exits an indoor visitor at the new saved door', () => {
  const { store, path } = fixture(1), before = store.universe('owner'), h = before.player.home!;
  const visitor = enter(store, 'visitor-0'), homeObject = before.currentPlanet.objects.find(object => object.id === h.buildingId)!;
  store.updateObject('owner', { planetId: before.ownedPlanetId, objectId: h.buildingId, expectedVersion: homeObject.version, position: homeObject.position, rotation: (homeObject.rotation + .02) % (Math.PI * 2) });
  const moved = store.state('visitor-0').home!;
  expect(moved.door.frame).not.toEqual(h.door.frame);
  const closed = toggle(store, false), world = new GroundWorld(closed.currentPlanet), frame = geometry(moved, world), leaf = homeDoorLeaf(false);
  expect(world.blocked(frame.pose(leaf.center[0], leaf.center[2]))).toBe(true);
  expect(store.state('visitor-0').location).toEqual(visitor.location);
  toggle(store, true);
  const openWorld = new GroundWorld(store.universe('owner').currentPlanet), opened = geometry(moved, openWorld);
  expect(openWorld.blocked(opened.pose(leaf.center[0], leaf.center[2]))).toBe(false);
  const outside = store.exitHome('visitor-0', { buildingId: h.buildingId, visitEpoch: visitor.location!.visitEpoch }).player;
  expect(outside.position).toEqual(moved.door.position);
  store.close();
  const again = connect(path);
  expect(again.state('visitor-0').position).toEqual(moved.door.position);
  expect(again.state('owner').home).toMatchObject({ buildingId: h.buildingId, interiorId: h.interiorId, buildingVersion: 2, interior: { doorOpen: true, doorVersion: 2 } });
}, 10_000);

it('projects missing legacy door values without rewriting room, manifest, blueprints or object identities', () => {
  const { store, path } = fixture(), owner = store.state('owner'), h = owner.home!;
  const legacy = { version: 7, room: { width: 5, depth: 4, height: 2.6 }, material: h.interior.material, items: h.interior.items };
  store.db.prepare('UPDATE home_interiors SET document=? WHERE building_id=?').run(JSON.stringify(legacy), h.buildingId);
  const stableTables = ['home_interiors', 'home_manifests', 'blueprint_library', 'blueprint_contents', 'planet_objects'];
  const snapshot = (s: Store) => stableTables.map(table => s.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const before = snapshot(store); store.close();
  const again = connect(path), current = again.universe('owner');
  expect(current.currentPlanet.homeDoor).toMatchObject({ buildingId: h.buildingId, open: true, version: 0 });
  expect(current.player.home!.interior).toMatchObject({ version: 7, items: legacy.items, doorOpen: true, doorVersion: 0 });
  expect(current.player.home!.interior.room.width * current.player.home!.interior.room.depth).toBeCloseTo(60.2);
  expect(snapshot(again)).toEqual(before);
}, 10_000);
