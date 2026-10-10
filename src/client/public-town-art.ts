import * as T from 'three';
import {StyleLibrary} from '../assets/claude-geometry/style/materials.ts';
import {buildBlueprintModel} from '../assets/claude-geometry/blueprint/model3d.ts';
import {placedTransform} from '../assets/claude-geometry/blueprint/placement.ts';
import {structureFit} from '../shared/blueprints.ts';
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
type PublicTownOptions=Pick<TownRendererOptions,'maxChunkRadius'|'mediumCacheChunks'|'maxBuildsPerUpdate'>;
function prepareTownOptions(village:SamplePublicVillage,radius:number,options:PublicTownOptions,preparedFits?:ReadonlyMap<string,GroundFit>){
  const field=fieldOf(village.environment,radius),fitStart=performance.now();
  const fits=preparedFits??new Map(village.objects.map(o=>[o.id,o.kind==='structure'
    ?structureFit(village.blueprints[o.blueprintHash!],o.position,o.rotation,field):objectSeat(field,o,village.blueprints)]));
  if(village.objects.some(o=>!fits.has(o.id)))throw new Error('Prepared town support is incomplete.');
  const initialFitMs=performance.now()-fitStart;
  const libraries={low:new StyleLibrary('low',{look:'village',scans:false}),medium:new StyleLibrary('medium',{look:'village',scans:false})};
  const occluderRadius=Math.min(radius-1.45,...[...fits.values()].map(f=>f.baseRadius-.01))-.02;
  const configured:TownRendererOptions={objects:village.objects,planetRadius:radius,occluderRadius,maxChunkRadius:Infinity,
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
        const model=buildBlueprintModel(parts,library,lod,{foundationDepth:fit.foundationDepth,sockets:false});
        const finish=buildStructureFinish(parts,library);model.object.add(finish.object);
        const transform=placedTransform({dir:o.position,yaw:o.rotation},fit);
        model.object.position.fromArray(transform.position);model.object.quaternion.fromArray(transform.quaternion);
        return {object:model.object,dispose(){finish.dispose();model.dispose();}};
      }
      const object=builtObject(o.kind,o.assetVersion??1,lod,library),normal=new T.Vector3(...o.position);
      object.position.copy(normal).multiplyScalar(fits.get(o.id)!.baseRadius+.015);
      object.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),normal);object.rotateY(o.rotation);
      return {object,dispose(){disposeGeometry(object);}};
    },...options};
  return {configured,libraries,initialFitMs};
}
function ownTown(town:ReturnType<typeof createTownRenderer>,prepared:ReturnType<typeof prepareTownOptions>){
  const {libraries,initialFitMs}=prepared;
  let disposed=false;
  const result={...town,stats:()=>({...town.stats(),initialFitMs}),
    update:(...args:Parameters<typeof town.update>)=>({...town.update(...args),initialFitMs}),dispose(){if(disposed)return;disposed=true;town.dispose();libraries.low.dispose();libraries.medium.dispose();}};
  result.root.userData.disposeOwned=result.dispose;return result;
}
export function createPublicTownArt(village:SamplePublicVillage,radius:number,options:PublicTownOptions={}){
  const prepared=prepareTownOptions(village,radius,options);
  try{return ownTown(createTownRenderer(prepared.configured),prepared);}
  catch(error){prepared.libraries.low.dispose();prepared.libraries.medium.dispose();throw error;}
}
export async function createPublicTownArtAsync(village:SamplePublicVillage,radius:number,options:PublicTownOptions={},preparation:TownRenderPreparation & {onGroundProgress?:(done:number,total:number)=>void}={}){
  const yieldFrame=preparation.yieldFrame??(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
  const warm=await prewarmTerrainFits({...village,radius},{yieldFrame,signal:preparation.signal,onProgress:preparation.onGroundProgress});
  if(warm.cancelled)throw new DOMException('Loading cancelled.','AbortError');
  // Reuse the exact fits already computed in frame-sized batches. Rebuilding
  // this Map used to repeat all blueprint footprints in one synchronous task.
  const prepared=prepareTownOptions(village,radius,options,warm.fits);
  try{return ownTown(await createTownRendererAsync(prepared.configured,{...preparation,yieldFrame}),prepared);}
  catch(error){prepared.libraries.low.dispose();prepared.libraries.medium.dispose();throw error;}
}
