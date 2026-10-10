import {afterEach, expect, it, vi} from 'vitest';
import {BufferGeometry, InstancedMesh, Material, Mesh, Texture} from 'three';
import {terrainModel, terrainModelAsync} from '../src/client/terrain-model.ts';
import {TerrainKit} from '../src/assets/claude-geometry/terrain/kit.ts';
import type {TerrainField} from '../src/assets/claude-geometry/terrain/field.ts';
import {defaultEnvironment, encodeEnvironment} from '../src/assets/claude-geometry/terrain/env.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import type {PlacedObject} from '../src/shared/planets.ts';
import type {Vec3} from '../src/shared/world.ts';

const environment=encodeEnvironment(defaultEnvironment('temperate',71923));
const objects:PlacedObject[]=[{id:'ordinary-foundation',kind:'path',position:[0,1,0],rotation:.37,assetVersion:2,version:1}];
const groundAttributes=['position','normal','color','surface','cover'];
type TerrainModel=ReturnType<typeof terrainModel>;
type KitResource=BufferGeometry|Material|Texture;

/** Compare actual buffers rather than counts: matching budgets alone can hide
 * a changed ground surface, clearing, plant placement or material program. */
function snapshot(model:TerrainModel){
 const ground=Object.fromEntries(groundAttributes.map(name=>[name,Array.from(model.ground.geometry.getAttribute(name).array)]));
 const meshes:{name:string;attributes:Record<string,number[]>;index:number[]|null;materials:{name:string;key:string}[];instances:number[]|null;count:number|null}[]=[];
 model.object.traverse(node=>{
  if(!(node instanceof Mesh))return;
  const geometry:BufferGeometry=node.geometry;
  const attributes=Object.fromEntries(Object.keys(geometry.attributes).sort().map(name=>[name,Array.from(geometry.getAttribute(name).array)]));
  meshes.push({name:node.name,attributes,index:geometry.index?Array.from(geometry.index.array):null,
   materials:(Array.isArray(node.material)?node.material:[node.material]).map(material=>({name:material.name,key:material.customProgramCacheKey()})),
   instances:node instanceof InstancedMesh?Array.from(node.instanceMatrix.array):null,count:node instanceof InstancedMesh?node.count:null});
 });
 const stats={...model.stats};delete (stats as Partial<typeof stats>).generationMs;
 return {ground,index:model.ground.geometry.index?Array.from(model.ground.geometry.index.array):null,meshes,stats};
}

/** Observe the real private kit without replacing any factories or resources. */
function trackPrivateKits(){
 const kits=new Set<TerrainKit>(),resources=new Map<KitResource,{disposals:number}>();
 const texture=TerrainKit.prototype.texture,dispose=TerrainKit.prototype.dispose;
 const watch=()=>{
  for(const kit of kits)for(const resource of Object.values(kit.owned()).flat()){
   if(resources.has(resource))continue;
   const count={disposals:0};resources.set(resource,count);
   resource.addEventListener('dispose',()=>count.disposals++);
  }
 };
 vi.spyOn(TerrainKit.prototype,'texture').mockImplementation(function(this:TerrainKit,name){kits.add(this);return texture.call(this,name);});
 const disposal=vi.spyOn(TerrainKit.prototype,'dispose').mockImplementation(function(this:TerrainKit){kits.add(this);watch();dispose.call(this);});
 return {kits,resources,watch,expectReleased(){
  expect(kits.size).toBe(1);expect(resources.size).toBeGreaterThan(0);expect(disposal).toHaveBeenCalledTimes(1);
  for(const kit of kits){expect(kit.owned()).toEqual({textures:[],materials:[],geometries:[]});kit.dispose();}
  for(const [resource,count]of resources)expect(count.disposals,resource.constructor.name).toBe(1);
 }};
}

afterEach(()=>vi.restoreAllMocks());

it.each([10,21.6])('prepares the exact complete low terrain, foundation and flora at radius %s',async radius=>{
 const before=JSON.stringify(objects),reference=terrainModel(environment,objects,{},'low',false,radius);
 let prepared:TerrainModel|undefined,frames=0;
 const progress:{done:number;total:number}[]=[];
 try{
  prepared=await terrainModelAsync(environment,objects,{},'low',false,radius,[],{
   budgetMs:6,yieldFrame:async()=>{frames++;},onProgress:(done,total)=>progress.push({done,total}),
  });
  const actual=snapshot(prepared),expected=snapshot(reference);
  for(const name of groundAttributes){expect(actual.ground[name].length).toBeGreaterThan(0);expect(actual.ground[name],name).toEqual(expected.ground[name]);}
  expect(actual.index).toEqual(expected.index);expect(actual.meshes).toEqual(expected.meshes);expect(actual.stats).toEqual(expected.stats);
  expect(actual.meshes.some(mesh=>mesh.instances!==null&&(mesh.count??0)>0)).toBe(true);
  expect(frames).toBeGreaterThan(1);expect(progress[0]).toMatchObject({done:0});
  const final=progress.at(-1)!;expect(final.done).toBe(final.total);expect(final.total).toBeGreaterThan(objects.length);
  expect(progress.every((value,index)=>value.total===final.total&&(!index||value.done>=progress[index-1].done))).toBe(true);
  expect(JSON.stringify(objects)).toBe(before);
 }finally{prepared?.dispose();reference.dispose();}
},15000);

