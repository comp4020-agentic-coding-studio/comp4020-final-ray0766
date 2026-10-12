import { describe, it, expect } from 'vitest';
import * as T from 'three';
import { GroundCameraCutawayRig as R15, type GroundCameraCutawayDiagnostics, type GroundCameraCutawayInput } from '../src/client/ground-camera-cutaway.ts';
import { GroundCameraCutawayRig as R14 } from './ground-camera-cutaway-r14-reference.ts';
import { certifyCameraFrame, type CameraFrameCertificate } from '../src/client/camera-frame-collision.ts';
import { createPublicTownArt } from '../src/client/public-town-art.ts';
import { samplePublicVillage } from '../src/shared/sample-public-village.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import fixture from './fixtures/ground-camera-protected-central-r15.json';
/** A captured rig input: the fixture stores vectors as arrays; the test supplies probing, framing and commit hooks. */
type CapturedRigInput = Omit<GroundCameraCutawayInput, 'feet' | 'up' | 'heading' | 'framingPoints' | 'diagnostics' | 'probe' | 'certifyFrame' | 'commitFrame'> & { feet: number[]; up: number[]; heading: number[] };
const v=(a:readonly number[])=>new T.Vector3(a[0],a[1],a[2]);
const framed=(feet:T.Vector3,up:T.Vector3,facing:T.Vector3)=>{
 const right=new T.Vector3().crossVectors(up,facing).normalize(),q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,facing));
 return fixture.hull.map(p=>v(p).applyQuaternion(q).add(feet).addScaledVector(up,.018));
};
function setup(Rig:typeof R15 | typeof R14, bootstrap=fixture.bootstrap){
 const world=new GroundWorld({id:'hub',radius:21.6,revision:1010,objects:[],blueprints:{}});
 const town=createPublicTownArt(samplePublicVillage(21.6),21.6,{cameraCutaway:true}),controller=town.cutaway!;
 let boxes=bootstrap.cutaway.framePlan.opticalTargetPoints,dt=0,commits=0;
 let lastDiagnostics:GroundCameraCutawayDiagnostics|undefined;
 const prepare=(proposal:Parameters<typeof certifyCameraFrame>[0])=>{
  const plan=controller.planFrame({world,...proposal,dt,cameraException:true,diagnostics:true,opticalTargetPoints:boxes as [number,number,number][]});
  return certifyCameraFrame(proposal,plan,{world,visibilityPolicy:'playable-central',planCurrent:p=>controller.validateFramePlan(p),
   avatarBounds:Array.from({length:boxes.length/8},(_,i)=>({label:`upper-${i}`,corners:boxes.slice(i*8,i*8+8) as [number,number,number][]})),
   probeParked:(a,b)=>a.distanceTo(b),probeParkedSafety:(a,b)=>a.distanceTo(b)});
 };
 const initial=prepare({eye:v(bootstrap.eye),direction:v(bootstrap.forward),feet:v(bootstrap.cutaway.framePlan.feet),up:v(bootstrap.up),probeRadius:.2});
 if(!initial.accepted)throw Error('bootstrap '+initial.diagnostics.reasons.join(',')); controller.commitFrame(initial.plan);
 const rig=new Rig();Object.assign(rig,{eye:v(bootstrap.eye),view:v(bootstrap.forward),feet:v(bootstrap.cutaway.framePlan.feet),up:v(bootstrap.up),heading:v(bootstrap.smoothedHeading),pitch:bootstrap.smoothedPitch});
 const update=(input:CapturedRigInput,targets:number[][],facing:number[])=>{
  dt=input.dt;boxes=targets;const diagnostics:GroundCameraCutawayDiagnostics={schema:'ground-camera-attempt-v1',candidates:[]};
  lastDiagnostics=diagnostics;const result=rig.update({...input,feet:v(input.feet),up:v(input.up),heading:v(input.heading),framingPoints:framed(v(input.feet),v(input.up),v(facing)),diagnostics,
   probe:(a:T.Vector3,b:T.Vector3,r:number)=>world.cameraDistance(a,b,r),certifyFrame:prepare,
   commitFrame:(c:CameraFrameCertificate)=>{if(!c.accepted||!controller.validateFramePlan(c.plan))return false;controller.commitFrame(c.plan);commits++;return true;}});
  return{result,diagnostics};
 };
 return{update,rig,dispose:()=>town.dispose(),get commits(){return commits;},get lastDiagnostics(){return lastDiagnostics;}};
}
describe('protected central visibility before the captured r14 column trap',()=>{
 it('reproduces all14 real current-frame core rejections with physical checks clear',()=>{
  const h=fixture.failure.rig.context.history,bootstrap={...fixture.bootstrap,eye:h.eye!,forward:h.view!,up:h.up!,smoothedHeading:h.heading!,smoothedPitch:h.pitch,cutaway:{...fixture.bootstrap.cutaway,framePlan:{...fixture.bootstrap.cutaway.framePlan,feet:h.feet!,opticalTargetPoints:fixture.failure.attempted.avatarBounds.flatMap(b=>b.corners)}}};
  const s=setup(R14,bootstrap);try{
   const i=fixture.failure.rig.context.input;expect(()=>s.update(i,fixture.failure.attempted.avatarBounds.flatMap(b=>b.corners),fixture.failure.attempted.facing)).toThrow('protected-or-uncovered-optical');expect(s.commits).toBe(0);expect(s.lastDiagnostics!.candidates).toHaveLength(14);
   for(const [i,c] of s.lastDiagnostics!.candidates.entries()){expect(c.eye).toEqual(fixture.failure.rig.candidates[i]!.eye);expect(c.frameCertificate!.endpoint.clear).toBe(true);expect(c.frameCertificate!.sweep.clear).toBe(true);expect(c.frameCertificate!.visibilityPolicy!.requiredOpticalResidual.some(hit=>hit.objectId==='v10-s-block-2-2-L'&&hit.colliderIndex===25&&hit.rayIndex===0)).toBe(true);}
  }finally{s.dispose();}
 },30000);
 it('keeps the captured character route continuous through attempted frame830 with the original hard limits',()=>{
  const s=setup(R15);let previous=fixture.bootstrap,steps=0;try{
   for(const f of fixture.frames){
    const input={feet:f.cutaway.framePlan.feet,up:f.up,heading:f.heading,pitch:f.pitch,radius:21.6,portrait:false,fov:f.fov,aspect:f.aspect,dt:(f.frameTime-previous.frameTime)/1000};
    const {result,diagnostics}=s.update(input,f.cutaway.framePlan.opticalTargetPoints,f.facing);expect(diagnostics.status).toBe('accepted');
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
});
