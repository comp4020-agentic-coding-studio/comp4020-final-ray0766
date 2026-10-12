import * as T from 'three';
import {applyArtMaterial} from './art-profile.ts';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {HUB_SHIP} from '../shared/harbour-layout.ts';
import {HUB_OBJECTS,PUBLIC_CONTENTS,publicField,HUB_COUNTS} from '../shared/public-village.ts';
import type {SamplePublicVillage} from '../shared/sample-public-village.ts';
import {fieldOf,objectSeat} from '../shared/terrain.ts';
import {structureFit} from '../shared/blueprints.ts';
import {objectRadius,objectHeight} from '../shared/planets.ts';
import type {BuildKind} from '../shared/planets.ts';
import {NPCS,normalize} from '../shared/world.ts';
import type {Vec3,NpcId} from '../shared/world.ts';
import {HUB_DOCK} from '../shared/ports.ts';
import {groundRadius,surfacePoint,surfaceHeight} from './terrain.ts';
import {courier} from './character.ts';
import {makeShip} from './ship-model.ts';
import {harbourMaterials} from './harbour-materials.ts';
import {worldMaterials} from './shared-assets.ts';
import {builtObject} from './build-art.ts';
import {buildBlueprintModel} from '../shared/blueprint-model3d.ts';
import {placedTransform} from '../assets/claude-geometry/blueprint/placement.ts';
import type {Obstacle} from './scene.ts';
import {terrainModel} from './terrain-model.ts';
import {buildStructureFinish} from './structure-finish.ts';
import {createPublicTownArt} from './public-town-art.ts';
import {MAIN_PLANET_LEDGER} from '../shared/planet-plan/main-planet.ts';
import {yawFacing,tangent} from '../shared/planet-plan/sphere.ts';
import type {V3} from '../shared/planet-plan/sphere.ts';
/** The planned planet turns the two task characters towards their street. */
function npcFacingYaw(id:NpcId):number{const at=NPCS[id].position as V3,toward=MAIN_PLANET_LEDGER.npcFacing[id] as V3;return yawFacing(at,tangent(at,[toward[0]-at[0],toward[1]-at[1],toward[2]-at[2]]));}

