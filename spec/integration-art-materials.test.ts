import {expect,it} from 'vitest';
import * as T from 'three';
import {ART_PALETTE,ART_PROFILE_VERSION,adaptArtLibrary,applyArtMaterial,applyArtToObject} from '../src/client/art-profile.ts';
import {VILLAGE} from '../src/assets/claude-geometry/style/look.ts';
import {StyleLibrary} from '../src/assets/claude-geometry/style/materials.ts';
import {libraryMaterials} from '../src/assets/claude-geometry/blueprint/parts/kit.ts';
import {materialTextures} from '../src/assets/claude-geometry/core/dispose.ts';
import {buildBlueprintModel} from '../src/assets/claude-geometry/blueprint/model3d.ts';
import {homeVariant,HOME_ENVIRONMENT} from '../src/shared/home-layout.ts';
import {configureHomeLighting,createWorldStyleLibrary} from '../src/client/presentation.ts';
import {createHomeDoor} from '../src/client/home-door.ts';
import {terrainModel} from '../src/client/terrain-model.ts';

it('uses the source village palette without replacing its library methods or player paint choices',()=>{
 const original=new StyleLibrary('medium',{look:'village'}),host=createWorldStyleLibrary();
 try{
  const untouched=libraryMaterials(original).get('skin') as T.MeshStandardMaterial,skin=libraryMaterials(host).get('skin') as T.MeshStandardMaterial;
  expect(skin.color.getHexString()).toBe(ART_PALETTE.cream.slice(1));expect(untouched.color.getHexString()).toBe(skin.color.getHexString());
  expect(skin).toBe(libraryMaterials(host).get('skin'));expect(skin.userData.sharedResource).toBe(true);
  expect(skin.userData.cel).toBe(true);expect(skin.userData.mottleSpace).toBe('world');
  expect(host.custom).toBe(StyleLibrary.prototype.custom);expect(host.glass).toBe(StyleLibrary.prototype.glass);
  expect(host.glass('clear').color.getHexString()).toBe(VILLAGE.glass.clear.color.slice(1));
  expect(host.glass('clear').depthWrite).toBe(true);expect(host.unlisted()).toEqual([]);
  const lease=host.leasePaint('#ad4574'),paintHex=lease.material.color.getHexString();
  expect(paintHex).toBe('ad4574');adaptArtLibrary(host);expect(lease.material.color.getHexString()).toBe(paintHex);
  let textureDisposals=0,paintDisposals=0;
  for(const texture of materialTextures(skin))texture.addEventListener('dispose',()=>textureDisposals++);
  lease.material.addEventListener('dispose',()=>paintDisposals++);lease.release();lease.release();
  expect(paintDisposals).toBe(1);expect(textureDisposals).toBe(0);
 }finally{host.dispose();original.dispose();}
});

it('preserves original compile hooks and adds one stable light-response program without replacing maps or transparency',()=>{
 const texture=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1),material=new T.MeshStandardMaterial({map:texture,alphaTest:.45});
 material.userData.sharedResource=true;
 let originalCompiles=0;material.onBeforeCompile=shader=>{originalCompiles++;shader.uniforms.originalContract={value:7};};
 material.customProgramCacheKey=()=> 'test-original';
 applyArtMaterial(material);const hook=material.onBeforeCompile,key=material.customProgramCacheKey();applyArtMaterial(material);
 expect(material.onBeforeCompile).toBe(hook);expect(material.customProgramCacheKey()).toBe(key);expect(key).toContain('test-original');
 const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
 hook.call(material,shader as Parameters<T.Material['onBeforeCompile']>[0],{} as T.WebGLRenderer);
 expect(originalCompiles).toBe(1);expect(shader.uniforms).toHaveProperty('originalContract.value',7);
 expect(shader.fragmentShader).toContain('float celStep');expect(shader.fragmentShader).toContain('RE_IndirectSpecular_Flat');
 expect(shader.fragmentShader).not.toContain('reflectedLight.indirectDiffuse *= vec3(0.92');
 expect(material.userData.mottleSpace).toBe('object');expect(material.envMapIntensity).toBe(0);
 expect(material.map).toBe(texture);expect(material.alphaTest).toBe(.45);expect(material.alphaToCoverage).toBe(true);expect(material.userData.sharedResource).toBe(true);
 const glass=applyArtMaterial(new T.MeshPhysicalMaterial({transparent:true,opacity:.7,depthWrite:false}));
 expect(glass.transparent).toBe(true);expect(glass.opacity).toBe(.7);expect(glass.depthWrite).toBe(false);expect(glass.userData.cel).toBe(true);expect(glass.userData.mottle).toBeUndefined();
 material.dispose();texture.dispose();glass.dispose();
});

