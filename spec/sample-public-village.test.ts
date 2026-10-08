import {expect,it,vi} from 'vitest';
import {Box3,Mesh,Vector3} from 'three';
import {samplePublicVillage,SAMPLE_PUBLIC_VERSION,SAMPLE_PUBLIC_BLUEPRINTS,SAMPLE_PUBLIC_HASHES} from '../src/shared/sample-public-village.ts';
import {groundCells,layoutErrors,pivotOf,partTransform} from '../src/assets/claude-geometry/blueprint/model.ts';
import {cornerLane} from '../src/assets/claude-geometry/blueprint/samples.ts';
import {blueprintHash} from '../src/assets/claude-geometry/blueprint/codec.ts';
import {structureFit,MAX_STRUCTURES} from '../src/shared/blueprints.ts';
import {MAX_OBJECTS,objectHeight,objectRadius,placementProblem} from '../src/shared/planets.ts';
import {fieldOf,objectSeat} from '../src/shared/terrain.ts';
import {GroundWorld,FIXED_STEP} from '../src/shared/physics/world.ts';
import type {GroundPose} from '../src/shared/physics/world.ts';
import {HUB_OBJECTS,PUBLIC_CONTENTS} from '../src/shared/public-village.ts';
import {NPCS,SPAWN,distance} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {HUB_DOCK,canBoard} from '../src/shared/ports.ts';
import {openStore} from '../src/server/store.ts';
import {planetStore} from '../src/server/planets.ts';
import {groundStore} from '../src/server/ground.ts';
import {planRoutePaths} from '../src/shared/path-layout.ts';
import {builtObject,disposeGeometry} from '../src/client/build-art.ts';
import {groundPresentation} from '../src/client/presentation.ts';
import {localToDir} from '../src/assets/claude-geometry/core/anchor.ts';
import {homeRoutesWalkable,walkHomeRoute} from '../src/shared/home-generation.ts';

