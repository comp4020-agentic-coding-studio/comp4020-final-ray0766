import * as T from 'three';
import {PRESENTATION} from './presentation.ts';
import {terrainModel,terrainModelAsync} from './terrain-model.ts';
import {RADIUS} from '../shared/world.ts';
import {samplePublicVillage,isSamplePublicRadius} from '../shared/sample-public-village.ts';
import {createPublicTownArt,createPublicTownArtAsync} from './public-town-art.ts';
import type {TownRenderPreparation} from './town-renderer.ts';
import {applyArtMaterial} from './art-profile.ts';
import {VILLAGE} from '../assets/claude-geometry/style/look.ts';

/** Distant legacy worlds keep their slot and radius. Their original procedural
 * land/sea distribution is drawn as flat colours rather than lunar photo maps. */
function legacyOrbit(slot:number,radius:number){
  const root=new T.Group(),geometry=new T.IcosahedronGeometry(radius,4),positions=geometry.getAttribute('position'),colors:number[]=[];
  const land=['#5ea476','#e0d3ab','#91b7aa','#bfa98a'][slot%4];
  for(let i=0;i<positions.count;i++){
    const point=new T.Vector3().fromBufferAttribute(positions,i).normalize();
    const patch=Math.sin(point.x*8+slot*1.37)*Math.cos(point.z*9-point.y*3);
    const colour=new T.Color(Math.abs(point.y)>.87?'#eef3f1':slot%4===0&&patch<-.18?'#3f8ab3':land);
    colors.push(colour.r,colour.g,colour.b);
  }
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const material=applyArtMaterial(new T.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0}));material.userData.ownedResource=true;
  const globe=new T.Mesh(geometry,material);root.add(globe);
  root.userData.disposeOwned=()=>{geometry.dispose();material.dispose();root.removeFromParent();};
  return root;
}

export function orbitalPlanet(slot:number,environment?:string|null,radius=RADIUS){
  const village=slot===0&&isSamplePublicRadius(radius)?samplePublicVillage(radius):null;
  if(village){
    const root=new T.Group(),terrain=terrainModel(village.environment,village.objects,village.blueprints,'low',false,radius,village.routes);
    const town=createPublicTownArt(village,radius,{mediumCacheChunks:0});root.add(terrain.object,town.root);
    terrain.setSunDirection([...PRESENTATION.space.sun.position]);
    root.userData.updateTown=(eye:T.Vector3)=>{root.userData.townStats=town.update(eye,undefined,{lowOnly:true,globalLow:true});};
    let disposed=false;root.userData.disposeOwned=()=>{if(disposed)return;disposed=true;town.dispose();terrain.dispose();root.removeFromParent();};
    return root;
  }
  if(environment){const model=terrainModel(environment,[],{},'low',false,radius);model.setSunDirection([...PRESENTATION.space.sun.position]);return model.object;}
  return legacyOrbit(slot,radius);
}

/** Build away from the visible scene. The existing distant sphere stays
 * visible until the full-detail handle is ready and atomically attached. */
export async function orbitalPlanetAsync(slot:number,environment:string|null|undefined,radius:number,preparation:TownRenderPreparation & {onGroundProgress?:(done:number,total:number)=>void}={}){
  const yieldFrame=preparation.yieldFrame??(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
  const check=()=>{if(preparation.signal?.aborted)throw new DOMException('Loading cancelled.','AbortError');};
  await yieldFrame();check();
  const village=slot===0&&isSamplePublicRadius(radius)?samplePublicVillage(radius):null;
  if(!village&&!environment)return legacyOrbit(slot,radius);
  let town:Awaited<ReturnType<typeof createPublicTownArtAsync>>|undefined,terrain:ReturnType<typeof terrainModel>|undefined;
  try{
    if(village)town=await createPublicTownArtAsync(village,radius,{mediumCacheChunks:0},preparation);
    await yieldFrame();check();
    terrain=await terrainModelAsync(village?.environment??environment!,village?.objects??[],village?.blueprints??{},'low',false,radius,village?.routes??[],
      {signal:preparation.signal,budgetMs:preparation.budgetMs??6,yieldFrame,onProgress:preparation.onGroundProgress});
    terrain.setSunDirection([...PRESENTATION.space.sun.position]);
    if(!town)return terrain.object;
    const root=new T.Group(),ownedTown=town,ownedTerrain=terrain;root.add(terrain.object,town.root);
    root.userData.updateTown=(eye:T.Vector3)=>{root.userData.townStats=ownedTown.update(eye,undefined,{lowOnly:true,globalLow:true});};
    let disposed=false;root.userData.disposeOwned=()=>{if(disposed)return;disposed=true;ownedTown.dispose();ownedTerrain.dispose();root.removeFromParent();};
    return root;
  }catch(error){town?.dispose();terrain?.dispose();throw error;}
}

export function configureSpace(scene:T.Scene,_renderer:T.WebGLRenderer){
  const look=PRESENTATION.space;
  scene.background=null;scene.fog=new T.FogExp2(VILLAGE.fog,look.fog.density);
  scene.environment=null;scene.environmentIntensity=0;
  scene.add(new T.HemisphereLight(VILLAGE.light.sky,VILLAGE.light.ground,VILLAGE.light.fillIntensity));
  const sun=new T.DirectionalLight(VILLAGE.light.key,VILLAGE.light.keyIntensity);sun.position.fromArray(look.sun.position);scene.add(sun);
  // The camera-following cloud sky belongs to the drawing pipeline. There are
  // no image lights, star field or extra scenery worlds behind the real atlas.
  void _renderer;
}
