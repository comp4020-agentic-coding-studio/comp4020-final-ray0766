import { afterEach, expect, it } from 'vitest';
import { openStore } from '../src/server/store.ts';
import { defaultHomeInterior, HOME_ENTRY, HOME_ROOM, homeNearDoor, homePositionAllowed, normalizeHomeInterior } from '../src/shared/home.ts';
import { createHomeDoor } from '../src/client/home-door.ts';

const stores: ReturnType<typeof openStore>[] = [];
const sample = () => { const s = openStore(':memory:', { homeSample: true }); stores.push(s); s.create('owner'); return s; };
afterEach(() => { for (const s of stores.splice(0)) s.close(); });

it('projects legacy rooms to three times the area without moving or rewriting belongings', () => {
  const s = sample(), h = s.state('owner').home!;
  const legacy = { version: 7, room: { width: 5, depth: 4, height: 2.6 }, material: 'sage', items: [{ id: 'my_old_shelf', kind: 'shelf', position: [1.7, 0, -1.5], yaw: .2 }] };
  const original = JSON.stringify(legacy);
  s.db.prepare('UPDATE home_interiors SET document=? WHERE building_id=?').run(original, h.buildingId);
  const projected = s.state('owner').home!;
  expect(projected.interior.room).toEqual(HOME_ROOM);
  expect(projected.interior.room.width * projected.interior.room.depth).toBeCloseTo(60.2);
  expect(projected.interior).toMatchObject({ version: 7, items: legacy.items, doorOpen: true, doorVersion: 0 });
  expect(projected.interiorId).toBe(h.interiorId);
  expect(s.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(h.buildingId)!.document).toBe(original);
  expect(homePositionAllowed([3.6, 0, 0], projected.interior.items, undefined, projected.interior.room)).toBe(true);
  expect(homePositionAllowed([4.6, 0, 0], projected.interior.items, undefined, projected.interior.room)).toBe(false);
});

it('persists a separate door version, rejects stale or distant actions and never moves a person on close', () => {
  const s = sample(), before = s.state('owner'), h = before.home!;
  const command = (open: boolean, expectedDoorVersion: number, visitEpoch = s.state('owner').location!.visitEpoch) => ({ buildingId: h.buildingId, visitEpoch, expectedDoorVersion, open });
  const closed = s.setHomeDoor('owner', command(false, 0)).player;
  expect(closed.position).toEqual(before.position); expect(closed.location).toEqual(before.location);
  expect(closed.home!.interior).toMatchObject({ doorOpen: false, doorVersion: 1, version: 1 });
  expect(()=>s.enterHome('owner',{planetId:before.planetId,buildingId:h.buildingId,visitEpoch:before.location!.visitEpoch})).toThrow('Open the door');
  expect(()=>s.setHomeDoor('owner', command(true, 0))).toThrow('another tab');
  s.setHomeDoor('owner', command(true, 1));
  const inside = s.enterHome('owner',{planetId:before.planetId,buildingId:h.buildingId,visitEpoch:before.location!.visitEpoch}).player;
  const at = inside.location!; expect(at.kind).toBe('interior');
  expect(()=>s.setHomeDoor('owner', command(false, 2, before.location!.visitEpoch))).toThrow('changed');
  const shut = s.setHomeDoor('owner', command(false, 2)).player;
  expect(shut.location).toEqual(at); expect(shut.home!.interior.items).toEqual(h.interior.items);
  expect(()=>s.exitHome('owner',{buildingId:h.buildingId,visitEpoch:at.visitEpoch})).toThrow('Open the door');
  s.saveHome('owner',{buildingId:h.buildingId,expectedVersion:1,material:'blue',items:h.interior.items});
  expect(s.state('owner').home!.interior).toMatchObject({ version: 2, doorVersion: 3, doorOpen: false });
  s.setHomeDoor('owner', command(true, 3));
  expect(s.state('owner').home!.interior).toMatchObject({ version: 2, doorVersion: 4, material: 'blue' });
  const position = [2.8,0,1] as [number,number,number];
  s.moveHome('owner',{buildingId:h.buildingId,visitEpoch:at.visitEpoch,sequence:1,position,yaw:0},Date.now()+1500);
  expect(()=>s.setHomeDoor('owner',command(false,4))).toThrow('Walk to');
  expect(homeNearDoor(position)).toBe(false); expect(homeNearDoor(HOME_ENTRY)).toBe(true);
});

it('lets a visitor open the same door while furniture stays owner-only', () => {
  const s=sample(),owner=s.state('owner'),h=owner.home!;
  s.setHomeDoor('owner',{buildingId:h.buildingId,visitEpoch:owner.location!.visitEpoch,expectedDoorVersion:0,open:false});
  s.create('visitor');s.visit('visitor',owner.planetId);
  s.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(owner.position),'visitor');
  const visitor=s.state('visitor');
  s.setHomeDoor('visitor',{buildingId:h.buildingId,visitEpoch:visitor.location!.visitEpoch,expectedDoorVersion:1,open:true});
  expect(s.state('owner').home!.interior.doorOpen).toBe(true);
  expect(s.state('visitor').home!.interior).toEqual(s.state('owner').home!.interior);
  expect(s.state('owner').revision).toBeGreaterThan(owner.revision);
  expect(()=>s.saveHome('visitor',{buildingId:h.buildingId,expectedVersion:1,material:'blue',items:[]})).toThrow('Only');
  const serialized=s.db.prepare('SELECT document FROM home_interiors WHERE building_id=?').get(h.buildingId)!.document;
  expect(JSON.parse(String(serialized))).toMatchObject({doorOpen:true,doorVersion:2});
});

it('keeps door animation separate from room collision and supports reduced motion', () => {
  const view=createHomeDoor(),position=[...HOME_ENTRY] as [number,number,number],room=defaultHomeInterior();
  view.setOpen(false,true);expect(view.root.userData.open).toBe(false);
  const closedAngle=view.root.children[0].rotation.y;
  view.setOpen(true);view.frame(.03);expect(view.root.children[0].rotation.y).toBeLessThan(closedAngle);
  view.setOpen(false);view.frame(.01,true);expect(view.root.children[0].rotation.y).toBe(0);
  expect(homePositionAllowed(position,room.items)).toBe(true);expect(position).toEqual(HOME_ENTRY);
  expect(normalizeHomeInterior(room)).toEqual(room);view.dispose();
});
