import { isDoorPartId } from './blueprint-parts.ts';
import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import { OBB } from 'three/addons/math/OBB.js';
import { anchorQuaternion } from '../assets/claude-geometry/core/anchor.ts';
import { groundRadius } from '../assets/claude-geometry/core/ground.ts';
import type { fitGround } from '../assets/claude-geometry/core/ground.ts';
import { seatedFit } from './ground-fit-cache.ts';
import { chord2 } from '../assets/claude-geometry/terrain/styles/program.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { groundCells, partTransform, pivotOf } from './blueprint-model.ts';
import type { PartPlacement } from './blueprint-model.ts';
import type { BlueprintContents } from './blueprints.ts';
import { surfaceFooting, gradeFoundations } from './terrain-grading.ts';
import { PART_COLLIDERS } from './physics/parts.ts';
import type { PartBox } from './physics/parts.ts';
import { homeDoorSweepBoxes } from './home-door.ts';
import type { PlacedObject } from './planets.ts';
import type { Vec3 } from './world.ts';

// Bounds of the existing four ordinary Path stones (legacy-build-art.ts).
// They remain on their original terrain seat; this rule adds no floor/support.
const STONES = [[-.22,-.20,.34,.29],[.20,-.18,.33,.33],[-.16,.18,.43,.31],[.26,.22,.25,.27]] as const;
export const PATH_STRUCTURE_REACH = .53;
const GAP = .012;
const UP = new Vector3(0,1,0),RIGHT = new Vector3(1,0,0);
const vec = (point:Vec3) => new Vector3(...point);
function oriented(center:Vector3,half:Vector3,rotation:Quaternion){
  return new OBB(center,half,new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(rotation)));
}

interface PreparedObject {
  field:HeightField;parts:readonly PartPlacement[]|undefined;signature:string;
  fit:ReturnType<typeof fitGround>;foundation:Parameters<typeof gradeFoundations>[1][number];solids?:OBB[];sweeps?:OBB[];
}
/** Only reuse within one placement/route preview, never across saved revisions. */
export class PathPlacementCache {
  private objects=new WeakMap<PlacedObject,PreparedObject>();
  prepare(field:HeightField,object:PlacedObject,parts:readonly PartPlacement[]|undefined,radius:number){
    const signature=[...object.position,object.rotation,radius,object.blueprintHash].join(':');
    const old=this.objects.get(object);
    if(old&&old.field===field&&old.parts===parts&&old.signature===signature)return old;
    const footing=surfaceFooting(parts,radius),anchor={dir:object.position,yaw:object.rotation};
    // The shared exact-key fit cache: the same anchor and footprint on the same immutable field
    // give the same fit, so placing one more object no longer refits every neighbour.
    const fit=seatedFit(field,anchor,footing.footprint);
    const result:PreparedObject={field,parts,signature,fit,foundation:{anchor,baseRadius:fit.baseRadius,radius:footing.footprint.radius,covers:footing.covers}};
    this.objects.set(object,result);return result;
  }
}

/** Narrow Path/structure rule only. The candidate scene supplies the exact
 * graded ground, including paths and props; no saved seat or collider changes. */
