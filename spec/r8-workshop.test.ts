import {expect,it} from 'vitest';
import {Vector3,Quaternion} from 'three';
import {LEGACY_PART_IDS as PART_IDS,partLabel} from '../src/shared/blueprint-parts.ts';
import {PART_INFO} from '../src/shared/blueprint-parts.ts';
import {homeCottage,cornerLane,padStall} from '../src/assets/claude-geometry/blueprint/samples.ts';
import {layoutErrors,placementProblem,partTransform,pivotOf,groundCells} from '../src/shared/blueprint-model.ts';
import type {PartPlacement} from '../src/shared/blueprint-model.ts';
import {blueprintHash,decodeBlueprint,encodeBlueprint} from '../src/shared/blueprint-codec.ts';
import {anchorQuaternion} from '../src/assets/claude-geometry/core/anchor.ts';
import {PART_COLLIDERS} from '../src/shared/physics/parts.ts';
import {GroundWorld,FIXED_STEP,JUMP_FLAG,PHYSICS_VERSION} from '../src/shared/physics/world.ts';
import type {GroundPose} from '../src/shared/physics/world.ts';
import {structureSize,structureFit} from '../src/shared/blueprints.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import {normalize} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {openStore} from '../src/server/store.ts';
import {translate} from '../src/client/i18n.ts';
import {randomUUID} from 'node:crypto';
import {QUICK_PARTS} from '../src/shared/quick-parts.ts';
import {objectRadius,objectHeight} from '../src/shared/planets.ts';
import type {BuildKind} from '../src/shared/planets.ts';

it('exposes all 45 pieces with Chinese labels and reconstructible samples through the unchanged codec',async()=>{
 expect(new Set(PART_IDS).size).toBe(45);
 for(const id of PART_IDS){expect(PART_COLLIDERS[id]).toBeTypeOf('function');expect(translate(partLabel(id,'village'),'zh')).not.toBe(partLabel(id,'village'));}
 for(const fn of [homeCottage,cornerLane,padStall]){const b=fn(),placed:PartPlacement[]=[];expect(layoutErrors(b.parts)).toEqual([]);for(const p of b.parts){expect(placementProblem(placed,p)).toBeNull();placed.push(p);}const back=decodeBlueprint(encodeBlueprint(b));expect(back.ok).toBe(true);if(back.ok)expect(await blueprintHash(back.value)).toBe(await blueprintHash(b));}
});

it('contains every new rotated overhang without extending the entrance foundation',()=>{
 for(const id of PART_IDS.slice(21))for(const rot of [0,1,2,3] as const){
  const parts:PartPlacement[]=[{n:1,part:'floor.deck',x:1,z:1,level:0,rot:0},{n:2,part:id,x:2,z:2,level:1,rot}];
  const b=PART_INFO[id].envelope!.village!,t=partTransform(parts[1],pivotOf(parts)),c=Math.cos(t.yaw),s=Math.sin(t.yaw),size=structureSize(parts);
  for(const x of [b.min[0],b.max[0]])for(const z of [b.min[2],b.max[2]])expect(size.radius).toBeGreaterThanOrEqual(Math.hypot(t.position[0]+x*c+z*s,t.position[2]-x*s+z*c));
 }
 const parts:PartPlacement[]=[{n:1,part:'floor.deck',x:1,z:1,level:0,rot:0},{n:2,part:'ramp.entry',x:1,z:2,level:0,rot:0}];expect(groundCells(parts)).toEqual([[1,1]]);
});