const village=samplePublicVillage();
const world=()=>new GroundWorld({id:'hub',radius:village.radius,revision:0,objects:[],environment:village.environment});
function walk(w:GroundWorld,start:GroundPose,target:Vec3){
 let p=start;
 for(let i=0;i<1800;i++){
  const a=new Vector3(...p.position),b=new Vector3(...target),d=a.angleTo(b)*village.radius;
  if(d<.028)return p;
  p=w.move(p,a.lerp(b,Math.min(1,.045/d)).normalize().toArray() as Vec3,FIXED_STEP);
  expect(w.blocked(p)).toBe(false);
 }
 throw Error(`Unreachable sample public waypoint ${JSON.stringify(target)} from ${JSON.stringify(p.position)}`);
}
it('frames the three retained destinations with six varied legal player structures',async()=>{
 expect(village.version).toBe(4);expect(SAMPLE_PUBLIC_VERSION).toBe(4);expect(village.radius).toBe(21.6);expect(village.destinations.map(d=>d.id)).toEqual(['post','orchard','harbour']);
 expect(village.objects.length).toBeLessThanOrEqual(MAX_OBJECTS);
 expect(village.objects.filter(o=>o.kind==='structure')).toHaveLength(6);expect(6).toBeLessThan(MAX_STRUCTURES);
 for(const [i,b]of SAMPLE_PUBLIC_BLUEPRINTS.entries()){
  expect(layoutErrors(b.parts)).toEqual([]);expect(await blueprintHash(b)).toBe(SAMPLE_PUBLIC_HASHES[i]);
 }
 for(const o of village.objects){
  expect(placementProblem(o.kind,o.position,village.objects,o.id,o.radius,village.radius,2,
   {rotation:o.rotation,blueprintHash:o.blueprintHash,blueprints:village.blueprints,field:fieldOf(village.environment,village.radius)})).toBeNull();
  if(o.kind==='structure'){
   const fit=structureFit(village.blueprints[o.blueprintHash!],o.position,o.rotation,fieldOf(village.environment,village.radius));
   expect(fit.problem).toBeNull();expect(fit.foundationDepth).toBeLessThan(.6);
  }
 }
 expect(samplePublicVillage()).toBe(village);
});
it('replaces only the courtyard lane finish, preserving support geometry, foundation seating and its original sample',()=>{
 const original=cornerLane(),before=JSON.stringify(original),courtyard=SAMPLE_PUBLIC_BLUEPRINTS[5];
 const roads=original.parts.filter(part=>part.part.startsWith('street.road'));
 expect(roads).toHaveLength(12);
 expect(courtyard.parts).toEqual(original.parts.map(part=>roads.includes(part)?{...part,part:'street.paving'}:part));
 expect(groundCells(courtyard.parts)).toEqual(groundCells(original.parts));
 expect(pivotOf(courtyard.parts)).toEqual(pivotOf(original.parts));
 const object=village.objects.find(object=>object.id==='sample-public-walk')!;
 const scene={id:'ordinary-courtyard',radius:village.radius,revision:0,objects:village.objects,environment:village.environment};
 const oldWorld=new GroundWorld({...scene,blueprints:{...village.blueprints,[object.blueprintHash!]:original.parts}});
 const newWorld=new GroundWorld({...scene,blueprints:village.blueprints});
 // Two old road kinds carried different diagnostic tags. Their physical
 // shapes, support flags and every other body's shape must remain identical.
 const shapes=(world:GroundWorld)=>world.bodies.map(body=>({...body,colliders:body.colliders.map(collider=>({...collider,tag:null}))}));
 expect(shapes(newWorld)).toEqual(shapes(oldWorld));
 const pivot=pivotOf(original.parts),fit=structureFit(original.parts,object.position,object.rotation,oldWorld.field);
 expect(structureFit(courtyard.parts,object.position,object.rotation,newWorld.field)).toEqual(fit);
 for(const part of roads){
  const at=partTransform(part,pivot);
  for(const x of [-.35,0,.35])for(const z of [-.35,0,.35]){
   const point=localToDir({dir:object.position,yaw:object.rotation},fit.baseRadius,[at.position[0]+x,0,at.position[2]+z]);
   const oldSupport=oldWorld.support(point,fit.baseRadius+.26),newSupport=newWorld.support(point,fit.baseRadius+.26);
   expect(newSupport.radius).toBe(oldSupport.radius);expect(newSupport.objectId).toBe(oldSupport.objectId);
  }
 }
 expect(JSON.stringify(original)).toBe(before);expect(cornerLane()).toEqual(original);
});
it('walks from landing to the post, orchard and boarding marker and back using authoritative colliders',()=>{
 const w=world();
 for(const route of village.routes){
  let p=w.recover(w.pose(SPAWN));
  for(const target of route.points.slice(1))p=walk(w,p,target);
  expect(distance(p.position,route.points.at(-1)!,village.radius)).toBeLessThan(.03);
  for(const target of [...route.points].reverse().slice(1))p=walk(w,p,target);
 }
 for(const p of [SPAWN,NPCS.mica.position,NPCS.sol.position,HUB_DOCK]){
  const pose=w.pose(p);expect(w.blocked(pose)).toBe(false);expect(pose.radius).toBeGreaterThan(21);
 }
 expect(canBoard('hub',HUB_DOCK,village.radius)).toBe(true);
 expect(homeRoutesWalkable(w,village.routes)).toBe(true);
});
it('walks the public workshop exterior stair up to its real upper deck and back without jumping',()=>{
 const w=world(),object=village.objects.find(object=>object.id==='sample-public-workshop')!,parts=village.blueprints[object.blueprintHash!];
 const base=structureFit(parts,object.position,object.rotation,w.field).baseRadius;
 const stair=partTransform(parts.find(part=>part.part==='stair.straight')!,pivotOf(parts));
 const at=(forward:number,height:number)=>localToDir({dir:object.position,yaw:object.rotation},base,
  [stair.position[0]+Math.sin(stair.yaw)*forward,height,stair.position[2]+Math.cos(stair.yaw)*forward]);
 const route={id:'public-exterior-stair',width:1,points:[at(1.5,0),at(.4,0),at(-1.6,2.2),at(-2.1,2.2)]};
 const upstairs=walkHomeRoute(w,route);expect(upstairs).not.toBeNull();
 expect(upstairs!.radius-base).toBeGreaterThan(2.05);
 const downstairs=walkHomeRoute(w,{...route,points:[...route.points].reverse()},upstairs!);
 expect(downstairs).not.toBeNull();expect(downstairs!.radius-base).toBeLessThan(.25);
});
it('keeps old harbour geometry and private database rows separate from the sample public projection',()=>{
 const legacy=new GroundWorld({id:'hub',radius:14,revision:0,objects:[]});
 expect(legacy.bodies.map(b=>b.objectId)).toContain(HUB_OBJECTS[0].id);
 expect(legacy.bodies.map(b=>b.objectId)).not.toContain(village.objects[0].id);
 expect(Object.keys(PUBLIC_CONTENTS)).toHaveLength(3);
 const store=openStore(':memory:');
 try{
  store.create('legacy-public');const before=store.state('legacy-public').ground!;
  // A disposable in-memory copy models an old sample hub ground row. The
  // new public configuration must recover it through the scene fence.
  store.db.prepare("UPDATE planets SET sample_radius=21.6 WHERE id='hub'").run();
  const rowBefore=store.db.prepare("SELECT * FROM planets WHERE id='hub'").get();
  const planets=planetStore(store.db,undefined,undefined,21.6),hub=planets.view('legacy-public','hub');
  expect(hub.radius).toBe(21.6);expect(hub.environment).toBe(village.environment);expect(hub.revision).toBe(1004);
  const restored=groundStore(store.db,planets).read('legacy-public');
  expect(restored.sceneRevision).toBe(1004);expect(restored.sequence).toBeGreaterThan(before.sequence);
  expect(restored.radius).toBeGreaterThan(21);
  expect(store.db.prepare("SELECT * FROM planets WHERE id='hub'").get()).toEqual(rowBefore);
 }finally{store.close();}
});
it('uses the same finite Path object, seating and presentation contract as player construction',()=>{
 const paths=village.objects.filter(o=>o.kind==='path'),field=fieldOf(village.environment,village.radius);
 expect(paths.length).toBeGreaterThan(0);
 for(const path of paths){
  expect(Object.keys(path).sort()).toEqual(['assetVersion','id','kind','position','rotation','version']);
  expect(objectRadius(path)).toBe(objectRadius({kind:'path'}));
  expect(objectHeight(path)).toBe(objectHeight({kind:'path'}));
  expect(placementProblem('path',path.position,village.objects,path.id,undefined,village.radius,2,
   {rotation:path.rotation,blueprints:village.blueprints,field})).toBeNull();
  expect(objectSeat(field,path,village.blueprints).problem).toBeNull();
 }
 // Canvas painting is outside this Node contract test; both real builders
 // still use the unmodified shared materials and real geometry.
 vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){}})})});
 let ordinary:ReturnType<typeof builtObject>|undefined,generated:ReturnType<typeof builtObject>|undefined;
 try{
  ordinary=builtObject('path',1);generated=builtObject('path',paths[0].assetVersion);
  expect(new Box3().setFromObject(generated)).toEqual(new Box3().setFromObject(ordinary));
  const meshes=(root:ReturnType<typeof builtObject>)=>{const result:Mesh[]=[];root.traverse(o=>{if(o instanceof Mesh)result.push(o);});return result;};
  expect(meshes(generated).map(m=>m.material)).toEqual(meshes(ordinary).map(m=>m.material));
  expect(meshes(generated).map(m=>Array.from(m.geometry.getAttribute('position').array)))
   .toEqual(meshes(ordinary).map(m=>Array.from(m.geometry.getAttribute('position').array)));
 }finally{if(ordinary)disposeGeometry(ordinary);if(generated)disposeGeometry(generated);vi.unstubAllGlobals();}
 expect(groundPresentation('hub',21.6)).toBe(groundPresentation('private',21.6));
});
it('keeps every route tile within the normal object budget and ignores historical route width',()=>{
 const objects=village.objects.filter(o=>o.kind!=='path'),before=JSON.stringify(objects);
 const options={routes:village.routes,pavingRoutes:village.pavingRoutes,radius:village.radius,environment:village.environment,objects,blueprints:village.blueprints,spacing:.77,idPrefix:'sample-public-path'};
 const plan=planRoutePaths(options);
 expect(plan.objects).toEqual(village.objects.filter(o=>o.kind==='path'));
 expect(plan.objects.length+objects.length).toBeLessThanOrEqual(MAX_OBJECTS);
 expect(plan.budgetLimited).toBe(false);expect(plan.coverage.every(route=>route.connected)).toBe(true);
 expect(planRoutePaths({...options,routes:village.routes.map(route=>({...route,width:route.width*10}))})).toEqual(plan);
 const limited=planRoutePaths({...options,maxObjects:objects.length+2});
 expect(limited.objects).toHaveLength(2);expect(limited.budgetLimited).toBe(true);
 expect(planRoutePaths({...options,maxObjects:objects.length}).objects).toEqual([]);
 const repeated=planRoutePaths({...options,objects:village.objects});
 expect(repeated.objects).toEqual([]);
 expect(JSON.stringify(objects)).toBe(before);
});
it('gives public construction exactly the same terrain and collision bodies as the same private objects',()=>{
 const publicWorld=world(),privateWorld=new GroundWorld({id:'ordinary-player-world',radius:village.radius,revision:0,objects:village.objects,environment:village.environment,blueprints:village.blueprints});
 expect(publicWorld.bodies.filter(body=>body.objectId!=='hub-ship')).toEqual(privateWorld.bodies);
 for(const path of village.objects.filter(o=>o.kind==='path')){
  expect(publicWorld.bodies.some(body=>body.objectId===path.id)).toBe(false);
  expect(publicWorld.pose(path.position)).toEqual(privateWorld.pose(path.position));
  expect(publicWorld.blocked(publicWorld.pose(path.position))).toBe(false);
 }
});
it('checks NPC reach in actual 21.6-metre world units rather than the old 14-metre globe',()=>{
 const store=openStore(':memory:');
 try{
  store.create('sample-reach');store.db.prepare("UPDATE planets SET sample_radius=21.6 WHERE id='hub'").run();
  const point=localToDir({dir:NPCS.mica.position,yaw:0},21.6,[0,0,1.9]);
  expect(distance(point,NPCS.mica.position,21.6)).toBeGreaterThan(1.65);
  expect(distance(point,NPCS.mica.position,14)).toBeLessThan(1.65);
  store.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(point),'sample-reach');
  expect(()=>store.interact('sample-reach','pickup')).toThrow('Walk closer to Mica');
  expect(store.db.prepare('SELECT quest FROM players WHERE id=?').get('sample-reach')?.quest).toBe('available');
 }finally{store.close();}
});
