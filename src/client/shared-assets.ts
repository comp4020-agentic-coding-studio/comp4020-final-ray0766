import * as T from 'three';
import { PartBuilder } from '../assets/claude-geometry/style/geometry.ts';
import type { LodTier } from '../assets/claude-geometry/style/lod.ts';
import { PART_IDS,PARTS } from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import type { PartId } from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import { StyleLibrary } from '../assets/claude-geometry/style/materials.ts';
import { disposeObject3D } from '../assets/claude-geometry/core/dispose.ts';
import { libraryMaterials, makeKit } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { harbourMaterials } from './harbour-materials.ts';
import type { Vec3 } from '../shared/world.ts';

export const SHARED_ASSET_VERSION='sunseed-structure/2';
let materialLibrary: StyleLibrary | null = null;
export const worldMaterials = () => materialLibrary ??= new StyleLibrary('medium', {scans: typeof document !== 'undefined'});
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
  const p=harbourMaterials(),b=new PartBuilder(lod);
  const kit=makeKit(b,libraryMaterials(worldMaterials()));
  for(const instance of instances)b.within({position:instance.position,rotation:[0,instance.yaw??0,0]},()=>{
    if(instance.part==='service.pipe'){
      b.cylinder(p.copper,.055,.055,2.2,{position:[0,1.1,0]});for(const y of [.18,1.1,2.02]){b.cylinder(p.metal,.083,.083,.09,{position:[0,y,0]});b.box(p.dark,[.24,.09,.10],{position:[0,y,-.07]});for(const x of [-.085,.085])b.bolt(p.pale,{position:[x,y,-.015],rotation:[Math.PI/2,0,0]});}
    }else if(instance.part==='service.light'){
      b.box(p.dark,[.25,.12,.25],{position:[0,.06,0]});b.cylinder(p.metal,.055,.075,1.92,{position:[0,1.04,0]});b.box(p.dark,[.50,.20,.35],{position:[0,2.08,0]});b.box(p.amber,[.40,.035,.26],{position:[0,1.96,0]});b.box(p.pale,[.53,.055,.38],{position:[0,2.2,0]});for(const x of [-.19,.19])b.bolt(p.metal,{position:[x,2.23,.1]});
    }else if(instance.part==='pad.tile'){
      PARTS['floor.deck'].emit(kit);for(const x of [-.44,.44])b.box(p.cyan,[.027,.01,.65],{position:[x,.012,0]},0);b.box(p.pale,[.08,.008,.33],{position:[0,.014,0]},0);
    }else PARTS[instance.part].emit(kit);
  });
  const built=b.build(SHARED_ASSET_VERSION);built.group.userData.assetKit=SHARED_ASSET_VERSION;built.group.userData.parts=instances.map(i=>({...i,position:[...i.position]}));built.group.userData.lod=lod;
  instances.forEach((item,i)=>{const socket=new T.Object3D();socket.name=`asset:${i}:${item.part}`;socket.position.fromArray(item.position);socket.rotation.y=item.yaw??0;socket.userData={part:item.part,connections:assetConnections(item.part)};built.group.add(socket);});
  built.group.userData.disposeOwned=()=>disposeObject3D(built.group);
  return built.group;
}
export const HABITAT_CABIN:readonly AssetInstance[]=[
  {part:'floor.deck',position:[-.5,.10,0]},{part:'floor.deck',position:[.5,.10,0]},
  {part:'wall.door',position:[-.5,.10,.5]},{part:'wall.window',position:[.5,.10,.5]},
  {part:'wall.solid',position:[-.5,.10,-.5],yaw:Math.PI},{part:'wall.louvre',position:[.5,.10,-.5],yaw:Math.PI},
  {part:'wall.window',position:[1,.10,0],yaw:Math.PI/2},{part:'wall.solid',position:[-1,.10,0],yaw:-Math.PI/2},
  {part:'roof.deck',position:[-.5,2.3,0]},{part:'roof.deck',position:[.5,2.3,0]},
  {part:'service.pipe',position:[.88,.12,-.64]},
];
export const habitatCabin=()=>sharedParts(HABITAT_CABIN);