it('cancels during sampling without publishing a partial terrain and releases every prepared kit resource once',async()=>{
 const tracked=trackPrivateKits(),controller=new AbortController(),publish=vi.fn();
 const pending=terrainModelAsync(environment,objects,{},'low',false,21.6,[],{
  signal:controller.signal,budgetMs:0,yieldFrame:async()=>{tracked.watch();},
  onProgress:done=>{if(done>0)controller.abort();},
 });
 const published=pending.then(publish,()=>undefined);
 await expect(pending).rejects.toMatchObject({name:'AbortError'});await published;
 expect(publish).not.toHaveBeenCalled();
 expect([...tracked.resources.keys()].some(resource=>resource instanceof Texture)).toBe(true);
 expect([...tracked.resources.keys()].some(resource=>resource instanceof Material)).toBe(true);
 expect([...tracked.resources.keys()].some(resource=>resource instanceof BufferGeometry)).toBe(true);
 tracked.expectReleased();
});

it('interrupts a suspended frame immediately on cancellation and releases already prepared textures',async()=>{
 const tracked=trackPrivateKits(),controller=new AbortController();let frames=0,ready!:()=>void;
 const suspended=new Promise<void>(resolve=>{ready=resolve;});
 const pending=terrainModelAsync(environment,objects,{},'low',false,10,[],{
  signal:controller.signal,yieldFrame:()=>{
   tracked.watch();frames++;
   if(frames===2){ready();return new Promise<void>(()=>{});}
   return Promise.resolve();
  },
 });
 await suspended;expect([...tracked.resources.keys()].some(resource=>resource instanceof Texture)).toBe(true);
 controller.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});
 tracked.expectReleased();
});

it('releases private textures, plant materials and geometries when a preparation frame fails',async()=>{
 const tracked=trackPrivateKits(),failure=new Error('Frame preparation failed');let sampled=false;
 await expect(terrainModelAsync(environment,objects,{},'low',false,21.6,[],{
  budgetMs:0,onProgress:done=>{sampled=done>0;},yieldFrame:async()=>{tracked.watch();if(sampled)throw failure;},
 })).rejects.toBe(failure);
 expect([...tracked.resources.keys()].some(resource=>resource instanceof Material)).toBe(true);
 expect([...tracked.resources.keys()].some(resource=>resource instanceof BufferGeometry)).toBe(true);
 tracked.expectReleased();
});

it('keeps shared fields unchanged across interleaved environments, radii and a repeated preparation',async()=>{
 const alternate=encodeEnvironment(defaultEnvironment('desert',71924));
 const firstField=fieldOf(environment,10) as TerrainField,otherField=fieldOf(alternate,21.6) as TerrainField;
 const firstSample=firstField.sample,otherSample=otherField.sample;
 const directions:Vec3[]=[[0,1,0],[.3,.4,Math.sqrt(.75)],[0,-1,-0]];
 const fieldSnapshot=(field:TerrainField)=>({id:field.id,environment:JSON.stringify(field.env),waterLevel:field.waterLevel,samples:directions.map(dir=>field.sample(dir))});
 const firstBefore=fieldSnapshot(firstField),otherBefore=fieldSnapshot(otherField);
 const models:TerrainModel[]=[];
 const prepare=async(encoded:string,radius:number)=>{
  const model=await terrainModelAsync(encoded,objects,{},'low',false,radius,[],{yieldFrame:async()=>{
   expect(firstField.sample).toBe(firstSample);expect(otherField.sample).toBe(otherSample);
  }});
  models.push(model);return model;
 };
 try{
  const [first,other]=await Promise.all([prepare(environment,10),prepare(alternate,21.6)]);
  const repeated=await prepare(environment,10);
  expect(snapshot(repeated)).toEqual(snapshot(first));
  expect(other.stats.maxHeight).not.toBe(first.stats.maxHeight);
  expect(fieldOf(environment,10)).toBe(firstField);expect(fieldOf(alternate,21.6)).toBe(otherField);
  expect(fieldSnapshot(firstField)).toEqual(firstBefore);expect(fieldSnapshot(otherField)).toEqual(otherBefore);
 }finally{for(const model of models)model.dispose();}
},15000);
