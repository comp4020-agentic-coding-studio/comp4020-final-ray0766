import * as T from 'three';
import {StyleLibrary} from '../assets/claude-geometry/style/materials.ts';
import {applyCel} from '../assets/claude-geometry/style/cel.ts';
import {applyHueKeep} from '../assets/claude-geometry/style/surface.ts';
import {VILLAGE} from '../assets/claude-geometry/style/look.ts';
import {buildBlueprintModel} from '../shared/blueprint-model3d.ts';
import {placedTransform} from '../assets/claude-geometry/blueprint/placement.ts';
import {structureFit} from '../shared/blueprints.ts';
import {buildCameraBlueprintModel,cameraBlueprintRegistry,cameraPartSlots} from './camera-blueprint-model.ts';
import {fieldOf,objectSeat} from '../shared/terrain.ts';
import type {SamplePublicVillage} from '../shared/sample-public-village.ts';
import {createTownRenderer,createTownRendererAsync} from './town-renderer.ts';
import {prewarmTerrainFits} from '../shared/terrain-prewarm.ts';
import type {TownRendererOptions,TownRenderPreparation} from './town-renderer.ts';
import {builtObject,disposeGeometry} from './build-art.ts';
import {buildStructureFinish} from './structure-finish.ts';
import type {GroundFit} from '../assets/claude-geometry/core/ground.ts';

/** The public town and its orbital view build the same ordinary saved parts.
 * Only drawing detail varies; there are no stand-in towers or extra buildings. */
