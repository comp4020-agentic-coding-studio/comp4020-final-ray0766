import { Box3, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import { OBB } from 'three/addons/math/OBB.js';
import { anchorQuaternion } from '../assets/claude-geometry/core/anchor.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { MAX_FOUNDATION_DEPTH } from '../assets/claude-geometry/core/ground.ts';
import { groundCells, partTransform, pivotOf } from '../assets/claude-geometry/blueprint/model.ts';
import type { PartPlacement } from '../assets/claude-geometry/blueprint/model.ts';
import { VILLAGE_PART_BOUNDS } from './physics/village-bounds.ts';
import { structureFit } from './blueprints.ts';
import type { BlueprintContents } from './blueprints.ts';
import { HOME_DOOR_BODY, homeDoorSweepBoxes } from './home-door.ts';
import { PART_COLLIDERS } from './physics/parts.ts';
import type { PartBox } from './physics/parts.ts';
import { BODY_RADIUS, STEP_HEIGHT, GROUND_SUBSTEP } from './physics/body.ts';
import type { PlacedObject } from './planets.ts';
import type { Vec3 } from './world.ts';

/** Keep the old 6 cm separation, applied to real surfaces rather than circles. */
export const STRUCTURE_CLEARANCE = .06;
/** A body can stand at either side of the doorway without touching a neighbour. */
export const STRUCTURE_DOOR_APPROACH = { width:.8, depth:.65, height:HOME_DOOR_BODY.height } as const;
const UP=new Vector3(0,1,0), RIGHT=new Vector3(1,0,0);
const vec=(p:Vec3)=>new Vector3(...p);
interface Shape { box:OBB; bounds:Box3 }
interface PreparedStructure { field:HeightField; signature:string; solids:Shape[]; sweeps:Shape[]; approaches:Shape[]; roadDecks:Shape[]; problem:string|null }
const envelope=(tag:string,min:Vec3,max:Vec3):PartBox=>({tag,center:min.map((n,i)=>(n+max[i])/2) as Vec3,half:min.map((n,i)=>(max[i]-n)/2) as Vec3});
/** Placement includes the actual visible envelope, while movement uses the
 * separately authored part proxies. Detail can never license two roofs to cut
 * through each other, and no obsolete open-door handle reserves empty air. */
function partSolids(part:PartPlacement['part']):PartBox[] {
  const bounds=VILLAGE_PART_BOUNDS[part];
  return [...PART_COLLIDERS[part](),envelope('appearance envelope',bounds.min,bounds.max)];
}
const doorSweeps=homeDoorSweepBoxes();
const doorApproach:PartBox={tag:'door approach',center:[0,.025+STRUCTURE_DOOR_APPROACH.height/2,.16+STRUCTURE_DOOR_APPROACH.depth/2],half:[STRUCTURE_DOOR_APPROACH.width/2,STRUCTURE_DOOR_APPROACH.height/2,STRUCTURE_DOOR_APPROACH.depth/2]};
const isDoor=(part:PartPlacement['part'])=>part==='wall.door.open'||part==='wall.door';
const reachCache=new WeakMap<readonly PartPlacement[],{signature:string;radius:number}>();
/** Query bound only: saved radii and movement collisions remain untouched.
 * Include adornments, full door motion/approach, and the largest permitted
 * footing depth so a below-surface corner cannot escape the circular filter. */
export function structurePlacementRadius(object:PlacedObject,parts:readonly PartPlacement[]|undefined):number {
  if(!parts?.length)return object.radius??0;
  const signature=JSON.stringify(parts),prior=reachCache.get(parts);
  if(prior?.signature===signature)return Math.max(object.radius??0,prior.radius);
  const pivot=pivotOf(parts);let radius=0;
  for(const part of parts){
    const t=partTransform(part,pivot),turn=new Quaternion().setFromAxisAngle(UP,t.yaw);
    for(const box of [...partSolids(part.part),...(isDoor(part.part)?[...doorSweeps,doorApproach]:[])]){
      const q=new Quaternion().setFromAxisAngle(UP,box.yaw??0).multiply(new Quaternion().setFromAxisAngle(RIGHT,box.pitch??0));
      for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
        const corner=new Vector3(x*box.half[0],y*box.half[1],z*box.half[2]).applyQuaternion(q).add(vec(box.center)).applyQuaternion(turn).add(vec(t.position));
        radius=Math.max(radius,Math.hypot(corner.x,corner.z));
      }
    }
  }
  radius+=MAX_FOUNDATION_DEPTH+.46;
  reachCache.set(parts,{signature,radius});
  return Math.max(object.radius??0,radius);
}
function oriented(center:Vector3,half:Vector3,q:Quaternion):Shape {
  const rotation=new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(q)),e=rotation.elements;
  const extent=new Vector3(Math.abs(e[0])*half.x+Math.abs(e[3])*half.y+Math.abs(e[6])*half.z,
    Math.abs(e[1])*half.x+Math.abs(e[4])*half.y+Math.abs(e[7])*half.z,
    Math.abs(e[2])*half.x+Math.abs(e[5])*half.y+Math.abs(e[8])*half.z);
  return {box:new OBB(center,half,rotation),bounds:new Box3(center.clone().sub(extent),center.clone().add(extent))};
}
const intersects=(a:readonly Shape[],b:readonly Shape[])=>a.some(first=>b.some(second=>first.bounds.intersectsBox(second.bounds)&&first.box.intersectsOBB(second.box,1e-10)));

