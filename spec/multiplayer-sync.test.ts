// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Group,Vector3 } from 'three';
import { openStore } from '../src/server/store.ts';
import { presenceStore } from '../src/server/presence.ts';
import { canAcceptPlayer,canAcceptUniverse,isDoorOnlyRevision } from '../src/client/sync.ts';
import { PlacedObjectShadows } from '../src/client/placed-shadows.ts';
import { Colony } from '../src/client/colony.ts';
import type { ColonyBridge } from '../src/client/colony.ts';
import type { Universe } from '../src/shared/planets.ts';
import type { Vec3 } from '../src/shared/world.ts';
import { normalize,SPAWN } from '../src/shared/world.ts';
import { PRESENCE_TTL } from '../src/shared/presence.ts';
import { GroundWorld,PHYSICS_VERSION,FIXED_STEP } from '../src/shared/physics/world.ts';
import type { MotionStep } from '../src/shared/physics/world.ts';
import { industrialCabin } from '../src/assets/claude-geometry/blueprint/samples.ts';
import { encodeBlueprint } from '../src/assets/claude-geometry/blueprint/codec.ts';
import { localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import { structureFit } from '../src/shared/blueprints.ts';
import { defaultHomeInterior } from '../src/shared/home.ts';

const stores:ReturnType<typeof openStore>[]=[];
afterEach(()=>{for(const s of stores)s.close();stores.length=0;vi.restoreAllMocks();});
function fixture(){
  const s=openStore(':memory:');stores.push(s);s.create('owner',0);s.create('visitor',0);
  const planet=s.universe('owner').planets.find(p=>p.kind==='garden')!.id;
  s.claim('owner',planet);s.visit('owner',planet);s.visit('visitor',planet);
  return {s,planet};
}
function colonyFixture(current:Universe,read:()=>Promise<Universe>=async()=>current){
  document.body.innerHTML='<button id="open-history"></button><button id="open-terrain"></button><select id="built-list"></select><canvas></canvas>';
  const applyPlayer=vi.fn(()=>true),paint=vi.fn(),obstacles=vi.fn();
  // Exercise the real acceptance/polling methods without the editor's event setup.
  const colony:Colony=Object.assign(Object.create(Colony.prototype) as Colony,{universe:current,building:false,syncing:true,busy:false,
    bridge:{applyPlayer,universe:paint,obstacles,canvas:document.querySelector('canvas'),read} as Partial<ColonyBridge>,
    layer:new Group(),pathPreview:new Group(),objects:new Map(),shadows:new PlacedObjectShadows(),painted:'',selected:null,pollBusy:false,
    hud:vi.fn(),editor:vi.fn(),starMap:vi.fn(),renderObject:vi.fn(()=>new Group())});
  return {colony,applyPlayer,paint,obstacles};
}
it('shows owner move/delete updates to the visitor and rejects a delayed scene before player side effects',()=>{
  const {s,planet}=fixture(),objectId=randomUUID(),a=normalize([.5,1,.4]),b=normalize([-.5,1,.4]);
  s.createObject('owner',{planetId:planet,objectId,kind:'lamp',position:a,rotation:0});
  const before=s.universe('visitor');
  s.updateObject('owner',{planetId:planet,objectId,position:b,rotation:.7,expectedVersion:1});
  const moved=s.universe('visitor'),c=colonyFixture(before);c.colony.accept(moved);
  expect(c.colony.universe?.currentPlanet.objects[0]).toEqual(moved.currentPlanet.objects[0]);
  expect(new Vector3(...moved.currentPlanet.objects[0].position).distanceTo(new Vector3(...b))).toBeLessThan(1e-12);expect(moved.currentPlanet.objects[0].version).toBe(2);expect(c.paint).toHaveBeenLastCalledWith(moved);
  s.removeObject('owner',{planetId:planet,objectId,expectedVersion:2});const removed=s.universe('visitor');c.colony.accept(removed);
  expect(c.colony.universe?.currentPlanet.objects).toEqual([]);expect(c.obstacles).toHaveBeenLastCalledWith([]);
  c.applyPlayer.mockClear();c.paint.mockClear();c.colony.accept(moved);c.colony.accept(before);
  expect(c.applyPlayer).not.toHaveBeenCalled();expect(c.paint).not.toHaveBeenCalled();expect(c.colony.universe).toBe(removed);
  expect(()=>s.createObject('visitor',{planetId:planet,objectId:randomUUID(),kind:'lamp',position:a,rotation:0})).toThrow('Only');
});
it('retains recovered visitor ground state at equal player revision after the owner removes the upper floor',()=>{
  const {s,planet}=fixture(),dir=normalize([.55,1,.4]),anchor={dir,yaw:0};
  const bp=industrialCabin();bp.parts=[
    {part:'floor.deck',x:1,z:1,level:0,rot:0,n:1},{part:'floor.deck',x:1,z:2,level:0,rot:0,n:2},{part:'floor.deck',x:1,z:3,level:0,rot:0,n:3},
    {part:'stair.straight',x:1,z:3,level:0,rot:0,n:4},{part:'structure.column',x:1,z:1,level:0,rot:2,n:5},{part:'floor.deck',x:1,z:1,level:1,rot:0,n:6},
  ];
  const entry=s.saveBlueprint('owner',{document:JSON.parse(encodeBlueprint(bp)),expectedVersion:0}),objectId=randomUUID();
  s.createObject('owner',{planetId:planet,objectId,kind:'structure',blueprintHash:entry.hash,position:dir,rotation:0});
  const base=structureFit(bp.parts,dir,0).baseRadius,at=(z:number,y=0)=>localToDir(anchor,base,[0,y,z]);
  // Place only this in-memory test identity at the stair approach, then use validated motion.
  s.db.prepare('UPDATE players SET position=?,moved_at=0 WHERE id=?').run(JSON.stringify(at(1.8)),'visitor');
  let saved=s.state('visitor'),pose={position:saved.position,...saved.ground!},time=0,batch:MotionStep[]=[];
  const world=new GroundWorld(s.universe('visitor').currentPlanet);
  const flush=()=>{saved=s.move('visitor',batch.at(-1)!.slice(0,3) as Vec3,time,planet,{physicsVersion:PHYSICS_VERSION,sequence:saved.ground!.sequence+1,steps:batch});batch=[];};
  for(let i=0;i<240;i++){
    const target=at(-1.05,pose.radius-base),a=new Vector3(...pose.position),b=new Vector3(...target),d=a.angleTo(b)*pose.radius;
    pose={...pose,...world.move(pose,a.lerp(b,Math.min(1,2.5*FIXED_STEP/Math.max(.00001,d))).normalize().toArray() as Vec3,FIXED_STEP)};
    time+=FIXED_STEP*1000;batch.push([...pose.position.map(v=>Number(v.toFixed(7))),FIXED_STEP] as MotionStep);if(batch.length===20)flush();
  }
  const before=s.universe('visitor');expect(before.player.ground!.radius-world.radius(before.player.position)).toBeGreaterThan(1.5);
  s.removeObject('owner',{planetId:planet,objectId,expectedVersion:1});const recovered=s.universe('visitor');
  expect(recovered.player.revision).toBe(before.player.revision);expect(recovered.player.ground!.grounded).toBe(false);
  expect(recovered.player.ground!.sequence).toBeGreaterThan(before.player.ground!.sequence);
  expect(canAcceptPlayer(before.player,recovered.player)).toBe(true);expect(canAcceptPlayer(recovered.player,before.player)).toBe(false);
  expect(canAcceptUniverse(recovered,before)).toBe(false);
  const c=colonyFixture(recovered);c.colony.accept(before);expect(c.applyPlayer).not.toHaveBeenCalled();
  const empty=new GroundWorld(recovered.currentPlanet);saved=recovered.player;
  for(let i=0;i<180;i++){time+=FIXED_STEP*1000;batch.push([...saved.position,FIXED_STEP]);if(batch.length===20)flush();}
  expect(saved.ground!.grounded).toBe(true);expect(saved.ground!.radius).toBeCloseTo(empty.radius(saved.position),4);
  expect(canAcceptPlayer(saved,recovered.player)).toBe(false);
});
it('rejects old visits and stale ground sequences while allowing a new journey to reset its motion sequence',()=>{
  const {s,planet}=fixture(),garden=s.universe('visitor');s.visit('visitor','hub');const hub=s.universe('visitor');
  expect(canAcceptPlayer(hub.player,garden.player)).toBe(false);expect(canAcceptUniverse(hub,garden)).toBe(false);
  s.visit('visitor',planet);const returned=s.universe('visitor');expect(canAcceptPlayer(hub.player,returned.player)).toBe(true);
  expect(canAcceptUniverse(returned,garden)).toBe(false);
  const oldSequence=structuredClone(returned.player);oldSequence.ground!.sequence++;
  expect(canAcceptPlayer(oldSequence,returned.player)).toBe(false);
  const newJourney=structuredClone(returned.player);newJourney.revision++;newJourney.flight.journey++;newJourney.ground!.sequence=0;
  expect(canAcceptPlayer(oldSequence,newJourney)).toBe(true);
});
it('rejects an older room or door poll even at the same player revision',()=>{
  const {s}=fixture(),current=s.state('owner');
  current.home={planetId:current.planetId,buildingId:'home',interiorId:'room',door:{position:SPAWN,yaw:0},interior:{...defaultHomeInterior(),version:4,doorVersion:3,doorOpen:false},canEdit:true,buildingVersion:1,variant:'base',canUndo:false};
  const oldRoom=structuredClone(current);oldRoom.home!.interior.version=3;
  const oldDoor=structuredClone(current);oldDoor.home!.interior.doorVersion=2;oldDoor.home!.interior.doorOpen=true;
  expect(canAcceptPlayer(current,oldRoom)).toBe(false);expect(canAcceptPlayer(current,oldDoor)).toBe(false);
  const fresh=structuredClone(current);fresh.home!.interior.doorVersion=4;fresh.home!.interior.doorOpen=true;
  expect(canAcceptPlayer(current,fresh)).toBe(true);
});
it('preserves held input only for an isolated door scene change, not a remodel or missed scene edits',()=>{
  const {s}=fixture(),before=s.state('owner');
  before.home={planetId:before.planetId,buildingId:'home',interiorId:'room',door:{position:SPAWN,yaw:0},interior:defaultHomeInterior(),canEdit:true,buildingVersion:1,variant:'base',canUndo:false};
  const after=structuredClone(before);after.home!.interior.doorVersion++;after.home!.interior.doorOpen=false;after.ground!.sceneRevision++;
  expect(isDoorOnlyRevision(before,after)).toBe(true);
  const remodel=structuredClone(after);remodel.home!.buildingVersion++;
  expect(isDoorOnlyRevision(before,remodel)).toBe(false);
  const missed=structuredClone(after);missed.ground!.sceneRevision++;
  expect(isDoorOnlyRevision(before,missed)).toBe(false);
});
it('keeps successful reconnect state when an earlier universe poll fails later',async()=>{
  const {s,planet}=fixture(),before=s.universe('visitor');let fail!:(e:Error)=>void;
  const c=colonyFixture(before,()=>new Promise((_resolve,reject)=>{fail=reject;}));
  const pending=(c.colony as unknown as {poll:()=>Promise<void>}).poll();
  s.createObject('owner',{planetId:planet,objectId:randomUUID(),kind:'lamp',position:normalize([.5,1,.4]),rotation:0});c.colony.accept(s.universe('visitor'));
  fail(new Error('old disconnected request'));await pending;expect(c.colony.syncing).toBe(true);
  const disconnected=colonyFixture(before,async()=>{throw new Error('current failure');});await (disconnected.colony as unknown as {poll:()=>Promise<void>}).poll();
  expect(disconnected.colony.syncing).toBe(false);disconnected.colony.accept(s.universe('visitor'));expect(disconnected.colony.syncing).toBe(true);
});
it('keeps authoritative presence through a stale old-planet request and scopes expiry/reconnect to two identities',()=>{
  const {s,planet}=fixture(),p=presenceStore(s.state),facing=normalize([0,SPAWN[2],-SPAWN[1]]),body={planetId:planet,facing};
  const owner=p.heartbeat('owner',body,1000),visitor=p.heartbeat('visitor',body,1000);expect(visitor.visitors).toHaveLength(1);
  expect(()=>p.heartbeat('owner',{...body,planetId:'hub'},1100)).toThrow('changed');
  expect(p.heartbeat('visitor',body,1200).visitors[0].id).toBe(owner.selfId);
  s.visit('owner','hub');expect(p.heartbeat('visitor',body,1300).visitors).toEqual([]);
  const elsewhere=p.heartbeat('owner',{...body,planetId:'hub'},1400);expect(elsewhere.visitors).toEqual([]);
  s.visit('owner',planet);const returned=p.heartbeat('owner',body,1500);expect(returned.visitors[0].id).toBe(visitor.selfId);
  expect(p.heartbeat('visitor',body,1501+PRESENCE_TTL).visitors).toEqual([]);
  const reconnected=p.heartbeat('owner',body,1600+PRESENCE_TTL);expect(reconnected.selfId).not.toBe(returned.selfId);
  expect(p.heartbeat('visitor',body,1700+PRESENCE_TTL).visitors[0]).toMatchObject({id:reconnected.selfId,position:s.state('owner').position,radius:s.state('owner').ground!.radius});
  expect(JSON.stringify(reconnected)).not.toContain('"owner"');
});
