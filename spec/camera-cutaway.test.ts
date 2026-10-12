import {describe,expect,it,vi} from 'vitest';
import * as T from 'three';
import {TownCameraCutaway,cameraCutawayEligible,CAMERA_CUTAWAY_LIMITS,CAMERA_CUTAWAY_DECK_CLEARANCE} from '../src/client/camera-cutaway.ts';
import type {CameraCutawayCollider,CameraCutawayPart} from '../src/client/camera-cutaway.ts';
import {CAMERA_PART_ATTRIBUTE} from '../src/client/camera-blueprint-model.ts';
import {createTownRenderer} from '../src/client/town-renderer.ts';
import type {GroundWorld} from '../src/shared/physics/world.ts';
import type {PlacedObject} from '../src/shared/planets.ts';

type Shader=Parameters<T.Material['onBeforeCompile']>[0];
const up=new T.Vector3(0,1,0),feet=new T.Vector3();
function box(objectId:string,tag='wall.solid',center=[0,1.16,-3],half=[1,1,.1],yaw=0):CameraCutawayCollider{
  const q=new T.Quaternion().setFromAxisAngle(up,yaw);
  return{objectId,tag,center:new T.Vector3().fromArray(center),half:new T.Vector3().fromArray(half),q,inverse:q.clone().invert(),support:false};
}
// Selector fixtures intentionally provide an explicit part/collider relation.
// Production registry/world parity is tested separately against real parts.
function registry(colliders:CameraCutawayCollider[]):CameraCutawayPart[]{
  const next=new Map<string,number>();
  return colliders.map(c=>{
    const index=next.get(c.objectId)??0;next.set(c.objectId,index+1);
    const category=c.tag.startsWith('wall.')?'wall':c.tag==='floor'?'deck':c.tag==='beam'?'beam':'protected';
    return{objectId:c.objectId,partNumber:index+1,partId:c.tag,level:category==='deck'?1:0,partSlot:category==='protected'?0:index+1,category,
      planePoint:[c.center.x,c.center.y+c.half.y,c.center.z],planeUp:[0,1,0],center:c.center.toArray(),half:c.half.toArray(),inverseQuaternion:c.inverse.toArray(),
      expectedColliders:[{index,tag:c.tag,center:c.center.toArray(),half:c.half.toArray(),inverseQuaternion:c.inverse.toArray()}]};
  });
}
function world(colliders:CameraCutawayCollider[],planetId='hub'){
  const ids=[...new Set(colliders.map(c=>c.objectId))];
  return{planetId,bodies:ids.map(objectId=>({objectId,colliders:colliders.filter(c=>c.objectId===objectId),cameraBounds:new T.Box3(new T.Vector3(-20,-20,-20),new T.Vector3(20,20,20))}))} as unknown as GroundWorld;
}
function camera(x=0){const c=new T.PerspectiveCamera(54,1.44,.08,100);c.position.set(x,1.16,-6);c.lookAt(x,1.16,0);c.updateMatrixWorld(true);return c;}
function compile(material:T.Material){
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <project_vertex>',fragmentShader:'#include <common>\n#include <clipping_planes_fragment>'} as unknown as Shader;
  material.onBeforeCompile(shader,{} as T.WebGLRenderer);return shader;
}
function registered(cut:TownCameraCutaway,owner='a',source=new T.MeshStandardMaterial(),partSlot=1){
  const mesh=new T.Mesh(new T.BoxGeometry(2,2,.2),source);
  mesh.geometry.setAttribute(CAMERA_PART_ATTRIBUTE,new T.Uint16BufferAttribute(new Uint16Array(mesh.geometry.attributes.position.count).fill(partSlot),1));
  cut.writeOwnerAttribute(mesh.geometry,owner);cut.registerMesh(mesh);return{mesh,source,shader:compile(mesh.material)};
}
// Copy the actual installed uniform values now; never compare references that
// could both mutate to the final frame, or use diagnostics as the render oracle.
function uniformSnapshot(shader:Shader){
  const copy=(value:unknown):unknown=>{
    if(typeof value==='number'||typeof value==='boolean'||value===null)return value;
    if(value instanceof T.Vector3||value instanceof T.Vector4)return value.toArray();
    if(ArrayBuffer.isView(value))return Array.from(value as Float32Array);
    if(Array.isArray(value))return value.map(copy);
    throw Error('Unexpected cutaway uniform type; update the independent snapshot explicitly');
  };
  return Object.fromEntries(Object.entries(shader.uniforms).map(([key,uniform])=>[key,copy(uniform.value)]));
}

// Independent CPU evaluation of installed shader uniforms, never evidence of
// GPU fragment execution, raw LOS clearance, or an actually visible avatar.
function uniformContains(shader:Shader,point:T.Vector3,owner:number,partSlot:number){
  const u=shader.uniforms,n=Number(u.uTownCutCount.value),eye=u.uTownCutEye.value as T.Vector3,target=u.uTownCutTarget.value as T.Vector3;
  const f=u.uTownCutFeet.value as T.Vector3,normal=u.uTownCutUp.value as T.Vector3;
  if(owner<=.5||partSlot<=.5||point.clone().sub(f).dot(normal)<=.30)return false;
  const direction=target.clone().sub(eye),length=direction.length();direction.normalize();
  const offset=point.clone().sub(eye),along=offset.dot(direction);
  if(along<0||along>=length-.08)return false;
  const across=offset.addScaledVector(direction,-along).length(),radius=.28+(.96-.28)*along/length;
  for(let i=0;i<n;i++){
    const c=(u.uTownCutCenter.value as T.Vector4[])[i],h=(u.uTownCutHalf.value as T.Vector4[])[i],q=(u.uTownCutInverse.value as T.Vector4[])[i];
    const local=point.clone().sub(new T.Vector3(c.x,c.y,c.z)).applyQuaternion(new T.Quaternion(q.x,q.y,q.z,q.w));
    if(Math.abs(owner-c.w)<.25&&Math.abs(partSlot-(u.uTownCutPart.value as Float32Array)[i])<.25
      &&Math.abs(local.x)<=h.x&&Math.abs(local.y)<=h.y&&Math.abs(local.z)<=h.z&&across<radius*h.w)return true;
  }
  return false;
}