/** Explicit preview-local cache. Position, yaw, content and field changes invalidate it. */
export class StructurePlacementCache {
  private objects=new WeakMap<PlacedObject,PreparedStructure>();
  prepare(field:HeightField,object:PlacedObject,parts:readonly PartPlacement[]):PreparedStructure {
    const signature=JSON.stringify([object.position,object.rotation,object.blueprintHash,parts]);
    const prior=this.objects.get(object);
    if(prior?.field===field&&prior.signature===signature)return prior;
    const fit=structureFit(parts,object.position,object.rotation,field);
    const result:PreparedStructure={field,signature,solids:[],sweeps:[],approaches:[],roadDecks:[],problem:fit.problem?'This ground cannot support the neighbouring buildings.':null};
    this.objects.set(object,result);
    if(result.problem)return result;
    const anchor=new Quaternion().fromArray(anchorQuaternion({dir:object.position,yaw:object.rotation}));
    const origin=vec(object.position).multiplyScalar(fit.baseRadius),pivot=pivotOf(parts);
    const shape=(box:PartBox,position:Vec3=[0,0,0],yaw=0,padding=STRUCTURE_CLEARANCE/2)=>{
      const turn=new Quaternion().setFromAxisAngle(UP,yaw);
      const center=vec(box.center).applyQuaternion(turn).add(vec(position)).applyQuaternion(anchor).add(origin);
      const q=anchor.clone().multiply(new Quaternion().setFromAxisAngle(UP,yaw+(box.yaw??0)))
        .multiply(new Quaternion().setFromAxisAngle(RIGHT,box.pitch??0));
      return oriented(center,vec(box.half).addScalar(padding),q);
    };
    for(const part of parts){
      const t=partTransform(part,pivot);
      for(const box of partSolids(part.part))result.solids.push(shape(box,t.position,t.yaw));
      if(isRoadSurface(parts))for(const box of PART_COLLIDERS[part.part]().filter(box=>box.support))result.roadDecks.push(shape(box,t.position,t.yaw,0));
      // R8 publishes village appearance envelopes separately from colliders.
      // Include those envelopes; invisible air below an eave must not license
      // a neighbouring roof/beam to cut through the visible tile or verge.
      if(isDoor(part.part)){
        for(const box of doorSweeps)result.sweeps.push(shape(box,t.position,t.yaw));
        result.approaches.push(shape(doorApproach,t.position,t.yaw));
      }
    }
    // Identical to GroundWorld's foundation proxy and deep enough to contain
    // the rendered 0.16 m slab plus foundationDepth + 0.30 m embedded plinth.
    const depth=fit.foundationDepth+.46;
    for(const [x,z] of groundCells(parts))result.solids.push(shape({tag:'foundation',center:[x+.5-pivot.x,-depth/2,z+.5-pivot.z],half:[.5,depth/2,.5]}));
    return result;
  }
}

/** Ground-only street blueprints are ordinary owner-editable structures.
 * Their foundations may meet, but the actual deck planes must form a walkable
 * join. A wall, stair, furnishing or upper deck never receives this exception. */
