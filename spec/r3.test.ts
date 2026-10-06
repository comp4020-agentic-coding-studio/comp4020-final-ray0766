import {expect,it,inject} from 'vitest';
import * as T from 'three';
import {rankFittings,PracticalLights} from '../src/assets/claude-geometry/style/practical.ts';
import {disposeObject3D} from '../src/assets/claude-geometry/core/dispose.ts';
import {buildBlueprintModel} from '../src/assets/claude-geometry/blueprint/model3d.ts';
import {industrialCabin} from '../src/assets/claude-geometry/blueprint/samples.ts';
import {StyleLibrary} from '../src/assets/claude-geometry/style/materials.ts';
import {CLAUDE_ASSET_ROOT} from '../src/shared/asset-release.ts';
it('fittings follow the existing rotated building anchor and ghost exclusion without adding per-building lights',()=>{
 const library=new StyleLibrary('medium'),model=buildBlueprintModel(industrialCabin().parts,library,'medium'),scene=new T.Scene(),camera=new T.PerspectiveCamera(),pool=new PracticalLights('medium');
 try{scene.add(model.object,pool.group);model.object.position.set(3,10,1);model.object.rotation.z=1;scene.updateMatrixWorld(true);camera.position.set(3,11,4);camera.updateMatrixWorld();
 const ranked=rankFittings(scene,camera.position,16);expect(ranked.some(f=>f.kind==='ceiling')).toBe(true);const emitter=model.object.userData.emitters.find((e:{kind:string})=>e.kind==='door');
 const expected=new T.Vector3(...emitter.position).applyMatrix4(model.object.matrixWorld);expect(ranked.find(f=>f.kind==='door')!.position.distanceTo(expected)).toBeLessThan(.001);
 pool.update(scene,camera,1);expect(pool.stats().slots).toEqual({spots:2,points:2,shadows:0});expect(pool.stats().lit).toBeGreaterThan(0);
 model.object.userData.noPracticalLights=true;expect(rankFittings(scene,camera.position,16)).toEqual([]);pool.update(scene,camera,1);expect(pool.stats().lit).toBe(0);
 }finally{pool.dispose();model.dispose();library.dispose();}
});
it('model cleanup honors the main adapter sharedResource flag and releases owned resources once',()=>{
 const shared=new T.MeshStandardMaterial(),texture=new T.Texture(),owned=new T.MeshStandardMaterial(),geometry=new T.BoxGeometry();shared.userData.sharedResource=true;texture.userData.sharedResource=true;owned.map=texture;
 const counts={shared:0,texture:0,owned:0,geometry:0};for(const [key,resource] of Object.entries({shared,texture,owned,geometry}))resource.addEventListener('dispose',()=>counts[key as keyof typeof counts]++);
 const group=new T.Group();group.add(new T.Mesh(geometry,[shared,owned]));disposeObject3D(group);expect(counts).toEqual({shared:0,texture:0,owned:1,geometry:1});shared.dispose();texture.dispose();
});
it('versioned resources have correct types and immutable validators; old URLs and HTML remain revalidatable',async()=>{
 const base=inject('baseUrl');for(const [path,type] of [['scans/metal_plate/512/albedo.ktx2','image/ktx2'],['basis/basis_transcoder.wasm','application/wasm'],['scans/metal_plate/512/albedo.webp','image/webp']]){
 const url=base+'/'+CLAUDE_ASSET_ROOT+path,r=await fetch(url);expect(r.status).toBe(200);expect(r.headers.get('content-type')).toBe(type);expect(r.headers.get('cache-control')).toContain('immutable');const etag=r.headers.get('etag')!;expect((await fetch(url,{headers:{'If-None-Match':etag}})).status).toBe(304);
 }
 for(const path of ['/','/assets/scans/metal_plate/512/albedo.webp','/assets/hdri/hanger_exterior_cloudy_1k.hdr']){const r=await fetch(base+path);expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-cache');}
});