it('applies the same response to actual terrain, planting and kit furniture without modifying geometry or structural records',()=>{
 const lib=createWorldStyleLibrary(),parts=homeVariant('starter').parts,before=JSON.stringify(parts),model=buildBlueprintModel(parts,lib,'medium');
 const terrain=terrainModel(HOME_ENVIRONMENT,[],{},'low',false,21.6);
 try{
  const beforePosition=Array.from(terrain.ground.geometry.getAttribute('position').array),matrix=terrain.ground.matrix.toArray();
  applyArtToObject(terrain.object);applyArtToObject(model.object);
  let terrainMaterials=0,kitMaterials=0;
  for(const [root,count]of [[terrain.object,()=>terrainMaterials++],[model.object,()=>kitMaterials++]] as const)root.traverse(object=>{
   if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof T.MeshStandardMaterial){
    count();expect(material.userData.artProfile).toBe(ART_PROFILE_VERSION);if(!material.transparent)expect(material.userData.cel).toBe(true);
   }
  });
  expect(terrainMaterials).toBeGreaterThan(2);expect(kitMaterials).toBeGreaterThan(5);
  expect(Array.from(terrain.ground.geometry.getAttribute('position').array)).toEqual(beforePosition);expect(terrain.ground.matrix.toArray()).toEqual(matrix);
  expect(JSON.stringify(parts)).toBe(before);
 }finally{terrain.dispose();model.dispose();lib.dispose();}
});

it('uses the same source lattice door models for both acknowledged poses and disposes geometry once',()=>{
 const view=createHomeDoor(),closed=view.root.getObjectByName('home-door-closed')!,open=view.root.getObjectByName('home-door-open')!;
 view.setOpen(false);expect(closed.visible).toBe(true);expect(open.visible).toBe(false);
 view.setOpen(true);view.frame(.03);expect(closed.visible).toBe(false);expect(open.visible).toBe(true);
 open.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(open);
 expect(bounds.min.z).toBeCloseTo(-.1,5);expect(bounds.max.z).toBeCloseTo(.152,5);
 let disposed=0;let geometry:T.BufferGeometry|undefined;open.traverse(o=>{if(!geometry&&o instanceof T.Mesh)geometry=o.geometry;});
 geometry!.addEventListener('dispose',()=>disposed++);view.dispose();view.dispose();expect(disposed).toBe(1);
});

it.each([[7,4,2.4],[12,8,3.2]])('fits indoor shadow projection to the %i by %i room without adding light slots',(width,depth,height)=>{
 const scene=new T.Scene(),fill=new T.HemisphereLight(),sun=new T.DirectionalLight();scene.add(fill,sun,sun.target);
 configureHomeLighting(scene,fill,sun,width,depth,height);scene.updateMatrixWorld(true);sun.shadow.updateMatrices(sun);
 for(const x of [-width/2,width/2])for(const y of [0,height])for(const z of [-depth/2,depth/2]){
  const point=new T.Vector3(x,y,z).project(sun.shadow.camera);expect(Math.max(Math.abs(point.x),Math.abs(point.y),Math.abs(point.z))).toBeLessThan(1);
 }
 expect(scene.children.filter(o=>o instanceof T.Light)).toHaveLength(2);expect(sun.shadow.mapSize.toArray()).toEqual([1024,1024]);
 sun.shadow.dispose();
});
