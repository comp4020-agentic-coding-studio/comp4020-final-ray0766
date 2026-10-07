import { expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Quaternion, Vector3 } from 'three';
import { openStore } from '../src/server/store.ts';
import { GroundWorld, PHYSICS_VERSION, FIXED_STEP } from '../src/shared/physics/world.ts';
import { PART_COLLIDERS } from '../src/shared/physics/parts.ts';
import { structureFit, structureSize } from '../src/shared/blueprints.ts';
import { normalize } from '../src/shared/world.ts';
import type { Vec3 } from '../src/shared/world.ts';
import { anchorQuaternion } from '../src/assets/claude-geometry/core/anchor.ts';
import { blueprintFootprint } from '../src/assets/claude-geometry/blueprint/model.ts';
import type { PartPlacement } from '../src/assets/claude-geometry/blueprint/model.ts';
import { industrialCabin } from '../src/assets/claude-geometry/blueprint/samples.ts';
import { encodeBlueprint } from '../src/assets/claude-geometry/blueprint/codec.ts';
import { canAcceptPlayer } from '../src/client/sync.ts';

const roofParts=(rot:0|1|2|3):PartPlacement[]=>[
  {n:1,part:'floor.deck',x:1,z:1,level:0,rot:0},
  {n:2,part:'roof.slope',x:1,z:1,level:1,rot},
  {n:3,part:'structure.column',x:1,z:1,level:0,rot:2},
];
function roofFixture(dir:Vec3,rot:0|1|2|3){
  const parts=roofParts(rot),yaw=.73,base=structureFit(parts,dir,yaw).baseRadius;
  const q=new Quaternion().fromArray(anchorQuaternion({dir,yaw}));
  const turn=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),rot*Math.PI/2);
  const point=(x:number,y:number,z:number)=>new Vector3(x,y,z).applyQuaternion(turn).applyQuaternion(q).addScaledVector(new Vector3(...dir),base);
  const world=new GroundWorld({id:'roof',revision:1,blueprints:{roof:parts},objects:[{id:'roof',kind:'structure',position:dir,rotation:yaw,version:1,blueprintHash:'roof',...structureSize(parts)}]});
  return {world,base,point};
}

it('clips R7 pitched tiles and eaves at all quarter turns and sphere poles without making them support surfaces',()=>{
  for(const dir of [[0,1,0],[0,-1,0],normalize([.55,1,.4])] as Vec3[])for(const rot of [0,1,2,3] as const){
    const f=roofFixture(dir,rot);
    expect(f.world.cameraDistance(f.point(0,1.3,0),f.point(0,4,0))).toBeLessThan(1);
    expect(f.world.cameraDistance(f.point(0,1.7,.76),f.point(0,3,.76))).toBeLessThan(.45);
    // Space above the low eave stays clear: no flat, full-height envelope.
    expect(f.world.cameraDistance(f.point(0,2.9,.76),f.point(0,3.8,.76))).toBeCloseTo(.9,6);
    expect(f.world.support(dir,f.base+5).radius).toBeLessThan(f.base+.01);
  }
  expect(PART_COLLIDERS['roof.slope']().every(p=>!p.support)).toBe(true);
  expect(PART_COLLIDERS['roof.deck']().some(p=>p.support)).toBe(true);
  expect(PART_COLLIDERS['stair.straight']().filter(p=>p.support)).toHaveLength(11);
});

it('uses the offset blueprint lantern column and the low hedge without changing local-prop collisions',()=>{
  const parts:PartPlacement[]=[{n:1,part:'floor.deck',x:1,z:1,level:0,rot:0},{n:2,part:'service.light',x:1,z:1,level:0,rot:0}];
  const dir=normalize([.55,1,.4]),base=structureFit(parts,dir,0).baseRadius,q=new Quaternion().fromArray(anchorQuaternion({dir,yaw:0}));
  const position=(x:number,y:number,z:number)=>new Vector3(x,y,z).applyQuaternion(q).addScaledVector(new Vector3(...dir),base);
  const world=new GroundWorld({id:'lamp',revision:1,blueprints:{lamp:parts},objects:[{id:'lamp',kind:'structure',position:dir,rotation:0,version:1,blueprintHash:'lamp',...structureSize(parts)}]});
  const foot=position(-.3,0,-.3),pose={position:foot.clone().normalize().toArray() as Vec3,radius:foot.length()+.003,verticalSpeed:0,grounded:true};
  expect(world.blocked(pose)).toBe(true);
  const safe=world.recover(pose);expect(world.blocked(safe)).toBe(false);
  expect(new Vector3(...pose.position).angleTo(new Vector3(...safe.position))*10).toBeLessThan(.51);
  // The former central column is no longer an invisible obstacle.
  expect(world.blocked({position:dir,radius:base+.003,verticalSpeed:0,grounded:true})).toBe(false);
  const hedge=PART_COLLIDERS['street.pipes']()[0];
  expect(hedge.center[2]-hedge.half[2]).toBeCloseTo(-.01,6);
  expect(hedge.center[2]+hedge.half[2]).toBeCloseTo(.33,6);
  expect(hedge.center[1]+hedge.half[1]).toBeCloseTo(.48,6);
  const local=new GroundWorld({id:'local',revision:1,objects:[{id:'local-lamp',kind:'lamp',position:dir,rotation:0,version:1}]});
  expect(local.bodies[0].round?.height).toBe(2.1);
});

