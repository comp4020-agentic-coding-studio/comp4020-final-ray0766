import {describe,expect,it} from 'vitest';
import {Vector3} from 'three';
import {SurfaceWalker} from '../src/client/motion.ts';

const positions=[[0,1,0],[0,-1,0],[0,0,-1],[-.3,.4,-.8]];
const rates=[30,60,120];
function frame(w:SurfaceWalker){
  for(const v of [w.up,w.north,w.facing,w.right()]){
    expect(v.toArray().every(Number.isFinite)).toBe(true);
    expect(v.length()).toBeCloseTo(1,9);
  }
  expect(Math.abs(w.north.dot(w.up))).toBeLessThan(1e-9);
  expect(Math.abs(w.facing.dot(w.up))).toBeLessThan(1e-9);
  expect(Math.abs(w.right().dot(w.north))).toBeLessThan(1e-9);
  expect(new Vector3(0,1,0).applyQuaternion(w.orientation()).distanceTo(w.up)).toBeLessThan(1e-9);
}

describe('surface view heading and avatar turn',()=>{
  it('changes only the requested tangent heading when dragging, not the current pose or velocity',()=>{
    for(const position of positions){
      const w=new SurfaceWalker(position);w.velocity.copy(w.north).multiplyScalar(.7);
      const up=w.up.clone(),facing=w.facing.clone(),velocity=w.velocity.clone(),expected=w.north.clone().applyAxisAngle(w.up,-.8);
      w.turnView(-.8);
      expect(w.north.distanceTo(expected)).toBeLessThan(1e-10);
      expect(w.up.equals(up)).toBe(true);expect(w.facing.equals(facing)).toBe(true);expect(w.velocity.equals(velocity)).toBe(true);frame(w);
    }
  });

  it('smoothly follows a stationary drag around the local up without moving the player',()=>{
    for(const position of positions)for(const rate of rates)for(const yaw of [-Math.PI/2,Math.PI/2,Math.PI]){
      const w=new SurfaceWalker(position),up=w.up.clone();w.turnView(yaw);
      let error=w.facing.angleTo(w.north);
      w.step(0,0,1/rate);const first=w.facing.angleTo(w.north);
      expect(first).toBeGreaterThan(0);expect(first).toBeLessThan(error);error=first;
      for(let tick=1;tick<rate;tick++){
        w.step(0,0,1/rate);const next=w.facing.angleTo(w.north);
        expect(next).toBeLessThanOrEqual(error+1e-7);error=next;frame(w);
        expect(w.up.equals(up)).toBe(true);expect(w.velocity.lengthSq()).toBe(0);
      }
      expect(error).toBeLessThan(1e-4);
    }
  });

  it('uses the short arc across the signed-pi boundary instead of spinning a full turn',()=>{
    const w=new SurfaceWalker([0,-1,0]);w.facing.applyAxisAngle(w.up,Math.PI-.05);w.turnView(-Math.PI+.05);
    const before=w.facing.clone(),error=w.facing.angleTo(w.north);expect(error).toBeCloseTo(.1,9);
    w.step(0,0,1/60);
    expect(w.facing.angleTo(before)).toBeLessThan(.1);expect(w.facing.angleTo(w.north)).toBeLessThan(error);frame(w);
  });

  it('gives the same stationary turn for equal elapsed time and bounds exceptional frame gaps',()=>{
    const endings=rates.map(rate=>{const w=new SurfaceWalker([.4,-.5,-.7]);w.turnView(1.7);for(let i=0;i<rate;i++)w.step(0,0,1/rate);return w.facing;});
    expect(endings[0].distanceTo(endings[1])).toBeLessThan(1e-9);expect(endings[1].distanceTo(endings[2])).toBeLessThan(1e-9);
    const w=new SurfaceWalker([0,0,-1]);w.turnView(1);const before=w.facing.clone();w.step(0,0,0);expect(w.facing.equals(before)).toBe(true);
    const bounded=new SurfaceWalker([0,0,-1]);bounded.turnView(1);bounded.step(0,0,.05);w.step(0,0,10);
    expect(w.facing.distanceTo(bounded.facing)).toBeLessThan(1e-10);frame(w);
  });

  it('keeps W forward, S backward and A/D lateral while facing the chosen view heading',()=>{
    for(const position of positions)for(const [x,y] of [[0,1],[0,-1],[-1,0],[1,0]]){
      const w=new SurfaceWalker(position);w.turnView(.9);for(let i=0;i<120;i++)w.step(x,y,1/60);
      const desired=w.right().multiplyScalar(x).addScaledVector(w.north,y).normalize();
      expect(w.velocity.clone().normalize().dot(desired)).toBeGreaterThan(.999);
      expect(w.facing.dot(w.north)).toBeGreaterThan(.999);frame(w);
      for(let i=0;i<120;i++)w.step(0,0,1/60);
      expect(w.facing.dot(w.north)).toBeGreaterThan(.999);expect(w.velocity.lengthSq()).toBe(0);frame(w);
    }
  });
});
