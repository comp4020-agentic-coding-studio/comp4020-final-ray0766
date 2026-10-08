import {Vector3} from 'three';
import {localToDir} from '../assets/claude-geometry/core/anchor.ts';
import type {Blueprint} from '../assets/claude-geometry/blueprint/model.ts';
import {partTransform,pivotOf} from '../assets/claude-geometry/blueprint/model.ts';
import {cornerLane,padStall} from '../assets/claude-geometry/blueprint/samples.ts';
import {HOME_INFRASTRUCTURE,samplePoint,starterHome} from './home-layout.ts';
import {SHORT_STREET_ENVIRONMENT,districtWorkshopWithEntryStep} from './district-layout.ts';
import type {HomeSurfaceRoute} from './home-layout.ts';
import {HOME_SAMPLE_RADIUS} from './home.ts';
import {structureFit,structureSize} from './blueprints.ts';
import type {BlueprintContents} from './blueprints.ts';
import {objectRadius,placementProblem} from './planets.ts';
import type {BuildKind,PlacedObject} from './planets.ts';
import {NPCS,SPAWN,distance} from './world.ts';
import type {Vec3} from './world.ts';
import {HUB_DOCK} from './ports.ts';
import {HUB_SHIP,facePoint} from './harbour-layout.ts';
import {fieldOf,objectSeat} from './terrain.ts';
import {planRoutePaths} from './path-layout.ts';
import {PART_COLLIDERS} from './physics/parts.ts';

/** Sample-only public composition. Metre-sized kit parts, never scaled meshes. */
export const SAMPLE_PUBLIC_VERSION=4;
export const SAMPLE_PUBLIC_ENVIRONMENT=SHORT_STREET_ENVIRONMENT;
/** Host composition: the courtyard's twelve lane cells retain their exact
 * floor/support footprint, but use the same unmarked paving as its footway.
 * The immutable sample and player-authored road parts keep their own look. */
function orchardWalk(): Blueprint {
 const blueprint=cornerLane();
 blueprint.parts=blueprint.parts.map(part=>part.part.startsWith('street.road')?{...part,part:'street.paving'}:part);
 return blueprint;
}
export const SAMPLE_PUBLIC_BLUEPRINTS:Blueprint[]=[
 {...starterHome(),id:'3dbf341d-a2e9-41c8-bf64-39ea9eb1c001',name:'Village · post cottage'},
 {...HOME_INFRASTRUCTURE[1],id:'3dbf341d-a2e9-41c8-bf64-39ea9eb1c002',name:'Village · orchard court'},
 {...HOME_INFRASTRUCTURE[0],id:'3dbf341d-a2e9-41c8-bf64-39ea9eb1c003',name:'Village · harbour shelter'},
 {...districtWorkshopWithEntryStep(),id:'3dbf341d-a2e9-41c8-bf64-39ea9eb1c004',name:'Village · stair workshop'},
 {...padStall(),id:'3dbf341d-a2e9-41c8-bf64-39ea9eb1c005',name:'Village · corner market'},
 {...orchardWalk(),id:'3dbf341d-a2e9-41c8-bf64-39ea9eb1c006',name:'Village · orchard walk'},
] as Blueprint[];
// Canonical blueprint content hashes, verified independently with the codec.
export const SAMPLE_PUBLIC_HASHES=['25b9a2104eb63989982871a9401081dcbf6b3bcf5b7af2f2f7bf7ccc6e52d4d6','7886320a5f35299b1e0da36f8be6c8fdd5c2311eb5bfbed8c876c93bf289bfe8','acbe5d36207566bb42e99dc0850bfce807fffabcb44b0e20d2739aa36dc0e456','7cd68a5f77f81fd8b1ffde1cbac991cb563403a57d0f6cc0764f8552994831ad','46394bc396801e6891b57d90d4324fd8c8a1097a75d013f4733aeef49350439d','81064a263e2d47b675a4cb7504f6fddcd90447f9ef6f0ce518adecdb86fe5059'];
export interface SamplePublicVillage {
 version:number;radius:number;environment:string;objects:PlacedObject[];blueprints:BlueprintContents;
 routes:HomeSurfaceRoute[];pavingRoutes:HomeSurfaceRoute[];destinations:{id:string;position:Vec3;buildingId:string}[];
}
const cache=new Map<number,SamplePublicVillage>();
export const isSamplePublicRadius=(radius:number)=>Math.abs(radius-HOME_SAMPLE_RADIUS)<1e-6;
/** Fixed public bearings retain the delivery and boarding interactions. Three
 * distinct courts sit beside those bearings; the broad central lane stays open. */