export function pathPlacementCheck(field:HeightField,objects:readonly PlacedObject[],blueprints:BlueprintContents,radiusOf:(object:PlacedObject)=>number,terrainSeating=true,cache=new PathPlacementCache()){
  // Unknown geometry cannot prove support. The caller retains conservative
  // circle spacing rather than guessing at the missing foundation.
  if(objects.some(o=>o.kind==='structure'&&!blueprints[o.blueprintHash??'']))return null;
  const prepare=(o:PlacedObject)=>cache.prepare(field,o,o.kind==='structure'?blueprints[o.blueprintHash??'']:undefined,radiusOf(o));
  const grounds=new WeakMap<PlacedObject,HeightField>();
  return (path:PlacedObject,structure:PlacedObject,parts:readonly PartPlacement[]):string|null=>{
  if(!parts.length)return 'The structure geometry is unavailable.';
  const prepared=prepare(structure),fit=prepared.fit,pathFit=prepare(path).fit;
  if(fit.problem||pathFit.problem)return 'This ground cannot support a path beside the structure.';
  const pathBase=terrainSeating?pathFit.baseRadius:groundRadius(field,path.position);
  let ground=grounds.get(path);
  if(!ground){
    // Use the grading algorithm's own angular broad phase, expanded by the
    // full stone footprint. Distant foundations provably cannot lower these
    // samples, so previewing one tile need not refit every distant building.
    const reach=Math.atan(PATH_STRUCTURE_REACH/Math.max(1,pathBase-.1));
    const nearby=objects.filter(o=>vec(path.position).angleTo(vec(o.position))<=reach+Math.acos(Math.max(-1,1-chord2(radiusOf(o)+.05)/2)));
    ground=terrainSeating?gradeFoundations(field,nearby.map(o=>prepare(o).foundation)):field;
    grounds.set(path,ground);
  }
  const pathTurn=new Quaternion().fromArray(anchorQuaternion({dir:path.position,yaw:path.rotation}));
  const pathOrigin=vec(path.position).multiplyScalar(pathBase);
  // Stone corners and midpoints expose unsupported edges beyond the old .42m
  // catalogue circle. The 12cm limit includes the existing 4.25cm visual lift.
  for(const [x,z,w,d] of STONES)for(const dx of [-.5,0,.5])for(const dz of [-.5,0,.5]){
    const point=new Vector3(x+dx*w,.0425,z+dz*d).applyQuaternion(pathTurn).add(pathOrigin);
    const gap=point.length()-groundRadius(ground,point.clone().normalize().toArray() as Vec3);
    if(gap<-.015||gap>.12)return 'Keep path stones on supported ground beside the building.';
  }
  // Full stone footprint plus standing clearance stops paths beneath furniture
  // and through walls, even where the thin paving itself would fit underneath.
  const clearances=STONES.map(([x,z,w,d])=>oriented(new Vector3(x,.8,z).applyQuaternion(pathTurn).add(pathOrigin),new Vector3(w/2+GAP,.8+GAP,d/2+GAP),pathTurn));
  const anchor=new Quaternion().fromArray(anchorQuaternion({dir:structure.position,yaw:structure.rotation}));
  const origin=vec(structure.position).multiplyScalar(fit.baseRadius),pivot=pivotOf(parts);
  const shapeBox=(shape:PartBox,position:Vec3=[0,0,0],yaw=0)=>{
    const turn=new Quaternion().setFromAxisAngle(UP,yaw);
    const center=vec(shape.center).applyQuaternion(turn).add(vec(position)).applyQuaternion(anchor).add(origin);
    const q=anchor.clone().multiply(new Quaternion().setFromAxisAngle(UP,yaw+(shape.yaw??0))).multiply(new Quaternion().setFromAxisAngle(RIGHT,shape.pitch??0));
    return oriented(center,vec(shape.half),q);
  };
  if(!prepared.solids){
  prepared.solids=[];prepared.sweeps=[];
  for(const part of parts){
    const transform=partTransform(part,pivot);
    for(const shape of PART_COLLIDERS[part.part]())prepared.solids.push(shapeBox(shape,transform.position,transform.yaw));
    if(isDoorPartId(part.part)){
      for(const shape of homeDoorSweepBoxes(part.part))prepared.sweeps.push(shapeBox(shape,transform.position,transform.yaw));
    }
  }
  const depth=fit.foundationDepth+.46;
  for(const [x,z] of groundCells(parts))prepared.solids.push(shapeBox({tag:'foundation',center:[x+.5-pivot.x,-depth/2,z+.5-pivot.z],half:[.5,depth/2,.5]}));
  }
  const blocked=(solid:OBB)=>clearances.some(pathBox=>pathBox.intersectsOBB(solid,1e-10));
  if(prepared.solids.some(blocked))return 'Keep the path clear of the building’s walls, steps, furnishings and foundation.';
  if(prepared.sweeps!.some(blocked))return 'Leave the door’s opening space clear of path stones.';
  return null;
  };
}