// This is an isolated solver fixture, not a saved placement or a permission
// to lift a blueprint. Actual placement continues to use structureFit.
function fixture(dir:Vec3,radius:number,yaw:number,kind:'ramp.entry'|'structure.beam'|'roof.slope.hip'|'roof.slope.valley'|'roof.verge.left'|'light.wall'){
 const world=new GroundWorld({id:'fixture',radius,revision:0,objects:[]}),anchor=new Quaternion().fromArray(anchorQuaternion({dir,yaw})),base=radius+.7;
 const point=(x:number,y:number,z:number)=>new Vector3(x,y,z).applyQuaternion(anchor).addScaledVector(new Vector3(...dir),base);
 world.radius=()=>radius;
 const shapes=PART_COLLIDERS[kind]();
 const boxes=shapes.map(s=>{const q=anchor.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),s.pitch??0));return {center:point(...s.center),half:new Vector3(...s.half),q,inverse:q.clone().invert(),support:!!s.support,tag:s.tag,objectId:'fixture'};});
 world.bodies.push({objectId:'fixture',dir:new Vector3(...dir),broad:5,colliders:boxes});
 return {world,point,base,anchor};
}
it('walks the pitched ramp uphill and downhill at walking/sprint speeds, poles and turns, with a safe jump landing',()=>{
 expect(PART_COLLIDERS['ramp.entry']().filter(p=>p.support)).toHaveLength(1);
 for(const radius of [10,14])for(const dir of [[0,1,0],[0,-1,0],normalize([.4,.7,.3])] as Vec3[])for(const yaw of [0,.73,Math.PI/2])for(const speed of [3,4.8]){
  const f=fixture(dir,radius,yaw,'ramp.entry'),at=(z:number)=>f.point(0,-.3*(z+.5),z).normalize().toArray() as Vec3;
  const start=at(1.25),s=f.world.support(start,f.base+1);let p:GroundPose={position:start,radius:s.radius,verticalSpeed:0,grounded:true};
  for(const end of [-.25,1.25]){
   for(let i=0;i<200;i++){const target=new Vector3(...at(end)),from=new Vector3(...p.position),d=from.angleTo(target)*p.radius;if(d<.02)break;p=f.world.move(p,from.lerp(target,Math.min(1,speed*FIXED_STEP/d)).normalize().toArray() as Vec3,FIXED_STEP);expect(f.world.blocked(p)).toBe(false);}
   expect(new Vector3(...p.position).angleTo(new Vector3(...at(end)))*radius).toBeLessThan(.03);
  }
  for(let i=0;i<90;i++)p=f.world.move(p,p.position,FIXED_STEP,i===0?JUMP_FLAG:0);
  expect(p.grounded).toBe(true);expect(f.world.blocked(p)).toBe(false);
 }
});
it('clips both corner roofs and verge tops while preserving roof-deck support and central beam clearance',()=>{
 for(const kind of ['roof.slope.hip','roof.slope.valley','roof.verge.left'] as const)for(const dir of [[0,1,0],[0,-1,0]] as Vec3[]){
  const f=fixture(dir,10,.73,kind),x=kind==='roof.verge.left'?-.54:-.45;
  expect(f.world.cameraDistance(f.point(x,.95,-.45),f.point(x,.3,-.45))).toBeLessThan(.3);
  expect(PART_COLLIDERS[kind]().every(p=>!p.support)).toBe(true);
 }
 expect(PART_COLLIDERS['roof.deck']().some(p=>p.support)).toBe(true);
 const f=fixture([0,1,0],10,0,'structure.beam');expect(f.world.blocked({position:[0,1,0],radius:f.base,verticalSpeed:0,grounded:true})).toBe(false);
 expect(f.world.blocked({position:[0,1,0],radius:f.base+.4,verticalSpeed:0,grounded:false})).toBe(true);
 const lamp=fixture([0,1,0],10,0,'light.wall');expect(lamp.world.cameraDistance(lamp.point(0,1.4,-.225),lamp.point(0,2.3,-.225))).toBeLessThan(.3);
});
it('preserves a valid v4 airborne save and rejects obsolete motion without rewriting the private layout',()=>{
 const s=openStore(':memory:');try{s.create('p',0);const planet=s.universe('p').planets.find(p=>p.kind==='garden')!.id;s.visit('p',planet);s.state('p');s.db.exec("UPDATE ground_states SET physics_version=4,radius=radius+0.5,vertical_speed=2,grounded=0,jump_held=1 WHERE player_id='p'");const before=s.db.prepare("SELECT * FROM ground_states WHERE player_id='p'").get()!;const current=s.state('p'),after=s.db.prepare("SELECT * FROM ground_states WHERE player_id='p'").get()!;for(const k of ['position','radius','grounded','scene_revision','planet_id'])expect(after[k]).toEqual(before[k]);expect(after.vertical_speed).toBe(0);expect(after.jump_held).toBe(0);expect(after.physics_version).toBe(PHYSICS_VERSION);expect(()=>s.move('p',current.position,100,planet,{physicsVersion:4,sequence:current.ground!.sequence+1,steps:[[...current.position,FIXED_STEP,0]]})).toThrow('Reload');}finally{s.close();}
});

