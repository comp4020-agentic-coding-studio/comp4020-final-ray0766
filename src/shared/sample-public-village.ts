import {Vector3} from 'three';
import {localToDir} from '../assets/claude-geometry/core/anchor.ts';
import type {Blueprint} from '../assets/claude-geometry/blueprint/model.ts';
import {HOME_ENVIRONMENT,HOME_INFRASTRUCTURE,starterHome} from './home-layout.ts';
import type {HomeSurfaceRoute} from './home-layout.ts';
import {HOME_SAMPLE_RADIUS} from './home.ts';
import {structureSize} from './blueprints.ts';
import type {BlueprintContents} from './blueprints.ts';
import {objectRadius,placementProblem} from './planets.ts';
import type {BuildKind,PlacedObject} from './planets.ts';
import {NPCS,SPAWN,distance} from './world.ts';
import type {Vec3} from './world.ts';
import {HUB_DOCK} from './ports.ts';
import {HUB_SHIP,facePoint} from './harbour-layout.ts';
import {fieldOf,objectSeat} from './terrain.ts';
import {planRoutePaths} from './path-layout.ts';

/** Sample-only public composition. Metre-sized kit parts, never scaled meshes. */
export const SAMPLE_PUBLIC_VERSION=2;
export const SAMPLE_PUBLIC_ENVIRONMENT=HOME_ENVIRONMENT;
export const SAMPLE_PUBLIC_BLUEPRINTS:Blueprint[]=[
 {...starterHome(),id:'3dbf341d-a2e9-41c8-bf64-39ea9eb1c001',name:'Village · post cottage'},
 {...HOME_INFRASTRUCTURE[1],id:'3dbf341d-a2e9-41c8-bf64-39ea9eb1c002',name:'Village · orchard court'},
 {...HOME_INFRASTRUCTURE[0],id:'3dbf341d-a2e9-41c8-bf64-39ea9eb1c003',name:'Village · harbour shelter'},
] as Blueprint[];
// Canonical blueprint content hashes, verified independently with the codec.
export const SAMPLE_PUBLIC_HASHES=['25b9a2104eb63989982871a9401081dcbf6b3bcf5b7af2f2f7bf7ccc6e52d4d6','7886320a5f35299b1e0da36f8be6c8fdd5c2311eb5bfbed8c876c93bf289bfe8','acbe5d36207566bb42e99dc0850bfce807fffabcb44b0e20d2739aa36dc0e456'];
export interface SamplePublicVillage {
 version:number;radius:number;environment:string;objects:PlacedObject[];blueprints:BlueprintContents;
 routes:HomeSurfaceRoute[];destinations:{id:string;position:Vec3;buildingId:string}[];
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
 ];
 const objects:PlacedObject[]=sites.map(([id,position,toward],i)=>({
  id:'sample-public-'+id,kind:'structure',position,rotation:(facePoint(position,toward)+Math.PI*2)%(Math.PI*2),
  version:SAMPLE_PUBLIC_VERSION,blueprintHash:SAMPLE_PUBLIC_HASHES[i],...structureSize(SAMPLE_PUBLIC_BLUEPRINTS[i].parts),
 }));
 const blueprints=Object.fromEntries(SAMPLE_PUBLIC_BLUEPRINTS.map((b,i)=>[SAMPLE_PUBLIC_HASHES[i],b.parts]));
 const lane=local(SPAWN,0,-6.3);
 const routes:HomeSurfaceRoute[]=[
  {id:'public-post',width:1.25,points:[SPAWN,lane,NPCS.mica.position]},
  {id:'public-orchard',width:1.15,points:[SPAWN,lane,local(NPCS.sol.position,3,1.6),NPCS.sol.position]},
  {id:'public-harbour',width:1.4,points:[SPAWN,lane,HUB_DOCK]},
 ];
 const samples=routes.flatMap(route=>route.points.slice(1).flatMap((end,j)=>{
  const a=new Vector3(...route.points[j]),b=new Vector3(...end),steps=Math.ceil(a.angleTo(b)*radius/.3);
  return Array.from({length:steps+1},(_,i)=>({dir:a.clone().lerp(b,i/Math.max(1,steps)).normalize().toArray() as Vec3,radius:route.width/2}));
 }));
 const field=fieldOf(SAMPLE_PUBLIC_ENVIRONMENT,radius);
 const add=(kind:BuildKind,position:Vec3,rotation=0)=>{
  const o:PlacedObject={id:`sample-public-${kind}-${objects.length}`,kind,assetVersion:2,position,rotation,version:1};
  if(placementProblem(kind,position,objects,undefined,undefined,radius)||distance(position,HUB_SHIP,radius)<3.4)return;
  if(samples.some(p=>distance(position,p.dir,radius)<p.radius+objectRadius(o)+.3))return;
  if(objectSeat(field,o,blueprints).problem)return;
  objects.push(o);
 };
 // Small tree groups frame destinations without hiding the route ahead.
 for(const [x,z]of [[-4,0],[4,0],[-5,-5],[5,-5],[-10,-8],[12,-5],[-12,-13],[12,-14],[-5,-19],[5,-19],[-15,-4],[15,1]])add('tree',local(SPAWN,x,z));
 for(const [x,z]of [[-2.5,-2],[2.5,-2],[-3.5,-8],[3.5,-8],[-8,-14],[8,-15]])add('flowers',local(SPAWN,x,z));
 for(const [x,z]of [[-2.1,-4],[2.1,-4]])add('bench',local(SPAWN,x,z),Math.PI);
 for(const x of [-1.4,1.4])add('lamp',local(HUB_DOCK,x,1.3));
 // Ordinary quick-build tiles retain their real dimensions, seating, clearings
 // and object cost. Preserve the existing courts/props before allocating roads.
 objects.push(...planRoutePaths({routes,radius,environment:SAMPLE_PUBLIC_ENVIRONMENT,objects,blueprints,spacing:.95,idPrefix:'sample-public-path'}).objects);
 const village:SamplePublicVillage={version:SAMPLE_PUBLIC_VERSION,radius,environment:SAMPLE_PUBLIC_ENVIRONMENT,objects,blueprints,routes,
  destinations:sites.map(([id,,position],i)=>({id,position,buildingId:objects[i].id}))};
 cache.set(radius,village);return village;
}
