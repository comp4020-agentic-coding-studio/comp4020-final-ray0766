import {Mesh} from 'three';
import type {Vec3} from '../shared/world.ts';
import { buildPlanet } from '../assets/claude-geometry/terrain/planet.ts';
import { TerrainKit } from '../assets/claude-geometry/terrain/kit.ts';
import type { TerrainField } from '../assets/claude-geometry/terrain/field.ts';
import type { LodTier } from '../assets/claude-geometry/style/lod.ts';
import type { PlacedObject } from '../shared/planets.ts';
import type { BlueprintContents } from '../shared/blueprints.ts';
import { fieldOf,foundations } from '../shared/terrain.ts';
import type { HomeSurfaceRoute } from '../shared/home-layout.ts';
import { rebasedTerrainFlora } from './sample-landscape.ts';
import { disposeObject3D } from '../assets/claude-geometry/core/dispose.ts';
import { measure } from '../assets/claude-geometry/style/geometry.ts';
import { BUDGET,LOD } from '../assets/claude-geometry/style/lod.ts';
import {icosphere} from '../assets/claude-geometry/terrain/icosphere.ts';
import {floraModel,floraTriangles} from '../assets/claude-geometry/terrain/flora.ts';
import { PRESENTATION } from './presentation.ts';
import { objectRadius } from '../shared/planets.ts';
import { isPlannedMainPlanet, pavingGrade } from '../shared/planet-plan/paving-grade.ts';
import { mainPlanetNetwork } from '../shared/planet-plan/main-planet.ts';
import { PUBLIC_TOWN_ENVIRONMENT } from '../shared/public-town-layout.ts';
/** The planned main planet's streets: drawn ground graded under them, flora kept off (render only). */
const paving=(environment:string,radius:number,field:TerrainField)=>isPlannedMainPlanet(radius)&&environment===PUBLIC_TOWN_ENVIRONMENT?pavingGrade(mainPlanetNetwork(),field):null;
interface PreparedTerrain {field:TerrainField;kit:TerrainKit;foundations:ReturnType<typeof foundations>}
export interface TerrainModelPreparation {
 signal?:AbortSignal;yieldFrame:()=>Promise<void>;budgetMs?:number;onProgress?:(done:number,total:number)=>void;
}
export function terrainModel(environment:string,objects:readonly PlacedObject[]=[],blueprints:BlueprintContents={},lod:LodTier='medium',alphaCanvas=false,radius=10,_surfaceRoutes:readonly HomeSurfaceRoute[]=[],prepared?:PreparedTerrain){
 void _surfaceRoutes;
 const field=prepared?.field??fieldOf(environment,radius) as TerrainField,kit=prepared?.kit??new TerrainKit(lod,{look:PRESENTATION.materials.look});
 // v1/v2 route documents remain readable historical/navigation metadata. Only
 // actual placed objects can clear flora or grade terrain, just as in Colony.
 const streets=paving(environment,radius,fieldOf(environment,radius) as TerrainField);
 const clearings=[...objects.map(o=>({dir:o.position,radius:objectRadius(o)+.2})),...(streets?.clearings??[])];
 const model=buildPlanet(field.env,null,lod,{kit,field,foundations:[...(prepared?.foundations??foundations(field,objects,blueprints)),...(streets?.foundations??[])],clearings});
 try{
 const adaptedAt=performance.now();
 if(radius!==10){
  const old=model.object.getObjectByName('flora');if(old){const stats=measure(old);model.stats.triangles-=stats.triangles;model.stats.drawCalls-=stats.drawCalls;disposeObject3D(old);}
  const flora=rebasedTerrainFlora(field,radius,kit,lod,clearings,BUDGET.terrain[lod].triangles-model.stats.triangles);
  model.object.add(flora.object);const stats=measure(flora.object);model.stats.triangles+=stats.triangles;model.stats.drawCalls+=stats.drawCalls;model.stats.vegetation=flora.vegetation;
 }
 model.stats.generationMs+=performance.now()-adaptedAt;
 // Strata altitude is relative to this planet's base, not the vendor default.
 for(const material of (Array.isArray(model.ground.material)?model.ground.material:[model.ground.material])){const uniforms=material.userData.uniforms;if(uniforms?.uRadius)uniforms.uRadius.value=radius;}
 // The immutable halo uses a fixed base radius. Resize only that empty shell,
 // never the ground, models or decorations; the shared field places those.
 const atmosphere=model.object.getObjectByName('terrain:atmosphere');
 if(atmosphere instanceof Mesh&&radius!==10){const position=atmosphere.geometry.getAttribute('position');const shellRadius=Math.hypot(position.getX(0),position.getY(0),position.getZ(0));atmosphere.geometry.scale((shellRadius+radius-10)/shellRadius,(shellRadius+radius-10)/shellRadius,(shellRadius+radius-10)/shellRadius);atmosphere.geometry.computeBoundingSphere();}
 // The new terrain owns its flat bands and biome palette. The old shader
 // string substitutions and additive halo treatment belong to the prior model.
 // Hide the decorative horizon shell: its straight edge crossed low cameras.
 if(atmosphere)atmosphere.visible=false;
 void alphaCanvas;
 let disposed=false;const dispose=()=>{if(disposed)return;disposed=true;model.dispose();kit.dispose();};model.object.userData.disposeOwned=dispose;
 return {object:model.object,ground:model.ground,stats:model.stats,tick:(t:number)=>model.tick(t),setSunDirection:(dir:Vec3)=>model.setSunDirection(dir),dispose};
 }catch(error){model.dispose();kit.dispose();throw error;}
}