it('lands beside the pad-stall counter after a beam-clipped jump instead of freezing during radial descent',()=>{
 const parts=padStall().parts,dir:Vec3=[0,1,0],fit=structureFit(parts,dir,0,fieldOf(null,12));
 const object={id:'stall',kind:'structure' as const,position:dir,rotation:0,version:1,blueprintHash:'stall',...structureSize(parts)};
 const w=new GroundWorld({id:'counter-descent',radius:12,revision:0,objects:[object],blueprints:{stall:parts}});
 const point=new Vector3(.0127,fit.baseRadius+.13815,-.515);
 let p:GroundPose={position:point.clone().normalize().toArray() as Vec3,radius:point.length(),verticalSpeed:-.8,grounded:false};
 expect(w.blocked(p)).toBe(false);
 for(let i=0;i<90;i++){p=w.move(p,p.position,FIXED_STEP);expect(w.blocked(p)).toBe(false);}
 expect(p.grounded).toBe(true);expect(p.verticalSpeed).toBe(0);expect(p.radius).toBeCloseTo(w.support(p.position,p.radius+.01).radius,5);
});

it('gives new quick props identical blueprint collision boxes and retains the old cylinder contract only for legacy objects',()=>{
 for(const kind of ['tree','flowers','bench'] as BuildKind[]){
  const contract=QUICK_PARTS[kind]!,o={id:kind,kind,position:[0,1,0] as Vec3,rotation:0,version:1,assetVersion:2 as const};
  const world=new GroundWorld({id:'quick',radius:10,revision:1,objects:[o]}),body=world.bodies[0],shapes=PART_COLLIDERS[contract.part]();
  expect(body.round).toBeUndefined();expect(body.colliders).toHaveLength(shapes.length);
  for(const [i,c]of body.colliders.entries()){expect(c.half.toArray()).toEqual(shapes[i].half);expect(c.center.x).toBeCloseTo(shapes[i].center[0]+contract.offset[0],8);expect(c.center.z).toBeCloseTo(shapes[i].center[2]+contract.offset[2],8);expect(c.support).toBe(!!shapes[i].support);}
  expect(objectRadius(o)).toBe(contract.radius);expect(objectHeight(o)).toBe(contract.height);
 }
 const old={id:'legacy-tree',kind:'tree' as const,position:[0,1,0] as Vec3,rotation:0,version:1};
 expect(objectRadius(old)).toBe(.4);expect(objectHeight(old)).toBe(2.1);expect(new GroundWorld({id:'legacy',revision:0,objects:[old]}).bodies[0].round).toMatchObject({radius:.4,height:2.1});
});

it('server assigns immutable asset versions and historical previews keep them after deletion without changing old event codecs',()=>{
 const s=openStore(':memory:');try{
  s.create('owner',0);s.create('visitor',0);const planet=s.universe('owner').planets.find(p=>p.kind==='garden')!.id;s.claim('owner',planet);s.visit('owner',planet);s.visit('visitor',planet);
  const id=randomUUID(),body={planetId:planet,objectId:id,kind:'tree',position:[1,0,0],rotation:0};
  expect(()=>s.createObject('owner',{...body,assetVersion:1})).toThrow('Unexpected');s.createObject('owner',body);s.createObject('owner',body);
  const o=s.universe('visitor').currentPlanet.objects[0];expect(o.assetVersion).toBe(2);expect(s.db.prepare('SELECT count(*) AS n FROM object_assets').get()!.n).toBe(1);
  expect(()=>s.db.exec('UPDATE object_assets SET asset_version=2')).toThrow('immutable');
  s.removeObject('owner',{planetId:planet,objectId:id,expectedVersion:1});
  const snapshot=s.historySnapshot('owner',planet,1);expect(snapshot.assetVersions).toEqual({[id]:2});expect(s.historySnapshot('owner',planet,2).assetVersions).toEqual({});
 }finally{s.close();}
});
