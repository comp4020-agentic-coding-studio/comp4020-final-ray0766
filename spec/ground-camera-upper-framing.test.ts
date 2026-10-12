import {describe,it,expect} from 'vitest';
import {Vector3} from 'three';
import {GroundCameraCutawayRig,type GroundCameraCutawayInput,type GroundCameraCutawayDiagnostics} from '../src/client/ground-camera-cutaway.ts';
import fixture from './fixtures/ground-camera-upper-framing-seq370-r14.json';
const v=(a:readonly number[])=>new Vector3(a[0],a[1],a[2]);
function project(eye:Vector3,direction:Vector3,up:Vector3,points:readonly Vector3[],fov:number,aspect:number){
  const right=new Vector3().crossVectors(direction,up).normalize(),vertical=new Vector3().crossVectors(right,direction).normalize(),tv=Math.tan(fov*Math.PI/360);
  let extent=0,minDepth=Infinity;for(const point of points){const d=point.clone().sub(eye),z=d.dot(direction);minDepth=Math.min(minDepth,z);extent=Math.max(extent,Math.abs(d.dot(right)/(z*tv*aspect)),Math.abs(d.dot(vertical)/(z*tv)));}return{extent,minDepth};
}
function history(rig:GroundCameraCutawayRig){const f=fixture.previous;Object.assign(rig,{eye:v(f.eye),view:v(f.forward),feet:v(f.position).multiplyScalar(f.radius),up:v(f.up),heading:v(f.smoothedHeading),pitch:f.smoothedPitch});}
function input():GroundCameraCutawayInput{const f=fixture.current;return{feet:v(f.position).multiplyScalar(f.radius),up:v(f.up),heading:v(f.heading),pitch:f.pitch,radius:21.6,portrait:false,dt:(f.frameTime-fixture.previous.frameTime)/1000,fov:f.fov,aspect:f.aspect,probe:(a,b)=>a.distanceTo(b)};}
describe('original upper envelope alignment (framing only, no collider acceptance)',()=>{
  it('reproduces the original envelope failure while actual19 boxes remain inside the margin',()=>{
    const f=fixture.current,result=project(v(f.eye),v(f.forward),v(f.up),fixture.worldFramingPoints.map(v),f.fov,f.aspect);
    expect(result.extent).toBeCloseTo(.9579918992011439,12);expect(result.extent).toBeGreaterThan(.95);
    expect(fixture.capturedProjection.ring.extent).toBeCloseTo(.949999,12);expect(fixture.capturedProjection.actual19Bounds.extent).toBeLessThan(.95);
  });
  it('fits the same original upper envelope without changing its points or old depth/margin/rate/step limits',()=>{
    const rig=new GroundCameraCutawayRig();history(rig);const value=input(),points=fixture.worldFramingPoints.map(v),saved=points.map(point=>point.toArray());
    const pose=rig.update({...value,framingPoints:points}),projected=project(pose.position,pose.direction,value.up,points,value.fov!,value.aspect!);
    expect(projected.extent).toBeLessThan(.95);expect(projected.minDepth).toBeGreaterThan(.12);expect(pose.frameWidth).toBeLessThanOrEqual(.75);expect(pose.frameHeight).toBeLessThanOrEqual(.75);
    expect(Math.abs(pose.avoidanceYaw)).toBeLessThanOrEqual(Math.PI/2+1e-7);expect(Math.abs(pose.framingPitch)).toBeLessThanOrEqual(.30+1e-7);
    const headingTurn=v(fixture.previous.smoothedHeading).angleTo(pose.heading),budget=3*value.dt+headingTurn+Math.abs(pose.pitch-fixture.previous.smoothedPitch);
    expect(v(fixture.previous.forward).angleTo(pose.direction)).toBeLessThanOrEqual(budget+1e-7);
    expect(v(fixture.previous.eye).distanceTo(pose.position)).toBeLessThanOrEqual(Math.min(1,12*value.dt+pose.desiredDistance*headingTurn)+1e-7);
    expect(points.map(point=>point.toArray())).toEqual(saved);
  });
  it('preserves original behavior when no envelope is supplied and keeps all14 original goals when frames reject',()=>{
    const after=new GroundCameraCutawayRig();history(after);const value=input();
    expect(JSON.parse(JSON.stringify(after.update(value)))).toEqual(fixture.frozenOriginalPose);
    const rig=new GroundCameraCutawayRig();history(rig);const trace:GroundCameraCutawayDiagnostics={schema:'ground-camera-attempt-v1',candidates:[]};let commits=0;
    const rejectFrame=(()=>({accepted:false,diagnostics:{reasons:['framing-fixture-no-geometry-authority']}})) as unknown as NonNullable<GroundCameraCutawayInput['certifyFrame']>;
    expect(()=>rig.update({...value,framingPoints:fixture.worldFramingPoints.map(v),diagnostics:trace,certifyFrame:rejectFrame,commitFrame:()=>{commits++;return true;}})).toThrow('framing-fixture-no-geometry-authority');
    expect(trace.candidates).toHaveLength(14);expect(commits).toBe(0);
  });
  it('rejects invalid framing input without modifying existing camera history',()=>{
    const a=new GroundCameraCutawayRig();history(a);const value=input();
    expect(()=>a.update({...value,framingPoints:[new Vector3(NaN,0,0)]})).toThrow('invalid-original-upper-framing-points');expect(JSON.parse(JSON.stringify(a.update(value)))).toEqual(fixture.frozenOriginalPose);
  });
});
