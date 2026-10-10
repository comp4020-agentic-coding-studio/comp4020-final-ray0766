import {afterEach,expect,it,vi} from 'vitest';
import * as T from 'three';
import {createPublicTownArt,createPublicTownArtAsync} from '../src/client/public-town-art.ts';
import {StyleLibrary} from '../src/assets/claude-geometry/style/materials.ts';
import {buildBlueprintModel} from '../src/shared/blueprint-model3d.ts';
import {placedTransform} from '../src/assets/claude-geometry/blueprint/placement.ts';
import type {PartPlacement} from '../src/shared/blueprint-model.ts';
import {structureFit} from '../src/shared/blueprints.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import {SAMPLE_PUBLIC_ENVIRONMENT} from '../src/shared/sample-public-village.ts';
import type {SamplePublicVillage} from '../src/shared/sample-public-village.ts';
import type {Vec3} from '../src/shared/world.ts';
import {rankFittings} from '../src/assets/claude-geometry/style/practical.ts';

const radius=21.6;
const parts:PartPlacement[]=[
  {n:1,part:'floor.deck',x:0,z:0,level:0,rot:0},
  {n:2,part:'wall.door',x:0,z:0,level:0,rot:0},
  {n:3,part:'roof.deck',x:0,z:0,level:1,rot:0},
];
function village():SamplePublicVillage{
  const objects=[1,1,-1,-1].map((y,i)=>({id:`house-${i}`,kind:'structure' as const,assetVersion:2 as const,
    position:new T.Vector3(.01+(i%2)*.02,y,.01).normalize().toArray() as Vec3,rotation:i*.2,version:1,blueprintHash:'sample'}));
  return {version:9,radius,environment:SAMPLE_PUBLIC_ENVIRONMENT,objects,blueprints:{sample:parts},routes:[],pavingRoutes:[],
    renderDistricts:[1,-1].map(y=>({id:`pole-${y}`,name:'Test',nameZh:'测试',center:[0,y,0] as Vec3,objectIds:objects.filter(o=>o.position[1]*y>0).map(o=>o.id)})),
    destinations:[],buildings:[],roadObjects:[],landmarks:[]};
}
function lampMeshes(root:T.Object3D){
  const result:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>[]=[];
  root.traverseVisible(node=>{if(node instanceof T.Mesh&&!Array.isArray(node.material)&&node.material.name==='blueprint:lamp')result.push(node);});
  return result;
}
function appearance(material:T.MeshStandardMaterial){
  const state={...material.toJSON(),uuid:undefined,userData:{...material.userData}};delete state.userData.sharedResource;
  return state;
}
function shader(material:T.Material){
  const value={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader,uniforms:{}};
  material.onBeforeCompile(value as Parameters<T.Material['onBeforeCompile']>[0],{} as T.WebGLRenderer);
  return value;
}
function watchGlows(adapt?:(material:T.MeshStandardMaterial,index:number)=>void){
  const materials:T.MeshStandardMaterial[]=[],disposals=new Map<T.Material,number>(),create=StyleLibrary.prototype.createGlow;
  vi.spyOn(StyleLibrary.prototype,'createGlow').mockImplementation(function(this:StyleLibrary,...args:Parameters<typeof create>){
    const material=create.apply(this,args);adapt?.(material,materials.length);materials.push(material);
    material.addEventListener('dispose',()=>disposals.set(material,(disposals.get(material)??0)+1));return material;
  });
  return {materials,disposals};
}
afterEach(()=>vi.restoreAllMocks());

