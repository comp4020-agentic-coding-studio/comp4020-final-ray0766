import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Vector3} from 'three';
import {localToDir} from '../src/assets/claude-geometry/core/anchor.ts';
import type {HeightField} from '../src/assets/claude-geometry/core/ground.ts';
import type {PartPlacement} from '../src/shared/blueprint-model.ts';
import {industrialCabin} from '../src/assets/claude-geometry/blueprint/samples.ts';
import {encodeBlueprint} from '../src/shared/blueprint-codec.ts';
import {structureSize,structureFit} from '../src/shared/blueprints.ts';
import {placementProblem,objectRadius} from '../src/shared/planets.ts';
import type {PlacedObject,PlacementDetails} from '../src/shared/planets.ts';
import {PathPlacementCache,pathPlacementCheck} from '../src/shared/path-structure-placement.ts';
import {planRoutePaths} from '../src/shared/path-layout.ts';
import {fieldOf,gradedField} from '../src/shared/terrain.ts';
import {GroundWorld,FIXED_STEP} from '../src/shared/physics/world.ts';
import {distance,normalize,SPAWN} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {openStore} from '../src/server/store.ts';

const deck:PartPlacement[]=[1,2].flatMap((x,i)=>[1,2].map((z,j)=>({n:i*2+j+1,part:'floor.deck',x,z,level:0,rot:0})));
const flat=(radius:number):HeightField=>({id:`flat-${radius}`,waterLevel:null,heightAt:()=>radius-10,normalAt:p=>p});
function fixture(radius=14,rotation=0,position=normalize([.65,1,-.3]),parts=deck,field=flat(radius)){
 const structure:PlacedObject={id:'building',kind:'structure',position,rotation,version:1,blueprintHash:'deck',...structureSize(parts)};
 const point=(x:number,z:number)=>localToDir({dir:position,yaw:rotation},structureFit(parts,position,rotation,field).baseRadius,[x,0,z]);
 const path=(x:number,z:number):PlacedObject=>({id:'path',kind:'path',position:point(x,z),rotation,version:1,assetVersion:2});
 const details=(object:PlacedObject):PlacementDetails=>({rotation:object.rotation,blueprintHash:object.blueprintHash,blueprints:{deck:parts},field});
 const check=(object:PlacedObject,objects:PlacedObject[])=>placementProblem(object.kind,object.position,objects,undefined,object.radius,radius,object.assetVersion??2,details(object));
 return {structure,path,point,details,check,field};
}

it('joins an actual floor edge inside the old exclusion circle, in both placement orders and at polar/rotated anchors',()=>{
 for(const radius of [10,14,21.6])for(const rotation of [0,Math.PI/2,.73])for(const position of [normalize([.65,1,-.3]),[0,-1,0] as Vec3]){
  const f=fixture(radius,rotation,position),path=f.path(0,1.48),before=structuredClone([f.structure,path]);
  expect(placementProblem('path',path.position,[f.structure],undefined,undefined,radius)).toMatch(/too close/);
  expect(f.check(path,[f.structure]),`path to floor ${radius}/${rotation}`).toBe(null);
  expect(f.check(f.structure,[path]),`floor to path ${radius}/${rotation}`).toBe(null);
  expect(f.check(f.path(0,1.1),[f.structure])).not.toBe(null);
  expect([f.structure,path]).toEqual(before);
 }
});

it('retains landing, missing-content and non-Path spacing protection',()=>{
 const f=fixture(),path=f.path(0,1.48),details=f.details(path);
 expect(placementProblem('path',SPAWN,[],undefined,undefined,14,2,details)).toMatch(/landing/);
 expect(placementProblem('path',path.position,[f.structure],undefined,undefined,14,2,{...details,blueprints:{}})).toMatch(/too close/);
 for(const kind of ['tree','bench','cottage'] as const)expect(placementProblem(kind,path.position,[f.structure],undefined,undefined,14,2,details)).toMatch(/too close/);
 for(const kind of ['tree','bench','lamp'] as const)expect(placementProblem('path',path.position,[{...path,id:'obstacle',kind}],undefined,undefined,14,2,details)).toMatch(/too close/);
});

