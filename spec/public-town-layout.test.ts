import {expect,it} from 'vitest';
import {Vector3} from 'three';
import {blueprintHash,decodeBlueprint,encodeBlueprint} from '../src/shared/blueprint-codec.ts';
import {layoutErrors} from '../src/shared/blueprint-model.ts';
import {publicTown,PUBLIC_TOWN_VERSION,PUBLIC_TOWN_BLUEPRINTS,PUBLIC_TOWN_HASHES,townDistrictFor,townPoint,townEntrancePoints} from '../src/shared/public-town-layout.ts';
import {PUBLIC_TOWN_CAPACITY,PRIVATE_CAPACITY} from '../src/shared/world-capacity.ts';
import {createPublicTownPlacementCheck} from '../src/shared/public-town-reservations.ts';
import {StructurePlacementCache} from '../src/shared/structure-placement.ts';
import {fieldOf,objectSeat} from '../src/shared/terrain.ts';
import {GroundWorld,FIXED_STEP} from '../src/shared/physics/world.ts';
import type {GroundPose} from '../src/shared/physics/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {NPCS,SPAWN,distance} from '../src/shared/world.ts';
import {HUB_DOCK} from '../src/shared/ports.ts';
import {planRoutePaths} from '../src/shared/path-layout.ts';

