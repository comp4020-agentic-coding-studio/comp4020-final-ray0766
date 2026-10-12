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
const data=JSON.parse(readFileSync(new URL('./fixtures/r11-protected-avatar-shadow.json',import.meta.url),'utf8'));
// Isolated original collider + source-bound captured avatar geometry. The
// genuine controller issues/authenticates this plan; this is not a full-town
// replay or evidence that an actual browser frame was rendered successfully.
function fixture(){
 const world=new GroundWorld({id:'r11-avatar-refinement-isolated',revision:1,radius:12,environment:null,objects:[],blueprints:{}});
 const collider={objectId:'original-protected-jamb',tag:'structure.column',center:new T.Vector3(...data.collider.center),half:new T.Vector3(...data.collider.half),q:new T.Quaternion(...data.collider.q),inverse:new T.Quaternion(...data.collider.q).invert(),support:false};
 world.bodies.push({objectId:collider.objectId,dir:collider.center.clone().normalize(),broad:5,colliders:[collider],cameraBounds:new T.Box3().setFromPoints([-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>new T.Vector3(x*collider.half.x,y*collider.half.y,z*collider.half.z).applyQuaternion(collider.q).add(collider.center)))))});
 const cut=new TownCameraCutaway([],[],world.planetId),bounds=structuredClone(data.bounds);
 const meshes=data.meshes.map((m:FixtureMesh)=>{const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(m.positions,3));if(m.indices)geometry.setIndex(new T.Uint32BufferAttribute(m.indices,1));geometry.setDrawRange(m.drawRange.start,m.drawRange.count==='all'?Infinity:m.drawRange.count);geometry.groups=structuredClone(m.groups);registerCameraExactAvatarShadowGeometry(geometry);return{label:m.label,geometryId:m.geometryId,geometry,matrixWorld:new T.Matrix4().fromArray(m.matrixWorld)};});
 const proposal={eye:new T.Vector3(...data.pose.eye),direction:new T.Vector3(...data.pose.direction),up:new T.Vector3(...data.pose.up),feet:new T.Vector3(.8995217461277737,-17.352918429213936,-13.109389047987316),probeRadius:.2};
 const plan=()=>cut.planFrame({...proposal,world,dt:.0147,cameraException:true,opticalTargetPoints:bounds.flatMap((b:{corners:CameraCutawayPoint[]})=>b.corners)});
 const certify=(selected:ReturnType<typeof plan>,actual:typeof meshes|null=meshes,current=true)=>certifyCameraFrame(proposal,selected,{world,avatarBounds:bounds,avatarMeshes:actual??undefined,planCurrent:p=>current&&cut.validateFramePlan(p),probeParked:(a,b)=>a.distanceTo(b),probeParkedSafety:(a,b)=>a.distanceTo(b)});
 return{world,collider,cut,bounds,meshes,proposal,plan,certify,dispose(){cut.dispose();for(const m of meshes)m.geometry.dispose();}};
}
describe('authenticated certificate refines only additional coarse avatar intersections',()=>{
 it('preserves original jamb box rejection while independent actual geometry clears it',()=>{
  const f=fixture();try{const plan=f.plan(),result=f.certify(plan),d=result.diagnostics;
   expect(plan.rawHits).toEqual([]);expect(plan.masks).toEqual([]);
   expect(result.accepted).toBe(true);expect(d.avatarOptical.intersections).toEqual([{objectId:f.collider.objectId,colliderIndex:0,reason:'protected-avatar-shadow-overlap'}]);
   expect(d.avatarGeometrySeparation!.cleared).toEqual(d.avatarOptical.intersections);expect(d.avatarGeometrySeparation!.remaining).toEqual([]);
   expect(d.avatarGeometrySeparation!.proofs).toHaveLength(1);const proof=d.avatarGeometrySeparation!.proofs[0];expect(proof.frameId).toBe(plan.frameId);expect(proof.evidence.frameId).toBe(plan.frameId);expect(proof.evidence.meshWitnesses).toHaveLength(19);
   expect(d.endpoint.authorized).toEqual([]);expect(d.sweep.authorized).toEqual([]);expect(d.optical.residual).toEqual([]);expect(d.exactResidual.calls).toBe(0);
  }finally{f.dispose();}
 });
 it('retains coarse rejection without complete current avatar geometry',()=>{
  const f=fixture();try{const plan=f.plan();for(const meshes of [null,f.meshes.slice(1)]){const result=f.certify(plan,meshes);expect(result.accepted).toBe(false);expect(result.diagnostics.avatarOptical.intersections).toHaveLength(1);expect(result.diagnostics.reasons).toContain('actual-avatar-optical-blocked');if(meshes){expect(result.diagnostics.avatarGeometrySeparation!.remaining).toHaveLength(1);expect(result.diagnostics.avatarGeometrySeparation!.cleared).toEqual([]);}else expect(result.diagnostics).not.toHaveProperty('avatarGeometrySeparation');}}finally{f.dispose();}
 });
 it('cannot use exact support proof to authorize stale or changed frame bindings',()=>{
  const f=fixture();try{const plan=f.plan();const stale=f.certify(plan,f.meshes,false);expect(stale.accepted).toBe(false);expect(stale.diagnostics).not.toHaveProperty('avatarGeometrySeparation');
   f.meshes[3].matrixWorld.elements[12]+=.0001;const changed=f.certify(plan);expect(changed.accepted).toBe(false);expect(changed.diagnostics.avatarGeometrySeparation!.cleared).toEqual([]);
  }finally{f.dispose();}
 });
 it('retains real foreground optical obstruction and raw protected contacts',()=>{
  const f=fixture();try{const visor=f.meshes[3],target=new T.Box3().setFromBufferAttribute(visor.geometry.getAttribute('position') as T.BufferAttribute).getCenter(new T.Vector3()).applyMatrix4(visor.matrixWorld);
   f.collider.center.copy(f.proposal.eye).lerp(target,.5);f.collider.half.set(.3,.3,.3);f.collider.q.identity();f.collider.inverse.identity();f.world.bodies[0].cameraBounds!.set(f.collider.center.clone().sub(f.collider.half),f.collider.center.clone().add(f.collider.half));
   const result=f.certify(f.plan());expect(result.accepted).toBe(false);expect(result.protectedOpticalClear).toBe(false);expect(result.diagnostics.avatarGeometrySeparation!.cleared).toEqual([]);
   f.collider.center.copy(f.proposal.eye);f.world.bodies[0].cameraBounds!.set(f.collider.center.clone().sub(f.collider.half),f.collider.center.clone().add(f.collider.half));const physical=f.certify(f.plan());expect(physical.accepted).toBe(false);expect(physical.endpointClear).toBe(false);expect(physical.diagnostics.endpoint.authorized).toEqual([]);expect(physical.diagnostics.endpoint.residual.length).toBeGreaterThan(0);
  }finally{f.dispose();}
 });
});
