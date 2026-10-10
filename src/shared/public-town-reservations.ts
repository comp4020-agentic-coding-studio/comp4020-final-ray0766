import {Matrix3,Matrix4,Quaternion,Vector3} from 'three';
import {OBB} from 'three/addons/math/OBB.js';
import {anchorQuaternion,localToDir} from '../assets/claude-geometry/core/anchor.ts';
import {MAX_FOUNDATION_DEPTH,groundRadius} from '../assets/claude-geometry/core/ground.ts';
import type {HeightField} from '../assets/claude-geometry/core/ground.ts';
import {layoutErrors} from './blueprint-model.ts';
import {structureSize} from './blueprints.ts';
import type {BlueprintContents} from './blueprints.ts';
import {objectRadius,placementGeometryProblem,placementProblem} from './planets.ts';
import type {PlacedObject} from './planets.ts';
import {objectSeat} from './terrain.ts';
import {isRoadSurface,StructurePlacementCache} from './structure-placement.ts';
import {BODY_RADIUS,GROUND_SKIN,GROUND_SUBSTEP,STEP_HEIGHT} from './physics/body.ts';
import {HUB_SHIP} from './harbour-layout.ts';
import {HUB_DOCK} from './ports.ts';
import {distance,NPCS,SPAWN,validPosition} from './world.ts';
import type {Vec3} from './world.ts';

/** Fixed public operation areas. These are occupied-space radii, not the
 * interaction distance (1.65 m), and are never supplied by an author/caller. */
export const PUBLIC_OPERATION_RADII=Object.freeze({spawn:1,mica:.6,sol:.6,dock:.6});
const STANDING_HEIGHT=1.9;
interface Reservation {id:keyof typeof PUBLIC_OPERATION_RADII;point:Vec3;metres:number;box:OBB;samples:Vec3[]}
const anchors=():{id:Reservation['id'];point:Vec3}[]=>[
 {id:'spawn',point:[...SPAWN]},{id:'mica',point:[...NPCS.mica.position]},
 {id:'sol',point:[...NPCS.sol.position]},{id:'dock',point:[...HUB_DOCK]},
];

function reservations(field:HeightField,radius:number):Reservation[]{
 return anchors().map(({id,point})=>{
  const metres=PUBLIC_OPERATION_RADII[id],samples:Vec3[]=[],count=Math.ceil(metres/.1);
  // The square contains the entire former disk. Sample its actual field,
  // reserve a full step above it and the maximum footing depth below it.
  // No candidate's floor/roof can move this operation volume to another level.
  for(let x=-count;x<=count;x++)for(let z=-count;z<=count;z++)samples.push(localToDir({dir:point,yaw:0},radius,[x*metres/count,0,z*metres/count]));
  const projected=samples.map(p=>groundRadius(field,p)*new Vector3(...p).dot(new Vector3(...point)));
  const bottom=Math.min(...projected)-MAX_FOUNDATION_DEPTH,top=Math.max(...projected)+STEP_HEIGHT+STANDING_HEIGHT;
  // Account for the diverging radial standing columns at head height; do
  // not merely put a .6 m horizontal square at the feet on a small sphere.
  const half=metres*Math.max(1,top/radius)+.01,q=new Quaternion().fromArray(anchorQuaternion({dir:point,yaw:0}));
  return{id,point,metres,samples,box:new OBB(new Vector3(...point).multiplyScalar((bottom+top)/2),new Vector3(half,(top-bottom)/2,half),new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(q)))};
 });
}

/** Only ordinary level-zero road slabs can be the task's standing surface.
 * A house floor, stair, roof or caller-provided ID never grants this exception.
 * This checks the real capsule support plane against the same 26 cm step;
 * final continuous movement still has to establish the joins and approach. */
