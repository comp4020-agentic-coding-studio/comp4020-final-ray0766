import * as T from 'three';
import { RADIUS } from '../shared/world.ts';
export function surfaceHeight(p:T.Vector3) {
  // Gentle northern village; broader rolling terrain around the rest of the sphere.
  const amplitude=p.y>.35?.055:.20;
  return .055+amplitude*(Math.sin(p.x*8+p.z*3)*.5+Math.cos(p.z*7-p.y*4)*.5);
}
export function surfacePoint(p:T.Vector3,offset=0){return p.clone().multiplyScalar(RADIUS+surfaceHeight(p)+offset);}
