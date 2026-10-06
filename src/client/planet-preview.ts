import * as T from 'three';
import type { StyleLibrary } from '../assets/claude-geometry/style/materials.ts';
import { buildBlueprintModel } from '../assets/claude-geometry/blueprint/model3d.ts';
import { placedTransform } from '../assets/claude-geometry/blueprint/placement.ts';
import { structureFit } from '../shared/blueprints.ts';
import type { BlueprintContents } from '../shared/blueprints.ts';
import type { PlacedObject } from '../shared/planets.ts';
import { fieldOf,objectSeat } from '../shared/terrain.ts';
import { terrainModel } from './terrain-model.ts';
import { builtObject,disposeGeometry } from './build-art.ts';
export function planetPreview(environment:string|null,objects:PlacedObject[],blueprints:BlueprintContents,library:StyleLibrary){
 const root=new T.Group(),release:(()=>void)[]=[],field=fieldOf(environment);
 if(environment){const model=terrainModel(environment,objects,blueprints);root.add(model.object);release.push(()=>model.dispose());}
 else{const geometry=new T.IcosahedronGeometry(10,4),a=geometry.attributes.position;for(let i=0;i<a.count;i++){const p=new T.Vector3().fromBufferAttribute(a,i).normalize();a.setXYZ(i,...p.multiplyScalar(10+field.heightAt(p.toArray() as [number,number,number])).toArray() as [number,number,number]);}geometry.computeVertexNormals();const material=new T.MeshStandardMaterial({color:'#696f66',roughness:.96});root.add(new T.Mesh(geometry,material));release.push(()=>{geometry.dispose();material.dispose();});}
 for(const o of objects){
  if(o.kind==='structure'){const parts=blueprints[o.blueprintHash!];if(!parts)throw Error('Preview blueprint is missing.');const fit=structureFit(parts,o.position,o.rotation,field),model=buildBlueprintModel(parts,library,'medium',{foundationDepth:fit.foundationDepth}),t=placedTransform({dir:o.position,yaw:o.rotation},fit);model.object.position.fromArray(t.position);model.object.quaternion.fromArray(t.quaternion);root.add(model.object);release.push(()=>model.dispose());}
  else{const group=builtObject(o.kind),normal=new T.Vector3(...o.position),radius=environment?objectSeat(field,o,blueprints).baseRadius:10+field.heightAt(o.position);group.position.copy(normal).multiplyScalar(radius+.015);group.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),normal);group.rotateY(o.rotation);root.add(group);release.push(()=>disposeGeometry(group));}
 }
 let disposed=false;return {object:root,dispose(){if(disposed)return;disposed=true;release.forEach(fn=>fn());root.removeFromParent();}};
}
