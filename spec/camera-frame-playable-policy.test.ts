import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import * as T from 'three';
import {certifyCameraFrame} from '../src/client/camera-frame-collision.ts';
import {registerCameraExactAvatarShadowGeometry} from '../src/client/camera-exact-avatar-shadow.ts';
import {TownCameraCutaway} from '../src/client/camera-cutaway.ts';
import {GroundWorld} from '../src/shared/physics/world.ts';
/** One captured avatar mesh as the fixture stores it. */
interface FixtureMesh { label: string; geometryId?: string; positions: number[]; indices?: number[]; drawRange: { start: number; count: number | 'all' }; groups: T.BufferGeometry['groups']; matrixWorld: number[] }
import type {CameraCutawayPoint} from '../src/client/camera-cutaway-plan.ts';
const data=JSON.parse(readFileSync(new URL('./fixtures/r12-protected-avatar-shadow.json',import.meta.url),'utf8'));
// Isolated original collider + source-bound captured avatar geometry. The
// genuine controller issues/authenticates this plan; this is not a full-town
// replay or evidence that an actual browser frame was rendered successfully.
function fixture(rayIndex?:number){
 const world=new GroundWorld({id:'r11-avatar-refinement-isolated',revision:1,radius:12,environment:null,objects:[],blueprints:{}});
 const collider={objectId:'original-protected-jamb',tag:'structure.column',center:new T.Vector3(...data.collider.center),half:new T.Vector3(...data.collider.half),q:new T.Quaternion(...data.collider.q),inverse:new T.Quaternion(...data.collider.q).invert(),support:false};
 world.bodies.push({objectId:collider.objectId,dir:collider.center.clone().normalize(),broad:5,colliders:[collider],cameraBounds:new T.Box3().setFromPoints([-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>new T.Vector3(x*collider.half.x,y*collider.half.y,z*collider.half.z).applyQuaternion(collider.q).add(collider.center)))))});
 const cut=new TownCameraCutaway([],[],world.planetId),bounds=structuredClone(data.bounds);
 const meshes=data.meshes.map((m:FixtureMesh)=>{const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(m.positions,3));if(m.indices)geometry.setIndex(new T.Uint32BufferAttribute(m.indices,1));geometry.setDrawRange(m.drawRange.start,m.drawRange.count==='all'?Infinity:m.drawRange.count);geometry.groups=structuredClone(m.groups);registerCameraExactAvatarShadowGeometry(geometry);return{label:m.label,geometryId:m.geometryId,geometry,matrixWorld:new T.Matrix4().fromArray(m.matrixWorld)};});
 const proposal={eye:new T.Vector3(...data.pose.eye),direction:new T.Vector3(...data.pose.direction),up:new T.Vector3(...data.pose.up),feet:new T.Vector3(...data.pose.feet),probeRadius:.2};
 if(rayIndex!==undefined){const right=new T.Vector3().crossVectors(proposal.direction,proposal.up).normalize();const offset=rayIndex===4?.62:0;
  const target=proposal.feet.clone().addScaledVector(proposal.up,1.16).addScaledVector(right,offset);
  collider.center.copy(proposal.eye).lerp(target,.5);collider.half.set(.01,.01,.01);collider.q.identity();collider.inverse.identity();world.bodies[0].cameraBounds!.set(collider.center.clone().sub(collider.half),collider.center.clone().add(collider.half));}
 const plan=(previousEye?:T.Vector3)=>cut.planFrame({...proposal,previousEye,world,dt:.0147,cameraException:true,opticalTargetPoints:bounds.flatMap((b:{corners:CameraCutawayPoint[]})=>b.corners)});
 const certify=(selected:ReturnType<typeof plan>,actual:typeof meshes|null=meshes,current=true,policy:'strict-avatar'|'playable-central'='strict-avatar',diagnostics=true)=>certifyCameraFrame({...proposal,previousEye:selected.previousEye?new T.Vector3(...selected.previousEye):undefined},selected,{world,visibilityPolicy:policy,avatarGeometryDiagnostics:diagnostics,avatarBounds:bounds,avatarMeshes:actual??undefined,planCurrent:p=>current&&cut.validateFramePlan(p),probeParked:(a,b)=>a.distanceTo(b),probeParkedSafety:(a,b)=>a.distanceTo(b)});
 return{world,collider,cut,bounds,meshes,proposal,plan,certify,dispose(){cut.dispose();for(const m of meshes)m.geometry.dispose();}};
}
describe('explicit playable central camera visibility policy',()=>{
 it('accepts the same captured r12 real visor/jamb intersection only under the playable policy',()=>{
  const f=fixture();try{const selected=f.plan(),strict=f.certify(selected),playable=f.certify(selected,f.meshes,true,'playable-central');
   expect(strict.accepted).toBe(false);expect(strict.diagnostics.reasons).toContain('actual-avatar-optical-blocked');
   expect(strict.diagnostics.avatarGeometrySeparation!.remaining).toHaveLength(1);
   expect(strict.diagnostics.avatarGeometrySeparation!.cleared).toEqual([]);
   const visor=f.meshes[3];const inverse=new T.Matrix4().compose(f.collider.center,f.collider.q,new T.Vector3(1,1,1)).invert();
   const position=visor.geometry.getAttribute('position');let inside=0;
   for(let i=0;i<position.count;i++){const v=new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(visor.matrixWorld).applyMatrix4(inverse);
    if(Math.abs(v.x)<f.collider.half.x&&Math.abs(v.y)<f.collider.half.y&&Math.abs(v.z)<f.collider.half.z)inside++;}
   expect(inside).toBeGreaterThan(0);
   expect(playable.accepted).toBe(true);expect(playable.endpointClear).toBe(true);expect(playable.sweepClear).toBe(true);expect(playable.protectedOpticalClear).toBe(true);
   expect(playable.diagnostics.avatarOptical.intersections).toEqual(strict.diagnostics.avatarOptical.intersections);
   expect(playable.diagnostics.avatarGeometrySeparation!.remaining).toEqual(strict.diagnostics.avatarGeometrySeparation!.remaining);
   expect(playable.diagnostics.avatarGeometrySeparation!.cleared).toEqual([]);
   expect(playable.diagnostics.visibilityPolicy).toMatchObject({mode:'playable-central',requiredRayIndices:[0,1],avatarShadowRequired:false,requiredOpticalResidual:[],requiredExternalBlockedRayIndices:[]});
   expect(strict.diagnostics).not.toHaveProperty('visibilityPolicy');
  }finally{f.dispose();}
 });
 it('keeps raw whole-avatar negatives without paying for exact separation during ordinary play',()=>{
  const f=fixture();try{const result=f.certify(f.plan(),f.meshes,true,'playable-central',false);
   expect(result.accepted).toBe(true);expect(result.diagnostics.avatarOptical.intersections).toHaveLength(1);
   expect(result.diagnostics.avatarGeometrySeparation!.remaining).toEqual(result.diagnostics.avatarOptical.intersections);
   expect(result.diagnostics.avatarGeometrySeparation!.proofs).toEqual([]);expect(result.diagnostics.avatarGeometrySeparation!.cleared).toEqual([]);
   expect(result.diagnostics.visibilityPolicy!.avatarGeometryTested).toBe(false);
  }finally{f.dispose();}
 });
 it('retains physical endpoint and authentic-plan rejection',()=>{
  const f=fixture();try{const selected=f.plan();const stale=f.certify(selected,f.meshes,false,'playable-central');expect(stale.accepted).toBe(false);expect(stale.diagnostics.reasons).toContain('plan-not-current-or-authentic');
   f.collider.center.copy(f.proposal.eye);f.collider.half.set(.3,.3,.3);f.collider.q.identity();f.collider.inverse.identity();f.world.bodies[0].cameraBounds!.set(f.collider.center.clone().sub(f.collider.half),f.collider.center.clone().add(f.collider.half));
   const blocked=f.certify(f.plan(),f.meshes,true,'playable-central');expect(blocked.accepted).toBe(false);expect(blocked.endpointClear).toBe(false);expect(blocked.diagnostics.reasons).toContain('endpoint-blocked');expect(blocked.diagnostics.endpoint.authorized).toEqual([]);
  }finally{f.dispose();}
 });
 it('retains protected physical sweep rejection with a clear endpoint',()=>{
  const f=fixture();try{const start=f.proposal.eye.clone().add(new T.Vector3(.8,0,0));f.collider.center.copy(f.proposal.eye).lerp(start,.5);f.collider.half.set(.03,.03,.03);f.collider.q.identity();f.collider.inverse.identity();f.world.bodies[0].cameraBounds!.set(f.collider.center.clone().sub(f.collider.half),f.collider.center.clone().add(f.collider.half));
   const result=f.certify(f.plan(start),null,true,'playable-central');expect(result.endpointClear).toBe(true);expect(result.sweepClear).toBe(false);expect(result.accepted).toBe(false);expect(result.diagnostics.reasons).toContain('sweep-blocked');expect(result.diagnostics.sweep.authorized).toEqual([]);
  }finally{f.dispose();}
 });
 it('retains central parked-ship and terrain optical gates and records peripheral external blockers',()=>{
  const f=fixture();try{const selected=f.plan();
   for(const rayIndex of [0,4]){const target=new T.Vector3(...selected.rayTargets[rayIndex]);const result=certifyCameraFrame(f.proposal,selected,{world:f.world,avatarBounds:f.bounds,planCurrent:p=>f.cut.validateFramePlan(p),visibilityPolicy:'playable-central',probeParked:(a,b,r)=>r===0&&b.equals(target)?0:a.distanceTo(b),probeParkedSafety:(a,b)=>a.distanceTo(b)});
    expect(result.diagnostics.externalOptical[rayIndex].shipClear).toBe(false);expect(result.accepted).toBe(rayIndex===4);expect(result.diagnostics.visibilityPolicy!.requiredExternalBlockedRayIndices).toEqual(rayIndex===0?[0]:[]);}
   const terrainWorld=new GroundWorld({id:'central-terrain',revision:1,radius:12,environment:null,objects:[],blueprints:{}}),cut=new TownCameraCutaway([],[],terrainWorld.planetId);
   try{const proposal={eye:new T.Vector3(0,13,0),feet:new T.Vector3(0,-12,0),up:new T.Vector3(0,-1,0),direction:new T.Vector3(0,-1,0),probeRadius:.2};const plan=cut.planFrame({...proposal,world:terrainWorld,dt:0,cameraException:true});const result=certifyCameraFrame(proposal,plan,{world:terrainWorld,visibilityPolicy:'playable-central',planCurrent:p=>cut.validateFramePlan(p),probeParked:(a,b)=>a.distanceTo(b),probeParkedSafety:(a,b)=>a.distanceTo(b)});expect(result.endpointClear).toBe(true);expect(result.accepted).toBe(false);expect(result.diagnostics.visibilityPolicy!.requiredExternalBlockedRayIndices).toEqual([0,1]);
   }finally{cut.dispose();}
  }finally{f.dispose();}
 });
 it('keeps central chest optical blockers hard and peripheral guard negatives diagnostic',()=>{
  for(const ray of [0,4]){const f=fixture(ray);try{const selected=f.plan();const result=certifyCameraFrame(f.proposal,selected,{world:f.world,visibilityPolicy:'playable-central',planCurrent:p=>f.cut.validateFramePlan(p),probeParked:(a,b)=>a.distanceTo(b),probeParkedSafety:(a,b)=>a.distanceTo(b)});
   expect(result.diagnostics.optical.residual.some(hit=>hit.rayIndex===ray)).toBe(true);
   if(ray===0){expect(result.accepted).toBe(false);expect(result.diagnostics.visibilityPolicy!.requiredOpticalResidual.some(hit=>hit.rayIndex===0)).toBe(true);expect(result.diagnostics.reasons).toContain('protected-or-uncovered-optical');}
   else{expect(result.diagnostics.visibilityPolicy!.requiredOpticalResidual).toEqual([]);expect(result.accepted).toBe(true);}
  }finally{f.dispose();}}
 });
});
