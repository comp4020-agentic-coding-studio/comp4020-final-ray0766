import {expect,it} from 'vitest';
import * as T from 'three';
import {ART_INK,ART_PALETTE,ART_PROFILE_VERSION,adaptArtLibrary,applyArtMaterial,applyArtToObject} from '../src/client/art-profile.ts';
import {StyleLibrary} from '../src/assets/claude-geometry/style/materials.ts';
import {libraryMaterials} from '../src/assets/claude-geometry/blueprint/parts/kit.ts';
import {materialTextures} from '../src/assets/claude-geometry/core/dispose.ts';
import {buildBlueprintModel} from '../src/assets/claude-geometry/blueprint/model3d.ts';
import {homeVariant,HOME_ENVIRONMENT} from '../src/shared/home-layout.ts';
import {configureHomeLighting,createWorldStyleLibrary} from '../src/client/presentation.ts';
import {createHomeDoor} from '../src/client/home-door.ts';
import {HOME_DOOR_LEAF} from '../src/shared/home-door.ts';
import {terrainModel} from '../src/client/terrain-model.ts';

it('adapts each host library while keeping source defaults, owned resources and player paint choices separate',()=>{
 const original=new StyleLibrary('medium',{look:'village'}),host=createWorldStyleLibrary();
 try{
  const untouched=libraryMaterials(original).get('skin') as T.MeshStandardMaterial,skin=libraryMaterials(host).get('skin') as T.MeshStandardMaterial;
  expect(skin.color.getHexString()).toBe(ART_PALETTE.cream.slice(1));expect(untouched.color.getHexString()).toBe('efe3c6');
  expect(skin).toBe(libraryMaterials(host).get('skin'));expect(skin.userData.sharedResource).toBe(true);
  expect(skin.userData.artProfile).toBe(ART_PROFILE_VERSION);expect(untouched.userData.artProfile).toBeUndefined();
  expect(host.ink()!.width).toBe(ART_INK.width);expect(host.ink()!.lines.opacity).toBe(ART_INK.lineOpacity);
  expect(original.ink()!.width).not.toBe(host.ink()!.width);
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
 expect(shader.fragmentShader).toContain('float celStep');expect(shader.fragmentShader.split('reflectedLight.indirectDiffuse *= vec3(0.92').length-1).toBe(1);
 expect(material.map).toBe(texture);expect(material.alphaTest).toBe(.45);expect(material.alphaToCoverage).toBe(true);expect(material.userData.sharedResource).toBe(true);
 const glass=applyArtMaterial(new T.MeshPhysicalMaterial({transparent:true,opacity:.7,depthWrite:false}));
 expect(glass.transparent).toBe(true);expect(glass.opacity).toBe(.7);expect(glass.depthWrite).toBe(false);expect(glass.userData.cel).toBeUndefined();
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

it('keeps the physical door leaf dimensions and open transform while owning its unified materials exactly once',()=>{
 const view=createHomeDoor(),pivot=view.root.children[0],leaf=pivot.children[0] as T.Mesh;
 const size=new T.Box3().setFromBufferAttribute(leaf.geometry.getAttribute('position') as T.BufferAttribute).getSize(new T.Vector3());
 expect(size.toArray()).toEqual(expect.arrayContaining([expect.closeTo(HOME_DOOR_LEAF.width,5),expect.closeTo(HOME_DOOR_LEAF.height,5),expect.closeTo(HOME_DOOR_LEAF.thickness,5)]));
 expect((leaf.material as T.Material).userData.artProfile).toBe(ART_PROFILE_VERSION);
 view.setOpen(true);expect(pivot.rotation.y).toBe(HOME_DOOR_LEAF.openAngle);view.setOpen(false);expect(pivot.rotation.y).toBe(0);
 let disposed=0;(leaf.material as T.Material).addEventListener('dispose',()=>disposed++);view.dispose();view.dispose();expect(disposed).toBe(1);
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