type PublicTownOptions=Pick<TownRendererOptions,'maxChunkRadius'|'mediumCacheChunks'|'maxBuildsPerUpdate'|'cameraCutaway'>;
// Fingerprint only the pinned village factory's two stateless shader patches.
// This is not an equivalence test for arbitrary shader closures or materials.
const staticGlowHooks=(()=>{
  const material=applyHueKeep(applyCel(new T.MeshStandardMaterial(),VILLAGE.cel!));
  const hooks={compile:material.onBeforeCompile.toString(),key:material.customProgramCacheKey.toString(),program:material.customProgramCacheKey()};
  material.dispose();return hooks;
})();
function prepareTownOptions(village:SamplePublicVillage,radius:number,options:PublicTownOptions,preparedFits?:ReadonlyMap<string,GroundFit>){
  const field=fieldOf(village.environment,radius),fitStart=performance.now();
  const fits=preparedFits??new Map(village.objects.map(o=>[o.id,o.kind==='structure'
    ?structureFit(village.blueprints[o.blueprintHash!],o.position,o.rotation,field):objectSeat(field,o,village.blueprints)]));
  if(village.objects.some(o=>!fits.has(o.id)))throw new Error('Prepared town support is incomplete.');
  const initialFitMs=performance.now()-fitStart;
  const libraries={low:new StyleLibrary('low',{look:'village',scans:false}),medium:new StyleLibrary('medium',{look:'village',scans:false})};
  // Only this static public-town adapter opts into sharing the pinned kit's
  // texture-free lamps. Its cel/hue shader hooks capture shader text, not
  // per-model uniforms; the town never animates a model's lamp material.
  // PracticalLights reads separate position/direction/color emitter records.
  // Private structures, previews and animated ship glows retain their owners.
  const glows=new Map<string,T.MeshStandardMaterial>();
  function shareStaticGlows(root:T.Object3D){
    root.traverse(node=>{
      const mesh=node as T.Mesh,source=mesh.material as T.MeshStandardMaterial;
      if(!mesh.isMesh||source?.type!=='MeshStandardMaterial'||source.name!=='blueprint:lamp')return;
      // Unknown dynamic/texture owners keep their original model lifetime.
      if(source.onBeforeRender!==T.Material.prototype.onBeforeRender||mesh.onBeforeRender!==T.Object3D.prototype.onBeforeRender||mesh.onAfterRender!==T.Object3D.prototype.onAfterRender
        ||'uniforms' in source||'uniformsGroups' in source||Object.values(source).some(value=>(value as T.Texture|null)?.isTexture)
        ||source.userData.cel!==true||source.userData.hueKeep!==true||Object.keys(source.userData).some(key=>key!=='cel'&&key!=='hueKeep')
        ||source.onBeforeCompile.toString()!==staticGlowHooks.compile||source.customProgramCacheKey.toString()!==staticGlowHooks.key||source.customProgramCacheKey()!==staticGlowHooks.program)return;
      // toJSON quantizes Color to 8-bit hex and omits precision/defines.
      const key=JSON.stringify([{...source.toJSON(),uuid:undefined},source.color.toArray(),source.emissive.toArray(),source.blendColor.toArray(),source.precision,source.defines,staticGlowHooks.program]);
      let shared=glows.get(key);
      if(!shared){
        shared=source.clone();
        // MeshStandardMaterial.copy resets defines to STANDARD, even when
        // the source has additional compile-time settings.
        shared.defines={...source.defines};
        // Material.clone() omits these hooks. Preserve both the exact cel/hue
        // patches and their cache key; copying just colors would change art.
        shared.onBeforeCompile=source.onBeforeCompile;shared.customProgramCacheKey=source.customProgramCacheKey;
        shared.userData.sharedResource=true;glows.set(key,shared);
      }
      mesh.material=shared;
    });
  }
  let resourcesDisposed=false;
  function disposeResources(){
    if(resourcesDisposed)return;resourcesDisposed=true;
    // Call only after every batch/model has gone. ModelHandle.dispose frees
    // the detached original lamps; its sharedResource check retains these.
    for(const material of glows.values())material.dispose();glows.clear();
    libraries.low.dispose();libraries.medium.dispose();
  }
  const occluderRadius=Math.min(radius-1.45,...[...fits.values()].map(f=>f.baseRadius-.01))-.02;
  const cameraCutawayParts=options.cameraCutaway?village.objects.flatMap(object=>object.kind==='structure'
    ?cameraBlueprintRegistry(object,village.blueprints[object.blueprintHash!],fits.get(object.id)!):[]):[];
  const configured:TownRendererOptions={objects:village.objects,planetRadius:radius,occluderRadius,maxChunkRadius:Infinity,cameraCutawayParts,
    districts:'renderDistricts' in village?village.renderDistricts as {id:string;center:[number,number,number];objectIds:readonly string[]}[]:undefined,
    buildObject:(o,lod)=>{
      // Geometry can simplify with distance; the same saved surface must keep
      // its material identity. The source's low kit palette folds the blue-grey
      // lane into cream stone. Use the medium palette for both geometry tiers.
      // Standalone lamps already resolve semantic keys without this folding,
      // and their source factory derives geometry LOD from the library itself.
      const library=o.kind==='lamp'&&lod==='low'?libraries.low:libraries.medium;
      if(o.kind==='structure'){
        const parts=village.blueprints[o.blueprintHash!],fit=fits.get(o.id)!;
        const model=(options.cameraCutaway?buildCameraBlueprintModel:buildBlueprintModel)(parts,library,lod,{foundationDepth:fit.foundationDepth,sockets:false});
        let finish:ReturnType<typeof buildStructureFinish>|undefined;
        try{
          shareStaticGlows(model.object);
          finish=buildStructureFinish(parts,library,options.cameraCutaway?{cameraPartSlots:cameraPartSlots(parts)}:{});model.object.add(finish.object);
          const transform=placedTransform({dir:o.position,yaw:o.rotation},fit);
          model.object.position.fromArray(transform.position);model.object.quaternion.fromArray(transform.quaternion);
          return {object:model.object,dispose(){finish!.dispose();model.dispose();}};
        }catch(error){finish?.dispose();model.dispose();throw error;}
      }
      const object=builtObject(o.kind,o.assetVersion??1,lod,library),normal=new T.Vector3(...o.position);
      object.position.copy(normal).multiplyScalar(fits.get(o.id)!.baseRadius+.015);
      object.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),normal);object.rotateY(o.rotation);
      return {object,dispose(){disposeGeometry(object);}};
    },...options};
  return {configured,disposeResources,initialFitMs};
}
function ownTown(town:ReturnType<typeof createTownRenderer>,prepared:ReturnType<typeof prepareTownOptions>){
  const {disposeResources,initialFitMs}=prepared;
  let disposed=false;
  const result={...town,stats:()=>({...town.stats(),initialFitMs}),
    update:(...args:Parameters<typeof town.update>)=>({...town.update(...args),initialFitMs}),dispose(){if(disposed)return;disposed=true;town.dispose();disposeResources();}};
  result.root.userData.disposeOwned=result.dispose;return result;
}
export function createPublicTownArt(village:SamplePublicVillage,radius:number,options:PublicTownOptions={}){
  const prepared=prepareTownOptions(village,radius,options);
  try{return ownTown(createTownRenderer(prepared.configured),prepared);}
  catch(error){prepared.disposeResources();throw error;}
}
export async function createPublicTownArtAsync(village:SamplePublicVillage,radius:number,options:PublicTownOptions={},preparation:TownRenderPreparation & {onGroundProgress?:(done:number,total:number)=>void}={}){
  const yieldFrame=preparation.yieldFrame??(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
  const warm=await prewarmTerrainFits({...village,radius},{yieldFrame,signal:preparation.signal,onProgress:preparation.onGroundProgress});
  if(warm.cancelled)throw new DOMException('Loading cancelled.','AbortError');
  // Reuse the exact fits already computed in frame-sized batches. Rebuilding
  // this Map used to repeat all blueprint footprints in one synchronous task.
  const prepared=prepareTownOptions(village,radius,options,warm.fits);
  try{return ownTown(await createTownRendererAsync(prepared.configured,{...preparation,yieldFrame}),prepared);}
  catch(error){prepared.disposeResources();throw error;}
}
