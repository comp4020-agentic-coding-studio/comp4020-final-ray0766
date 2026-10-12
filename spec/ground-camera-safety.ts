import {Vector3} from 'three';
import type {GroundWorld} from '../src/shared/physics/world.ts';

/** Independent point-sphere occupancy against the real terrain and OBBs.
 * A zero-length cameraDistance query cannot distinguish clear from blocked. */
export function cameraEyePenetration(world:GroundWorld,eye:Vector3,radius=.2){
  let depth=radius-(eye.length()-world.radius(eye.clone().normalize().toArray() as [number,number,number]));
  let objectId=depth>0?'terrain':'';
  const local=new Vector3();
  for(const body of world.bodies){
    if(body.cameraBounds&&body.cameraBounds.distanceToPoint(eye)>radius)continue;
    for(const box of body.colliders){
      local.copy(eye).sub(box.center).applyQuaternion(box.inverse);
      const dx=Math.max(0,Math.abs(local.x)-box.half.x),dy=Math.max(0,Math.abs(local.y)-box.half.y),dz=Math.max(0,Math.abs(local.z)-box.half.z);
      const overlap=radius-Math.hypot(dx,dy,dz);
      if(overlap>depth){depth=overlap;objectId=box.objectId;}
    }
  }
  return{depth:Math.max(0,depth),objectId:depth>0?objectId:''};
}
