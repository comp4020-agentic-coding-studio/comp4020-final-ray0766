import { describe, it, expect } from 'vitest';
import * as T from 'three';
import { GroundCameraCutawayRig as R18, type GroundCameraCutawayDiagnostics, type GroundCameraCutawayInput } from '../src/client/ground-camera-cutaway.ts';
import { GroundCameraCutawayRig as R17 } from './ground-camera-cutaway-r17-reference.ts';
import { certifyCameraFrame, type CameraFrameCertificate } from '../src/client/camera-frame-collision.ts';
import { createPublicTownArt } from '../src/client/public-town-art.ts';
import { samplePublicVillage } from '../src/shared/sample-public-village.ts';
import { courier } from '../src/client/character.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
interface CapturedFrame {
 frameSeq:number;frameTime:number;eye:number[];forward:number[];feet:number[];up:number[];heading:number[];pitch:number;facing:number[];fov:number;aspect:number;smoothedHeading:number[];smoothedPitch:number;
 avatarBounds:{corners:number[][]}[];meshTransforms:{visible:boolean;matrixWorld:number[]}[];
 ship:{matrixWorld:number[];solidBounds:{min:number[];max:number[]};bounds:{min:number[];max:number[]};rightFallback:number[]};
}
const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/ground-camera-temporal-r18.json.gz',import.meta.url))).toString()) as {hull:number[][];bootstrap:CapturedFrame;frames:CapturedFrame[]};
import {writeFileSync} from 'node:fs';
const proofDirectory=process.env.CAMERA_TEMPORAL_PROOF_DIR;
const saveProof=(name:string,value:unknown)=>{if(proofDirectory)writeFileSync(`${proofDirectory}/${name}`,JSON.stringify(value,null,2));};
import {makeShip} from '../src/client/ship-model.ts';
import {decodeShipDesign} from '../src/assets/claude-geometry/ship/design.ts';
import {CameraShipCollision} from '../src/client/camera-ship-collision.ts';
import shipDocument from './fixtures/ground-camera-ship-r18.json';
/** A captured rig input: the fixture stores vectors as arrays; the test supplies probing, framing and commit hooks. */
type CapturedRigInput = Omit<GroundCameraCutawayInput, 'feet' | 'up' | 'heading' | 'framingPoints' | 'diagnostics' | 'probe' | 'certifyFrame' | 'commitFrame'> & { feet: number[]; up: number[]; heading: number[] };
/** One replayed frame's camera evidence; further captured fields ride along unchanged. */
interface ReplayRow { seq: number; time: number; arm: number; height: number; [field: string]: unknown }
const v=(a:readonly number[])=>new T.Vector3(a[0],a[1],a[2]);
const framed=(feet:T.Vector3,up:T.Vector3,facing:T.Vector3)=>{
 const right=new T.Vector3().crossVectors(up,facing).normalize(),q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,facing));
 return fixture.hull.map(p=>v(p).applyQuaternion(q).add(feet).addScaledVector(up,.018));
};
function setup(Rig:typeof R18 | typeof R17, bootstrap=fixture.bootstrap){
 const world=new GroundWorld({id:'hub',radius:21.6,revision:1010,objects:[],blueprints:{}});
 const town=createPublicTownArt(samplePublicVillage(21.6),21.6,{cameraCutaway:true}),controller=town.cutaway!;
 const actor=courier('clay'),upper:T.Mesh[]=[];actor.head.traverse(o=>{if(o instanceof T.Mesh)upper.push(o);});for(const child of actor.head.parent!.children){if(child===actor.head)continue;if(child instanceof T.Mesh)child.traverse(o=>{if(o instanceof T.Mesh)upper.push(o);});else for(const shoulder of child.children)if(shoulder instanceof T.Mesh)upper.push(shoulder);}let transforms=bootstrap.meshTransforms,ship=bootstrap.ship;
 const craft=makeShip(),design=decodeShipDesign(JSON.parse(shipDocument));if(!design.ok)throw Error('captured craft document');craft.setDesign(design.value);craft.animate(0,false);craft.root.matrixAutoUpdate=false;const shipCollision=new CameraShipCollision(),raycaster=new T.Raycaster();
 const refreshShip=()=>{craft.root.matrix.fromArray(ship.matrixWorld);craft.root.updateMatrixWorld(true);shipCollision.update(new T.Box3(v(ship.solidBounds.min),v(ship.solidBounds.max)),new T.Matrix4().fromArray(ship.matrixWorld));};refreshShip();
 const probeParked=(start:T.Vector3,end:T.Vector3,radius:number)=>{const delta=end.clone().sub(start),length=delta.length();if(length<1e-8)return 0;let limit=length;if(!new T.Box3(v(ship.bounds.min),v(ship.bounds.max)).intersectsBox(new T.Box3().setFromPoints([start,end]).expandByScalar(radius)))return limit;const direction=delta.divideScalar(length),right=new T.Vector3().crossVectors(direction,start.clone().normalize());if(right.lengthSq()<1e-8)right.copy(v(ship.rightFallback));else right.normalize();const vertical=new T.Vector3().crossVectors(right,direction).normalize();raycaster.far=length;for(const[x,y]of[[0,0],[1,0],[-1,0],[0,1],[0,-1]]){raycaster.set(start.clone().addScaledVector(right,x!*radius).addScaledVector(vertical,y!*radius),direction);const hit=raycaster.intersectObject(craft.root,true).find(h=>h.object instanceof T.Mesh);if(hit)limit=Math.min(limit,Math.max(0,hit.distance-radius));}raycaster.far=Infinity;return limit;};

 let boxes=bootstrap.avatarBounds.flatMap(b=>b.corners),dt=0,commits=0;
 let lastDiagnostics:GroundCameraCutawayDiagnostics|undefined;let frameCertCalls=0,frameCertMs=0;
 const prepare=(proposal:Parameters<typeof certifyCameraFrame>[0])=>{
  const started=performance.now();frameCertCalls++;
  const plan=controller.planFrame({world,...proposal,dt,cameraException:true,diagnostics:true,opticalTargetPoints:boxes as [number,number,number][]});
  const certificate=certifyCameraFrame(proposal,plan,{world,visibilityPolicy:'playable-central',planCurrent:p=>controller.validateFramePlan(p),
   avatarBounds:Array.from({length:boxes.length/8},(_,i)=>({label:`upper-${i}`,corners:boxes.slice(i*8,i*8+8) as [number,number,number][]})),
   avatarMeshes:upper.flatMap((mesh,i)=>transforms[i]?.visible?[{label:'upper-mesh-'+i,geometry:mesh.geometry,matrixWorld:new T.Matrix4().fromArray(transforms[i]!.matrixWorld)}]:[]),frameRenderGeometry:p=>controller.frameRenderGeometry(p),probeParked,probeParkedSafety:(a,b,r)=>shipCollision.distance(a,b,r)});frameCertMs+=performance.now()-started;return certificate;
 };
 const initial=prepare({eye:v(bootstrap.eye),direction:v(bootstrap.forward),feet:v(bootstrap.feet),up:v(bootstrap.up),probeRadius:.2});
 if(!initial.accepted)throw Error('bootstrap '+initial.diagnostics.reasons.join(',')); controller.commitFrame(initial.plan);
 const rig=new Rig();Object.assign(rig,{eye:v(bootstrap.eye),view:v(bootstrap.forward),feet:v(bootstrap.feet),up:v(bootstrap.up),heading:v(bootstrap.smoothedHeading),pitch:bootstrap.smoothedPitch});
 const update=(input:CapturedRigInput,targets:number[][],facing:number[],meshTransforms=transforms,capturedShip=ship)=>{
  transforms=meshTransforms;ship=capturedShip;refreshShip();
  dt=input.dt;boxes=targets;frameCertCalls=frameCertMs=0;const diagnostics:GroundCameraCutawayDiagnostics={schema:'ground-camera-attempt-v1',candidates:[]};
  lastDiagnostics=diagnostics;const result=rig.update({...input,feet:v(input.feet),up:v(input.up),heading:v(input.heading),framingPoints:framed(v(input.feet),v(input.up),v(facing)),diagnostics,
   probe:(a:T.Vector3,b:T.Vector3,r:number)=>Math.min(world.cameraDistance(a,b,r),probeParked(a,b,r)),certifyFrame:prepare,
   commitFrame:(c:CameraFrameCertificate)=>{if(!c.accepted||!controller.validateFramePlan(c.plan))return false;controller.commitFrame(c.plan);commits++;return true;}});
  expect(result.frameWidth).toBeLessThanOrEqual(.75);expect(result.frameHeight).toBeLessThanOrEqual(.75);
  const selected=diagnostics.candidates.find(c=>c.index===diagnostics.selectedCandidate);
  expect(selected?.projection?.good).toBe(true);expect(selected?.projection?.extent).toBeLessThan(.95);
  return{result,diagnostics};
 };
 const freshPose=(feet:number[],up:number[],facing:number[],elapsed:number)=>{const u=v(up),front=v(facing);actor.root.position.copy(v(feet)).addScaledVector(u,.018);actor.root.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3().crossVectors(u,front).normalize(),u,front));actor.animate(elapsed,0,false,0,true);actor.root.updateMatrixWorld(true);const meshTransforms=upper.map(mesh=>{let visible=true;for(let o:T.Object3D|null=mesh;o;o=o.parent)visible&&=o.visible;return{visible,matrixWorld:mesh.matrixWorld.toArray()};});const targets=upper.flatMap((mesh,i)=>{if(!meshTransforms[i]!.visible)return[];const b=new T.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as T.BufferAttribute),points:number[][]=[];for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])points.push(new T.Vector3(x,y,z).applyMatrix4(mesh.matrixWorld).toArray());return points;});expect(targets.length).toBe(19*8);return{targets,meshTransforms};};
 return{update,freshPose,rig,dispose:()=>{town.dispose();craft.dispose();},get commits(){return commits;},get lastDiagnostics(){return lastDiagnostics;},get frameCertCalls(){return frameCertCalls;},get frameCertMs(){return frameCertMs;}};
}

