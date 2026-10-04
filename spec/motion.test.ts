import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SurfaceWalker, cameraPose } from '../src/client/motion.ts';
import { SPAWN, SPEED } from '../src/shared/world.ts';
it('walks repeated great circles through both poles without losing its tangent frame',()=>{
  const w=new SurfaceWalker([0,1,0]); let previous=w.up.clone();
  for(let i=0;i<16000;i++) {
    w.step(0,1,1/60);
    expect(w.up.length()).toBeCloseTo(1,9);
    expect(w.north.dot(w.up)).toBeCloseTo(0,9);
    expect(w.right().dot(w.north)).toBeCloseTo(0,9);
    expect(previous.angleTo(w.up)).toBeLessThan(.006);
    const pose=cameraPose(w,false);
    expect(pose.position.length()).toBeGreaterThan(10);
    expect(pose.position.toArray().every(Number.isFinite)).toBe(true);
    expect(w.orientation().toArray().every(Number.isFinite)).toBe(true);
    previous=w.up.clone();
  }
});
it('turning, diagonal input, stopping and large frame gaps keep speed bounded',()=>{
  const w=new SurfaceWalker(SPAWN);
  for(const [x,y] of [[0,1],[1,1],[-1,0],[0,-1],[1,0],[0,1]]) {
    for(let i=0;i<100;i++){w.step(x,y,i===3?10:1/60);expect(w.velocity.length()).toBeLessThanOrEqual(SPEED+.0001);}
  }
  for(let i=0;i<120;i++)w.step(0,0,1/60);
  expect(w.velocity.length()).toBe(0);
  const pose=cameraPose(w,true);
  expect(new Vector3().crossVectors(pose.position.clone().sub(pose.target),w.up).length()).toBeGreaterThan(1);
});
it('turns the character through a full reversal instead of normalising back to the old heading',()=>{
  const w=new SurfaceWalker(SPAWN);
  for(let i=0;i<100;i++)w.step(0,1,1/60);
  for(let i=0;i<100;i++)w.step(0,-1,1/60);
  expect(w.facing.dot(w.north)).toBeLessThan(-.99);
  expect(w.facing.length()).toBeCloseTo(1,9);
});
