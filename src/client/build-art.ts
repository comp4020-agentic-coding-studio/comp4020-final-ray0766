import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { habitatCabin,sharedParts,SHARED_ASSET_VERSION } from './shared-assets.ts';
import { harbourMaterials } from './harbour-materials.ts';
import type { BuildKind } from '../shared/planets.ts';
import { applyCel } from '../assets/claude-geometry/style/cel.ts';
import { VILLAGE } from '../assets/claude-geometry/style/look.ts';
export function builtObject(kind: BuildKind) {
  if(kind==='cottage')return habitatCabin();
  if(kind==='lamp')return sharedParts([{part:'service.light',position:[0,0,0]}]);
  const g=new T.Group(),p=harbourMaterials();
  const add=(geo:T.BufferGeometry,m:T.Material,pos:number[])=>{const mesh=new T.Mesh(geo,m);mesh.position.fromArray(pos);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;};
  if(kind==='path'){
    for(const [x,z,w,d]of [[-.22,-.20,.34,.29],[.20,-.18,.33,.33],[-.16,.18,.43,.31],[.26,.22,.25,.27]])add(new RoundedBoxGeometry(w,.065,d,1,.025),p.concrete,[x,.06,z]);
  }else if(kind==='bench'){
    for(const x of [-.43,.43])add(new RoundedBoxGeometry(.14,.44,.46,1,.025),p.edge,[x,.22,0]);
    for(let i=0;i<4;i++)add(new RoundedBoxGeometry(1.13,.055,.10,1,.015),p.dark,[0,.46,(i-1.5)*.115]);
    for(const x of [-.47,.47])add(new T.BoxGeometry(.065,.35,.065),p.dark,[x,.64,-.25]);
    for(let i=0;i<2;i++)add(new RoundedBoxGeometry(1.13,.105,.05,1,.015),p.dark,[0,.65+i*.13,-.26]);
  }else if(kind==='tree'){
    const leaf=applyCel(new T.MeshStandardMaterial({color:'#93a571',roughness:.92}),VILLAGE.cel!);leaf.userData.ownedResource=true;
    add(new T.CylinderGeometry(.07,.12,1.2,7),p.dark,[0,.6,0]);
    for(const side of [-1,1]){const branch=add(new T.CylinderGeometry(.035,.055,.6,6),p.dark,[side*.10,.94,0]);branch.rotation.z=-side*.45;}
    for(let i=0;i<3;i++){const a=i*2.4;add(new T.IcosahedronGeometry(.40,1),leaf,[Math.sin(a)*.16,1.2+i*.24,Math.cos(a)*.13]).scale.set(1,.9,.9);}
  }else{
    add(new T.CylinderGeometry(.23,.18,.20,10),p.copper,[0,.10,0]);add(new T.CylinderGeometry(.25,.25,.055,10),p.copper,[0,.21,0]);add(new T.CylinderGeometry(.216,.216,.012,10),p.dark,[0,.24,0]);
    const leaf=applyCel(new T.MeshStandardMaterial({color:'#789380',roughness:.8}),VILLAGE.cel!);leaf.userData.ownedResource=true;
    for(let i=0;i<5;i++){const x=Math.sin(i*2)*.13,z=Math.cos(i*2)*.12;add(new T.CylinderGeometry(.013,.018,.24,5),leaf,[x,.35,z]);for(let petal=0;petal<5;petal++){const a=petal/5*Math.PI*2;add(new T.IcosahedronGeometry(.035,0),i%2?p.pale:p.copper,[x+Math.sin(a)*.035,.48,z+Math.cos(a)*.035]);}add(new T.IcosahedronGeometry(.024,0),p.pale,[x,.50,z]);}
  }
  // Static local props use one mesh per material; instances still retain their
  // own root/transform for picking, history and owner editing.
  const batches=new Map<T.Material,T.BufferGeometry[]>();
  for(const o of [...g.children])if(o instanceof T.Mesh){o.updateMatrix();const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(o.matrix);const bucket=batches.get(o.material as T.Material)??[];bucket.push(geo);batches.set(o.material as T.Material,bucket);o.geometry.dispose();o.removeFromParent();}
  for(const [m,parts]of batches){const merged=mergeGeometries(parts);if(merged)add(merged,m,[0,0,0]);parts.forEach(part=>part.dispose());}
  g.userData.assetKit=SHARED_ASSET_VERSION;return g;
}
export function disposeGeometry(root: T.Object3D) {
  if (typeof root.userData.disposeOwned === 'function') { root.userData.disposeOwned(); return; }
  const textures=new Set<T.Texture>();
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  root.traverse(o=>{if(o instanceof T.Mesh || o instanceof T.Line){if(!o.geometry.userData.sharedResource&&!geometries.has(o.geometry)){geometries.add(o.geometry);o.geometry.dispose();}const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(m.userData.sharedResource||materials.has(m))continue;materials.add(m);if(m.userData.ownedResource){if(m instanceof T.MeshStandardMaterial)for(const texture of [m.map,m.bumpMap,m.roughnessMap,m.emissiveMap,m.normalMap,m.metalnessMap,m.aoMap])if(texture?.userData.ownedResource&&!textures.has(texture)){textures.add(texture);texture.dispose();}m.dispose();}else if(m instanceof T.MeshStandardMaterial && m.map){m.map.dispose();m.dispose();}else if(m instanceof T.MeshBasicMaterial){m.map?.dispose();m.dispose();}else if(m instanceof T.LineBasicMaterial || (m instanceof T.MeshToonMaterial && (m.vertexColors || !m.gradientMap)))m.dispose();}}});
  root.removeFromParent();
}
