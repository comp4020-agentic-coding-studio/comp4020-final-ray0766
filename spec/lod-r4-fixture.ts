import * as T from 'three';
import {StyleLibrary} from '../src/assets/claude-geometry/style/materials.ts';
import {LOD_TIERS} from '../src/assets/claude-geometry/style/lod.ts';
import {buildPart,PART_IDS,PARTS} from '../src/assets/claude-geometry/blueprint/parts/catalogue.ts';
import {buildBlueprintModel} from '../src/assets/claude-geometry/blueprint/model3d.ts';
import {industrialCabin,surveyPost} from '../src/assets/claude-geometry/blueprint/samples.ts';
import {createShipModel} from '../src/assets/claude-geometry/ship/factory.ts';
import {STARTERS} from '../src/assets/claude-geometry/ship/design.ts';
import {disposeObject3D} from '../src/assets/claude-geometry/core/dispose.ts';
function contract(object:T.Object3D){const b=new T.Box3().setFromObject(object);return{bounds:[...b.min.toArray(),...b.max.toArray()],emitters:object.userData.emitters??[],sockets:object.children.filter(o=>!(o as T.Mesh).isMesh).map(o=>({name:o.name,position:o.position.toArray(),quaternion:o.quaternion.toArray(),data:o.userData}))};}
export function geometrySnapshot(){
 const entries=[];
 for(const lod of LOD_TIERS){const lib=new StyleLibrary(lod);try{
  for(const id of PART_IDS){const p=buildPart(id,lib);entries.push({id,lod,triangles:p.triangles,calls:p.drawCalls,...contract(p.group)});disposeObject3D(p.group);}
  for(const [id,bp] of [['cabin',industrialCabin()],['survey',surveyPost()]] as const){const p=buildBlueprintModel(bp,lib,lod,{foundationDepth:.2});entries.push({id,lod,triangles:p.triangles,calls:p.drawCalls,...contract(p.object)});p.dispose();}
  for(const [i,design] of STARTERS.entries()){const p=createShipModel(design,lib,lod,{decal:null});entries.push({id:'ship:'+i,lod,triangles:p.stats.triangles,calls:p.stats.drawCalls,...contract(p.object),solidBounds:[...p.bounds.min.toArray(),...p.bounds.max.toArray()],radius:p.radius,exhausts:p.exhausts.map(o=>({position:o.position.toArray(),quaternion:o.quaternion.toArray()}))});p.dispose();}
 }finally{lib.dispose();}}
 return{parts:JSON.parse(JSON.stringify(PARTS)),entries};
}
