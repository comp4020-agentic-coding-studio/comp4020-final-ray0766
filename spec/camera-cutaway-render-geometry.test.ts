import { describe, it, expect } from 'vitest';
import * as T from 'three';
import { TownCameraCutaway } from '../src/client/camera-cutaway.ts';
import type { CameraCutawayPart } from '../src/client/camera-cutaway.ts';
import type { GroundWorld } from '../src/shared/physics/world.ts';
const part: CameraCutawayPart = {objectId:'home',partSlot:1,partNumber:1,partId:'wall.solid',level:0,category:'wall',planePoint:[0,0,0],planeUp:[0,1,0],center:[0,1.16,-3],half:[1,1,.1],inverseQuaternion:[0,0,0,1],expectedColliders:[{index:0,tag:'wall.solid',center:[0,1.16,-3],half:[1,1,.1],inverseQuaternion:[0,0,0,1]}]};
function fixture() {
 const cut = new TownCameraCutaway(['home'],[part]);
 const collider={objectId:'home',tag:'wall.solid',center:new T.Vector3(...part.center),half:new T.Vector3(...part.half),q:new T.Quaternion(),inverse:new T.Quaternion(),support:false};
 const world={planetId:'hub',revision:1,bodies:[{objectId:'home',colliders:[collider],cameraBounds:new T.Box3(new T.Vector3(-20,-20,-20),new T.Vector3(20,20,20))}]} as unknown as GroundWorld;
 function mesh(indexed=false,name='structure', custom=false, certified=false) {
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  geometry.setAttribute('townCameraPart',new T.Uint16BufferAttribute([1,1,1],1));cut.writeOwnerAttribute(geometry,'home');if(indexed)geometry.setIndex([0,2,1]);
  const source=new T.MeshStandardMaterial(); if(custom)source.onBeforeCompile=()=>{};
  const result=new T.Mesh(geometry,source);result.name=name;cut.registerMesh(result,certified?{staticGeometry:true}:{});return result;
 }
 function plan() { return cut.planFrame({world,eye:new T.Vector3(0,1.16,-6),feet:new T.Vector3(),up:new T.Vector3(0,1,0),direction:new T.Vector3(0,0,1),dt:.016,cameraException:true}); }
 return {cut,mesh,plan};
}
describe('authentic registered render geometry snapshots',()=>{
 it('includes primary and finish batches with exact indexed triangles and stable cache references',()=>{
  const f=fixture(),base=f.mesh(),finish=f.mesh(true,'structure-finish'),p=f.plan(),frame=f.cut.frameRenderGeometry(p);
  expect(frame.ready).toBe(true);expect(frame.parts).toHaveLength(1);expect(frame.parts[0].batches.map(b=>b.mesh)).toEqual([base,finish]);
  expect(Array.from(frame.parts[0].batches[1].triangleVertexIndices)).toEqual([0,2,1]);
  const again=f.cut.frameRenderGeometry(f.plan());expect(again.parts[0].batches[0].triangleVertexIndices).toBe(frame.parts[0].batches[0].triangleVertexIndices);
  const manifest=f.cut.captureRenderGeometryManifest(p);expect(manifest.parts[0].batches[1].geometryId).toBe(frame.parts[0].batches[1].geometryId);expect(manifest.parts[0].batches[1].positions).toEqual([[0,0,0],[1,0,0],[0,1,0]]);
  expect(f.cut.validateFramePlan(p)).toBe(true);f.cut.commitFrame(p);expect(f.cut.validateFramePlan(p)).toBe(false);
 });
 it.each(['unknown','mixed','unsupported'] as const)('fails closed for %s provenance or binding without poisoning the original strict plan',kind=>{
  const f=fixture(),m=f.mesh();
  if(kind==='unknown'){m.geometry.getAttribute('townCameraPart').setX(0,88);m.geometry.getAttribute('townCameraPart').setX(1,88);m.geometry.getAttribute('townCameraPart').setX(2,88);}
  if(kind==='mixed')m.geometry.getAttribute('townCameraPart').setX(1,0);
  if(kind==='unsupported')(m.material as T.MeshStandardMaterial).displacementMap=new T.Texture();
  // Displacement belongs to the original source, not a replaced clone.
  if(kind==='unsupported')m.onBeforeRender=()=>{};
  const p=f.plan(),frame=f.cut.frameRenderGeometry(p);expect(frame.ready).toBe(false);expect(frame.reasons.length).toBeGreaterThan(0);expect(f.cut.validateFramePlan(p)).toBe(true);
 });
 it.each(['matrix','visibility','geometry','version','register','unregister'] as const)('rejects %s changes between proof and same-plan commit',change=>{
  const f=fixture(),m=f.mesh(),p=f.plan();expect(f.cut.frameRenderGeometry(p).ready).toBe(true);
  if(change==='matrix')m.position.x=1;
  if(change==='visibility'){const parent=new T.Group();parent.add(m);parent.visible=false;}
  if(change==='geometry')m.geometry=m.geometry.clone();
  if(change==='version')m.geometry.getAttribute('position').needsUpdate=true;
  if(change==='register')f.mesh(false,'new-finish');
  if(change==='unregister')f.cut.unregisterMesh(m);
  expect(f.cut.validateFramePlan(p)).toBe(false);expect(()=>f.cut.commitFrame(p)).toThrow('Stale or unsafe');expect(f.cut.frameRenderGeometry(p).ready).toBe(false);
 });
 it('excludes invisible LOD and rechecks its visibility before commit',()=>{
  const f=fixture();f.mesh();const lod=f.mesh(true,'low-LOD');lod.visible=false;const p=f.plan(),frame=f.cut.frameRenderGeometry(p);expect(frame.ready).toBe(true);expect(frame.parts[0].batches).toHaveLength(1);lod.visible=true;expect(f.cut.validateFramePlan(p)).toBe(false);
 });
 it('respects draw range, rejects partial triangles, and invalidates cached identity on attribute version changes',()=>{
  const f=fixture(),m=f.mesh();m.geometry.setIndex([0,1,2,0,2,1]);m.geometry.setDrawRange(3,3);const frame=f.cut.frameRenderGeometry(f.plan());expect(frame.ready).toBe(true);expect(Array.from(frame.parts[0].batches[0].triangleVertexIndices)).toEqual([0,2,1]);
  m.geometry.getAttribute('position').needsUpdate=true;const updated=f.cut.frameRenderGeometry(f.plan());expect(updated.parts[0].batches[0].geometryId).not.toBe(frame.parts[0].batches[0].geometryId);
  m.geometry.setDrawRange(1,3);expect(f.cut.frameRenderGeometry(f.plan()).ready).toBe(false);
 });
 it('requires explicit frozen-factory certification for custom source shader hooks',()=>{
  const unknown=fixture();unknown.mesh(false,'custom',true);expect(unknown.cut.frameRenderGeometry(unknown.plan()).ready).toBe(false);
  const known=fixture();known.mesh(false,'known',true,true);expect(known.cut.frameRenderGeometry(known.plan()).ready).toBe(true);
 });
 it('rejects shader or displacement changes after a successful proof',()=>{
  for(const change of ['compile','displacement']){const f=fixture(),m=f.mesh(),p=f.plan();expect(f.cut.frameRenderGeometry(p).ready).toBe(true);if(change==='compile')(m.material as T.Material).onBeforeCompile=()=>{};else(m.material as T.MeshStandardMaterial).displacementMap=new T.Texture();expect(f.cut.validateFramePlan(p)).toBe(false);}
 });
 it('captures complete original registration including hidden finish and only new raw asset deltas',()=>{
  const f=fixture(),base=f.mesh(),finish=f.mesh(true,'structure-finish');finish.visible=false;const known=new Set<string>(),p=f.plan();
  const first=f.cut.captureFrameRenderEvidence(p,known);expect(first.frame.ready).toBe(true);expect(first.frame.registry.map(r=>r.mesh)).toEqual([base.uuid,finish.uuid]);expect(first.frame.registry[1].visible).toBe(false);expect(first.geometryDelta).toHaveLength(1);expect(first.frame.registry[1].geometryId).toBeNull();expect(first.registryCatalog.registry).toHaveLength(2);expect(first.frame.registry[0]).not.toHaveProperty('partPairs');expect(first.frame.registry[0]).not.toHaveProperty('ownerSlots');
  for(const asset of first.geometryDelta)known.add(asset.geometryId);const repeated=f.cut.captureFrameRenderEvidence(p,known);expect(repeated.geometryDelta).toEqual([]);expect(repeated.registryCatalog).toBe(first.registryCatalog);expect(first.frame.parts[0].batches).toHaveLength(1);
  finish.visible=true;const visible=f.cut.captureFrameRenderEvidence(f.plan(),known);expect(visible.geometryDelta).toHaveLength(1);expect(visible.frame.registry[1].geometryId).not.toBeNull();expect(visible.registryCatalog.revision).toBeGreaterThan(first.registryCatalog.revision);expect(visible.frame.parts[0].batches).toHaveLength(2);for(const asset of visible.geometryDelta)known.add(asset.geometryId);
  f.cut.unregisterMesh(finish);const rebuild=f.mesh(true,'finish-rebuilt'),next=f.cut.captureFrameRenderEvidence(f.plan(),known);expect(next.geometryDelta).toHaveLength(1);expect(next.frame.registry.map(r=>r.mesh)).toEqual([base.uuid,rebuild.uuid]);expect(next.frame.parts[0].batches).toHaveLength(2);
 });
 it('binds numeric content fingerprint to immutable geometry generation',()=>{
  const f=fixture(),m=f.mesh(),first=f.cut.captureFrameRenderEvidence(f.plan(),new Set()),asset=first.geometryDelta[0];
  let hash=2166136261;const bytes=new DataView(new ArrayBuffer(8));for(const v of [1,1,0,0,0,0,1,1,0,0,2,0,1,0]){bytes.setFloat64(0,v,true);hash=Math.imul(hash^bytes.getUint32(0,true),16777619)>>>0;hash=Math.imul(hash^bytes.getUint32(4,true),16777619)>>>0;}expect(asset.geometryId.split(':')[2]).toBe(hash.toString(16));
  m.geometry.getAttribute('position').setX(1,1.5);m.geometry.getAttribute('position').needsUpdate=true;const changed=f.cut.captureFrameRenderEvidence(f.plan(),new Set());expect(changed.geometryDelta[0].geometryId.split(':')[2]).not.toBe(asset.geometryId.split(':')[2]);
 });
 it('rejects forged plans',()=>{const f=fixture();f.mesh();const p=f.plan();expect(f.cut.frameRenderGeometry({...p}).ready).toBe(false);});
});