it('checks real walls, furniture and staircase overhangs while leaving clear ground beneath high roofs available',()=>{
 const base=fixture(),near=base.path(0,1.48);
 for(const part of ['wall.solid','furniture.bench'] as const){
  // These solids overhang the deck by 8–10cm. The very same tile must fit
  // beside the bare deck, so a slab/foundation rejection cannot mask this.
  const parts=[...deck,{n:5,part,x:1,z:2,level:0,rot:part==='furniture.bench'?1:0}] as PartPlacement[];
  const f=fixture(14,0,base.structure.position,parts);
  const blocked=f.path(-.5,1.4);
  expect(base.check(blocked,[base.structure]),`bare deck before ${part}`).toBe(null);
  expect(f.check(blocked,[f.structure]),part).not.toBe(null);
 }
 const stairs=fixture(14,0,base.structure.position,[...deck,{n:5,part:'stair.straight',x:1,z:2,level:0,rot:2}]);
 const stairPath=stairs.path(-.5,1.65);
 expect(base.check(stairPath,[base.structure])).toBe(null);
 expect(stairs.check(stairPath,[stairs.structure])).not.toBe(null);
 const door=fixture(14,0,base.structure.position,[...deck,{n:5,part:'wall.door.open',x:1,z:2,level:0,rot:0}]);
 const doorPath=door.path(-.5,1.55);
 expect(base.check(doorPath,[base.structure])).toBe(null);
 // Sliding leaves stay on the wall face; the old swing no longer excludes
 // an otherwise supported path in front of the threshold.
 expect(door.check(doorPath,[door.structure])).toBe(null);
 const roofs=[...deck,{n:5,part:'roof.slope',x:1,z:2,level:2,rot:0}] as PartPlacement[];
 const f=fixture(14,0,base.structure.position,roofs);
 expect(f.check(near,[f.structure])).toBe(null);
});

it('uses final graded ground for stone support and caches dense fits only within the explicit preview',()=>{
 const f=fixture(),path=f.path(0,1.48),objects=[f.structure,path],blueprints={deck};
 const cached=new PathPlacementCache();let samples=0;
 const field={...f.field,heightAt:(p:Vec3)=>{samples++;return f.field.heightAt(p);}};
 expect(pathPlacementCheck(field,objects,blueprints,objectRadius,true,cached)!(path,f.structure,deck)).toBe(null);
 const first=samples;samples=0;
 expect(pathPlacementCheck(field,objects,blueprints,objectRadius,true,cached)!(path,f.structure,deck)).toBe(null);
 expect(samples).toBeLessThan(first/5);
 // An existing path's lowering must be accounted for with exactly the same
 // grading as rendering/physics, not a newly invented Path support platform.
 const support=gradedField(field,objects,blueprints);
 expect(support.heightAt(path.position)).toBeLessThan(field.heightAt(path.position));
 const underwater={...f.field,waterLevel:10};
 expect(pathPlacementCheck(underwater,objects,blueprints,objectRadius)!(path,f.structure,deck)).toMatch(/support/);
 const steep={...f.field,heightAt:(p:Vec3)=>f.field.heightAt(p)+(p[0]>path.position[0]?.8:0)};
 expect(pathPlacementCheck(steep,objects,blueprints,objectRadius)!(path,f.structure,deck)).not.toBe(null);
});