export function createHarbour(scene:T.Scene,village:SamplePublicVillage|null=null,preparedTown?:ReturnType<typeof createPublicTownArt>,preparedTerrain?:ReturnType<typeof terrainModel>){
 const radius=groundRadius(),p=harbourMaterials(),scenery=new T.Group(),blocks:Obstacle[]=[];scene.add(scenery);
 const mesh=(parent:T.Object3D,geometry:T.BufferGeometry,material:T.Material,position:number[]=[0,0,0],shadow=true)=>{const m=new T.Mesh(geometry,material);m.position.fromArray(position);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m;};
 function anchor(parent:T.Object3D,point:Vec3,yaw=0){const up=new T.Vector3(...normalize(point)),g=new T.Group();g.position.copy(surfacePoint(up));g.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),up);g.rotateY(yaw);parent.add(g);return g;}
 const ground=applyArtMaterial(new T.MeshStandardMaterial({color:'#5ea476',roughness:1,flatShading:true}));ground.userData.ownedResource=true;
 const terrain=village?(preparedTerrain??terrainModel(village.environment,village.objects,village.blueprints,'medium',true,radius,village.routes)):null;
 const globe=terrain?terrain.ground:mesh(scene,new T.IcosahedronGeometry(radius,6),ground,[0,0,0],false);
 if(terrain){ground.dispose();scene.add(terrain.object);}
 const objects=village?.objects??HUB_OBJECTS,contents=village?.blueprints??PUBLIC_CONTENTS;
 const field=village?fieldOf(village.environment,radius):publicField(radius);
 const finishes:ReturnType<typeof buildStructureFinish>[]=[],models:ReturnType<typeof buildBlueprintModel>[]=[];
 // The same model builder, foundation fit, dimensions and anchor as Colony.
 // Cloning quick-build prototypes shares materials before the static merge.
 const prototypes=new Map<BuildKind,T.Group>();
 const town=village?(preparedTown??createPublicTownArt(village,radius)):null;
 if(town)scenery.add(town.root);
 for(const o of objects){
  if(town){if(objectHeight(o)>.6)blocks.push({point:new T.Vector3(...o.position),radius:objectRadius(o),height:objectHeight(o)});continue;}
  if(o.kind==='structure'){
   const parts=contents[o.blueprintHash!],fit=structureFit(parts,o.position,o.rotation,field),model=buildBlueprintModel(parts,worldMaterials(),'medium',{foundationDepth:fit.foundationDepth}),t=placedTransform({dir:o.position,yaw:o.rotation},fit);
   if(village){
    model.object.traverse(child=>{if(child.name==='ink-shell')child.userData.publicSilhouette=true;});
    const finish=buildStructureFinish(parts,worldMaterials());finish.object.traverse(child=>{child.userData.publicFinish=true;});model.object.add(finish.object);finishes.push(finish);
   }
   models.push(model);model.object.position.fromArray(t.position);model.object.quaternion.fromArray(t.quaternion);scenery.add(model.object);
  }else{
   let source=prototypes.get(o.kind);if(!source){source=builtObject(o.kind,o.assetVersion??1);prototypes.set(o.kind,source);}
   const root=anchor(scenery,o.position,o.rotation);root.position.setLength((village?objectSeat(field,o,contents).baseRadius:radius)+.015);root.add(source.clone(true));
  }
  if(objectHeight(o)>.6)blocks.push({point:new T.Vector3(...o.position),radius:objectRadius(o),height:objectHeight(o)});
 }
 const dock=anchor(scene,HUB_DOCK),parked=makeShip(),shipAnchor=anchor(scene,HUB_SHIP);shipAnchor.add(parked.root);parked.root.position.y=1.25;parked.animate(0,false);
 blocks.push({point:new T.Vector3(...HUB_SHIP),radius:2.1,height:2.5});
 const flowers=new T.Group();scene.add(flowers);
 const npcs=(Object.keys(NPCS) as NpcId[]).map(id=>{const facing=village?npcFacingYaw(id):null,a=anchor(scene,NPCS[id].position,facing??0),avatar=courier(id);a.add(avatar.root);avatar.root.rotation.y=facing!==null?0:id==='mica'?-Math.PI/2:Math.PI/2;const beacon=mesh(a,new T.BoxGeometry(.18,.13,.035),p.pale,[0,1.9,0],false);return{id,anchor:a,avatar,beacon};});
  // Preserve the established static material batching, without model ink callbacks.
  function bake(root:T.Group){
    const freed=new Set<T.BufferGeometry>(),ink:T.Object3D[]=[];root.traverse(o=>{if((o.name==='ink-shell'||o.name==='ink-lines')&&!o.userData.publicSilhouette)ink.push(o);});
    for(const o of ink){if((o instanceof T.Mesh||o instanceof T.Line)&&!o.geometry.userData.sharedResource&&!freed.has(o.geometry)){freed.add(o.geometry);o.geometry.dispose();}o.removeFromParent();}
    root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),batches=new Map<T.Material,T.BufferGeometry[]>(),meshes:T.Mesh[]=[];
    root.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)&&!o.userData.publicSilhouette&&!o.userData.publicFinish){const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));if(!g.getAttribute('uv'))g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));const bucket=batches.get(o.material)??[];bucket.push(g);batches.set(o.material,bucket);meshes.push(o);}});
    for(const o of meshes){if(!o.geometry.userData.sharedResource&&!freed.has(o.geometry)){freed.add(o.geometry);o.geometry.dispose();}o.removeFromParent();}
    for(const [material,parts]of batches){const g=mergeGeometries(parts);if(g)mesh(root,g,material,[0,0,0],!material.transparent&&material!==p.amber);parts.forEach(p=>p.dispose());}
  }
  if(!town)bake(scenery);scenery.userData.publicCounts=village?{structures:objects.filter(o=>o.kind==='structure').length,objects:objects.length,destinations:village.destinations.map(d=>d.id)}:HUB_COUNTS;scenery.name='public-village';
 // Baking frees source geometry but transfers its materials to the batches.
 // Keep model handles to release their private lamps and retained silhouettes;
 // the host's following scene cleanup owns the merged batch geometry.
 return {globe,scenery,blocks,flowers,npcs,dock,parked,setSunDirection(dir:Vec3){terrain?.setSunDirection(dir);},dispose(){town?.dispose();finishes.forEach(finish=>finish.dispose());models.forEach(model=>model.dispose());terrain?.dispose();},height:surfaceHeight,animate(t:number,_reduced:boolean,_eye?:T.Vector3,_up?:T.Vector3,overview=false){terrain?.tick(t);void _reduced;if(town&&_eye){const stats=town.update(_eye,_up?.clone().multiplyScalar(radius),{globalLow:overview});scenery.userData.townStats=stats;}}};
}
