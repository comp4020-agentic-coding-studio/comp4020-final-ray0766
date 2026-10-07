import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../src/server/store.ts';

const stores: ReturnType<typeof openStore>[] = [], directories: string[] = [];
const connect = (path: string) => { const store = openStore(path, { homeSample: true }); stores.push(store); return store; };
const create = () => {
  const dir = mkdtempSync(join(tmpdir(), 'home-door-concurrent-')); directories.push(dir);
  const path = join(dir, 'sample.sqlite'), store = connect(path);
  store.create('owner'); store.create('visitor');
  const owner = store.state('owner');
  store.visit('visitor', owner.planetId);
  store.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(owner.position), 'visitor');
  return { store, path };
};
const enter = (store: ReturnType<typeof openStore>, id: string) => {
  const player = store.state(id);
  return store.enterHome(id, { planetId: player.planetId, buildingId: player.home!.buildingId, visitEpoch: player.location!.visitEpoch }).player;
};
afterEach(() => {
  for (const store of stores.splice(0)) { try { store.close(); } catch { /* Reopened by the test. */ } }
  for (const dir of directories.splice(0)) rmSync(dir, { force: true, recursive: true });
});

it('keeps furnishing drafts and door changes independent across two connections and a reopen', () => {
  const { store: ownerConnection, path } = create();
  const owner = enter(ownerConnection, 'owner'), visitor = enter(ownerConnection, 'visitor'), h = owner.home!;
  const visitorConnection = connect(path);
  const draft = { buildingId: h.buildingId, expectedVersion: h.interior.version, material: 'sage', items: h.interior.items };
  const door = (open: boolean, expectedDoorVersion: number) => ({ buildingId: h.buildingId, visitEpoch: visitor.location!.visitEpoch, expectedDoorVersion, open });
  visitorConnection.setHomeDoor('visitor', door(false, 0));
  ownerConnection.saveHome('owner', draft);
  expect(ownerConnection.state('owner').home!.interior).toMatchObject({ version: 2, material: 'sage', doorVersion: 1, doorOpen: false });
  visitorConnection.setHomeDoor('visitor', door(true, 1));
  expect(visitorConnection.state('visitor').home!.interior).toMatchObject({ version: 2, material: 'sage', doorVersion: 2, doorOpen: true });
  const changed = Number(ownerConnection.db.prepare('SELECT total_changes() AS n').get()!.n);
  expect(() => ownerConnection.setHomeDoor('owner', { buildingId: h.buildingId, visitEpoch: owner.location!.visitEpoch, expectedDoorVersion: 0, open: false })).toThrow('another tab');
  expect(Number(ownerConnection.db.prepare('SELECT total_changes() AS n').get()!.n)).toBe(changed);
  expect(ownerConnection.state('owner').location).toEqual(owner.location);
  expect(visitorConnection.state('visitor').location).toEqual(visitor.location);
  const final = ownerConnection.state('owner').home!;
  ownerConnection.close(); visitorConnection.close();
  const reopened = connect(path);
  expect(reopened.state('owner').home).toEqual(final);
  expect(reopened.state('visitor').home!.interior).toEqual(final.interior);
  expect(reopened.state('visitor').location).toEqual(visitor.location);
}, 10_000);

it('lets an indoor visitor operate a moved house door and exit at its persisted new position', () => {
  const { store, path } = create(), owner = store.state('owner'), h = owner.home!;
  const visitor = enter(store, 'visitor'), visitorConnection = connect(path);
  const object = store.universe('owner').currentPlanet.objects.find(object => object.id === h.buildingId)!;
  store.updateObject('owner', { planetId: owner.planetId, objectId: object.id, expectedVersion: object.version, position: object.position, rotation: (object.rotation + .01) % (Math.PI * 2) });
  const moved = visitorConnection.state('visitor').home!;
  expect(moved.door.position).not.toEqual(h.door.position);
  expect(moved.buildingId).toBe(h.buildingId); expect(moved.interiorId).toBe(h.interiorId);
  const door = (open: boolean, expectedDoorVersion: number) => ({ buildingId: h.buildingId, visitEpoch: visitor.location!.visitEpoch, expectedDoorVersion, open });
  visitorConnection.setHomeDoor('visitor', door(false, 0));
  expect(visitorConnection.state('visitor').location).toEqual(visitor.location);
  expect(() => visitorConnection.exitHome('visitor', { buildingId: h.buildingId, visitEpoch: visitor.location!.visitEpoch })).toThrow('Open the door');
  visitorConnection.setHomeDoor('visitor', door(true, 1));
  const outside = visitorConnection.exitHome('visitor', { buildingId: h.buildingId, visitEpoch: visitor.location!.visitEpoch }).player;
  expect(outside.position).toEqual(moved.door.position);
  expect(outside.home!.interior.items).toEqual(h.interior.items);
  expect(outside.home!.interior.version).toBe(h.interior.version);
  store.close(); visitorConnection.close();
  const reopened = connect(path);
  expect(reopened.state('visitor').position).toEqual(moved.door.position);
  expect(reopened.state('owner').home).toMatchObject({ buildingId: h.buildingId, interiorId: h.interiorId, buildingVersion: 2, interior: { doorVersion: 2, doorOpen: true } });
}, 10_000);
