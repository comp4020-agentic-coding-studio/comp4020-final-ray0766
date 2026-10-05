import { describe,it,expect,afterEach } from 'vitest';
import { Vector3 } from 'three';
import { setGroundWorld,surfaceNormal,logicalNormal,surfacePoint,surfaceTangent,surfaceOrientation,surfaceScale,groundRadius } from '../src/client/terrain.ts';
import { SurfaceWalker } from '../src/client/motion.ts';
import { SPAWN,SPEED } from '../src/shared/world.ts';
afterEach(()=>setGroundWorld(true));
describe('public display scale preserves saved navigation',()=>{
 it('round-trips saved positions continuously at both poles and around the entire sphere',()=>{
  setGroundWorld(true);
  for(let i=0;i<=800;i++){
   const angle=i/800*Math.PI*2,p=new Vector3(Math.sin(angle)*.6,Math.cos(angle),Math.sin(angle)*.8).normalize();
   const render=surfaceNormal(p),restored=logicalNormal(render);
   expect(render.length()).toBeCloseTo(1,10);expect(restored.distanceTo(p)).toBeLessThan(1e-10);expect(surfacePoint(p).length()).toBeCloseTo(800,9);
   const tangent=new Vector3(1,0,0).projectOnPlane(p).normalize(),direction=surfaceTangent(p,tangent);
   expect(Math.abs(direction.dot(render))).toBeLessThan(1e-6);expect(surfaceOrientation(p,tangent).toArray().every(Number.isFinite)).toBe(true);
  }
 });
 it('keeps human walking speed through the saved north pole and when reversing',()=>{
  setGroundWorld(true);const w=new SurfaceWalker(SPAWN);let maxJump=0;
  for(let i=0;i<600;i++){
   const before=surfacePoint(w.up);w.step(0,i<300?1:-1,1/60,1/surfaceScale(w.up));const delta=before.distanceTo(surfacePoint(w.up));maxJump=Math.max(maxJump,delta);
   if(i>40&&i<290)expect(delta/(1/60)).toBeCloseTo(SPEED,1);
   expect(Math.abs(surfaceTangent(w.up,w.north).dot(surfaceNormal(w.up)))).toBeLessThan(1e-6);
  }
  expect(maxJump).toBeLessThan(.051);expect(w.facing.dot(w.north)).toBeLessThan(-.99);
 });
 it('keeps moving near the south pole where logical angular speeds are very small',()=>{
  setGroundWorld(true);const w=new SurfaceWalker([0,-1,0]),start=surfacePoint(w.up);let previous=start.clone();
  for(let i=0;i<120;i++){w.step(0,1,1/60,1/surfaceScale(w.up));const current=surfacePoint(w.up);expect(current.distanceTo(previous)).toBeLessThan(.051);expect(current.toArray().every(Number.isFinite)).toBe(true);previous=current;}
  expect(start.distanceTo(surfacePoint(w.up))).toBeGreaterThan(5.5);
 });
 it('leaves private planet placement and metric unchanged',()=>{
  setGroundWorld(false);const p=new Vector3(...SPAWN),t=new Vector3(0,0,-1).projectOnPlane(p).normalize();
  expect(groundRadius()).toBe(10);expect(surfaceScale(p)).toBe(1);expect(surfaceNormal(p).equals(p)).toBe(true);expect(logicalNormal(p).equals(p)).toBe(true);expect(surfaceTangent(p,t).distanceTo(t)).toBeLessThan(1e-12);
 });
});