/** Prepare the existing terrain implementation in bounded stages. Coordinates
 * and samples are exact: no rounded cache keys, alternate mesh or shared-field
 * mutation. The temporary cache and private kit belong only to this request. */
export async function terrainModelAsync(environment:string,objects:readonly PlacedObject[]=[],blueprints:BlueprintContents={},lod:LodTier='medium',alphaCanvas=false,radius=10,surfaceRoutes:readonly HomeSurfaceRoute[]=[],preparation:TerrainModelPreparation={yieldFrame:()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()))}){
 const field=fieldOf(environment,radius) as TerrainField,kit=new TerrainKit(lod,{look:PRESENTATION.materials.look});
 const samples=new Map<string,ReturnType<TerrainField['sample']>>();
 const key=(dir:Vec3)=>dir.map(value=>Object.is(value,-0)?'-0':String(value)).join(',');
 const check=()=>{if(preparation.signal?.aborted)throw new DOMException('Loading cancelled.','AbortError');};
 const frame=async()=>{
  check();await new Promise<void>((resolve,reject)=>{
   const signal=preparation.signal;let settled=false;
   const finish=(failed:boolean,error?:unknown)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);if(failed)reject(error);else resolve();};
   const abort=()=>finish(true,new DOMException('Loading cancelled.','AbortError'));
   signal?.addEventListener('abort',abort,{once:true});
   Promise.resolve().then(preparation.yieldFrame).then(()=>finish(false),error=>finish(true,error));
  });check();
 };
 let result:ReturnType<typeof terrainModel>|undefined;
 try{
  await frame();
  // These three textures are always used by the source ground material.
  // Each procedural texture and plant model remains an indivisible operation.
  for(const name of ['rock','grain','turf'] as const){kit.texture(name);await frame();}
  for(const kind of new Set(field.program.flora.map(rule=>rule.kind))){
   floraTriangles(kind,kit);await frame();
   // The rebased host planner evaluates every kind. At the native radius,
   // leave unused village models unallocated just as buildPlanet does.
   if(radius!==10){floraModel(kind,kit);await frame();}
  }
  const level=LOD[lod].terrainSubdivisions,ico=icosphere(level),count=ico.levels[level].vertices;
  const total=count+objects.length,budget=preparation.budgetMs??6;let completed=0,started=performance.now();
  if(!Number.isFinite(budget)||budget<0)throw new Error('Invalid terrain preparation budget.');
  preparation.onProgress?.(completed,total);
  for(let i=0;i<count;i++){
   check();const dir:Vec3=[ico.dirs[i*3],ico.dirs[i*3+1],ico.dirs[i*3+2]];
   samples.set(key(dir),field.sample(dir));completed++;
   if(performance.now()-started>=budget){preparation.onProgress?.(completed,total);await frame();started=performance.now();}
  }
  const preparedFoundations:ReturnType<typeof foundations>=[];
  for(const object of objects){
   check();preparedFoundations.push(...foundations(field,[object],blueprints));completed++;
   if(performance.now()-started>=budget){preparation.onProgress?.(completed,total);await frame();started=performance.now();}
  }
  preparation.onProgress?.(completed,total);await frame();
  const sampledField:TerrainField={...field,sample:dir=>samples.get(key(dir))??field.sample(dir)};
  result=terrainModel(environment,objects,blueprints,lod,alphaCanvas,radius,surfaceRoutes,{field:sampledField,kit,foundations:preparedFoundations});
  // The model no longer needs vertex samples once its buffers and flora exist.
  samples.clear();await frame();return result;
 }catch(error){samples.clear();if(result)result.dispose();else kit.dispose();throw error;}
}
