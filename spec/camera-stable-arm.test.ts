import {describe,expect,it} from 'vitest';
import {Vector3} from 'three';
import {cameraStableArmEye} from '../src/client/ground-camera-cutaway.ts';
describe('original step sphere intersecting a stable camera arm',()=>{
 it('turns at the exact one-metre cap without retracting the five-metre arm',()=>{
  const c=new Vector3(),o=new Vector3(0,0,5),p=cameraStableArmEye(c,o,new Vector3(5,0,0),5,1)!;
  expect(p.x).toBeCloseTo(.99498743710662,12);expect(p.z).toBeCloseTo(4.9,12);expect(p.length()).toBeCloseTo(5,12);expect(p.distanceTo(o)).toBeCloseTo(1,12);
 });
 it('preserves an already legal goal and preserves zero-step history',()=>{
  const c=new Vector3(),o=new Vector3(0,0,5),goal=new Vector3(.6,0,Math.sqrt(25-.36));
  expect(cameraStableArmEye(c,o,goal,5,1)!.distanceTo(goal)).toBeLessThan(1e-12);
  expect(cameraStableArmEye(c,o,new Vector3(5,0,0),5,0)!.distanceTo(o)).toBeLessThan(1e-12);
 });
 it('is rotation/translation invariant and rejects an empty radial intersection',()=>{
  const c=new Vector3(9,-2,7),o=new Vector3(9,3,7),goal=new Vector3(9,-2,12),p=cameraStableArmEye(c,o,goal,5,1)!;
  expect(p.distanceTo(c)).toBeCloseTo(5,12);expect(p.distanceTo(o)).toBeCloseTo(1,12);
  expect(cameraStableArmEye(c,o,goal,3,1)).toBeUndefined();expect(cameraStableArmEye(c,o,goal,NaN,1)).toBeUndefined();
 });
});
