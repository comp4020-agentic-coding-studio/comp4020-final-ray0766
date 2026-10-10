import {expect,it} from 'vitest';
import {Vector3} from 'three';
import {blueprintHash,decodeBlueprint,encodeBlueprint} from '../src/assets/claude-geometry/blueprint/codec.ts';
import {layoutErrors} from '../src/assets/claude-geometry/blueprint/model.ts';
import {publicTown,PUBLIC_TOWN_BLUEPRINTS,PUBLIC_TOWN_HASHES,townDistrictFor,townPoint} from '../src/shared/public-town-layout.ts';
import {PUBLIC_TOWN_CAPACITY,PRIVATE_CAPACITY} from '../src/shared/world-capacity.ts';
import {placementProblem} from '../src/shared/planets.ts';
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
it('uses a complete counted ledger and ordinary editable blueprints for all twelve districts',async()=>{
 expect(town.radius).toBe(21.6);expect(town.version).toBe(8);
 expect(town.objects.length).toBeLessThanOrEqual(PUBLIC_TOWN_CAPACITY.objects);
 expect(town.objects.filter(o=>o.kind==='structure').length).toBeLessThanOrEqual(PUBLIC_TOWN_CAPACITY.structures);
 expect(town.buildings.length).toBeGreaterThanOrEqual(80);
 expect(town.entranceCoverage).toHaveLength(town.buildings.length);
 expect(town.entranceCoverage!.every(route=>route.connected&&route.maxGap<=.24&&route.endDistance<=.24)).toBe(true);
 expect(town.objects.every(object=>object.version===8)).toBe(true);
 const polarCourt=town.objects.find(object=>object.id==='town-north-square')!;
 expect(town.blueprints[polarCourt.blueprintHash!]).toHaveLength(16);
 expect(town.blueprints[polarCourt.blueprintHash!].every(part=>part.part==='street.road.plain'&&part.level===0)).toBe(true);
 expect(town.objects.some(object=>object.id==='town-town-arrival-court-1-1')).toBe(false);
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
 // A Fibonacci survey measures the largest undesigned gap independently
 // of the authored latitude rows. Roads and squares count as designed land.
 let maxGap=0;
 for(let i=0;i<1000;i++){
  const y=1-2*(i+.5)/1000,a=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-y*y),p:Vec3=[Math.cos(a)*r,y,Math.sin(a)*r];
  maxGap=Math.max(maxGap,Math.min(...town.objects.map(o=>distance(o.position,p,town.radius)-(o.radius??.4))));
 }
 expect(maxGap).toBeLessThan(6);
 expect(town.landmarks.some(l=>l.id==='north-square')).toBe(true);
 expect(town.landmarks.some(l=>l.id==='south-square')).toBe(true);
});
it('validates every actual building, road, plaza and prop through the same player placement contract',()=>{
 const field=fieldOf(town.environment,town.radius),structureCache=new StructurePlacementCache();
 const failures:unknown[]=[];
 for(const object of town.objects){
  const problem=placementProblem(object.kind,object.position,town.objects,object.id,object.radius,town.radius,2,
   {rotation:object.rotation,blueprintHash:object.blueprintHash,blueprints:town.blueprints,field,structureCache});
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
it('walks the full three rings, four meridians and preserved task routes in both directions',()=>{
 const world=new GroundWorld({id:'ordinary-town-copy',radius:town.radius,revision:5,objects:town.objects,environment:town.environment,blueprints:town.blueprints});
 for(const route of town.routes){
  const first=world.recover(world.pose(route.points[0]));
  expect(distance(first.position,route.points[0],town.radius),route.id).toBeLessThan(.005);
  const end=walk(world,first,route.points.slice(1));
  walk(world,end,[...route.points].reverse().slice(1));
 }
 for(const point of [SPAWN,HUB_DOCK,NPCS.mica.position,NPCS.sol.position,townPoint(-90,0)])expect(world.blocked(world.recover(world.pose(point)))).toBe(false);
 expect(town.destinations.map(d=>d.position)).toEqual([NPCS.mica.position,NPCS.sol.position,HUB_DOCK]);
 for(const destination of town.destinations)expect(town.objects.some(o=>o.id===destination.buildingId)).toBe(true);
},120000);