it('walks from an ordinary Path onto the low floor and back using actual collision and support, without Path colliders',()=>{
 const radius=14,field=fieldOf(null,radius),f=fixture(radius,0,normalize([.65,1,-.3]),deck,field),path=f.path(0,1.48);
 const details={...f.details(path),terrainSeating:false};
 expect(placementProblem('path',path.position,[f.structure],undefined,undefined,radius,2,details)).toBe(null);
 const world=new GroundWorld({id:'private-test',revision:1,radius,objects:[f.structure,path],blueprints:{deck}});
 expect(world.bodies.map(body=>body.objectId)).toEqual(['building']);
 let pose=world.pose(f.point(0,2));
 for(const [target,expectedSupport] of [[f.point(0,.45),'building'],[f.point(0,2),null]] as const){
  for(let step=0;step<100;step++){
   const current=new Vector3(...pose.position),goal=new Vector3(...target),distance=current.angleTo(goal)*radius;
   if(distance<.02)break;
   const next=current.lerp(goal,Math.min(1,.035/distance)).normalize().toArray() as Vec3;
   pose=world.move(pose,next,FIXED_STEP);
   expect(world.blocked(pose)).toBe(false);expect(pose.grounded).toBe(true);
  }
  expect(distance(pose.position,target,radius)).toBeLessThan(.025);
  expect(world.support(pose.position,pose.radius+.01).objectId).toBe(expectedSupport);
 }
});

it('samples the terminal floor edge before coarse route tiles while preserving existing Paths and the object budget',()=>{
 const radius=14,f=fixture(radius,0,normalize([.65,1,-.3]),deck,fieldOf(null,radius));
 const route={id:'floor',width:1,points:[f.point(0,4.1),f.point(0,.65)]};
 const options={routes:[route],radius,environment:null,objects:[f.structure],blueprints:{deck},spacing:.85};
 const plan=planRoutePaths(options),end=plan.objects[0];
 expect(end.id).toContain('-end-');
 expect(distance(end.position,f.point(0,1),radius)).toBeLessThan(.48);
 for(const path of plan.objects)expect(placementProblem('path',path.position,[f.structure],undefined,undefined,radius,2,{...f.details(path),terrainSeating:false})).toBe(null);
 for(let i=0;i<plan.objects.length;i++)for(let j=0;j<i;j++)expect(distance(plan.objects[i].position,plan.objects[j].position,radius)).toBeGreaterThanOrEqual(.48);
 const old=structuredClone(plan.objects),occupied=[f.structure,...old],before=structuredClone(occupied);
 expect(planRoutePaths({...options,objects:occupied}).objects).toEqual([]);
 expect(occupied).toEqual(before);
 const limited=planRoutePaths({...options,maxObjects:2});expect(limited.objects).toHaveLength(1);expect(limited.objects[0]).toEqual(end);expect(limited.budgetLimited).toBe(true);
});

it('measures continuous visible paving separately from the navigation endpoint inside a building',()=>{
 const radius=14,f=fixture(radius,0,normalize([.65,1,-.3]),deck,fieldOf(null,radius));
 const route={id:'floor',width:1,points:[f.point(0,4.1),f.point(0,.65)]};
 const paving={...route,points:[route.points[0],f.point(0,1.48)]};
 const options={routes:[route],pavingRoutes:[paving],radius,environment:null,objects:[f.structure],blueprints:{deck},spacing:.85};
 const plan=planRoutePaths(options);
 expect(plan.coverage[0].connected).toBe(true);expect(plan.coverage[0].endDistance).toBeLessThan(.01);
 expect(plan.coverage[0].maxGap).toBeLessThanOrEqual(.24);
 // Missing middle tiles remain walkable grass, but are explicitly disconnected
 // even though two endpoint tiles exist and no budget was truncated.
 const sparse=[f.structure,plan.objects[0],plan.objects.at(-1)!],before=structuredClone(sparse);
 const missing=planRoutePaths({...options,objects:sparse,maxObjects:sparse.length});
 expect(missing.coverage[0].connected).toBe(false);expect(missing.coverage[0].maxGap).toBeGreaterThan(.3);
 const filled=planRoutePaths({...options,objects:sparse});
 expect(filled.coverage[0].connected).toBe(true);expect(filled.added).toBeGreaterThan(0);expect(sparse).toEqual(before);
 const complete=[...sparse,...filled.objects];
 expect(planRoutePaths({...options,objects:complete}).added).toBe(0);
 expect(new Set(complete.map(object=>object.id)).size).toBe(complete.length);
});