const ROAD_PARTS=new Set(['street.paving','street.road','street.road.plain','street.road.corner','pad.quarter']);
export const isRoadSurface=(parts:readonly PartPlacement[])=>parts.length>0&&parts.every(p=>p.level===0&&ROAD_PARTS.has(p.part));
export const ROAD_JOIN_MAX_STEP=STEP_HEIGHT;
type Point2=[number,number];
function clipPolygon(input:Point2[],axis:0|1,edge:number,sign:number):Point2[]{
 const out:Point2[]=[];
 for(let i=0;i<input.length;i++){
  const a=input[i],b=input[(i+1)%input.length],da=sign*(a[axis]-edge),db=sign*(b[axis]-edge);
  if(da<=1e-9)out.push(a);
  if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
 }
 return out;
}
function roadJoinProblem(one:PreparedStructure,two:PreparedStructure):string|null {
 for(const a of one.roadDecks)for(const b of two.roadDecks){
  // Work in A's deck frame; intersect B's projected top rectangle with A.
  // Plane-height difference is affine, so checking every clipped vertex
  // bounds the entire overlap, including bends and square/plaza junctions.
  const inverse=a.box.rotation.clone().transpose();
  // Support begins as the bottom capsule reaches an edge, before its centre
  // reaches the visible overlap. Check that same reach on both deck planes.
  // A bare 25 cm plane join can otherwise demand a >26 cm capsule step.
  const reach=BODY_RADIUS+GROUND_SUBSTEP;
  const corners:Point2[]=[],top=b.box.halfSize.y;
  for(const [x,z] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
   const p=new Vector3(x*(b.box.halfSize.x+reach),top,z*(b.box.halfSize.z+reach)).applyMatrix3(b.box.rotation).add(b.box.center).sub(a.box.center).applyMatrix3(inverse);
   corners.push([p.x,p.z]);
  }
  let overlap=corners;
  for(const axis of [0,1] as const){const h=(axis===0?a.box.halfSize.x:a.box.halfSize.z)+reach;overlap=clipPolygon(clipPolygon(overlap,axis,h,1),axis,-h,-1);}
  if(!overlap.length)continue;
  const normal=new Vector3(0,1,0).applyMatrix3(b.box.rotation).applyMatrix3(inverse);
  if(normal.y<Math.cos(Math.PI/6))return 'Road decks need a shallower join.';
  const origin=new Vector3(0,top,0).applyMatrix3(b.box.rotation).add(b.box.center).sub(a.box.center).applyMatrix3(inverse);
  for(const [x,z] of overlap){const y=origin.y-(normal.x*(x-origin.x)+normal.z*(z-origin.z))/normal.y;
   if(Math.abs(y-a.box.halfSize.y)>ROAD_JOIN_MAX_STEP+1e-6)return 'Keep joined road surfaces within a 26 cm step, including the walking capsule at their edges.';
  }
 }
 return null;
}

/** Narrow phase after conservative circle overlap. Both surface frames and
 * seats come from the actual sphere/height field; no tangent-plane flattening.
 * Missing content never proves that two structures can fit beside each other. */
export function structurePlacementProblem(first:PlacedObject,second:PlacedObject,context:{field:HeightField;blueprints:BlueprintContents;cache?:StructurePlacementCache}):string|null {
  const a=context.blueprints[first.blueprintHash??''],b=context.blueprints[second.blueprintHash??''];
  if(!a?.length||!b?.length)return 'A little too close. Resolve both building blueprints before placing them nearby.';
  const cache=context.cache??new StructurePlacementCache(),one=cache.prepare(context.field,first,a),two=cache.prepare(context.field,second,b);
  if(one.problem||two.problem)return one.problem??two.problem;
  if(isRoadSurface(a)&&isRoadSurface(b))return roadJoinProblem(one,two);
  if(intersects(one.solids,two.solids))return 'A little too close. Leave space between the buildings’ walls, roofs and foundations.';
  if(intersects(one.sweeps,two.solids)||intersects(two.sweeps,one.solids)||intersects(one.sweeps,two.sweeps))return 'A little too close. Keep the full door opening space clear.';
  if(intersects(one.approaches,two.solids)||intersects(two.approaches,one.solids)||intersects(one.approaches,two.sweeps)||intersects(two.approaches,one.sweeps))return 'A little too close. Leave standing room in front of each doorway.';
  return null;
}
