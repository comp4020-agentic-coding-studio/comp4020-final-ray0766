import {afterEach, expect, it, vi} from 'vitest';
import {BufferGeometry, Material, Mesh, Scene} from 'three';
import {createHarbour} from '../src/client/harbour.ts';
import {disposeGeometry} from '../src/client/build-art.ts';
import {samplePublicVillage} from '../src/shared/sample-public-village.ts';
import {setGroundWorld, useTerrain} from '../src/client/terrain.ts';

// Keep the real model builder, batching and teardown. A plain shared palette
// avoids browser canvas textures; terrain is unrelated to model ownership.
vi.mock('../src/client/harbour-materials.ts', async () => {
 const {MeshStandardMaterial}=await import('three');
 const palette=Object.fromEntries(['concrete','pale','metal','dark','copper','road','edge','cyan','amber','glass','facade'].map(name=>{
  const material=new MeshStandardMaterial();material.name='sunseed:'+name;material.userData.sharedResource=true;
  return [name,material];
 }));
 return {harbourMaterials:()=>palette};
});
vi.mock('../src/client/terrain-model.ts', async () => {
 const {Group,Mesh,SphereGeometry,MeshStandardMaterial}=await import('three');
 return {terrainModel:()=>{
  const object=new Group(),ground=new Mesh(new SphereGeometry(1,4,2),new MeshStandardMaterial());object.add(ground);
  let disposed=false;
  return {object,ground,tick(){},setSunDirection(){},dispose(){if(disposed)return;disposed=true;ground.geometry.dispose();ground.material.dispose();object.removeFromParent();}};
 }};
});
afterEach(()=>{setGroundWorld(true);vi.restoreAllMocks();});

it.each([false,true])('frees public model lamps and geometry once while retaining the shared palette (sample=%s)', sample=>{
 const village=sample?samplePublicVillage():null;
 setGroundWorld(true,village?.environment,village?.radius);
 if(village)useTerrain(village);
 const geometryDisposals=new Map<BufferGeometry,number>(),original=BufferGeometry.prototype.dispose;
 vi.spyOn(BufferGeometry.prototype,'dispose').mockImplementation(function(this:BufferGeometry){
  geometryDisposals.set(this,(geometryDisposals.get(this)??0)+1);original.call(this);
 });
 for(let cycle=0;cycle<2;cycle++){
  const scene=new Scene(),world=createHarbour(scene,village),lamps=new Set<Material>(),shared=new Set<Material>(),visibleGeometry=new Set<BufferGeometry>();
  world.scenery.traverse(object=>{if(object instanceof Mesh){
   visibleGeometry.add(object.geometry);
   for(const material of Array.isArray(object.material)?object.material:[object.material]){
    if(material.name==='blueprint:lamp')lamps.add(material);
    if(material.userData.sharedResource)shared.add(material);
   }
  }});
  expect(lamps.size).toBeGreaterThan(0);expect(shared.size).toBeGreaterThan(0);
  const lampDisposals=new Map<Material,number>();let sharedDisposals=0;
  for(const material of lamps)material.addEventListener('dispose',()=>lampDisposals.set(material,(lampDisposals.get(material)??0)+1));
  const onSharedDispose=()=>sharedDisposals++;
  for(const material of shared)material.addEventListener('dispose',onSharedDispose);
  // The same ordering used when switching planets, plus repeated handle cleanup.
  world.dispose();world.dispose();world.parked.dispose();disposeGeometry(scene);
  for(const material of lamps)expect(lampDisposals.get(material)).toBe(1);
  for(const geometry of visibleGeometry)expect(geometryDisposals.get(geometry)).toBe(1);
  expect(sharedDisposals).toBe(0);
  for(const material of shared)material.removeEventListener('dispose',onSharedDispose);
 }
 // Includes cloned source geometry disposed during the static bake.
 expect([...geometryDisposals.values()].every(count=>count===1)).toBe(true);
});