it('merges only the static town lamps while preserving shader, every lamp vertex, cover and practical-light fittings',()=>{
  const fixture=village(),library=new StyleLibrary('medium',{look:'village',scans:false}),reference=new T.Group();
  const models=fixture.objects.map(o=>{
    const fit=structureFit(parts,o.position,o.rotation,fieldOf(fixture.environment,radius));
    const model=buildBlueprintModel(parts,library,'low',{foundationDepth:fit.foundationDepth,sockets:false});
    const transform=placedTransform({dir:o.position,yaw:o.rotation},fit);
    model.object.position.fromArray(transform.position);model.object.quaternion.fromArray(transform.quaternion);reference.add(model.object);
    return model;
  });
  const town=createPublicTownArt(fixture,radius);
  try{
    town.update(new T.Vector3(0,70,0),undefined,{globalLow:true});reference.updateWorldMatrix(true,true);town.root.updateWorldMatrix(true,true);
    const before=lampMeshes(reference),after=lampMeshes(town.root);expect(before).toHaveLength(4);expect(after).toHaveLength(1);
    const shared=after[0].material;
    expect(new Set(before.map(mesh=>mesh.material)).size).toBe(4);
    expect(before.every(mesh=>mesh.material!==shared&&!mesh.material.userData.sharedResource)).toBe(true);
    expect(appearance(shared)).toEqual(appearance(before[0].material));expect(shader(shared)).toEqual(shader(before[0].material));
    expect(shared.customProgramCacheKey()).toBe(before[0].material.customProgramCacheKey());
    // Face ranges still identify each original structure inside the merged lamp.
    for(const [i,mesh] of before.entries()){
      const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      try{
        const range=(after[0].userData.townFaceRanges as {objectId:string;first:number;count:number}[]).find(r=>r.objectId===fixture.objects[i].id)!;
        expect(range).toBeDefined();expect(range.count*3).toBe(geometry.attributes.position.count);
        expect(after[0].castShadow).toBe(mesh.castShadow);expect(after[0].receiveShadow).toBe(mesh.receiveShadow);
        for(const [name,attribute] of Object.entries(geometry.attributes)){
          const baked=after[0].geometry.getAttribute(name),start=range.first*3*attribute.itemSize,end=(range.first+range.count)*3*attribute.itemSize;
          expect([...baked.array.slice(start,end)],name).toEqual([...attribute.array]);
        }
      }finally{geometry.dispose();}
    }
    const eye=new T.Vector3(0,22,0);
    expect(rankFittings(reference,eye,100).length).toBeGreaterThan(0);
    expect(rankFittings(town.root,eye,100)).toEqual(rankFittings(reference,eye,100));
    // The native hue-preserving shader stays intact at dim/off/night values;
    // these mutations cannot change a separately built private model's lamp.
    for(const intensity of [0,.25,1.6,3]){shared.emissiveIntensity=intensity;expect(shader(shared)).toEqual(shader(before[0].material));}
    expect(before.every(mesh=>mesh.material.emissiveIntensity===1.6)).toBe(true);
  }finally{town.dispose();models.forEach(model=>model.dispose());library.dispose();}
});

it.each(['intensity','linear-rgb','precision','defines'] as const)('keeps unequal %s in separate batches with the exact source values',kind=>{
  const watch=watchGlows((material,index)=>{
    if(kind==='intensity')material.emissiveIntensity=index%2?0.4:1.6;
    if(kind==='linear-rgb')material.emissive.r-=index%2?1e-8:0;
    if(kind==='precision')material.precision=index%2?'lowp':'highp';
    if(kind==='defines')material.defines={...material.defines,PUBLIC_TEST_VARIANT:index%2};
  });
  const town=createPublicTownArt(village(),radius);
  try{
    town.update(new T.Vector3(0,70,0),undefined,{globalLow:true});
    const lamps=lampMeshes(town.root);expect(lamps).toHaveLength(2);
    expect(new Set(lamps.map(mesh=>mesh.material.uuid)).size).toBe(2);
    const values=(material:T.MeshStandardMaterial)=>({intensity:material.emissiveIntensity,emissive:material.emissive.toArray(),precision:material.precision,defines:material.defines});
    expect(lamps.map(mesh=>values(mesh.material))).toEqual(expect.arrayContaining(watch.materials.slice(0,2).map(values)));
    if(kind!=='intensity')expect(appearance(watch.materials[0])).toEqual(appearance(watch.materials[1]));
  }finally{town.dispose();}
});