export function samplePublicVillage(radius=HOME_SAMPLE_RADIUS):SamplePublicVillage {
 const old=cache.get(radius);if(old)return old;
 const local=(point:Vec3,x:number,z:number)=>localToDir({dir:point,yaw:0},radius,[x,0,z]);
 const sites:[string,Vec3,Vec3][]=[
  ['post',local(NPCS.mica.position,1,-4.3),NPCS.mica.position],
  ['orchard',local(NPCS.sol.position,-3.5,-.6),NPCS.sol.position],
  ['harbour',local(HUB_DOCK,4.8,-.2),HUB_DOCK],
  ['workshop',local(HUB_DOCK,-2,11),local(HUB_DOCK,0,5.5)],
  ['market',local(HUB_DOCK,2,5.5),local(HUB_DOCK,0,5.5)],
  ['walk',samplePoint(radius,-4.7,-16),samplePoint(radius,0,-16)],
 ];
 const objects:PlacedObject[]=sites.map(([id,position,toward],i)=>{
  const rotation=(facePoint(position,toward)+Math.PI*2)%(Math.PI*2);
  // The exterior stair's new foot step moves the blueprint pivot by .5m.
  // Compensate its anchor so that the authored street facade stays in place.
  const seated=id==='workshop'?localToDir({dir:position,yaw:rotation},radius,[0,0,-.5]):position;
  return {id:'sample-public-'+id,kind:'structure',position:seated,rotation,
   version:SAMPLE_PUBLIC_VERSION,blueprintHash:SAMPLE_PUBLIC_HASHES[i],...structureSize(SAMPLE_PUBLIC_BLUEPRINTS[i].parts)};
 });
 const blueprints=Object.fromEntries(SAMPLE_PUBLIC_BLUEPRINTS.map((b,i)=>[SAMPLE_PUBLIC_HASHES[i],b.parts]));
 const field=fieldOf(SAMPLE_PUBLIC_ENVIRONMENT,radius);
 const approach=local(HUB_DOCK,2.5,14),junction=local(HUB_DOCK,2.5,10),
  street=local(HUB_DOCK,-1.2,8.4),marketJunction=local(HUB_DOCK,-1.2,7.16),
  bend=local(HUB_DOCK,-1.2,3),gate=local(HUB_DOCK,0,1.8);
 const entrance=(index:number)=>{
  const object=objects[index],parts=SAMPLE_PUBLIC_BLUEPRINTS[index].parts;
  const entry=parts.find(part=>part.part==='step.entry'||part.part==='ramp.entry')!;
  const t=partTransform(entry,pivotOf(parts)),base=structureFit(parts,object.position,object.rotation,field).baseRadius;
  const at=(offset:number)=>localToDir({dir:object.position,yaw:object.rotation},base,
   [t.position[0]+Math.sin(t.yaw)*offset,0,t.position[2]+Math.cos(t.yaw)*offset]);
  const outer=Math.max(...PART_COLLIDERS[entry.part]().filter(box=>box.support).map(box=>
   box.center[2]+Math.abs(Math.cos(box.pitch??0))*box.half[2]+Math.abs(Math.sin(box.pitch??0))*box.half[1]));
  return {navigation:[at(entry.part==='ramp.entry'?1.9:.95),at(-.6)],paving:at(outer+.39)};
 };
 const workshop=entrance(3),market=entrance(4);
 const routes:HomeSurfaceRoute[]=[
  {id:'public-post',width:1.25,points:[SPAWN,approach,junction,NPCS.mica.position]},
  {id:'public-orchard',width:1.15,points:[SPAWN,approach,junction,street,marketJunction,bend,gate,HUB_DOCK,NPCS.sol.position]},
  {id:'public-harbour',width:1.4,points:[SPAWN,approach,junction,street,marketJunction,bend,gate,HUB_DOCK]},
  {id:'public-workshop',width:1.1,points:[SPAWN,approach,junction,street,...workshop.navigation]},
  {id:'public-market',width:1.1,points:[SPAWN,approach,junction,street,marketJunction,...market.navigation]},
 ];
 // Stone paving ends on supported terrain beside the first real step/ramp;
 // the navigation route continues on that existing building support.
 const pavingRoutes=routes.map(route=>route.id==='public-workshop'||route.id==='public-market'
  ?{...route,points:[...route.points.slice(0,-2),route.id==='public-workshop'?workshop.paving:market.paving]}:route);
 const samples=routes.flatMap(route=>route.points.slice(1).flatMap((end,j)=>{
  const a=new Vector3(...route.points[j]),b=new Vector3(...end),steps=Math.ceil(a.angleTo(b)*radius/.3);
  return Array.from({length:steps+1},(_,i)=>({dir:a.clone().lerp(b,i/Math.max(1,steps)).normalize().toArray() as Vec3,radius:route.width/2}));
 }));
 const add=(kind:BuildKind,position:Vec3,rotation=0)=>{
  const o:PlacedObject={id:`sample-public-${kind}-${objects.length}`,kind,assetVersion:2,position,rotation,version:1};
  if(placementProblem(kind,position,objects,undefined,undefined,radius)||distance(position,HUB_SHIP,radius)<3.4)return;
  if(samples.some(p=>distance(position,p.dir,radius)<p.radius+objectRadius(o)+.3))return;
  if(objectSeat(field,o,blueprints).problem)return;
  objects.push(o);
 };
 // Small tree groups frame destinations without hiding the route ahead.
 for(const [x,z]of [[-5,-5],[5,-5],[-12,-13]])add('tree',local(SPAWN,x,z));
 // Flowers and seats belong to the six authored courts and shop fronts;
 // avoid spending the shared object budget on isolated props in the lane.
 for(const x of [-1.4,1.4])add('lamp',local(HUB_DOCK,x,1.3));
 // Ordinary quick-build tiles retain their real dimensions, seating, clearings
 // and object cost. Preserve the existing courts/props before allocating roads.
 objects.push(...planRoutePaths({routes,pavingRoutes,radius,environment:SAMPLE_PUBLIC_ENVIRONMENT,objects,blueprints,spacing:.77,idPrefix:'sample-public-path'}).objects);
 const village:SamplePublicVillage={version:SAMPLE_PUBLIC_VERSION,radius,environment:SAMPLE_PUBLIC_ENVIRONMENT,objects,blueprints,routes,pavingRoutes,
  destinations:sites.slice(0,3).map(([id,,position],i)=>({id,position,buildingId:objects[i].id}))};
 cache.set(radius,village);return village;
}