it('anchors a shared street and two close door approaches without letting a side branch erase the street',()=>{
 const radius=14,f=fixture(radius,0,normalize([.65,1,-.3]),deck,fieldOf(null,radius));
 const prefix=[f.point(0,5),f.point(0,3.3),f.point(0,1.55)];
 const routes=[{id:'left',width:1,points:[...prefix,f.point(-.18,1.55)]},{id:'right',width:1,points:[...prefix,f.point(.18,1.55)]},{id:'branch',width:1,points:[prefix[0],prefix[1],f.point(-1.7,3.3)]}];
 const options={routes,pavingRoutes:routes,radius,environment:null,objects:[f.structure],blueprints:{deck},spacing:.85};
 const plan=planRoutePaths(options);
 for(const route of plan.coverage){expect(route.connected,route.id).toBe(true);expect(route.isolated).toBe(0);expect(route.maxGap).toBeLessThanOrEqual(.24);}
 expect(plan.coverage.slice(0,2).every(route=>route.endDistance<=.25)).toBe(true);
 // The shared junction is an actual, ordinary tile, reused by both doors.
 expect(plan.objects.filter(path=>distance(path.position,prefix[2],radius)<.01)).toHaveLength(1);
 const old=[f.structure,...plan.objects],before=structuredClone(old);
 expect(planRoutePaths({...options,objects:old}).objects).toEqual([]);expect(old).toEqual(before);
 expect(()=>planRoutePaths({...options,routes:[{id:'bad',width:1,points:[[NaN,1,0]]}]})).toThrow(/directions/);
});

it('server create and update use the same bilateral rule and preserve old Paths when rejected',()=>{
 for(const pathFirst of [false,true]){
  const store=openStore(':memory:');try{
   store.create('owner',0);const planet=store.universe('owner').planets.find(p=>p.kind==='garden')!;
   store.claim('owner',planet.id);store.visit('owner',planet.id);
   const bp={...industrialCabin(),parts:deck},saved=store.saveBlueprint('owner',{document:encodeBlueprint(bp),expectedVersion:0});
   const radius=planet.radius!,f=fixture(radius,0,normalize([.65,1,-.3]),deck,fieldOf(null,radius));
   const path=f.path(0,1.48),pathId=randomUUID(),structureId=randomUUID();
   const addPath=()=>store.createObject('owner',{planetId:planet.id,objectId:pathId,kind:'path',position:path.position,rotation:path.rotation});
   const addStructure=()=>store.createObject('owner',{planetId:planet.id,objectId:structureId,kind:'structure',position:f.structure.position,rotation:0,blueprintHash:saved.hash});
   if(pathFirst){addPath();addStructure();}else{addStructure();addPath();}
   expect(store.universe('owner').currentPlanet.objects).toHaveLength(2);
   const before=store.universe('owner').currentPlanet.objects,history=store.historySnapshot('owner',planet.id);
   expect(()=>store.updateObject('owner',{planetId:planet.id,objectId:pathId,position:f.path(0,1.1).position,rotation:0,expectedVersion:1})).toThrow();
   expect(()=>store.updateObject('owner',{planetId:planet.id,objectId:structureId,position:f.point(0,.4),rotation:0,expectedVersion:1})).toThrow();
   expect(store.universe('owner').currentPlanet.objects).toEqual(before);
   expect(store.historySnapshot('owner',planet.id)).toEqual(history);
   const replacement=store.saveBlueprint('owner',{document:encodeBlueprint({...bp,id:randomUUID() as typeof bp.id,parts:deck.map(part=>({...part,part:'floor.grate' as const}))}),expectedVersion:0});
   store.replaceObject('owner',{planetId:planet.id,objectId:structureId,blueprintHash:replacement.hash,expectedVersion:1});
   store.undoObject('owner',{planetId:planet.id,objectId:structureId,expectedVersion:2});
   const after=store.universe('owner').currentPlanet.objects;
   expect(after.find(object=>object.id===pathId)).toEqual(before.find(object=>object.id===pathId));
   expect(after.find(object=>object.id===structureId)).toEqual({...before.find(object=>object.id===structureId),version:3});
  }finally{store.close();}
 }
});
