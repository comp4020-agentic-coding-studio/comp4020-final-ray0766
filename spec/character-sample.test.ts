import {expect,it} from 'vitest';
import * as T from 'three';
import {courier} from '../src/client/character.ts';
import {disposeGeometry} from '../src/client/build-art.ts';
function stats(root:T.Object3D){const g=new Set<T.BufferGeometry>(),m=new Set<T.Material>();let triangles=0;root.traverse(o=>{if(o instanceof T.Mesh){g.add(o.geometry);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const material of Array.isArray(o.material)?o.material:[o.material])m.add(material);}});return {g,m,triangles};}
it('uses the same new traveller rig for all players and named task residents',()=>{for(const id of ['clay','fern','sky','mica','sol'] as const)expect(courier(id).root.userData.characterVariant).toBe('sample');});
it('retains the game avatar API, bounded body size and finite walking/carrying/falling animation',()=>{
 const a=courier('clay'),b=new T.Box3().setFromObject(a.root);expect(b.min.y).toBeGreaterThan(-.05);expect(b.max.y).toBeLessThan(1.8);expect(b.max.x-b.min.x).toBeLessThan(.8);
 for(const c of ['fern','sky','clay'] as const)a.setColor(c);a.parcel.visible=true;a.greet(1);
 for(let i=0;i<180;i++){a.animate(i/60,3,false,.2,i<90);a.root.updateMatrixWorld(true);a.root.traverse(o=>expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));}
 a.animate(5,3,true);const snapshot=a.root.toJSON();a.animate(10,3,true);expect(a.root.toJSON()).toEqual(snapshot);
});
it('uses bounded shared geometry without image textures or morph buffers, safe across disposal and recreation',()=>{
 const a=courier('clay'),b=courier('clay'),x=stats(a.root),y=stats(b.root);expect(x.g.size).toBeLessThan(16);expect(x.triangles).toBeLessThan(16000);expect([...x.g].every(g=>y.g.has(g)&&g.userData.sharedResource)).toBe(true);
 for(const material of x.m)if(material instanceof T.MeshStandardMaterial){expect(material.map).toBeNull();expect(material.normalMap).toBeNull();}
 disposeGeometry(a.root);const z=stats(courier('clay').root);expect(z.g).toEqual(x.g);expect(z.triangles).toEqual(x.triangles);
});
it('keeps one stable actor and shared bounded resources across every finite face and hair choice',()=>{
 const a=courier('clay'),root=a.root,geometries=new Set<T.BufferGeometry>();root.position.set(1,2,3);a.parcel.visible=true;
 for(const face of ['soft','oval','round'] as const)for(const hair of ['swept','crop','bob'] as const)for(const skin of ['porcelain','sand','warm','bronze','deep'] as const){
  a.setAppearance({version:1,model:'sample',face,hair,skin,eyes:'ocean',coat:'sky'});expect(a.root).toBe(root);expect(root.children).toHaveLength(1);expect(root.position.toArray()).toEqual([1,2,3]);expect(a.parcel.visible).toBe(true);const s=stats(root);expect(s.triangles).toBeLessThan(16000);for(const g of s.g)geometries.add(g);a.animate(1,2,false);
 }
 expect(geometries.size).toBeLessThan(16);a.setAppearance({version:1,model:'sample',face:'round',hair:'bob',skin:'deep',eyes:'ocean',coat:'sky'});expect(root.children).toHaveLength(1);expect(root.userData.characterVariant).toBe('sample');expect(a.parcel.visible).toBe(true);
});