const replay=(Rig:typeof R18|typeof R17)=>{
 const s=setup(Rig),rows:ReplayRow[]=[];let previous=fixture.bootstrap,maxNativeEyeDifference=0,maxAttempts=0,maxCertCalls=0,maxCertMs=0;
 try {for(const f of fixture.frames){
  const input={feet:f.feet,up:f.up,heading:f.heading,pitch:f.pitch,radius:21.6,portrait:false,fov:f.fov,aspect:f.aspect,dt:(f.frameTime-previous.frameTime)/1000};
  let result,diagnostics;try{({result,diagnostics}=s.update(input,f.avatarBounds.flatMap(b=>b.corners),f.facing,f.meshTransforms,f.ship));}catch(error){saveProof('replay-failure-exact.json',{frameSeq:f.frameSeq,diagnostics:s.lastDiagnostics});saveProof('replay-partial.json',{rig:Rig===R17?'r17':'r18',maxNativeEyeDifference,rows});throw Error('frame '+f.frameSeq+' '+String(error),{cause:error});}
  maxAttempts=Math.max(maxAttempts,diagnostics.candidates.length);maxCertCalls=Math.max(maxCertCalls,s.frameCertCalls);maxCertMs=Math.max(maxCertMs,s.frameCertMs);expect(diagnostics.candidates.length).toBeLessThanOrEqual(201);const resolved=diagnostics.context!.resolved as {maximumStep:number;angleBudget:number;oldView:number[]};
  expect(result.position.distanceTo(v(previous.eye))).toBeLessThanOrEqual(resolved.maximumStep+1e-7);expect(result.direction.angleTo(v(resolved.oldView))).toBeLessThanOrEqual(resolved.angleBudget+1e-7);expect(result.frameCertificate!.diagnostics.reasons).toEqual([]);expect(result.frameCertificate!.plan.masks.length).toBeLessThanOrEqual(12);expect(new Set(result.frameCertificate!.plan.masks.map(m=>m.objectId)).size).toBeLessThanOrEqual(4);
  const fw=result.direction.clone().normalize(),right=new T.Vector3().crossVectors(fw,v(f.up)).normalize(),up=new T.Vector3().crossVectors(right,fw).normalize(),t=Math.tan(T.MathUtils.degToRad(f.fov)/2),ys=f.avatarBounds.flatMap(b=>b.corners).map(p=>{const d=v(p).sub(result.position);return d.dot(up)/d.dot(fw)/t;});
  const eyeDiff=result.position.distanceTo(v(f.eye));maxNativeEyeDifference=Math.max(maxNativeEyeDifference,eyeDiff);
  rows.push({seq:f.frameSeq,time:f.frameTime,arm:result.distance,height:(Math.max(...ys)-Math.min(...ys))/2,eyeDiff,candidate:diagnostics.selectedCandidate,candidates:diagnostics.candidates.map(c=>({index:c.index,status:c.status,arm:c.armDistance,margins:c.margins&&{reserve:c.margins.reserve,central:c.margins.protectedCentral,physical:c.margins.protectedPhysical,composition:c.margins.composition,optical:c.margins.optical,nominal:c.margins.nominalDistance}}))});
  previous={...f,eye:result.position.toArray(),forward:result.direction.toArray()};
 }
 const last=fixture.frames.at(-1)!,facing=v(last.facing),up=v(last.up),desired=v(last.heading);let oldEye=v(previous.eye),settleArmMin=Infinity,settleArmMax=0;
 for(let i=0;i<180;i++){const dt=1/60,turn=Math.atan2(up.dot(new T.Vector3().crossVectors(facing,desired)),facing.dot(desired));facing.applyAxisAngle(up,turn*(1-Math.exp(-14*dt))).normalize();const pose=s.freshPose(last.feet,last.up,facing.toArray(),last.frameTime/1000+(i+1)*dt);const{result,diagnostics}=s.update({feet:last.feet,up:last.up,heading:last.heading,pitch:last.pitch,radius:21.6,portrait:false,fov:last.fov,aspect:last.aspect,dt},pose.targets,facing.toArray(),pose.meshTransforms,last.ship);const resolved=diagnostics.context!.resolved as {maximumStep:number;angleBudget:number;oldView:number[]};expect(result.position.distanceTo(oldEye)).toBeLessThanOrEqual(resolved.maximumStep+1e-7);expect(result.direction.angleTo(v(resolved.oldView))).toBeLessThanOrEqual(resolved.angleBudget+1e-7);expect(result.frameCertificate!.diagnostics.reasons).toEqual([]);expect(result.frameCertificate!.plan.masks.length).toBeLessThanOrEqual(12);expect(new Set(result.frameCertificate!.plan.masks.map(m=>m.objectId)).size).toBeLessThanOrEqual(4);oldEye=result.position;settleArmMin=Math.min(settleArmMin,result.distance);settleArmMax=Math.max(settleArmMax,result.distance);maxAttempts=Math.max(maxAttempts,diagnostics.candidates.length);maxCertCalls=Math.max(maxCertCalls,s.frameCertCalls);maxCertMs=Math.max(maxCertMs,s.frameCertMs);expect(diagnostics.candidates.length).toBeLessThanOrEqual(201);}
 expect(s.commits).toBe(fixture.frames.length+180);
 return{rows,maxNativeEyeDifference,maxAttempts,maxCertCalls,maxCertMs,settle:{synthetic:true,frames:180,seconds:3,armMin:settleArmMin,armMax:settleArmMax}};
 }finally{s.dispose();}
};
const metrics=(rows:readonly ReplayRow[],lo:number,hi:number)=>{
 const f=rows.filter(x=>lo<=x.seq&&x.seq<=hi),arms=f.map(x=>x.arm),heights=f.map(x=>x.height);let reversals=0,last=0;
 for(let i=1;i<f.length;i++){const d=f[i]!.arm-f[i-1]!.arm,s=d>.001?1:d<-.001?-1:0;if(s&&last&&s!==last)reversals++;if(s)last=s;}
 return{frames:f.length,armMin:Math.min(...arms),armMax:Math.max(...arms),armVariation:f.slice(1).reduce((n,b,i)=>n+Math.abs(b.arm-f[i]!.arm),0),heightRatio:Math.max(...heights)/Math.min(...heights),reversals};
};
describe('certified temporal preference on the actual r17 camera input continuation',()=>{
 it('compares the existing reserve ranking with transported follow preference through both captured stationary turns and long W',()=>{
 const baseline=replay(R17);saveProof('baseline-proof.json',{maxNativeEyeDifference:baseline.maxNativeEyeDifference,frames:baseline.rows.length});saveProof('baseline-curves.json',baseline.rows);const proposal=replay(R18),ranges=[{label:'long W',lo:2195,hi:3352},{label:'worst native second',lo:2777,hi:2824},{label:'second stationary turn',lo:3380,hi:3525}],summary=ranges.map(r=>({...r,baseline:metrics(baseline.rows,r.lo,r.hi),proposal:metrics(proposal.rows,r.lo,r.hi)}));
 saveProof('replay-comparison.json',{scope:'Source-world replay of captured inputs and 19 actual bounds with source craft five-ray probes and captured solid OBB safety; the additional settle is synthetic. This is not native proposal acceptance.',baselineMaxNativeEyeDifference:baseline.maxNativeEyeDifference,proposalMaxNativeEyeDifference:proposal.maxNativeEyeDifference,baselineSettle:baseline.settle,proposalSettle:proposal.settle,diagnosticCosts:{maxAttempts:proposal.maxAttempts,maxCertCalls:proposal.maxCertCalls,maxCertMs:proposal.maxCertMs},summary});saveProof('replay-curves.json',{baseline:baseline.rows,proposal:proposal.rows});
 expect(baseline.maxNativeEyeDifference).toBeLessThan(1e-8);expect(proposal.rows.length).toBe(fixture.frames.length);expect(summary[0]!.proposal.armVariation).toBeLessThan(summary[0]!.baseline.armVariation);expect(summary[0]!.proposal.heightRatio).toBeLessThan(summary[0]!.baseline.heightRatio);
 for(const range of summary.slice(1)){expect(range.proposal.armVariation).toBeLessThan(range.baseline.armVariation);expect(range.proposal.heightRatio).toBeLessThan(range.baseline.heightRatio);}
 expect(proposal.settle.armMax-proposal.settle.armMin).toBeLessThan(baseline.settle.armMax-baseline.settle.armMin);
 },300000);
});
