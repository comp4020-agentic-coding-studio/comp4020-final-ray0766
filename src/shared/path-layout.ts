import {Vector3} from 'three';
import type {BlueprintContents} from './blueprints.ts';
import {facePoint} from './harbour-layout.ts';
import type {HomeSurfaceRoute} from './home-layout.ts';
import {MAX_OBJECTS,placementProblem} from './planets.ts';
import type {PlacedObject} from './planets.ts';
import {fieldOf,objectSeat} from './terrain.ts';
import {distance} from './world.ts';
import type {Vec3} from './world.ts';

export interface RoutePathOptions {
 routes:readonly HomeSurfaceRoute[];
 radius:number;
 environment:string|null;
 objects:readonly PlacedObject[];
 blueprints?:BlueprintContents;
 /** Total world-object ceiling, including existing structures and props. */
 maxObjects?:number;
 spacing?:number;
 idPrefix?:string;
}
export interface RoutePathCoverage {id:string;candidates:number;added:number;covered:number;blocked:number;budgetOmitted:number}
export interface RoutePathPlan {
 objects:PlacedObject[];requested:number;added:number;capacity:number;blocked:number;budgetLimited:boolean;coverage:RoutePathCoverage[];
}

/** Plan ordinary quick-build Path objects. Route width is historical navigation
 * metadata: it cannot scale a tile, widen its clearing or grant collision rules.
 * This pure preview never changes existing objects, documents or their IDs. */
export function planRoutePaths({routes,radius,environment,objects,blueprints={},maxObjects=MAX_OBJECTS,spacing=.7,idPrefix='route-path'}:RoutePathOptions):RoutePathPlan {
 if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(spacing)||spacing<.4||spacing>2||!Number.isInteger(maxObjects)||maxObjects<0)throw Error('Invalid path planning budget or dimensions.');
 const capacity=Math.max(0,Math.min(MAX_OBJECTS,maxObjects)-objects.length),field=fieldOf(environment,radius);
 const coverage=routes.map(route=>({id:route.id,candidates:0,added:0,covered:0,blocked:0,budgetOmitted:0}));
 const queues=routes.map((route,routeIndex)=>{
  const candidates:{object:PlacedObject;routeIndex:number}[]=[];
  for(let leg=1;leg<route.points.length;leg++){
   const a=new Vector3(...route.points[leg-1]),b=new Vector3(...route.points[leg]),length=a.angleTo(b)*radius;
   if(length<.0001)continue;
   const steps=Math.max(1,Math.ceil(length/spacing));
   for(let i=0;i<=steps;i++){
    const position=a.clone().lerp(b,i/steps).normalize().toArray() as Vec3;
    const toward=i===steps?a.toArray() as Vec3:b.toArray() as Vec3;
    const rotation=(facePoint(position,toward)+Math.PI*2)%(Math.PI*2);
    candidates.push({routeIndex,object:{id:`${idPrefix}-${routeIndex}-${leg}-${i}`,kind:'path',assetVersion:2,position,rotation,version:1}});
   }
  }
  // Spread a capacity-limited preview over the whole route before filling its
  // gaps. Round-robin between routes also avoids starving later destinations.
  const ordered:typeof candidates=[];
  const ranges:[[number,number],...[number,number][]]=[[0,candidates.length-1]];
  for(let n=0;n<ranges.length;n++){
   const [lo,hi]=ranges[n];if(lo>hi)continue;
   const mid=Math.floor((lo+hi)/2);ordered.push(candidates[mid]);
   ranges.push([lo,mid-1],[mid+1,hi]);
  }
  return ordered;
 });
 const accepted:PlacedObject[]=[],existingPaths=objects.filter(o=>o.kind==='path'),pending:{object:PlacedObject;routeIndex:number}[]=[];
 const occupied=[...objects];
 for(let index=0;index<Math.max(0,...queues.map(queue=>queue.length));index++)for(const queue of queues){
  const candidate=queue[index];if(!candidate)continue;
  const {object,routeIndex}=candidate,stats=coverage[routeIndex];stats.candidates++;
  if([...existingPaths,...accepted].some(path=>distance(path.position,object.position,radius)<spacing*.78)){stats.covered++;continue;}
  if(placementProblem('path',object.position,occupied,undefined,undefined,radius)||objectSeat(field,object,blueprints).problem){stats.blocked++;continue;}
  // Accepted candidates also deduplicate those omitted by the budget; counts
  // describe the complete legal proposal without duplicate junction tiles.
  accepted.push(object);pending.push(candidate);
 }
 const result=pending.slice(0,capacity);
 for(const [index,candidate]of pending.entries()){
  if(index<capacity)coverage[candidate.routeIndex].added++;
  else coverage[candidate.routeIndex].budgetOmitted++;
 }
 return {objects:result.map(candidate=>candidate.object),requested:pending.length,added:result.length,capacity,blocked:coverage.reduce((sum,route)=>sum+route.blocked,0),budgetLimited:pending.length>capacity,coverage};
}
