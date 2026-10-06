import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import * as T from 'three';
import {geometrySnapshot} from './lod-r4-fixture.ts';
import {StyleLibrary} from '../src/assets/claude-geometry/style/materials.ts';
import {PartBuilder,hexHead} from '../src/assets/claude-geometry/style/geometry.ts';
import {buildBlueprintModel} from '../src/assets/claude-geometry/blueprint/model3d.ts';
import {industrialCabin} from '../src/assets/claude-geometry/blueprint/samples.ts';
import {buildPart} from '../src/assets/claude-geometry/blueprint/parts/catalogue.ts';
import {disposeObject3D,ResourceTracker} from '../src/assets/claude-geometry/core/dispose.ts';
import {createShipModel} from '../src/assets/claude-geometry/ship/factory.ts';
import {STARTERS} from '../src/assets/claude-geometry/ship/design.ts';
it('retains pre-R4 contracts across 78 fixtures, accounting for the measured rotated window hood corner',()=>{
 const before=JSON.parse(readFileSync('docs/evidence/lod-r4/before-geometry.json','utf8')) as ReturnType<typeof geometrySnapshot>,after=geometrySnapshot();
 expect(after.parts).toEqual(before.parts);expect(after.entries.length).toBe(78);
 for(const [i,row] of after.entries.entries()){
  const old=before.entries[i];expect([row.id,row.lod]).toEqual([old.id,old.lod]);
  // Removing the 4 mm chamfer on the window's 0.2-radian sun hood restores
  // its corner: the render-only bound grows by sin(0.2)*0.004 = 0.795 mm.
  // Only these known axes differ; door/floor/stair and ship bounds remain exact.
  const h=Math.sin(.2)*.004,hood:Record<string,number[]>={'wall.window':[0,0,0,0,0,h],cabin:[-h,0,-h,h,0,h],survey:[0,0,-h,h,0,0]};
  const delta=row.lod==='medium'?hood[row.id]:undefined;
  row.bounds.forEach((v,j)=>expect(v,`${row.id} ${row.lod} bound ${j}`).toBeCloseTo(old.bounds[j]+(delta?.[j]??0),6));
  expect(row.emitters).toEqual(old.emitters);expect(row.sockets).toEqual(old.sockets);expect(row.calls).toBe(old.calls);expect(row.triangles).toBeLessThanOrEqual(old.triangles);if(row.lod==='low')expect(row.triangles).toBe(old.triangles);
  if('radius' in row&&'radius' in old){expect(row.radius).toBe(old.radius);expect(row.solidBounds).toEqual(old.solidBounds);expect(row.exhausts).toEqual(old.exhausts);}
 }
 const medium=(s:typeof after)=>s.entries.filter(r=>r.lod==='medium').reduce((n,r)=>n+r.triangles,0);expect(medium(after)).toBeLessThan(medium(before));
 writeFileSync('docs/evidence/lod-r4/after-geometry.json',JSON.stringify(after,null,2)+'\n');
});
it('preserves visible bolt surfaces and default chamfers for non-kit builders',()=>{
 const radius=.014,height=radius*.9,head=hexHead(radius,height),old=new T.CylinderGeometry(radius,radius,height,6).toNonIndexed();
 const faces=(g:T.BufferGeometry)=>{const pos=g.getAttribute('position'),normal=g.getAttribute('normal'),sides:string[]=[],top:number[]=[];for(let i=0;i<pos.count;i+=3){const a=new T.Vector3().fromBufferAttribute(pos,i),b=new T.Vector3().fromBufferAttribute(pos,i+1),c=new T.Vector3().fromBufferAttribute(pos,i+2),cross=new T.Vector3().crossVectors(b.sub(a),c.sub(a));expect(cross.clone().normalize().dot(new T.Vector3().fromBufferAttribute(normal,i))).toBeGreaterThan(.8);if(cross.y>0)top.push(cross.length()/2);if(Math.abs(cross.clone().normalize().y)<.5)sides.push([0,1,2].map(k=>[pos.getX(i+k),pos.getY(i+k),pos.getZ(i+k),normal.getX(i+k),normal.getY(i+k),normal.getZ(i+k)].map(v=>Math.abs(v)<5e-7?'0':v.toFixed(6)).join(',')).join('|'));}return{sides:sides.sort(),top:top.reduce((a,b)=>a+b,0)};};
 expect(head.getAttribute('position').count/3).toBe(16);expect(faces(head)).toEqual(faces(old));head.dispose();old.dispose();
 const lib=new StyleLibrary('medium');try{const b=new PartBuilder('medium');expect(b.minChamfer).toBe(0);b.box(lib.preset('frame'),[1,1,1],{},.004);const built=b.build();expect(built.triangles).toBe(44);disposeObject3D(built.group);}finally{lib.dispose();}
});
it('keeps exterior shadows and received lining shadows in both individual and assembled buildings',()=>{
 for(const lod of ['medium','high'] as const){const lib=new StyleLibrary(lod),model=buildBlueprintModel(industrialCabin(),lib,lod),part=buildPart('wall.solid',lib);try{for(const group of [model.object,part.group]){const meshes:T.Mesh[]=[];group.traverse(o=>{if((o as T.Mesh).isMesh)meshes.push(o as T.Mesh);});const lining=meshes.filter(m=>(m.material as T.Material).name==='custom:blueprint:lining');expect(lining.length).toBe(1);expect(lining[0].castShadow).toBe(false);expect(lining[0].receiveShadow).toBe(true);expect(meshes.find(m=>(m.material as T.Material).name==='cladding')!.castShadow).toBe(true);}}finally{model.dispose();disposeObject3D(part.group);lib.dispose();}}
});
it('releases owned geometry once while a sibling building and ship retain shared materials',()=>{
 const lib=new StyleLibrary('medium'),shared=lib.preset('frame');let sharedDisposals=0;shared.addEventListener('dispose',()=>sharedDisposals++);
 const a=buildBlueprintModel(industrialCabin(),lib),b=buildBlueprintModel(industrialCabin(),lib),ship=createShipModel(STARTERS[0],lib,'medium',{decal:null}),track=new ResourceTracker().track(a.object);const initial=track.counts();expect(initial.geometries).toBeGreaterThan(0);a.dispose();a.dispose();expect(track.counts()).toEqual({geometries:0,materials:0,textures:0});expect(sharedDisposals).toBe(0);expect(lib.preset('frame')).toBe(shared);
 const again=buildBlueprintModel(industrialCabin(),lib);expect(again.triangles).toBe(b.triangles);const rest=new ResourceTracker().track(b.object).track(ship.object).track(again.object);b.dispose();ship.dispose();again.dispose();expect(rest.counts()).toEqual({geometries:0,materials:0,textures:0});expect(sharedDisposals).toBe(0);lib.dispose();expect(sharedDisposals).toBe(1);
});
