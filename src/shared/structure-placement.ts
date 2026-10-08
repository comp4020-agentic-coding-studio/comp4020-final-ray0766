import { Box3, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import { OBB } from 'three/addons/math/OBB.js';
import { anchorQuaternion } from '../assets/claude-geometry/core/anchor.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { MAX_FOUNDATION_DEPTH } from '../assets/claude-geometry/core/ground.ts';
import { groundCells, partTransform, pivotOf } from '../assets/claude-geometry/blueprint/model.ts';
import type { PartPlacement } from '../assets/claude-geometry/blueprint/model.ts';
import { PART_INFO } from '../assets/claude-geometry/blueprint/parts/info.ts';
import { structureFit } from './blueprints.ts';
import type { BlueprintContents } from './blueprints.ts';
import { HOME_DOOR_BODY, HOME_DOOR_LEAF } from './home-door.ts';
import { PART_COLLIDERS, SLOPE_BOUNDS } from './physics/parts.ts';
import type { PartBox } from './physics/parts.ts';
import type { PlacedObject } from './planets.ts';
import type { Vec3 } from './world.ts';

/** Keep the old 6 cm separation, applied to real surfaces rather than circles. */
export const STRUCTURE_CLEARANCE = .06;
/** A body can stand at either side of the doorway without touching a neighbour. */
export const STRUCTURE_DOOR_APPROACH = { width:.8, depth:.65, height:HOME_DOOR_BODY.height } as const;
const UP=new Vector3(0,1,0), RIGHT=new Vector3(1,0,0);
const vec=(p:Vec3)=>new Vector3(...p);
interface Shape { box:OBB; bounds:Box3 }
interface PreparedStructure { field:HeightField; signature:string; solids:Shape[]; sweeps:Shape[]; approaches:Shape[]; problem:string|null }
const envelope=(tag:string,min:Vec3,max:Vec3):PartBox=>({tag,center:min.map((n,i)=>(n+max[i])/2) as Vec3,half:min.map((n,i)=>(max[i]-n)/2) as Vec3});
/** First-generation village details have no PART_INFO envelope. These small
 * appearance-only boxes follow their authored geometry, not walking support. */
function appearanceDetails(part:PartPlacement['part']):PartBox[] {
  switch(part){
    case 'wall.window':return [envelope('window planter',[-.33,.58,.09],[.33,.94,.25])];
    case 'wall.louvre':return [envelope('window canopy',[-.324,1.51,.09],[.324,1.737,.24])];
    case 'wall.door':case 'wall.door.open':return [envelope('door lantern',[-.043,1.92,.105],[.043,2.036,.152]),
      ...(part==='wall.door.open'?[envelope('open door handle',[-.46,1,-.792],[-.33,1.05,-.748])]:[])];
    case 'roof.deck':return [envelope('ceiling lamp',[-.09,-.275,-.14],[.09,-.16,.04]),...[-.3,.3].map(z=>({tag:'ceiling beam',center:[0,-.19,z] as Vec3,half:[.5,.03,.04] as Vec3}))];
    case 'street.kerb':return [envelope('drain cover',[.05,-.008,.09],[.31,.004,.23]),envelope('kerb underside',[-.5,-.05,-.075],[.5,0,.075])];
    case 'service.light':return [envelope('hanging basket',[-.415,2.233,-.265],[-.185,2.435,-.035]),envelope('lamp sign',[-.315,2.67,-.23],[-.285,2.83,.15]),envelope('lamp brace',[-.313,3.118,-.281],[-.287,3.382,.001])];
    case 'stair.straight':return [-1,1].flatMap(side=>[
      {tag:'sloping handrail',center:[side*.3175,2.0020879121,-.48] as Vec3,half:[.025,.0225,1.3334915803] as Vec3,pitch:.8796454792},
      {tag:'stair foot post',center:[side*.3175,.5615,.405] as Vec3,half:[.038,.5615,.038] as Vec3},
      {tag:'stair foot stringer',center:[side*.3175,.112,.397] as Vec3,half:[.0175,.112,.093] as Vec3},
      {tag:'stair top stringer',center:[side*.3175,2.1,-1.355] as Vec3,half:[.0175,.1,.025] as Vec3},
    ]);
    default:return [];
  }
}
function partSolids(part:PartPlacement['part']):PartBox[] {
  const result=[...PART_COLLIDERS[part](),...appearanceDetails(part)];
  const bounds=part==='roof.slope'?{min:[-SLOPE_BOUNDS.halfWidth,SLOPE_BOUNDS.bottom,SLOPE_BOUNDS.back] as Vec3,max:[SLOPE_BOUNDS.halfWidth,SLOPE_BOUNDS.top,SLOPE_BOUNDS.front] as Vec3}:PART_INFO[part].envelope?.village;
  if(bounds)result.push(envelope('appearance envelope',bounds.min,bounds.max));
  return result;
}
const doorSweeps:PartBox[]=Array.from({length:19},(_,step)=>{
  const leaf=HOME_DOOR_LEAF,[x,y,z]=leaf.hinge,angle=leaf.openAngle*step/18;
  // Nearest sample is at most 2.5 degrees away. Pad by maximum corner travel
  // to cover every angle continuously, including between the sampled poses.
  const pad=2*Math.hypot(leaf.width,leaf.thickness/2)*Math.sin(Math.PI/144);
  return {tag:'door sweep',center:[x+Math.cos(angle)*leaf.width/2,y+leaf.height/2,z-Math.sin(angle)*leaf.width/2],half:[leaf.width/2+pad,leaf.height/2,leaf.thickness/2+pad],yaw:angle};
});
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
    const result:PreparedStructure={field,signature,solids:[],sweeps:[],approaches:[],problem:fit.problem?'This ground cannot support the neighbouring buildings.':null};
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

/** Narrow phase after conservative circle overlap. Both surface frames and
 * seats come from the actual sphere/height field; no tangent-plane flattening.
 * Missing content never proves that two structures can fit beside each other. */
export function structurePlacementProblem(first:PlacedObject,second:PlacedObject,context:{field:HeightField;blueprints:BlueprintContents;cache?:StructurePlacementCache}):string|null {
  const a=context.blueprints[first.blueprintHash??''],b=context.blueprints[second.blueprintHash??''];
  if(!a?.length||!b?.length)return 'A little too close. Resolve both building blueprints before placing them nearby.';
  const cache=context.cache??new StructurePlacementCache(),one=cache.prepare(context.field,first,a),two=cache.prepare(context.field,second,b);
  if(one.problem||two.problem)return one.problem??two.problem;
  if(intersects(one.solids,two.solids))return 'A little too close. Leave space between the buildings’ walls, roofs and foundations.';
  if(intersects(one.sweeps,two.solids)||intersects(two.sweeps,one.solids)||intersects(one.sweeps,two.sweeps))return 'A little too close. Keep the full door opening space clear.';
  if(intersects(one.approaches,two.solids)||intersects(two.approaches,one.solids)||intersects(one.approaches,two.sweeps)||intersects(two.approaches,one.sweeps))return 'A little too close. Leave standing room in front of each doorway.';
  return null;
}
