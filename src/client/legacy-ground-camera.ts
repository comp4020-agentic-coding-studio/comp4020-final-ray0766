import { Vector3 } from 'three';
import { cameraPose } from './motion.ts';
import type { SurfaceWalker } from './motion.ts';
export type LegacyCameraProbe = (start: Vector3, end: Vector3) => number;
/** Original boom clipping, without extending beyond the measured clearance. */
export function clipLegacyCameraBoom(head: Vector3, eye: Vector3, probe: LegacyCameraProbe) {
  const boom=eye.clone().sub(head),length=boom.length();
  if(length<1e-10)return eye.clone();
  const limit=Math.max(0,Math.min(length,probe(head,eye)));
  return head.clone().addScaledVector(boom,limit/length);
}
/** 4f0d596 outdoor offsets and near-wall mode, with direction-preserving compression. */
export function legacyOutdoorCameraPose(walker: SurfaceWalker, portrait: boolean, radius: number,
  feet: Vector3, renderUp: Vector3, pitch: number, probe: LegacyCameraProbe) {
  const pose=cameraPose(walker,portrait,false,radius),lift=feet.length()-radius;
  pose.position.addScaledVector(walker.up,lift);pose.target.addScaledVector(walker.up,lift);
  const head=feet.clone().addScaledVector(renderUp,1.35);
  let clipped=probe(head,pose.position);const close=clipped<2.5;
  if(close){
    pose.position.copy(head).addScaledVector(walker.north,-1.2);
    pose.target.copy(head).addScaledVector(walker.north,3).addScaledVector(walker.up,Math.tan(pitch)*3);
    clipped=probe(head,pose.position);
  }
  // Keep the intended pitch when a wall retracts the eye; no fixed-target tilt.
  const direction=pose.target.clone().sub(pose.position).normalize();
  pose.position.copy(clipLegacyCameraBoom(head,pose.position,()=>clipped));
  pose.target.copy(pose.position).addScaledVector(direction,3);
  return {...pose,head,close,playerVisible:!close||clipped>1.35};
}