const town=publicTown();
it('keeps private path previews at 64 while accepting the trusted public ceiling',()=>{
 const options={routes:[{id:'budget-route',width:.8,points:[townPoint(-12,0),townPoint(-12,12)]}],radius:21.6,environment:null,
  objects:Array.from({length:64},(_,i)=>({id:`existing-${i}`,kind:'path' as const,position:townPoint(60,180),rotation:0,version:1}))};
 const privatePlan=planRoutePaths(options),publicPlan=planRoutePaths({...options,maxObjects:PUBLIC_TOWN_CAPACITY.objects});
 expect(privatePlan.capacity).toBe(0);expect(privatePlan.added).toBe(0);
 expect(publicPlan.capacity).toBe(448);expect(publicPlan.added).toBeGreaterThan(0);
 for(const maxObjects of [NaN,Infinity,-1,1.5])expect(()=>planRoutePaths({...options,maxObjects})).toThrow('Invalid path planning budget');
});
it('uses a complete v10 ledger, ordinary editable blueprints and authored places across all twelve render districts',async()=>{
 expect(town.radius).toBe(21.6);expect(town.version).toBe(PUBLIC_TOWN_VERSION);expect(PUBLIC_TOWN_VERSION).toBe(10);
 expect(town.objects.length).toBeLessThanOrEqual(PUBLIC_TOWN_CAPACITY.objects);
 expect(town.objects.filter(o=>o.kind==='structure').length).toBeLessThanOrEqual(PUBLIC_TOWN_CAPACITY.structures);
 expect(new Set(town.objects.map(object=>object.id)).size).toBe(town.objects.length);
 expect(town.objects.every(object=>object.version===PUBLIC_TOWN_VERSION)).toBe(true);
 // Paving coverage describes only explicitly paved approaches. Walkable
 // terrain alleys must instead satisfy the real navigation checks below.
 expect(town.roadObjects.length).toBeGreaterThan(0);
 // Actual stone objects need not cover an entire named street. Coverage is
 // asserted only for explicitly recorded paved spans, never inferred for grass.
 expect(town.entranceCoverage).toHaveLength(town.pavingRoutes.length);
 expect(town.entranceCoverage!.map(route=>route.id).sort()).toEqual(town.pavingRoutes.map(route=>route.id).sort());
 expect(town.entranceCoverage!.every(route=>route.connected&&route.maxGap<=.24&&route.endDistance<=.24)).toBe(true);
 const places=town.places??[];
 expect(places.length).toBeGreaterThan(0);
 expect(new Set(places.map(place=>place.id)).size).toBe(places.length);
 expect(new Set(places.flatMap(place=>place.objectIds)).size).toBe(places.flatMap(place=>place.objectIds).length);
 for(const place of places){
  expect(place.name.length,place.id).toBeGreaterThan(0);expect(place.nameZh.length,place.id).toBeGreaterThan(0);
  expect(place.intent.length,place.id).toBeGreaterThan(0);expect(place.walk.length,place.id).toBeGreaterThan(1);
  // A shared side lane can be bounded by neighbouring buildings without
  // inventing a separate owned house. Its referenced boundary must be real.
  const boundaries=[...place.objectIds,...place.boundaryObjectIds??[]];
  expect(boundaries.length,place.id).toBeGreaterThan(0);
  for(const id of boundaries)expect(town.buildings,place.id).toContain(id);
  for(const id of place.siteObjectIds??[]){
   expect(town.siteObjects,place.id).toContain(id);
   expect(town.objects.some(object=>object.id===id&&object.kind==='structure'),place.id).toBe(true);
  }
  expect(place.streetIds?.length,place.id).toBeGreaterThan(0);
  for(const id of place.streetIds??[])expect(town.routes.some(route=>route.id===id),place.id).toBe(true);
 }
 const placedBuildings=new Set([...places.flatMap(place=>place.objectIds),...town.destinations.map(destination=>destination.buildingId)]);
 expect([...placedBuildings].sort()).toEqual([...town.buildings].sort());
 expect(PRIVATE_CAPACITY).toEqual({objects:64,structures:8});
 expect(town.renderDistricts).toHaveLength(12);
 const assigned=town.renderDistricts.flatMap(d=>d.objectIds);
 expect(new Set(assigned).size).toBe(town.objects.length);
 expect(assigned.slice().sort()).toEqual(town.objects.map(o=>o.id).sort());
 for(const district of town.renderDistricts){
  expect(district.objectIds.filter(id=>town.buildings.includes(id)).length).toBeGreaterThanOrEqual(3);
  for(const id of district.objectIds)expect(townDistrictFor(town.objects.find(o=>o.id===id)!.position)).toBe(district.id);
 }
 for(const [index,blueprint] of PUBLIC_TOWN_BLUEPRINTS.entries()){
  expect(layoutErrors(blueprint.parts)).toEqual([]);
  expect(decodeBlueprint(encodeBlueprint(blueprint)).ok).toBe(true);
  expect(await blueprintHash(blueprint)).toBe(PUBLIC_TOWN_HASHES[index]);
 }
 expect(new Set(town.buildings.map(id=>town.objects.find(o=>o.id===id)!.blueprintHash)).size).toBeGreaterThanOrEqual(7);
 expect(publicTown()).toBe(town);
});
it('designs the back, both poles and every surface sector rather than only the arrival face',()=>{
 const buildings=town.objects.filter(o=>town.buildings.includes(o.id));
 for(const axis of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as Vec3[])
  expect(buildings.filter(o=>distance(o.position,axis,town.radius)<12).length).toBeGreaterThanOrEqual(3);
 // This coarse omission check includes roads and squares. It cannot establish
 // physical roof coverage, authored place quality or visual acceptance.
 let maxGap=0;
 for(let i=0;i<1000;i++){
  const y=1-2*(i+.5)/1000,a=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-y*y),p:Vec3=[Math.cos(a)*r,y,Math.sin(a)*r];
  maxGap=Math.max(maxGap,Math.min(...town.objects.map(o=>distance(o.position,p,town.radius)-(o.radius??.4))));
 }
 expect(maxGap).toBeLessThan(6);
 expect(town.landmarks.some(l=>l.id==='north-square')).toBe(true);
 expect(town.landmarks.some(l=>l.id==='south-square')).toBe(true);
});
it('validates the entire frozen ledger with shared entity geometry and fixed public operation reservations',()=>{
 const field=fieldOf(town.environment,town.radius),structureCache=new StructurePlacementCache();
 const placementCheck=createPublicTownPlacementCheck(field,town.radius,town.blueprints,structureCache);
 const failures:unknown[]=[];
 for(const object of town.objects){
  const problem=placementCheck(object,town.objects);
  if(problem)failures.push({id:object.id,problem});
  expect(objectSeat(field,object,town.blueprints).problem,object.id).toBeNull();
 }
 expect(failures).toEqual([]);
},120000);
function walk(world:GroundWorld,start:GroundPose,points:Vec3[]):GroundPose {
 let pose=start;
 for(const target of points){
  let done=false;
  for(let i=0;i<1800;i++){
   const remaining=distance(pose.position,target,town.radius);
   if(remaining<.035){done=true;break;}
   const next=new Vector3(...pose.position).lerp(new Vector3(...target),Math.min(1,.045/remaining)).normalize().toArray() as Vec3;
   const before=pose;
   pose=world.move(pose,next,FIXED_STEP);
   expect(world.blocked(pose),JSON.stringify({target,pose})).toBe(false);
   if(distance(before.position,pose.position,town.radius)<.000001)break;
  }
  expect(done,JSON.stringify({target,pose})).toBe(true);
 }
 return pose;
}
it('replays the preserved task routes, every real door approach and each authored street in both directions',()=>{
 // Use the actual public scene once, including the parked craft obstacle.
 // Passing the ledger as additional hub objects would duplicate every body.
 const world=new GroundWorld({id:'hub',radius:town.radius,revision:1000+town.version,objects:[]});
 expect(new Set(town.routes.map(route=>route.id)).size).toBe(town.routes.length);
 for(const [id,target]of [['public-post',NPCS.mica.position],['public-orchard',NPCS.sol.position],['public-harbour',HUB_DOCK]] as const){
  const route=town.routes.find(route=>route.id===id);
  expect(route,`Missing ${id}`).toBeDefined();
  expect(route!.points[0]).toEqual(SPAWN);
  expect(distance(route!.points.at(-1)!,target,town.radius),id).toBeLessThan(.24);
 }
 const entrances=townEntrancePoints(town),represented=new Set(entrances.map(entry=>entry.buildingId));
 for(const id of town.buildings)expect(represented,`Building ${id} has no outward door or step`).toContain(id);
 for(const entry of entrances){
  const route=town.routes.find(route=>distance(route.points.at(-1)!,entry.point,town.radius)<.24);
  expect(route,`No navigable route ends at ${entry.id}`).toBeDefined();
 }
 for(const place of town.places??[]){
  // Every authored bend needs a collision-checked route point, not just a
  // straight shortcut between the two ends of a visually named place.
  for(const point of place.walk)expect(town.routes.some(route=>route.points.some(p=>distance(p,point,town.radius)<.24)),`No navigable street at ${place.id}: ${point}`).toBe(true);
 }
 for(const route of town.routes){
  expect(route.points.length,route.id).toBeGreaterThan(1);
  const initial=world.pose(route.points[0]),support=world.support(initial.position,initial.radius+.26);
  const first={...initial,radius:support.radius};
  expect(world.blocked(first),`Blocked route start: ${route.id}`).toBe(false);
  const end=walk(world,first,route.points.slice(1));
  walk(world,end,[...route.points].reverse().slice(1));
 }
 for(const point of [SPAWN,HUB_DOCK,NPCS.mica.position,NPCS.sol.position,townPoint(-90,0)]){
  const initial=world.pose(point),support=world.support(point,initial.radius+.26);
  expect(world.blocked({...initial,radius:support.radius}),`Blocked preserved anchor: ${point}`).toBe(false);
 }
 expect(town.destinations.map(d=>d.position)).toEqual([NPCS.mica.position,NPCS.sol.position,HUB_DOCK]);
 for(const destination of town.destinations)expect(town.objects.some(o=>o.id===destination.buildingId)).toBe(true);
},120000);