describe('part-scoped cutaway selector and material lifetime (not rendered-pixel acceptance)',()=>{
  it('keeps source hooks/defines and borrows one unchanged-opacity clone per source',()=>{
    const cut=new TownCameraCutaway(['a','b']),source=new T.MeshStandardMaterial();
    source.defines={STANDARD:'',SOURCE_SENTINEL:1};const hook=vi.fn((shader:Shader)=>{shader.vertexShader+='\n// source hook';});source.onBeforeCompile=hook;source.customProgramCacheKey=()=> 'original-key';
    const a=registered(cut,'a',source),b=registered(cut,'b',source),originalDispose=vi.fn();source.addEventListener('dispose',originalDispose);
    expect(a.mesh.material).toBe(b.mesh.material);expect(a.mesh.material).not.toBe(source);expect(a.mesh.material.defines).toEqual(source.defines);
    expect(a.mesh.material.transparent).toBe(false);expect(a.mesh.material.depthWrite).toBe(true);expect(source.opacity).toBe(1);
    expect(a.shader.vertexShader).toContain('// source hook');expect(hook).toHaveBeenCalled();expect(a.mesh.material.customProgramCacheKey()).toContain('original-key');
    expect(a.shader.fragmentShader).toContain('discard;');expect(a.shader.fragmentShader).toContain('vTownCutPart');
    const cloneDispose=vi.fn();a.mesh.material.addEventListener('dispose',cloneDispose);
    cut.unregisterMesh(a.mesh);expect(a.mesh.material).toBe(source);expect(cloneDispose).not.toHaveBeenCalled();
    cut.dispose();cut.dispose();expect(b.mesh.material).toBe(source);expect(cloneDispose).toHaveBeenCalledTimes(1);expect(originalDispose).not.toHaveBeenCalled();
    a.mesh.geometry.dispose();b.mesh.geometry.dispose();source.dispose();
  });
  it('records every raw layer and never claims unregistered or protected hits were rendered clear',()=>{
    const colliders=[box('a','wall.solid',[0,1.16,-4]),box('b','wall.window',[0,1.16,-2]),box('unregistered','wall.solid',[0,1.16,-1]),box('a','stairs',[0,1.16,-2])];
    const cut=new TownCameraCutaway(['a','b'],registry(colliders)),w=world(colliders),before=JSON.stringify(w);
    const d=cut.update({world:w,camera:camera(),feet,up,dt:.016,enabled:true});
    expect(new Set(d.rawHits.filter(h=>h.rayIndex===0).map(h=>h.objectId))).toEqual(new Set(['a','b','unregistered']));
    expect(d.remainingHits.some(h=>h.objectId==='unregistered')).toBe(true);expect(d.remainingHits.some(h=>h.tag==='stairs')).toBe(true);
    expect(d.renderClearVerified).toBe(false);expect(d.terrainTested).toBe(false);expect(JSON.stringify(w)).toBe(before);cut.dispose();
  });
  it('requires the selected owner AND part slot AND local OBB AND finite corridor',()=>{
    const colliders=[box('a')],cut=new TownCameraCutaway(['a','b'],registry(colliders)),{mesh,source,shader}=registered(cut);
    cut.update({world:world(colliders),camera:camera(),feet,up,dt:.016,enabled:true});
    const point=new T.Vector3(0,1.16,-3),owner=cut.ownerSlot('a');
    expect(uniformContains(shader,point,owner,1)).toBe(true);
    expect(uniformContains(shader,point,cut.ownerSlot('b'),1)).toBe(false);
    expect(uniformContains(shader,point,owner,2)).toBe(false);expect(uniformContains(shader,point,owner,0)).toBe(false);
    expect(uniformContains(shader,new T.Vector3(.9,1.16,-3),owner,1)).toBe(false);
    expect(uniformContains(shader,new T.Vector3(0,1.16,-1),owner,1)).toBe(false);
    expect(uniformContains(shader,new T.Vector3(0,.1,-3),owner,1)).toBe(false);
    cut.dispose();mesh.geometry.dispose();source.dispose();
  });
  it('keeps ground/current/lower decks and stairs protected and invalidates a held ceiling immediately on ascent',()=>{
    const colliders=[box('a','floor')],parts=registry(colliders),deck=parts[0];deck.planePoint=[0,2,0];
    expect(cameraCutawayEligible({...deck,partSlot:0,level:0,category:'protected'},feet)).toBe(false);
    expect(cameraCutawayEligible(deck,feet)).toBe(true);
    expect(cameraCutawayEligible(deck,new T.Vector3(0,2,0))).toBe(false);
    expect(cameraCutawayEligible(deck,new T.Vector3(0,3,0))).toBe(false);
    expect(cameraCutawayEligible(deck,new T.Vector3(0,2-CAMERA_CUTAWAY_DECK_CLEARANCE,0))).toBe(false);
    const tilted={...deck,planePoint:[2,0,0] as [number,number,number],planeUp:[1,0,0] as [number,number,number]};
    expect(cameraCutawayEligible(tilted,new T.Vector3(1,200,0))).toBe(true);
    expect(cameraCutawayEligible(tilted,new T.Vector3(2,-200,0))).toBe(false);
    const cut=new TownCameraCutaway(['a'],parts),{mesh,source,shader}=registered(cut),w=world(colliders);
    expect(cut.update({world:w,camera:camera(),feet,up,dt:.016,enabled:true}).active).toBe(true);
    const d=cut.update({world:w,camera:camera(),feet:new T.Vector3(0,2,0),up,dt:.016,enabled:true});
    expect(d.active).toBe(false);expect(d.masks).toEqual([]);expect(shader.uniforms.uTownCutCount.value).toBe(0);
    cut.dispose();mesh.geometry.dispose();source.dispose();
  });
  it('does not bridge separated walls or allow a neighbouring unselected part in their gap',()=>{
    const colliders=[box('a','wall.solid',[0,1.16,-4]),box('a','wall.solid',[0,1.16,-2])],cut=new TownCameraCutaway(['a'],registry(colliders)),{mesh,source,shader}=registered(cut);
    const d=cut.update({world:world(colliders),camera:camera(),feet,up,dt:.016,enabled:true});
    expect(d.masks).toHaveLength(2);expect(d.masks.every(m=>m.sourceColliderIndices.length===1)).toBe(true);
    expect(uniformContains(shader,new T.Vector3(0,1.16,-3),cut.ownerSlot('a'),1)).toBe(false);
    expect(uniformContains(shader,new T.Vector3(0,1.16,-4),cut.ownerSlot('a'),1)).toBe(true);
    expect(uniformContains(shader,new T.Vector3(0,1.16,-4),cut.ownerSlot('a'),2)).toBe(false);
    cut.dispose();mesh.geometry.dispose();source.dispose();
  });
  it('retains bounded owner/part-mask budgets and unresolved overflow',()=>{
    expect(CAMERA_CUTAWAY_LIMITS.objects).toBe(4);expect(CAMERA_CUTAWAY_LIMITS.masks).toBe(12);
    for(const colliders of [Array.from({length:5},(_,i)=>box(`owner-${i}`,'wall.solid',[0,1.16,-1-i])),Array.from({length:13},(_,i)=>box('a','wall.solid',[0,1.16,-3],[1,1,.1],i*.04))]){
      const cut=new TownCameraCutaway([...new Set(colliders.map(c=>c.objectId))],registry(colliders));
      const d=cut.update({world:world(colliders),camera:camera(),feet,up,dt:.016,enabled:true});
      expect(d.objects.length).toBeLessThanOrEqual(4);expect(d.masks.length).toBeLessThanOrEqual(12);
      expect(d.overflow.objects+d.overflow.masks).toBeGreaterThan(0);expect(d.remainingHits.length).toBeGreaterThan(0);expect(d.renderClearVerified).toBe(false);cut.dispose();
    }
  });
  it('protects seventeen or more immutable parts by slot zero without exhausting protection boxes',()=>{
    const colliders=[box('a'),...Array.from({length:17},(_,i)=>box('a','stairs',[0,1.16,-3],[.08,.08,.08],i*.04))];
    const cut=new TownCameraCutaway(['a'],registry(colliders)),{mesh,source,shader}=registered(cut);
    const d=cut.update({world:world(colliders),camera:camera(),feet,up,dt:.016,enabled:true});
    expect(d.active).toBe(true);expect(d.masks).toHaveLength(1);expect(d.overflow.protected).toBe(0);expect(d.protectedMasks).toEqual([]);
    expect(d.partInventory.filter(p=>p.partSlot===0)).toHaveLength(17);
    expect(d.remainingHits.filter(h=>h.tag==='stairs').length).toBeGreaterThanOrEqual(17);
    expect(uniformContains(shader,new T.Vector3(0,1.16,-3),cut.ownerSlot('a'),0)).toBe(false);
    cut.dispose();mesh.geometry.dispose();source.dispose();
  });
  it('holds briefly, closes monotonically and restores on disable, world replacement and private mode',()=>{
    const colliders=[box('a')],cut=new TownCameraCutaway(['a'],registry(colliders)),{mesh,source,shader}=registered(cut),w=world(colliders);
    const input={world:w,camera:camera(),feet,up,dt:.1,enabled:true};expect(cut.update(input).active).toBe(true);
    const away={...input,camera:camera(20),feet:new T.Vector3(20,0,0)};let last=cut.update(away);expect(last.active).toBe(true);
    let previous=last.masks[0].amount;for(let i=0;i<6;i++){last=cut.update(away);const amount=last.masks[0]?.amount??0;expect(amount).toBeLessThanOrEqual(previous+1e-12);previous=amount;}
    expect(last.active).toBe(false);expect(shader.uniforms.uTownCutCount.value).toBe(0);
    expect(cut.update(input).active).toBe(true);expect(cut.update({...away,world:world([])}).active).toBe(false);
    expect(cut.update(input).active).toBe(true);expect(cut.update({...input,enabled:false}).active).toBe(false);
    expect(cut.update({...input,world:world(colliders,'private')}).active).toBe(false);cut.dispose();mesh.geometry.dispose();source.dispose();
  });
  it('preserves existing glass flags and declines depthWrite=false materials',()=>{
    const colliders=[box('a')],cut=new TownCameraCutaway(['a'],registry(colliders)),source=new T.MeshStandardMaterial({transparent:true,opacity:.6}),a=registered(cut,'a',source);
    expect(a.mesh.material).not.toBe(source);expect(a.mesh.material.transparent).toBe(true);expect(a.mesh.material.opacity).toBe(.6);expect(a.mesh.material.depthWrite).toBe(true);
    expect(source.transparent).toBe(true);expect(source.opacity).toBe(.6);expect(source.depthWrite).toBe(true);
    let d=cut.update({world:world(colliders),camera:camera(),feet,up,dt:.016,enabled:true});expect(d.addedTransparency).toBe(0);
    const unsupported=new T.MeshStandardMaterial({depthWrite:false}),other=registered(cut,'a',unsupported);
    expect(other.mesh.material).toBe(unsupported);d=cut.update({world:world(colliders),camera:camera(),feet,up,dt:.016,enabled:true});expect(d.unsupportedMaterials).toBe(1);
    cut.dispose();expect(a.mesh.material).toBe(source);a.mesh.geometry.dispose();other.mesh.geometry.dispose();source.dispose();unsupported.dispose();
  });
  it('keeps unannotated furniture/finish at slot zero even without a physics collider',()=>{
    const colliders=[box('a')],cut=new TownCameraCutaway(['a'],registry(colliders)),source=new T.MeshStandardMaterial(),mesh=new T.Mesh(new T.BoxGeometry(),source);
    cut.writeOwnerAttribute(mesh.geometry,'a');expect(new Set(Array.from(mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE).array))).toEqual(new Set([0]));cut.registerMesh(mesh);
    const shader=compile(mesh.material),d=cut.update({world:world(colliders),camera:camera(),feet,up,dt:.016,enabled:true});
    expect(d.masks).toHaveLength(1);expect(uniformContains(shader,new T.Vector3(0,1.16,-3),cut.ownerSlot('a'),0)).toBe(false);
    expect(d.bindings[0].partPairs).toEqual([{ownerSlot:cut.ownerSlot('a'),partSlot:0}]);
    cut.dispose();mesh.geometry.dispose();source.dispose();
  });
  it.each(['missing registry','wrong tag','wrong center','wrong half','wrong quaternion','duplicate index','extra collider'])('fails closed for the entire owner on %s',kind=>{
    const colliders=[box('a'),box('a','wall.window',[0,1.16,-2])],parts=registry(colliders),w=world(colliders);
    if(kind==='wrong tag')parts[0].expectedColliders[0].tag='wrong';
    if(kind==='wrong center')parts[0].expectedColliders[0].center[0]+=.1;
    if(kind==='wrong half')parts[0].expectedColliders[0].half[0]+=.1;
    if(kind==='wrong quaternion')parts[0].expectedColliders[0].inverseQuaternion=new T.Quaternion().setFromAxisAngle(up,.1).toArray();
    if(kind==='duplicate index')parts[1].expectedColliders[0].index=0;
    if(kind==='extra collider')w.bodies[0].colliders.push(box('a','wall.solid',[0,1.16,-1]));
    const cut=new TownCameraCutaway(['a'],kind==='missing registry'?[]:parts);
    const d=cut.update({world:w,camera:camera(),feet,up,dt:.016,enabled:true});
    expect(d.mappingProblems.length).toBeGreaterThan(0);expect(d.active).toBe(false);expect(d.masks).toEqual([]);
    expect(d.rawHits.length).toBeGreaterThan(0);expect(d.remainingHits).toHaveLength(d.rawHits.length);expect(d.rawHits.every(h=>h.partSlot===0&&!h.mappingValid)).toBe(true);cut.dispose();
  });
  it('keeps every installed uniform and held transition identical with diagnostics on, off or toggled',()=>{
    const owners=['a','b','c','d','e','f'];
    const colliders=[...Array.from({length:13},(_,i)=>box('a','wall.solid',[0,1.16,-3],[1,1,.1],i*.04)),
      ...Array.from({length:18},(_,i)=>box('a','stairs',[0,1.16,-3],[.08,.08,.08],i*.04)),
      ...['b','c','d','e'].map((id,i)=>box(id,'wall.solid',[0,1.16,-5+i*.25])),box('f','floor')];
    const parts=registry(colliders);parts.find(p=>p.objectId==='f')!.planePoint=[0,2,0];
    const source=new T.MeshStandardMaterial();
    const variants=Array.from({length:3},()=>{
      const cut=new TownCameraCutaway(owners,parts),bound=owners.map(owner=>registered(cut,owner,source));
      return{cut,bound,shader:bound[0].shader,geometries:bound.map(x=>x.mesh.geometry),materials:bound.map(x=>x.mesh.material)};
    });
    const one=world(colliders.filter(c=>c.objectId==='b')),manyParts=world(colliders.filter(c=>c.objectId==='a')),
      manyOwners=world(colliders),floor=world(colliders.filter(c=>c.objectId==='f'));
    const replacement=world(colliders.filter(c=>c.objectId==='b'));
    const mismatched=world([box('b','wall.solid',[.4,1.16,-5])]);
    const base={camera:camera(),feet,up,dt:.1,enabled:true};
    const sequence=[
      {label:'ordinary active',world:one},
      {label:'hold 1',world:one,camera:camera(20),feet:new T.Vector3(20,0,0)},
      ...Array.from({length:6},(_,i)=>({label:`restore ${i}`,world:one,camera:camera(20),feet:new T.Vector3(20,0,0)})),
      {label:'part budget with 18 immutable parts',world:manyParts},
      {label:'owner budget',world:manyOwners},
      {label:'overhead deck',world:floor},
      {label:'same deck becomes walking floor',world:floor,feet:new T.Vector3(0,2,0)},
      {label:'world replaced',world:replacement},
      {label:'mapping invalid after replacement',world:mismatched},
      {label:'resume ordinary',world:one},
      {label:'disabled',world:one,enabled:false},
      {label:'resume enabled',world:one},
      {label:'private ground',world:world(colliders.filter(c=>c.objectId==='b'),'private')},
    ];
    const observed={objects:false,masks:false,held:false,walkingFloor:false,mismatch:false};
    try{
      for(const [index,step] of sequence.entries()){
        // The first keeps the existing default API; the second never requests
        // a report; the third exercises off -> on state without rebuilding.
        const reports=variants.map((v,branch)=>v.cut.update({...base,...step,...(branch===0?{}:{diagnostics:branch===2&&index%2===0})}));
        expect(reports[1],step.label+' off report').toBeNull();
        if(index%2)expect(reports[2],step.label+' toggled-off report').toBeNull();
        else expect(reports[2],step.label+' toggled-on report').not.toBeNull();
        const diagnostic=reports[0];expect(diagnostic,step.label+' default schema').not.toBeNull();if(!diagnostic)throw Error('Default diagnostics missing');
        expect(diagnostic.schema).toBe('part-slots-v2');
        expect(diagnostic.renderClearVerified).toBe(false);
        if(reports[2]){
          // On-after-off must retain indices accumulated while no report was
          // allocated, including a held mask no longer in this frame's hits.
          expect(reports[2].masks,step.label+' held source indices').toEqual(diagnostic.masks);
          expect(reports[2].rawHits).toEqual(diagnostic.rawHits);
          expect(reports[2].partInventory).toEqual(diagnostic.partInventory);
          expect(reports[2].overflow).toEqual(diagnostic.overflow);
        }
        const expected=uniformSnapshot(variants[0].shader);
        for(const v of variants.slice(1))expect(uniformSnapshot(v.shader),step.label+' uniforms').toEqual(expected);
        for(const v of variants)for(const [i,b] of v.bound.entries()){
          expect(b.mesh.geometry,step.label+' geometry identity').toBe(v.geometries[i]);
          expect(b.mesh.material,step.label+' material identity').toBe(v.materials[i]);
          expect(b.mesh.material.opacity).toBe(1);expect(b.mesh.material.transparent).toBe(false);expect(b.mesh.material.depthWrite).toBe(true);
        }
        observed.objects ||= diagnostic.overflow.objects>0;observed.masks ||= diagnostic.overflow.masks>0;
        if(step.label==='hold 1')observed.held=diagnostic.active;
        if(step.label==='same deck becomes walking floor')observed.walkingFloor=!diagnostic.active&&diagnostic.masks.length===0;
        if(step.label==='mapping invalid after replacement')observed.mismatch=diagnostic.mappingProblems.length>0&&!diagnostic.active;
        if(step.label==='disabled'||step.label==='private ground')expect(variants[0].shader.uniforms.uTownCutCount.value).toBe(0);
      }
      expect(observed).toEqual({objects:true,masks:true,held:true,walkingFloor:true,mismatch:true});
      for(const v of variants){v.cut.dispose();v.cut.dispose();for(const b of v.bound)expect(b.mesh.material).toBe(source);}
      const disposed=uniformSnapshot(variants[0].shader);expect(variants[0].shader.uniforms.uTownCutCount.value).toBe(0);
      for(const v of variants.slice(1))expect(uniformSnapshot(v.shader)).toEqual(disposed);
      const afterDispose=variants.map((v,i)=>v.cut.update({...base,world:one,diagnostics:i===0}));
      expect(afterDispose[0]?.active).toBe(false);expect(afterDispose[1]).toBeNull();expect(afterDispose[2]).toBeNull();
      for(const v of variants.slice(1))expect(uniformSnapshot(v.shader)).toEqual(uniformSnapshot(variants[0].shader));
    }finally{for(const v of variants){v.cut.dispose();for(const b of v.bound)b.mesh.geometry.dispose();}source.dispose();}
  });

  it('keeps cached budgets exact and parent visibility immediate across diagnostic-off and registration changes',()=>{
    const colliders=[box('a'),box('b')],cut=new TownCameraCutaway(['a','b'],registry(colliders)),source=new T.MeshStandardMaterial();
    const a=registered(cut,'a',source),b=registered(cut,'b',source),outer=new T.Group(),inner=new T.Group();outer.add(inner);inner.add(b.mesh);
    const w=world(colliders),input={world:w,camera:camera(),feet,up,dt:.016,enabled:true};
    const extra=(mesh:T.Mesh)=>mesh.geometry.getAttribute('townCameraOwner').array.byteLength+mesh.geometry.getAttribute(CAMERA_PART_ATTRIBUTE).array.byteLength;
    try{
      expect(cut.update({...input,diagnostics:false})).toBeNull();
      let d=cut.update(input);expect(d.boundMeshes).toBe(2);expect(d.clonedMaterials).toBe(1);expect(d.extraGeometryBytes).toBe(extra(a.mesh)+extra(b.mesh));
      expect(new Set(d.bindings.map(x=>x.mesh))).toEqual(new Set([a.mesh.uuid,b.mesh.uuid]));
      cut.registerMesh(a.mesh);cut.registerMesh(a.mesh);d=cut.update(input);
      expect(d.boundMeshes).toBe(2);expect(d.clonedMaterials).toBe(1);expect(d.extraGeometryBytes).toBe(extra(a.mesh)+extra(b.mesh));
      outer.visible=false;expect(cut.update({...input,diagnostics:false})).toBeNull();d=cut.update(input);
      expect(d.bindings.map(x=>x.mesh)).toEqual([a.mesh.uuid]);expect(d.extraGeometryBytes).toBe(extra(a.mesh)+extra(b.mesh));
      outer.visible=true;inner.visible=false;d=cut.update(input);expect(d.bindings.map(x=>x.mesh)).toEqual([a.mesh.uuid]);
      inner.visible=true;d=cut.update(input);expect(new Set(d.bindings.map(x=>x.mesh))).toEqual(new Set([a.mesh.uuid,b.mesh.uuid]));
      cut.unregisterMesh(a.mesh);cut.unregisterMesh(a.mesh);expect(a.mesh.material).toBe(source);
      expect(cut.update({...input,diagnostics:false})).toBeNull();d=cut.update(input);
      expect(d.boundMeshes).toBe(1);expect(d.clonedMaterials).toBe(1);expect(d.extraGeometryBytes).toBe(extra(b.mesh));expect(d.bindings.map(x=>x.mesh)).toEqual([b.mesh.uuid]);
      cut.unregisterMesh(b.mesh);cut.unregisterMesh(b.mesh);d=cut.update(input);
      expect(d.boundMeshes).toBe(0);expect(d.clonedMaterials).toBe(0);expect(d.extraGeometryBytes).toBe(0);expect(d.bindings).toEqual([]);
      cut.dispose();cut.dispose();d=cut.update(input);
      expect(d.active).toBe(false);expect(d.boundMeshes).toBe(0);expect(d.clonedMaterials).toBe(0);expect(d.extraGeometryBytes).toBe(0);expect(d.bindings).toEqual([]);
    }finally{cut.dispose();a.mesh.geometry.dispose();b.mesh.geometry.dispose();source.dispose();}
  });

  it('keeps owner and part provenance stable through low, medium and global batching',()=>{
    const objects=[{id:'a',kind:'structure',position:[0,1,0],rotation:0,version:1},{id:'b',kind:'structure',position:[.08,.9968,0],rotation:0,version:1}] as PlacedObject[];
    const colliders=[box('a'),box('b')],parts=registry(colliders);parts[0].partSlot=7;parts[1].partSlot=9;
    const source=new T.MeshStandardMaterial(),town=createTownRenderer({objects,planetRadius:21.6,cameraCutaway:true,cameraCutawayParts:parts,maxBuildsPerUpdate:2,
      buildObject(o,lod){const root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(1,lod==='low'?2:2.1,1),source);
        mesh.geometry.setAttribute(CAMERA_PART_ATTRIBUTE,new T.Uint16BufferAttribute(new Uint16Array(mesh.geometry.attributes.position.count).fill(o.id==='a'?7:9),1));
        root.add(mesh);root.position.fromArray(o.position).multiplyScalar(22);return{object:root,dispose(){mesh.geometry.dispose();}};}});
    const inspect=()=>{let vertices=0;town.root.traverseVisible(o=>{if(!(o instanceof T.Mesh))return;const a=o.geometry.getAttribute('townCameraOwner'),p=o.geometry.getAttribute(CAMERA_PART_ATTRIBUTE);expect(a).toBeDefined();expect(p).toBeDefined();
      const ranges=o.userData.townFaceRanges as {first:number;count:number;objectId:string}[];
      for(const range of ranges)for(let i=range.first*3;i<(range.first+range.count)*3;i++){expect(a.getX(i)).toBe(town.cutaway!.ownerSlot(range.objectId));expect(p.getX(i)).toBe(range.objectId==='a'?7:9);vertices++;}
    });expect(vertices).toBeGreaterThan(0);
      const input={world:world(colliders),camera:camera(),feet,up,dt:.016,enabled:true};
      expect(town.cutaway!.update({...input,diagnostics:false})).toBeNull();
      const d=town.cutaway!.update(input),visible=new Set<string>();town.root.traverseVisible(o=>{if(o instanceof T.Mesh)visible.add(o.uuid);});
      expect(d.bindings.length).toBeGreaterThan(0);for(const binding of d.bindings)expect(visible.has(binding.mesh),'only current LOD/global parents are reported').toBe(true);
      const before=d.bindings.map(x=>x.mesh);town.root.visible=false;
      expect(town.cutaway!.update(input).bindings).toEqual([]);town.root.visible=true;
      expect(town.cutaway!.update(input).bindings.map(x=>x.mesh)).toEqual(before);
    };
    inspect();town.update(new T.Vector3(0,24,0));expect(town.stats().mediumChunks).toBeGreaterThan(0);inspect();
    town.update(new T.Vector3(0,80,0),undefined,{globalLow:true});expect(town.stats().globalLowBatch).toBe(true);inspect();
    town.update(new T.Vector3(0,24,0));inspect();town.dispose();source.dispose();
  });
});

