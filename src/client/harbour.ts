import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {HUB_SHIP} from '../shared/harbour-layout.ts';
import {HUB_OBJECTS,PUBLIC_CONTENTS,PUBLIC_FIELD,HUB_COUNTS} from '../shared/public-village.ts';
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
import {buildBlueprintModel} from '../assets/claude-geometry/blueprint/model3d.ts';
import {placedTransform} from '../assets/claude-geometry/blueprint/placement.ts';
import type {Obstacle} from './scene.ts';

export function createHarbour(scene:T.Scene){
 const radius=groundRadius(),p=harbourMaterials(),scenery=new T.Group(),blocks:Obstacle[]=[];scene.add(scenery);
 const mesh=(parent:T.Object3D,geometry:T.BufferGeometry,material:T.Material,position:number[]=[0,0,0],shadow=true)=>{const m=new T.Mesh(geometry,material);m.position.fromArray(position);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m;};
 function anchor(parent:T.Object3D,point:Vec3,yaw=0){const up=new T.Vector3(...normalize(point)),g=new T.Group();g.position.copy(surfacePoint(up));g.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),up);g.rotateY(yaw);parent.add(g);return g;}
 const ground=new T.MeshStandardMaterial({color:'#95ab7f',roughness:.98,flatShading:true});ground.userData.ownedResource=true;
 const globe=mesh(scene,new T.IcosahedronGeometry(radius,6),ground,[0,0,0],false);
 // The same model builder, foundation fit, dimensions and anchor as Colony.
 // Cloning quick-build prototypes shares materials before the static merge.
 const prototypes=new Map<BuildKind,T.Group>();
 for(const o of HUB_OBJECTS){
  if(o.kind==='structure'){
   const parts=PUBLIC_CONTENTS[o.blueprintHash!],fit=structureFit(parts,o.position,o.rotation,PUBLIC_FIELD),model=buildBlueprintModel(parts,worldMaterials(),'medium',{foundationDepth:fit.foundationDepth}),t=placedTransform({dir:o.position,yaw:o.rotation},fit);
   model.object.position.fromArray(t.position);model.object.quaternion.fromArray(t.quaternion);scenery.add(model.object);
  }else{
   let source=prototypes.get(o.kind);if(!source){source=builtObject(o.kind,o.assetVersion??1);prototypes.set(o.kind,source);}
   const root=anchor(scenery,o.position,o.rotation);root.position.multiplyScalar((radius+.015)/radius);root.add(source.clone(true));
  }
  if(objectHeight(o)>.6)blocks.push({point:new T.Vector3(...o.position),radius:objectRadius(o),height:objectHeight(o)});
 }
 const dock=anchor(scene,HUB_DOCK),parked=makeShip(),shipAnchor=anchor(scene,HUB_SHIP);shipAnchor.add(parked.root);parked.root.position.y=1.25;parked.animate(0,false);
 blocks.push({point:new T.Vector3(...HUB_SHIP),radius:2.1,height:2.5});
 const flowers=new T.Group();scene.add(flowers);
 const npcs=(Object.keys(NPCS) as NpcId[]).map(id=>{const a=anchor(scene,NPCS[id].position),avatar=courier(id);a.add(avatar.root);avatar.root.rotation.y=id==='mica'?-Math.PI/2:Math.PI/2;const beacon=mesh(a,new T.BoxGeometry(.18,.13,.035),p.pale,[0,1.9,0],false);return{id,anchor:a,avatar,beacon};});
  // Preserve the established static material batching, without model ink callbacks.
  function bake(root:T.Group){
    const ink:T.Object3D[]=[];root.traverse(o=>{if(o.name==='ink-shell'||o.name==='ink-lines')ink.push(o);});
    for(const o of ink){if((o instanceof T.Mesh||o instanceof T.Line)&&!o.geometry.userData.sharedResource)o.geometry.dispose();o.removeFromParent();}
    root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),batches=new Map<T.Material,T.BufferGeometry[]>(),meshes:T.Mesh[]=[];
    root.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));if(!g.getAttribute('uv'))g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));const bucket=batches.get(o.material)??[];bucket.push(g);batches.set(o.material,bucket);meshes.push(o);}});
    const freed=new Set<T.BufferGeometry>();for(const o of meshes){if(!o.geometry.userData.sharedResource&&!freed.has(o.geometry)){freed.add(o.geometry);o.geometry.dispose();}o.removeFromParent();}
    for(const [material,parts]of batches){const g=mergeGeometries(parts);if(g)mesh(root,g,material,[0,0,0],!material.transparent&&material!==p.amber);parts.forEach(p=>p.dispose());}
  }
  bake(scenery);scenery.userData.publicCounts=HUB_COUNTS;scenery.name='public-village';
 return {globe,scenery,blocks,flowers,npcs,dock,parked,dispose(){},height:surfaceHeight,animate(_t:number,_reduced:boolean,_eye?:T.Vector3,_up?:T.Vector3){void _t;void _reduced;void _eye;void _up;}};
}
