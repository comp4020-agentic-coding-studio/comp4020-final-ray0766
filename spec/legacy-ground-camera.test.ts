import { expect, it } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { SurfaceWalker, cameraPose } from '../src/client/motion.ts';
import { INITIAL_OUTDOOR_PITCH, legacyOutdoorCameraPose, clipLegacyCameraBoom } from '../src/client/legacy-ground-camera.ts';
const walker=()=>new SurfaceWalker([0,1,0]);
const clear=(a:Vector3,b:Vector3)=>a.distanceTo(b);
it('retains the delivered outdoor eye and direction in clear space',()=>{
 const w=walker();w.velocity.set(.2,0,-.6);
 for(const portrait of [false,true])for(const radius of [12,60]){
  const feet=w.up.clone().multiplyScalar(radius+.25),original=cameraPose(w,portrait,false,radius);
  original.position.addScaledVector(w.up,.25);original.target.addScaledVector(w.up,.25);
  const pose=legacyOutdoorCameraPose(w,portrait,radius,feet,w.up,0,clear);
  expect(pose.position.distanceTo(original.position)).toBeLessThan(1e-8);
  expect(pose.target.clone().sub(pose.position).normalize().distanceTo(original.target.sub(original.position).normalize())).toBeLessThan(1e-8);
 }
});
it('wall compression never turns a neutral near-wall view toward the sky',()=>{
 const w=walker(),feet=w.up.clone().multiplyScalar(60);
 for(const limit of [2.49,1,.2,.01,0]){
  const pose=legacyOutdoorCameraPose(w,false,60,feet,w.up,0,(a,b)=>Math.min(limit,a.distanceTo(b)));
  const direction=pose.target.clone().sub(pose.position).normalize();
  expect(direction.dot(w.up)).toBeCloseTo(0);expect(direction.dot(w.north)).toBeCloseTo(1);
  expect(pose.position.distanceTo(pose.head)).toBeLessThanOrEqual(limit+1e-8);
 }
});
it('keeps manual near-wall pitch independent of obstruction distance on the sphere',()=>{
 const w=walker(),rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),1.2);
 w.up.applyQuaternion(rotation);w.north.applyQuaternion(rotation);
 const feet=w.up.clone().multiplyScalar(60),directions=[];
 for(const limit of [1,.1,0]){const p=legacyOutdoorCameraPose(w,false,60,feet,w.up,.3,(a,b)=>Math.min(limit,a.distanceTo(b)));directions.push(p.target.sub(p.position).normalize());}
 expect(directions[0].distanceTo(directions[1])).toBeLessThan(1e-8);expect(directions[0].distanceTo(directions[2])).toBeLessThan(1e-8);
});
it('reclips an interpolated eye without moving the supplied head or exceeding clearance',()=>{
 const head=new Vector3(0,61.35,0),eye=new Vector3(0,63,7),before=head.clone();
 expect(clipLegacyCameraBoom(head,eye,()=>.001).distanceTo(head)).toBeCloseTo(.001);
 expect(clipLegacyCameraBoom(head,eye,()=>0).equals(head)).toBe(true);expect(head.equals(before)).toBe(true);
});

it('applies bounded manual pitch in clear space, keeping the local horizon and arm length',()=>{
 for(const up of [[0,1,0],[0,-1,0],[1,0,0]])for(const portrait of [false,true]){
  const w=new SurfaceWalker(up),feet=w.up.clone().multiplyScalar(21.6);
  const base=legacyOutdoorCameraPose(w,portrait,21.6,feet,w.up,0,clear);
  for(const pitch of [-.3,.3,.7]){
   const p=legacyOutdoorCameraPose(w,portrait,21.6,feet,w.up,pitch,clear),dir=p.target.clone().sub(p.position).normalize();
   const expected=base.target.clone().sub(base.position).normalize().applyAxisAngle(w.right(),pitch);
   expect(dir.distanceTo(expected)).toBeLessThan(1e-8);expect(dir.dot(w.right())).toBeCloseTo(0,9);
   expect(p.position.distanceTo(p.head)).toBeCloseTo(base.position.distanceTo(base.head),8);
  }
  expect(legacyOutdoorCameraPose(w,portrait,21.6,feet,w.up,Infinity,clear).position.equals(base.position)).toBe(true);
 }
});
it('rechecks a pitched boom against walls without extending beyond clearance',()=>{
 const w=walker(),feet=w.up.clone().multiplyScalar(21.6);
 for(const pitch of [-.3,.7])for(const limit of [.1,1,3,5]){
  const p=legacyOutdoorCameraPose(w,false,21.6,feet,w.up,pitch,(a,b)=>Math.min(limit,a.distanceTo(b)));
  expect(p.position.distanceTo(p.head)).toBeLessThanOrEqual(limit+1e-8);
  expect(p.target.clone().sub(p.position).normalize().dot(w.right())).toBeCloseTo(0,9);
 }
});

it('starts outdoors looking farther down at the ground without changing the boom safety contract',()=>{
 for(const up of [[0,1,0],[0,-1,0],[1,0,0]])for(const portrait of [false,true]){
  const w=new SurfaceWalker(up),feet=w.up.clone().multiplyScalar(21.6);
  for(const limit of [20,1]){
   const probe=(a:Vector3,b:Vector3)=>Math.min(limit,a.distanceTo(b));
   const neutral=legacyOutdoorCameraPose(w,portrait,21.6,feet,w.up,0,probe);
   const initial=legacyOutdoorCameraPose(w,portrait,21.6,feet,w.up,INITIAL_OUTDOOR_PITCH,probe);
   const tilt=(p:typeof initial)=>p.target.clone().sub(p.position).normalize().dot(w.up);
   expect(tilt(initial)).toBeLessThan(tilt(neutral));
   expect(initial.position.distanceTo(initial.head)).toBeLessThanOrEqual(limit+1e-8);
   expect(initial.target.clone().sub(initial.position).normalize().dot(w.right())).toBeCloseTo(0,9);
  }
 }
});