// An independent evaluation of only the installed physical capsule branch.
// The shader source assertions below prove it is OR-ed beside, not nested in,
// the visual cone. This is still CPU evidence, never a rendered-pixel claim.
function physicalCapsuleContains(shader:Shader,point:T.Vector3,owner:number,partSlot:number){
  const u=shader.uniforms,start=(u.uTownCutCapsuleStart.value as T.Vector3),end=(u.uTownCutCapsuleEnd.value as T.Vector3);
  const axis=end.clone().sub(start),lengthSq=axis.lengthSq();
  const along=lengthSq?Math.max(0,Math.min(1,point.clone().sub(start).dot(axis)/lengthSq)):0;
  if(point.distanceTo(start.clone().addScaledVector(axis,along))>.22||owner<=.5||partSlot<=.5)return false;
  for(let i=0;i<Number(u.uTownCutCount.value);i++){
    if((u.uTownCutPhysical.value as Float32Array)[i]<.5)continue;
    const c=(u.uTownCutCenter.value as T.Vector4[])[i],h=(u.uTownCutHalf.value as T.Vector4[])[i],q=(u.uTownCutInverse.value as T.Vector4[])[i];
    const local=point.clone().sub(new T.Vector3(c.x,c.y,c.z)).applyQuaternion(new T.Quaternion(q.x,q.y,q.z,q.w));
    if(Math.abs(owner-c.w)<.25&&Math.abs(partSlot-(u.uTownCutPart.value as Float32Array)[i])<.25
      &&Math.abs(local.x)<=h.x&&Math.abs(local.y)<=h.y&&Math.abs(local.z)<=h.z)return true;
  }
  return false;
}

