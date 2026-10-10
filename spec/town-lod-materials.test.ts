import {expect,it} from 'vitest';
import {Color,Mesh,MeshStandardMaterial,Vector3} from 'three';
import type {Object3D} from 'three';
import {createPublicTownArt} from '../src/client/public-town-art.ts';
import {StyleLibrary} from '../src/assets/claude-geometry/style/materials.ts';
import {buildBlueprintModel} from '../src/assets/claude-geometry/blueprint/model3d.ts';
import type {PartPlacement} from '../src/assets/claude-geometry/blueprint/model.ts';
import {villageCottage} from '../src/assets/claude-geometry/blueprint/samples.ts';
import {VILLAGE} from '../src/assets/claude-geometry/style/look.ts';
import {structureFit} from '../src/shared/blueprints.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import {SAMPLE_PUBLIC_ENVIRONMENT} from '../src/shared/sample-public-village.ts';
import type {SamplePublicVillage} from '../src/shared/sample-public-village.ts';
import {buildStructureFinish} from '../src/client/structure-finish.ts';
import {builtObject,disposeGeometry} from '../src/client/build-art.ts';

const radius=21.6,eye=new Vector3(0,29,0),feet=new Vector3(0,22,0);
function village(parts:PartPlacement[],kind:'structure'|'lamp'='structure'):SamplePublicVillage{
  return {version:6,radius,environment:SAMPLE_PUBLIC_ENVIRONMENT,
    objects:[{id:'sample',kind,assetVersion:2,position:[0,1,0],rotation:0,version:1,blueprintHash:kind==='structure'?'sample':undefined}],blueprints:{sample:parts},
    routes:[],pavingRoutes:[],renderDistricts:[{id:'north',name:'North',nameZh:'北',center:[0,1,0],objectIds:['sample']}],
    destinations:[],buildings:[],roadObjects:[],landmarks:[]};
}
function materials(root:Object3D){
  const result=new Map<string,MeshStandardMaterial>();
  root.traverseVisible(object=>{if(object instanceof Mesh&&object.material instanceof MeshStandardMaterial)result.set(object.material.name,object.material);});
  return result;
}
function triangles(root:Object3D){let n=0;root.traverse(object=>{if(object instanceof Mesh)n+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;});return n;}

it('keeps lane and paving materials identical when the actual town changes from overview low to street medium',()=>{
  const parts:PartPlacement[]=[{n:1,part:'street.road.plain',x:0,z:0,level:0,rot:0},{n:2,part:'street.paving',x:1,z:0,level:0,rot:0}];
  const town=createPublicTownArt(village(parts),radius),referenceLibrary=new StyleLibrary('low',{look:'village'});
  const fit=structureFit(parts,[0,1,0],0,fieldOf(SAMPLE_PUBLIC_ENVIRONMENT,radius));
  const reference=buildBlueprintModel(parts,referenceLibrary,'low',{foundationDepth:fit.foundationDepth,sockets:false});
  try{
    const low=town.update(new Vector3(0,70,0),undefined,{globalLow:true}),lowMaterials=materials(town.root);
    expect(low.activeTriangles).toBe(reference.triangles);
    const near=town.update(eye,feet),nearMaterials=materials(town.root);expect(near.mediumChunks).toBe(1);
    for(const key of ['village:lane','village:cobble'] as const){
      const lowMaterial=lowMaterials.get('custom:'+key+'+indoor')!;
      expect(lowMaterial,key).toBeDefined();expect(lowMaterial.color.getHex()).toBe(new Color(VILLAGE.materials[key]).getHex());
      expect(nearMaterials.get('custom:'+key+'+indoor')).toBe(lowMaterial);
    }
    // Splitting previously folded surfaces has a real batching cost. This
    // fixture keeps that cost explicit while retaining the original triangles.
    expect(low.activeDrawCalls).toBeGreaterThan(reference.drawCalls);
    expect(low.activeDrawCalls).toBe(near.activeDrawCalls);
  }finally{town.dispose();reference.dispose();referenceLibrary.dispose();}
});

it('retains the original low cottage geometry while keeping low and medium surface colours stable',()=>{
  const parts=villageCottage().parts,town=createPublicTownArt(village(parts),radius),library=new StyleLibrary('low',{look:'village'});
  const fit=structureFit(parts,[0,1,0],0,fieldOf(SAMPLE_PUBLIC_ENVIRONMENT,radius));
  const model=buildBlueprintModel(parts,library,'low',{foundationDepth:fit.foundationDepth,sockets:false}),finish=buildStructureFinish(parts,library);
  try{
    const low=town.update(new Vector3(0,70,0),undefined,{globalLow:true}),before=materials(town.root);
    expect(low.activeTriangles).toBe(model.triangles+finish.triangles);
    const medium=town.update(eye,feet),after=materials(town.root);expect(medium.mediumChunks).toBe(1);expect(medium.activeTriangles).toBeGreaterThan(low.activeTriangles);
    for(const [key,material]of before)if(after.has(key))expect(after.get(key)!.color.getHex(),key).toBe(material.color.getHex());
  }finally{town.dispose();model.dispose();finish.dispose();library.dispose();}
});

it('keeps standalone lamps at their original low geometry tier despite the shared kit palette',()=>{
  const town=createPublicTownArt(village([],'lamp'),radius),library=new StyleLibrary('low',{look:'village'}),reference=builtObject('lamp',2,'low',library);
  try{expect(town.update(new Vector3(0,70,0),undefined,{globalLow:true}).activeTriangles).toBe(triangles(reference));}
  finally{town.dispose();disposeGeometry(reference);library.dispose();}
});