it('includes turned roof overhangs in new spacing while reading old placements without rewriting buildings or history',()=>{
  for(const rot of [0,1,2,3] as const){
    const parts=roofParts(rot),size=structureSize(parts);
    expect(size.radius).toBeGreaterThan(blueprintFootprint(parts).radius);
    expect(size.radius).toBeGreaterThan(Math.hypot(.5,.79));
  }
  const s=openStore(':memory:');try{
    s.create('owner',0);const planet=s.universe('owner').planets.find(p=>p.kind==='garden')!.id;
    s.claim('owner',planet);s.visit('owner',planet);
    const bp={...industrialCabin(),parts:roofParts(0)},saved=s.saveBlueprint('owner',{document:encodeBlueprint(bp),expectedVersion:0});
    const id=randomUUID();s.createObject('owner',{planetId:planet,objectId:id,kind:'structure',blueprintHash:saved.hash,position:normalize([.55,1,.4]),rotation:0});
    const oldRadius=blueprintFootprint(bp.parts).radius;
    s.db.prepare('UPDATE planet_objects SET radius=? WHERE id=?').run(oldRadius,id);
    const before=s.db.prepare('SELECT * FROM planet_objects').all(),history=s.historySnapshot('owner',planet);
    expect(s.universe('owner').currentPlanet.objects[0].radius).toBeGreaterThan(oldRadius);
    const anchor=new Vector3(...normalize([.55,1,.4])),tangent=new Vector3(1,0,0).projectOnPlane(anchor).normalize();
    const angle=(oldRadius+.4+.06+.03)/10,neighbour=anchor.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tangent,Math.sin(angle)).toArray();
    expect(()=>s.createObject('owner',{planetId:planet,objectId:randomUUID(),kind:'tree',position:neighbour,rotation:0})).toThrow('too close');
    expect(s.db.prepare('SELECT * FROM planet_objects').all()).toEqual(before);
    expect(s.historySnapshot('owner',planet)).toEqual(history);
  }finally{s.close();}
});

it('backs up schema 9 and lazily recovers the old standing height; rejects old physics batches and stale responses',()=>{
  const dir=mkdtempSync(join(tmpdir(),'r7-ground-')),path=join(dir,'world.sqlite');let s=openStore(path);
  try{
    s.create('owner',0);s.character('owner','fern');const planet=s.universe('owner').planets.find(p=>p.kind==='garden')!.id;
    s.claim('owner',planet);s.visit('owner',planet);const initial=s.state('owner');
    s.db.prepare('UPDATE ground_states SET radius=radius+2,grounded=1 WHERE player_id=?').run('owner');
    s.db.exec('ALTER TABLE ground_states DROP COLUMN physics_version;PRAGMA user_version=9');
    const old=s.db.prepare('SELECT * FROM ground_states').get()!,players=s.db.prepare('SELECT * FROM players').all(),objects=s.db.prepare('SELECT * FROM planet_objects').all();
    s.close();s=openStore(path);
    expect(s.db.prepare('PRAGMA user_version').get()!.user_version).toBe(12);
    const backup=new DatabaseSync(s.migrationBackup!);try{
      expect(backup.prepare('PRAGMA user_version').get()!.user_version).toBe(9);
      expect(backup.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');
      expect(backup.prepare('SELECT * FROM ground_states').get()).toEqual(old);
    }finally{backup.close();}
    expect(s.db.prepare('SELECT * FROM players').all()).toEqual(players);
    expect(s.db.prepare('SELECT physics_version FROM ground_states').get()!.physics_version).toBe(0);
    const current=s.state('owner');expect(current.character).toBe('fern');expect(current.position).toEqual(initial.position);
    expect(current.quest).toBe(initial.quest);expect(current.ground!.radius).toBe(Number(old.radius));
    expect(current.ground!.grounded).toBe(false);expect(current.ground!.physicsVersion).toBe(PHYSICS_VERSION);
    expect(current.ground!.sequence).toBe(Number(old.sequence)+1);expect(current.revision).toBe(initial.revision+1);
    const batch={sequence:current.ground!.sequence+1,steps:[[...current.position,FIXED_STEP]]};
    expect(()=>s.move('owner',current.position,1000,planet,batch)).toThrow('Reload');
    expect(()=>s.move('owner',current.position,1000,planet,{...batch,physicsVersion:0})).toThrow('Reload');
    expect(s.state('owner')).toEqual(current);
    const next=s.move('owner',current.position,1000,planet,{...batch,physicsVersion:PHYSICS_VERSION});
    expect(next.ground!.radius).toBeLessThan(current.ground!.radius);
    const stale=structuredClone(next);stale.ground!.physicsVersion=0;
    expect(canAcceptPlayer(next,stale)).toBe(false);expect(canAcceptPlayer(next,current)).toBe(false);
    expect(s.db.prepare('SELECT * FROM planet_objects').all()).toEqual(objects);
    s.close();s=openStore(path);expect(s.state('owner')).toEqual(next);
  }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