describe('frozen cutaway frame plan and physical shader capsule (CPU only)',()=>{
  it('keeps candidates pure, snapshots inputs, and commits the exact chosen masks without re-selection',()=>{
    const colliders=[box('a','wall.solid',[0,1.16,0],[1,1,.3])],cut=new TownCameraCutaway(['a'],registry(colliders)),w=world(colliders);
    const {mesh,source,shader}=registered(cut),eye=new T.Vector3(0,1.16,0),view=new T.Vector3(0,0,1),f=new T.Vector3(0,0,2);
    const before=uniformSnapshot(shader),input={world:w,eye,feet:f,up,direction:view,dt:.016,cameraException:true};
    const chosen=cut.planFrame(input),other=cut.planFrame({...input,eye:eye.clone().addScaledVector(view,.05)});
    expect(chosen.ready).toBe(true);expect(other.ready).toBe(true);expect(uniformSnapshot(shader)).toEqual(before);
    expect(cut.validateFramePlan(chosen)).toBe(true);expect(cut.validateFramePlan({...chosen})).toBe(false);
    eye.x=80;f.y=90;view.z=-1;
    expect(chosen.eye).toEqual([0,1.16,0]);expect(chosen.feet).toEqual([0,0,2]);expect(chosen.direction).toEqual([0,0,1]);
    expect(Object.isFrozen(chosen)).toBe(true);expect(Object.isFrozen(chosen.masks)).toBe(true);expect(Object.isFrozen(chosen.cameraCapsule.start)).toBe(true);
    expect(Reflect.set(chosen.masks[0].half,0,100)).toBe(false);
    const reselect=vi.spyOn(cut,'planFrame'),d=cut.commitFrame(chosen)!;
    expect(reselect).not.toHaveBeenCalled();expect(d.masks).toEqual(chosen.masks);
    expect(d.framePlan).toMatchObject({worldRevision:chosen.worldRevision,planetId:chosen.planetId,cameraException:true,eye:chosen.eye,feet:chosen.feet,up:chosen.up,direction:chosen.direction});
    expect(shader.uniforms.uTownCutCount.value).toBe(chosen.masks.length);
    expect((shader.uniforms.uTownCutCapsuleStart.value as T.Vector3).toArray()).toEqual(chosen.cameraCapsule.start);
    expect((shader.uniforms.uTownCutCapsuleEnd.value as T.Vector3).toArray()).toEqual(chosen.cameraCapsule.end);
    for(const [i,m] of chosen.masks.entries()){
      expect((shader.uniforms.uTownCutCenter.value as T.Vector4[])[i].toArray()).toEqual([...m.center,m.ownerSlot]);
      expect((shader.uniforms.uTownCutHalf.value as T.Vector4[])[i].toArray()).toEqual([...m.half,m.amount]);
      expect((shader.uniforms.uTownCutPart.value as Float32Array)[i]).toBe(m.partSlot);
      expect((shader.uniforms.uTownCutPhysical.value as Float32Array)[i]).toBe(Number(m.physical));
    }
    expect(cut.validateFramePlan(chosen)).toBe(false);expect(cut.validateFramePlan(other)).toBe(false);expect(()=>cut.commitFrame(other)).toThrow();
    cut.dispose();mesh.geometry.dispose();source.dispose();
  });

  it('keeps a disjoint eight-corner optical inventory from changing selected masks or installed shader uniforms',()=>{
    const colliders=[box('a','wall.solid',[0,1.16,0],[1,1,.3]),box('protected','structure.column',[4,1.2,1],[.1,.5,.1])];
    const w=world(colliders),one=new TownCameraCutaway(['a'],registry(colliders)),two=new TownCameraCutaway(['a'],registry(colliders));
    const a=registered(one),b=registered(two),points:[number,number,number][]=[4.9,5.1].flatMap(x=>[.5,2].flatMap(y=>[1.9,2.1].map(z=>[x,y,z] as [number,number,number])));
    try{
      const input={world:w,eye:new T.Vector3(0,1.16,0),feet:new T.Vector3(0,0,2),up,direction:new T.Vector3(0,0,1),dt:.016,cameraException:true};
      const plain=one.planFrame(input),expanded=two.planFrame({...input,opticalTargetPoints:points});
      expect(plain.opticalCandidates).toEqual([]);expect(expanded.opticalCandidates.some(p=>p.objectId==='protected')).toBe(true);
      expect(expanded.masks).toEqual(plain.masks);expect(expanded.rayTargets).toEqual(plain.rayTargets);expect(expanded.rawHits).toEqual(plain.rawHits);
      const saved=points.map(p=>[...p]);points[0][0]=400;points.push([600,600,600]);
      expect(expanded.opticalTargetPoints).toEqual(saved);expect(Object.isFrozen(expanded.opticalTargetPoints)).toBe(true);
      expect(expanded.opticalTargetPoints.every(Object.isFrozen)).toBe(true);expect(expanded.opticalCandidates.every(Object.isFrozen)).toBe(true);
      one.commitFrame(plain);two.commitFrame(expanded);expect(uniformSnapshot(a.shader)).toEqual(uniformSnapshot(b.shader));
    }finally{one.dispose();two.dispose();a.mesh.geometry.dispose();b.mesh.geometry.dispose();a.source.dispose();b.source.dispose();}
  });

  it('requires an eligible part between the old guard rays at full visual amount without granting physical authority or cutting its whole mesh',()=>{
    const colliders=[box('a','wall.solid',[.10,1.16,-3],[.012,.012,.02]),box('protected','structure.column',[-.10,1.16,-3],[.012,.012,.02])];
    const parts=registry(colliders);parts[0].half=[1,.012,.02]; // Visual wall is wider than its one small physics proxy.
    const cut=new TownCameraCutaway(['a','protected'],parts),w=world(colliders),a=registered(cut),points:[number,number,number][]=[-.3,.3].flatMap(x=>[1.06,1.26].flatMap(y=>[-.05,.05].map(z=>[x,y,z] as [number,number,number])));
    try{
      const input={world:w,eye:new T.Vector3(0,1.16,-6),feet,up,direction:new T.Vector3(0,0,1),dt:.016,cameraException:true};
      const legacy=cut.planFrame(input),selected=cut.planFrame({...input,opticalTargetPoints:points});
      expect(legacy.rawHits).toEqual([]);expect(legacy.masks).toEqual([]);expect(selected.rawHits).toEqual([]);
      expect(selected.ready).toBe(true);expect(selected.visualRequiredParts).toEqual([{key:'a|part:1',objectId:'a',partSlot:1,sourceColliderIndices:[0]}]);
      expect(selected.masks).toHaveLength(1);expect(selected.masks[0]).toMatchObject({objectId:'a',partSlot:1,amount:1,physical:false});
      expect(selected.mandatoryParts).toEqual([]);
      const protectedPart=selected.opticalCandidates.find(p=>p.objectId==='protected')!;
      expect(protectedPart.avatarShadowOverlap).toBe(true);expect(protectedPart.eligible).toBe(false);expect(protectedPart.maskKey).toBeNull();
      cut.commitFrame(selected);const owner=cut.ownerSlot('a');
      expect(uniformContains(a.shader,new T.Vector3(.10,1.16,-3),owner,1)).toBe(true);
      expect(uniformContains(a.shader,new T.Vector3(.9,1.16,-3),owner,1)).toBe(false); // Same selected visual OBB, outside finite cone.
      expect(uniformContains(a.shader,new T.Vector3(.10,1.16,-3),owner,2)).toBe(false);
      expect(uniformContains(a.shader,new T.Vector3(-.10,1.16,-3),cut.ownerSlot('protected'),0)).toBe(false);
      expect((a.shader.uniforms.uTownCutPhysical.value as Float32Array)[0]).toBe(0);
    }finally{cut.dispose();a.mesh.geometry.dispose();a.source.dispose();}
  });

  it.each([[13,1],[1,5]])('fails closed when %i actual-shadow parts across %i owners exceed the unchanged budget', (partCount,ownerCount)=>{
    const colliders=Array.from({length:ownerCount},(_,owner)=>Array.from({length:partCount},()=>box(`required-${owner}`,'wall.solid',[.10,1.16,-3],[.012,.012,.02]))).flat();
    const parts=registry(colliders),cut=new TownCameraCutaway([...new Set(colliders.map(c=>c.objectId))],parts),w=world(colliders);
    const bindings=parts.map(part=>registered(cut,part.objectId,new T.MeshStandardMaterial(),part.partSlot));
    const points:[number,number,number][]=[-.3,.3].flatMap(x=>[1.06,1.26].flatMap(y=>[-.05,.05].map(z=>[x,y,z] as [number,number,number])));
    try{
      const selected=cut.planFrame({world:w,eye:new T.Vector3(0,1.16,-6),feet,up,direction:new T.Vector3(0,0,1),dt:.016,cameraException:true,opticalTargetPoints:points});
      expect(selected.rawHits).toEqual([]);expect(selected.visualRequiredParts).toHaveLength(partCount*ownerCount);
      expect(selected.ready).toBe(false);expect(selected.reasons.some(r=>r.startsWith('visual-mask-budget:'))).toBe(true);
      expect(selected.masks.length).toBeLessThanOrEqual(12);expect(new Set(selected.masks.map(m=>m.objectId)).size).toBeLessThanOrEqual(4);
      expect(selected.masks.every(m=>m.amount===1&&!m.physical)).toBe(true);expect(selected.mandatoryParts).toEqual([]);
      expect(()=>cut.commitFrame(selected)).toThrow();
    }finally{cut.dispose();for(const b of bindings){b.mesh.geometry.dispose();b.source.dispose();}}
  });

  it('rejects incomplete avatar corner groups while omitted points keep the legacy guard path',()=>{
    const colliders=[box('a')],cut=new TownCameraCutaway(['a'],registry(colliders)),w=world(colliders),a=registered(cut);
    try{
      const input={world:w,eye:new T.Vector3(0,1.16,-6),feet,up,direction:new T.Vector3(0,0,1),dt:.016,cameraException:true};
      const legacy=cut.planFrame(input),invalid=cut.planFrame({...input,opticalTargetPoints:[[0,1,0],[0,1.5,0]]});
      expect(legacy.ready).toBe(true);expect(legacy.visualRequiredParts).toEqual([]);
      expect(invalid.ready).toBe(false);expect(invalid.reasons).toContain('invalid-avatar-box-groups');
      expect(()=>cut.commitFrame(invalid)).toThrow();
    }finally{cut.dispose();a.mesh.geometry.dispose();a.source.dispose();}
  });

  it('keeps .22 endpoint caps outside the cone, below minHeight and independent of visual amount',()=>{
    const colliders=[box('a','wall.solid',[0,.1,0],[1,1,1])],cut=new TownCameraCutaway(['a','b'],registry(colliders)),w=world(colliders);
    const {mesh,source,shader}=registered(cut),eye=new T.Vector3(0,.1,0);
    const selected=cut.planFrame({world:w,eye,feet,up,direction:new T.Vector3(0,0,1),dt:.016,cameraException:true});
    expect(selected.ready).toBe(true);cut.commitFrame(selected);
    // Inspect the installed source, not a substitute shader or material.
    expect(shader.fragmentShader).toContain('bool townCutCapsule = distance(');
    const radiusLiteral=shader.fragmentShader.match(/bool townCutCapsule = [^;]+ <= ([\d.]+);/);
    expect(radiusLiteral).not.toBeNull();expect(Number(radiusLiteral![1])).toBe(.22);
    expect(shader.fragmentShader).toContain('|| (uTownCutPhysical[i] > .5 && townCutCapsule)');
    expect(shader.fragmentShader).toContain('if (uTownCutCount > 0 && vTownCutOwner > .5 && vTownCutPart > .5)');
    const owner=cut.ownerSlot('a');
    for(const offset of [[.219,0,0],[-.219,0,0],[0,0,.219],[0,0,-.219]]){
      const point=eye.clone().add(new T.Vector3(...offset));
      expect(uniformContains(shader,point,owner,1)).toBe(false); // y=.1 is protected by the old optical minHeight.
      expect(physicalCapsuleContains(shader,point,owner,1)).toBe(true);
    }
    expect(physicalCapsuleContains(shader,eye.clone().add(new T.Vector3(.221,0,0)),owner,1)).toBe(false);
    expect(physicalCapsuleContains(shader,eye,cut.ownerSlot('b'),1)).toBe(false);
    expect(physicalCapsuleContains(shader,eye,owner,0)).toBe(false);expect(physicalCapsuleContains(shader,eye,owner,2)).toBe(false);
    // Even an optical fade value must not accidentally rescale the separate
    // physical capsule. Production physical plans themselves use amount=1.
    (shader.uniforms.uTownCutHalf.value as T.Vector4[])[0].w=.90;
    expect(physicalCapsuleContains(shader,eye.clone().add(new T.Vector3(.215,0,0)),owner,1)).toBe(true);
    cut.reset();expect(shader.uniforms.uTownCutCount.value).toBe(0);
    cut.dispose();mesh.geometry.dispose();source.dispose();
  });

  it('covers the full short swept capsule and both caps while a degenerate visual cone grants nothing',()=>{
    const colliders=[box('a','wall.solid',[0,1.16,0],[1,1,1])],cut=new TownCameraCutaway(['a'],registry(colliders)),w=world(colliders);
    const {mesh,source,shader}=registered(cut),start=new T.Vector3(0,1.16,-.25),eye=new T.Vector3(0,1.16,.25),view=new T.Vector3(0,0,1);
    cut.commitFrame(cut.planFrame({world:w,eye:start,feet:start.clone().addScaledVector(up,-1.16),up,direction:view,dt:.016,cameraException:true}));
    const chosen=cut.planFrame({world:w,eye,previousEye:start,feet:eye.clone().addScaledVector(up,-1.16),up,direction:view,dt:.016,cameraException:true});
    expect(chosen.ready).toBe(true);expect(chosen.visualCone.length).toBe(0);cut.commitFrame(chosen);
    const owner=cut.ownerSlot('a');
    for(const p of [start.clone().addScaledVector(view,-.219),eye.clone().addScaledVector(view,.219),new T.Vector3(.219,1.16,0)]){
      expect(uniformContains(shader,p,owner,1)).toBe(false);expect(physicalCapsuleContains(shader,p,owner,1)).toBe(true);
    }
    expect(physicalCapsuleContains(shader,start.clone().addScaledVector(view,-.221),owner,1)).toBe(false);
    expect(physicalCapsuleContains(shader,new T.Vector3(.221,1.16,0),owner,1)).toBe(false);
    // Switching to visual-only has no physical authority, including held masks.
    cut.update({world:w,camera:camera(),feet,up,dt:.016,enabled:true});
    expect(Array.from((shader.uniforms.uTownCutPhysical.value as Float32Array)).slice(0,Number(shader.uniforms.uTownCutCount.value)).every(v=>v===0)).toBe(true);
    cut.dispose();mesh.geometry.dispose();source.dispose();
  });

  it('revalidates current parent visibility and actual material before committing an exception plan',()=>{
    const colliders=[box('a','wall.solid',[0,1.16,0],[1,1,.3])],cut=new TownCameraCutaway(['a'],registry(colliders)),w=world(colliders);
    const {mesh,source}=registered(cut),parent=new T.Group();parent.add(mesh);
    const plan=cut.planFrame({world:w,eye:new T.Vector3(0,1.16,0),feet,up,direction:new T.Vector3(0,0,1),dt:.016,cameraException:true});
    expect(plan.ready).toBe(true);expect(cut.validateFramePlan(plan)).toBe(true);
    parent.visible=false;expect(cut.validateFramePlan(plan)).toBe(false);expect(()=>cut.commitFrame(plan)).toThrow();
    parent.visible=true;expect(cut.validateFramePlan(plan)).toBe(true);
    const clone=mesh.material;mesh.material=source;expect(cut.validateFramePlan(plan)).toBe(false);expect(()=>cut.commitFrame(plan)).toThrow();
    mesh.material=clone;expect(cut.validateFramePlan(plan)).toBe(true);cut.commitFrame(plan);
    cut.dispose();mesh.geometry.dispose();source.dispose();
  });

  it('invalidates pending authentic plans after binding, generation or world replacement',()=>{
    const colliders=[box('a','wall.solid',[0,1.16,0],[1,1,.3])],cut=new TownCameraCutaway(['a'],registry(colliders)),w=world(colliders);
    const {mesh,source}=registered(cut),input={world:w,eye:new T.Vector3(0,1.16,0),feet,up,direction:new T.Vector3(0,0,1),dt:.016,cameraException:true};
    let plan=cut.planFrame(input);cut.unregisterMesh(mesh);expect(cut.validateFramePlan(plan)).toBe(false);expect(()=>cut.commitFrame(plan)).toThrow();
    cut.registerMesh(mesh);plan=cut.planFrame(input);cut.reset();expect(cut.validateFramePlan(plan)).toBe(false);
    plan=cut.planFrame(input);cut.planFrame({...input,world:world(colliders)});expect(cut.validateFramePlan(plan)).toBe(false);
    const last=cut.planFrame(input);cut.dispose();expect(cut.validateFramePlan(last)).toBe(false);expect(()=>cut.commitFrame(last)).toThrow();
    mesh.geometry.dispose();source.dispose();
  });
});
