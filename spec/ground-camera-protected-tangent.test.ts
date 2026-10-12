import { describe, it, expect } from 'vitest';
import * as T from 'three';
import { GroundCameraCutawayRig as R17, type GroundCameraCutawayDiagnostics, type GroundCameraCutawayInput } from '../src/client/ground-camera-cutaway.ts';
import { GroundCameraCutawayRig as R16 } from './ground-camera-cutaway-r16-reference.ts';
import { certifyCameraFrame, type CameraFrameCertificate } from '../src/client/camera-frame-collision.ts';
import { createPublicTownArt } from '../src/client/public-town-art.ts';
import { samplePublicVillage } from '../src/shared/sample-public-village.ts';
import { courier } from '../src/client/character.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import fixture from './fixtures/ground-camera-protected-tangent-r17.json';
/** A captured rig input: the fixture stores vectors as arrays; the test supplies probing, framing and commit hooks. */
type CapturedRigInput = Omit<GroundCameraCutawayInput, 'feet' | 'up' | 'heading' | 'framingPoints' | 'diagnostics' | 'probe' | 'certifyFrame' | 'commitFrame'> & { feet: number[]; up: number[]; heading: number[] };
const v=(a:readonly number[])=>new T.Vector3(a[0],a[1],a[2]);
const framed=(feet:T.Vector3,up:T.Vector3,facing:T.Vector3)=>{
 const right=new T.Vector3().crossVectors(up,facing).normalize(),q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,facing));
 return fixture.hull.map(p=>v(p).applyQuaternion(q).add(feet).addScaledVector(up,.018));
};
function setup(Rig:typeof R17 | typeof R16, bootstrap=fixture.bootstrap){
 const world=new GroundWorld({id:'hub',radius:21.6,revision:1010,objects:[],blueprints:{}});
 const town=createPublicTownArt(samplePublicVillage(21.6),21.6,{cameraCutaway:true}),controller=town.cutaway!;
 let boxes=bootstrap.cutaway.framePlan.opticalTargetPoints,dt=0,commits=0;
 let lastDiagnostics:GroundCameraCutawayDiagnostics|undefined;let frameCertCalls=0,frameCertMs=0;
 const prepare=(proposal:Parameters<typeof certifyCameraFrame>[0])=>{
  const started=performance.now();frameCertCalls++;
  const plan=controller.planFrame({world,...proposal,dt,cameraException:true,diagnostics:true,opticalTargetPoints:boxes as [number,number,number][]});
  const certificate=certifyCameraFrame(proposal,plan,{world,visibilityPolicy:'playable-central',planCurrent:p=>controller.validateFramePlan(p),
   avatarBounds:Array.from({length:boxes.length/8},(_,i)=>({label:`upper-${i}`,corners:boxes.slice(i*8,i*8+8) as [number,number,number][]})),
   probeParked:(a,b)=>a.distanceTo(b),probeParkedSafety:(a,b)=>a.distanceTo(b)});frameCertMs+=performance.now()-started;return certificate;
 };
 const initial=prepare({eye:v(bootstrap.eye),direction:v(bootstrap.forward),feet:v(bootstrap.cutaway.framePlan.feet),up:v(bootstrap.up),probeRadius:.2});
 if(!initial.accepted)throw Error('bootstrap '+initial.diagnostics.reasons.join(',')); controller.commitFrame(initial.plan);
 const rig=new Rig();Object.assign(rig,{eye:v(bootstrap.eye),view:v(bootstrap.forward),feet:v(bootstrap.cutaway.framePlan.feet),up:v(bootstrap.up),heading:v(bootstrap.smoothedHeading),pitch:bootstrap.smoothedPitch});
 const update=(input:CapturedRigInput,targets:number[][],facing:number[])=>{
  dt=input.dt;boxes=targets;frameCertCalls=frameCertMs=0;const diagnostics:GroundCameraCutawayDiagnostics={schema:'ground-camera-attempt-v1',candidates:[]};
  lastDiagnostics=diagnostics;const result=rig.update({...input,feet:v(input.feet),up:v(input.up),heading:v(input.heading),framingPoints:framed(v(input.feet),v(input.up),v(facing)),diagnostics,
   probe:(a:T.Vector3,b:T.Vector3,r:number)=>world.cameraDistance(a,b,r),certifyFrame:prepare,
   commitFrame:(c:CameraFrameCertificate)=>{if(!c.accepted||!controller.validateFramePlan(c.plan))return false;controller.commitFrame(c.plan);commits++;return true;}});
  return{result,diagnostics};
 };
 return{update,rig,dispose:()=>town.dispose(),get commits(){return commits;},get lastDiagnostics(){return lastDiagnostics;},get frameCertCalls(){return frameCertCalls;},get frameCertMs(){return frameCertMs;}};
}
describe('protected central visibility before the captured r16 fit/column trap',()=>{
 it('reproduces all 15 real current-frame physical/core rejections',()=>{
  const h=fixture.failure.rig.context.history,bootstrap={...fixture.bootstrap,eye:h.eye!,forward:h.view!,up:h.up!,smoothedHeading:h.heading!,smoothedPitch:h.pitch,cutaway:{...fixture.bootstrap.cutaway,framePlan:{...fixture.bootstrap.cutaway.framePlan,feet:h.feet!,opticalTargetPoints:fixture.failure.attempted.avatarBounds.flatMap(b=>b.corners)}}};
  const s=setup(R16,bootstrap);try{
   const i=fixture.failure.rig.context.input;expect(()=>s.update(i,fixture.failure.attempted.avatarBounds.flatMap(b=>b.corners),fixture.failure.attempted.facing)).toThrow('protected-or-uncovered-optical');expect(s.commits).toBe(0);expect(s.lastDiagnostics!.candidates).toHaveLength(15);
   for(const [i,c] of s.lastDiagnostics!.candidates.entries()){expect(c.eye).toEqual(fixture.failure.rig.candidates[i]!.eye);expect(c.status).toEqual(fixture.failure.rig.candidates[i]!.status);if(c.frameCertificate)expect(c.frameCertificate.reasons).toEqual(fixture.failure.rig.candidates[i]!.reasons);}
  }finally{s.dispose();}
 },30000);
 it('certifies shorter steps in the exact failed r16 state while all original15 attempts remain rejected',()=>{
  const h=fixture.failure.rig.context.history,bootstrap={...fixture.bootstrap,eye:h.eye!,forward:h.view!,up:h.up!,smoothedHeading:h.heading!,smoothedPitch:h.pitch,cutaway:{...fixture.bootstrap.cutaway,framePlan:{...fixture.bootstrap.cutaway.framePlan,feet:h.feet!,opticalTargetPoints:fixture.failure.attempted.avatarBounds.flatMap(b=>b.corners)}}};
  const s=setup(R17,bootstrap);try{
   const {result,diagnostics}=s.update(fixture.failure.rig.context.input,fixture.failure.attempted.avatarBounds.flatMap(b=>b.corners),fixture.failure.attempted.facing);
   expect(diagnostics.selectedCandidate).toBeGreaterThanOrEqual(15);expect(diagnostics.candidates.slice(0,15).map(c=>c.eye)).toEqual(fixture.failure.rig.candidates.map(c=>c.eye));expect(diagnostics.candidates.slice(0,15).every(c=>c.status!=='accepted')).toBe(true);
   const resolved=diagnostics.context!.resolved as {maximumStep:number;angleBudget:number;oldView:number[]};expect(result.position.distanceTo(v(h.eye!))).toBeGreaterThan(0);expect(result.position.distanceTo(v(h.eye!))).toBeLessThanOrEqual(resolved.maximumStep+1e-7);expect(result.direction.angleTo(v(h.view!))).toBeLessThanOrEqual(resolved.angleBudget+1e-7);
   const certificate=diagnostics.candidates[diagnostics.selectedCandidate!]!.frameCertificate!;expect(certificate.reasons).toEqual([]);expect(certificate.endpoint.clear).toBe(true);expect(certificate.sweep.clear).toBe(true);expect(certificate.visibilityPolicy!.requiredOpticalResidual).toEqual([]);expect(certificate.visibilityPolicy!.requiredExternalBlockedRayIndices).toEqual([]);expect(s.commits).toBe(1);
  }finally{s.dispose();}
 },30000);
 it('keeps the captured character route continuous through the actual failed turn input with the original hard limits',()=>{
  const s=setup(R17);let previous=fixture.bootstrap,steps=0;try{
   for(const f of fixture.frames){
    const input={feet:f.cutaway.framePlan.feet,up:f.up,heading:f.heading,pitch:f.pitch,radius:21.6,portrait:false,fov:f.fov,aspect:f.aspect,dt:(f.frameTime-previous.frameTime)/1000};
    let value;try{value=s.update(input,f.cutaway.framePlan.opticalTargetPoints,f.facing);}catch(error){throw Error('frame '+f.frameSeq+' '+String(error),{cause:error});}const {result,diagnostics}=value;
expect(diagnostics.status).toBe('accepted');
    const resolved=diagnostics.context!.resolved as {maximumStep:number;angleBudget:number;oldView:number[]};
    expect(result.position.distanceTo(v(previous.eye))).toBeLessThanOrEqual(resolved.maximumStep+1e-7);expect(result.direction.angleTo(v(resolved.oldView))).toBeLessThanOrEqual(resolved.angleBudget+1e-7);
    const certificate=diagnostics.candidates[diagnostics.selectedCandidate!]!.frameCertificate!;expect(certificate.visibilityPolicy!.requiredOpticalResidual).toEqual([]);expect(certificate.visibilityPolicy!.requiredExternalBlockedRayIndices).toEqual([]);expect(certificate.endpoint.clear).toBe(true);expect(certificate.sweep.clear).toBe(true);
    expect(result.position.distanceTo(v(previous.eye))).toBeLessThanOrEqual(1+1e-7);expect(result.frameWidth).toBeLessThanOrEqual(.75);expect(result.frameHeight).toBeLessThanOrEqual(.75);
    previous={...f,eye:result.position.toArray(),forward:result.direction.toArray()};steps++;
   }
   const input=fixture.failure.rig.context.input,{diagnostics}=s.update(input,fixture.failure.attempted.avatarBounds.flatMap(b=>b.corners),fixture.failure.attempted.facing);
   expect(diagnostics.status).toBe('accepted');expect(s.commits).toBe(steps+1);
  }finally{s.dispose();}
 },30000);
 it('continues the captured stationary turn to its quarter-turn goal and settles for 3 seconds using fresh source animation boxes',()=>{
  const s=setup(R17),actor=courier('clay');let previous=fixture.bootstrap,elapsed=fixture.failure.attempted.elapsed;try{
   for(const f of fixture.frames){s.update({feet:f.cutaway.framePlan.feet,up:f.up,heading:f.heading,pitch:f.pitch,radius:21.6,portrait:false,fov:f.fov,aspect:f.aspect,dt:(f.frameTime-previous.frameTime)/1000},f.cutaway.framePlan.opticalTargetPoints,f.facing);previous=f;}
   const input=fixture.failure.rig.context.input;let old=s.update(input,fixture.failure.attempted.avatarBounds.flatMap(b=>b.corners),fixture.failure.attempted.facing).result;
   const up=v(input.up),feet=v(input.feet),heading=v(input.heading),facing=v(fixture.failure.attempted.facing),start=v(fixture.frames.find(f=>f.frameSeq===3373)!.heading);
   const signed=Math.atan2(up.dot(new T.Vector3().crossVectors(start,heading)),start.dot(heading)),remaining=Math.max(0,Math.PI/2-Math.abs(signed)),sign=Math.sign(signed),steps=Math.ceil(remaining/.01);let moved=0;const measured:{step:number;angle:number;distance:number;height:number;candidate:number;attempts:number;certCalls:number;certMs:number}[]=[];
   const upper:T.Mesh[]=[];actor.head.traverse(o=>{if(o instanceof T.Mesh)upper.push(o);});for(const child of actor.head.parent!.children){if(child===actor.head)continue;if(child instanceof T.Mesh)child.traverse(o=>{if(o instanceof T.Mesh)upper.push(o);});else for(const shoulder of child.children)if(shoulder instanceof T.Mesh)upper.push(shoulder);}expect(upper.filter(m=>m!==actor.parcel).length).toBeGreaterThanOrEqual(19);
   for(let i=0;i<steps+180;i++){
    const dt=1/60;if(i<steps)heading.applyAxisAngle(up,sign*remaining/steps).normalize();
    const turn=Math.atan2(up.dot(new T.Vector3().crossVectors(facing,heading)),facing.dot(heading));facing.applyAxisAngle(up,turn*(1-Math.exp(-14*dt))).normalize();elapsed+=dt;
    actor.root.position.copy(feet).addScaledVector(up,.018);actor.root.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3().crossVectors(up,facing).normalize(),up,facing));actor.animate(elapsed,0,false,0,true);actor.root.updateMatrixWorld(true);
    const boxes=upper.filter(mesh=>{for(let object:T.Object3D|null=mesh;object;object=object.parent)if(!object.visible)return false;return true;}).flatMap(mesh=>{const box=new T.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as T.BufferAttribute),points:number[][]=[];for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])points.push(new T.Vector3(x,y,z).applyMatrix4(mesh.matrixWorld).toArray());return points;});expect(boxes.length).toBe(19*8);
    let outcome;try{outcome=s.update({...input,dt,heading:heading.toArray()},boxes,facing.toArray());}catch(error){throw Error('modeled index '+i+' '+String(error),{cause:error});}const {result,diagnostics}=outcome,resolved=diagnostics.context!.resolved as {maximumStep:number;angleBudget:number;oldView:number[]};
    expect(result.position.distanceTo(old.position)).toBeLessThanOrEqual(resolved.maximumStep+1e-7);expect(result.direction.angleTo(v(resolved.oldView))).toBeLessThanOrEqual(resolved.angleBudget+1e-7);expect(diagnostics.candidates[diagnostics.selectedCandidate!]!.frameCertificate!.reasons).toEqual([]);if(result.position.distanceTo(old.position)>1e-6)moved++;measured.push({step:result.position.distanceTo(old.position),angle:result.direction.angleTo(v(resolved.oldView)),distance:result.distance,height:result.frameHeight,candidate:diagnostics.selectedCandidate!,attempts:diagnostics.candidates.length,certCalls:s.frameCertCalls,certMs:s.frameCertMs});expect(result.frameCertificate!.plan.masks.length).toBeLessThanOrEqual(12);expect(new Set(result.frameCertificate!.plan.masks.map(m=>m.objectId)).size).toBeLessThanOrEqual(4);old=result;
   }
   expect(Math.abs(Math.atan2(up.dot(new T.Vector3().crossVectors(start,heading)),start.dot(heading)))).toBeCloseTo(Math.PI/2,10);expect(old.heading.angleTo(heading)).toBeLessThan(1e-6);expect(moved).toBeGreaterThan(0);expect(Math.max(...measured.map(m=>m.attempts))).toBeLessThanOrEqual(201);expect(measured.every(m=>m.certCalls<=m.attempts)).toBe(true);
  }finally{s.dispose();}
 },60000);

});
