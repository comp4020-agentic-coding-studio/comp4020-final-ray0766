import {HABITAT_CABIN} from '../shared/harbour-layout.ts';
export {HABITAT_CABIN} from '../shared/harbour-layout.ts';
import * as T from 'three';
import { PartBuilder } from '../assets/claude-geometry/style/geometry.ts';
import type { LodTier } from '../assets/claude-geometry/style/lod.ts';
import { PART_IDS,emitPart } from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import type { PartId } from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import type { StyleLibrary } from '../assets/claude-geometry/style/materials.ts';
import { disposeObject3D } from '../assets/claude-geometry/core/dispose.ts';
import { libraryMaterials, liningCastsNoShadow, makeKit } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { createWorldStyleLibrary } from './presentation.ts';
import { harbourMaterials } from './harbour-materials.ts';
import type { Vec3 } from '../shared/world.ts';

export const SHARED_ASSET_VERSION='sunseed-village/3';
let materialLibrary: StyleLibrary | null = null;
export const worldMaterials = () => materialLibrary ??= createWorldStyleLibrary();
export type SharedAssetId=PartId|'service.pipe'|'service.light'|'pad.tile';
export interface AssetInstance {part:SharedAssetId;position:Vec3;yaw?:number}
// Same metre / +Y-up / +Z-exterior convention as Claude's committed geometry kit.
// Connection hints are asset metadata, not a second editor or server authority.
export const SHARED_ASSETS: readonly SharedAssetId[]=[...PART_IDS,'service.pipe','pad.tile'];
export function assetConnections(id:SharedAssetId){
  if(id.startsWith('wall.'))return[{name:'left',position:[-.5,0,0]},{name:'right',position:[.5,0,0]},{name:'top',position:[0,2.2,0]}];
  if(id==='structure.column'||id==='service.pipe')return[{name:'base',position:[0,0,0]},{name:'top',position:[0,2.2,0]}];
  return[{name:'centre',position:[0,0,0]},{name:'front',position:[0,0,.5]},{name:'back',position:[0,0,-.5]}];
}
export function sharedParts(instances:readonly AssetInstance[],lod:LodTier='medium'){
  const p=harbourMaterials(),b=new PartBuilder(lod),lib=worldMaterials();
  const source=libraryMaterials(lib),kit=makeKit(b,source);
  for(const instance of instances)b.within({position:instance.position,rotation:[0,instance.yaw??0,0]},()=>{
    if(instance.part==='service.pipe'){
      // A simple rain pipe and timber brackets, inside the former service pipe.
      b.cylinder(p.metal,.055,.055,2.2,{position:[0,1.1,0]});for(const y of [.18,1.1,2.02]){b.cylinder(p.copper,.072,.072,.065,{position:[0,y,0]});b.box(p.dark,[.20,.09,.10],{position:[0,y,-.07]},0);}
    }else if(instance.part==='service.light'){
      // This host prop stays 2.23 m high; it is not the blueprint's 3.42 m lamp.
      b.box(p.concrete,[.25,.12,.25],{position:[0,.06,0]},0);
      b.cylinder(p.dark,.045,.065,1.80,{position:[0,1.02,0]},{segments:6});
      b.box(p.metal,[.38,.035,.27],{position:[0,1.93,0]},0);
      b.box(p.amber,[.28,.035,.18],{position:[0,1.96,0]},0);
      for(const x of [-.16,.16])for(const z of [-.10,.10])b.box(p.metal,[.025,.19,.025],{position:[x,2.055,z]},0);
      b.box(p.pale,[.35,.02,.23],{position:[0,2.14,0]},0);
      b.cylinder(p.copper,0,.25,.08,{position:[0,2.19,0],rotation:[0,Math.PI/4,0]},{segments:4});
      b.emitter('street',[0,1.96,0],[0,-1,0]);
    }else if(instance.part==='pad.tile'){
      emitPart('floor.deck',lib.look,kit);for(const x of [-.44,.44])b.box(p.pale,[.027,.01,.65],{position:[x,.012,0]},0);b.box(p.pale,[.08,.008,.33],{position:[0,.014,0]},0);
    }else emitPart(instance.part,lib.look,kit);
  });
  const built=b.build(SHARED_ASSET_VERSION);built.group.userData.assetKit=SHARED_ASSET_VERSION;built.group.userData.parts=instances.map(i=>({...i,position:[...i.position]}));built.group.userData.lod=lod;
  liningCastsNoShadow(built.group,source,lod);
  built.group.traverse(o=>{if(o instanceof T.Mesh&&(o.material===p.amber||(o.material as T.Material).name==='blueprint:lamp'))o.castShadow=false;});
  instances.forEach((item,i)=>{const socket=new T.Object3D();socket.name=`asset:${i}:${item.part}`;socket.position.fromArray(item.position);socket.rotation.y=item.yaw??0;socket.userData={part:item.part,connections:assetConnections(item.part)};built.group.add(socket);});
  let disposed=false;built.group.userData.disposeOwned=()=>{if(disposed)return;disposed=true;disposeObject3D(built.group);};
  return built.group;
}
export const habitatCabin=()=>sharedParts(HABITAT_CABIN);