it.each(['texture','uniforms','compile-hook','render-hook','cache-hook'] as const)('retains model ownership for an unknown %s',kind=>{
  const textures:T.Texture[]=[],textureDisposed=vi.fn();
  const watch=watchGlows(material=>{
    if(kind==='texture'){
      const texture=new T.Texture();texture.addEventListener('dispose',textureDisposed);textures.push(texture);material.emissiveMap=texture;
    }
    if(kind==='uniforms')Object.assign(material,{uniforms:{perBuilding:{value:1}}});
    if(kind==='compile-hook')material.onBeforeCompile=()=>{};
    if(kind==='render-hook')material.onBeforeRender=()=>{};
    if(kind==='cache-hook'){const key=material.customProgramCacheKey();material.customProgramCacheKey=()=>key;}
  });
  const town=createPublicTownArt(village(),radius);
  try{
    town.update(new T.Vector3(0,70,0),undefined,{globalLow:true});
    const lamps=lampMeshes(town.root);expect(lamps).toHaveLength(4);
    expect(new Set(lamps.map(mesh=>mesh.material))).toEqual(new Set(watch.materials));
    expect(lamps.every(mesh=>!mesh.material.userData.sharedResource)).toBe(true);
    expect(watch.disposals.size).toBe(0);expect(textureDisposed).not.toHaveBeenCalled();
  }finally{town.dispose();town.dispose();}
  expect(watch.materials.every(material=>watch.disposals.get(material)===1)).toBe(true);
  expect(textureDisposed).toHaveBeenCalledTimes(textures.length);
});

it('retains shared lamps through staged LOD cancellation and cache eviction, then frees all original and shared owners once',()=>{
  const watch=watchGlows(),town=createPublicTownArt(village(),radius,{mediumCacheChunks:1,maxBuildsPerUpdate:1});
  const shared=lampMeshes(town.root)[0].material,disposed=vi.fn();shared.addEventListener('dispose',disposed);
  try{
    const north=[new T.Vector3(0,29,0),new T.Vector3(0,22,0)] as const,south=[new T.Vector3(0,-29,0),new T.Vector3(0,-22,0)] as const;
    expect(town.update(...north).stagedMediumObjects).toBe(1);
    const staged=watch.materials.at(-1)!;
    expect(town.update(new T.Vector3(0,70,0),undefined,{globalLow:true}).stagedMediumObjects).toBe(0);
    expect(watch.disposals.get(staged)).toBe(1);expect(disposed).not.toHaveBeenCalled();
    for(const pose of [north,south,north]){
      town.update(...pose);const settled=town.update(...pose);
      expect(settled.mediumChunks).toBe(1);expect(settled.cachedMediumChunks).toBe(1);
      expect(lampMeshes(town.root).every(mesh=>mesh.material===shared)).toBe(true);expect(disposed).not.toHaveBeenCalled();
    }
    expect(watch.materials.length).toBeGreaterThan(8);
  }finally{town.dispose();town.dispose();}
  expect(disposed).toHaveBeenCalledTimes(1);expect(watch.materials.every(material=>watch.disposals.get(material)===1)).toBe(true);
  expect(town.root.children).toHaveLength(0);expect(town.stats().residentGeometryBytes).toBe(0);
});

it.each(['abort','progress-error'] as const)('frees partial real models and the town-owned glow after async %s',async mode=>{
  const watch=watchGlows(),controller=new AbortController(),clones:T.MeshStandardMaterial[]=[],clone=T.MeshStandardMaterial.prototype.clone;
  const disposals=new Map<T.Material,number>();
  vi.spyOn(T.MeshStandardMaterial.prototype,'clone').mockImplementation(function(this:T.MeshStandardMaterial){
    const result=clone.call(this);if(this.name==='blueprint:lamp'){
      clones.push(result);result.addEventListener('dispose',()=>disposals.set(result,(disposals.get(result)??0)+1));
    }return result;
  });
  await expect(createPublicTownArtAsync(village(),radius,{}, {signal:controller.signal,yieldFrame:async()=>{},onProgress:progress=>{
    if(progress.readyObjects===3){if(mode==='abort')controller.abort(new Error('test abort'));else throw new Error('test progress failure');}
  }})).rejects.toThrow(mode==='abort'?'test abort':'test progress failure');
  expect(watch.materials).toHaveLength(3);expect(clones).toHaveLength(1);
  expect(watch.materials.every(material=>watch.disposals.get(material)===1)).toBe(true);
  expect(clones.every(material=>disposals.get(material)===1)).toBe(true);
});