function roadSupportProblem(prepared:ReturnType<StructurePlacementCache['prepare']>,area:Reservation,field:HeightField):boolean {
 const reach=BODY_RADIUS+GROUND_SUBSTEP;
 for(const deck of prepared.roadDecks){
  if(!deck.box.intersectsOBB(area.box,1e-10))continue;
  const inverse=deck.box.rotation.clone().transpose(),origin=deck.box.center.clone().applyMatrix3(inverse);
  for(const point of area.samples){
   const u=new Vector3(...point).applyMatrix3(inverse);
   if(u.y<.7)return true;
   const feet=(origin.y+deck.box.halfSize.y+BODY_RADIUS)/u.y-BODY_RADIUS;
   const x=u.x*(feet+BODY_RADIUS)-origin.x,z=u.z*(feet+BODY_RADIUS)-origin.z;
   if(Math.hypot(Math.max(0,Math.abs(x)-deck.box.halfSize.x),Math.max(0,Math.abs(z)-deck.box.halfSize.z))>reach)continue;
   if(feet>groundRadius(field,point)+STEP_HEIGHT+GROUND_SKIN)return true;
  }
 }
 return false;
}

/** Trusted public authoring only. Instantiate once for an immutable field and
 * one blueprint catalogue; validate every ledger object, including anchors and
 * supports, with the returned check. This is not a private placement option.
 * Full task support/LOS/continuous routes remain separate acceptance checks. */
export function createPublicTownPlacementCheck(field:HeightField,radius:number,blueprints:BlueprintContents,structureCache=new StructurePlacementCache()){
 if(!Number.isFinite(radius)||radius<=0)throw Error('Invalid public town radius.');
 const areas=reservations(field,radius);
 return (object:PlacedObject,objects:PlacedObject[]):string|null=>{
  if(!validPosition(object.position))return 'Choose a point on the planet.';
  if(Math.abs(Math.hypot(...object.position)-1)>1e-10)return 'Use a unit direction for public placement.';
  if(!Number.isFinite(object.rotation)||object.rotation<0||object.rotation>=Math.PI*2)return 'Choose a valid building orientation.';
  const size=objectRadius(object);
  if(!Number.isFinite(size)||size<=0)return 'Resolve the object footprint before public placement.';
  // Kept exactly: actual saved/custom craft may exceed the default renderer.
  if(distance(object.position,HUB_SHIP,radius)<size+2.5)return 'Preserve ship landing clearance.';
  const details={rotation:object.rotation,blueprintHash:object.blueprintHash,blueprints,field,structureCache};
  if(object.kind!=='structure'){
   // Ordinary Path has no standing obstacle; its existing seating and
   // path/structure checks remain authoritative. No path-planner change here.
   if(object.kind!=='path'&&areas.some(a=>a.id!=='spawn'&&distance(object.position,a.point,radius)<size+a.metres))return 'Preserve actual task standing space.';
   return objectSeat(field,object,blueprints).problem??placementProblem(object.kind,object.position,objects,object.id,object.radius,radius,object.assetVersion??1,details);
  }
  const parts=blueprints[object.blueprintHash??''];
  if(!parts?.length)return 'Resolve the building blueprint before public placement.';
  if(layoutErrors(parts).length)return 'Resolve the building layout before public placement.';
  if(size+1e-8<structureSize(parts).radius)return 'Resolve the complete building footprint before public placement.';
  const seat=objectSeat(field,object,blueprints);if(seat.problem)return seat.problem;
  const prepared=structureCache.prepare(field,object,parts);if(prepared.problem)return prepared.problem;
  for(const area of areas){
   const intersects=prepared.solids.some(shape=>shape.box.intersectsOBB(area.box,1e-10))||prepared.sweeps.some(shape=>shape.box.intersectsOBB(area.box,1e-10));
   if(!intersects)continue;
   if(isRoadSurface(parts)&&!roadSupportProblem(prepared,area,field))continue;
   return area.id==='spawn'?'Preserve the actual landing operation space.':`Preserve the actual ${area.id} standing space.`;
  }
  return placementGeometryProblem(object,objects,object.id,radius,details);
 };
}
