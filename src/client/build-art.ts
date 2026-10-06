import * as T from 'three';
import { habitatCabin,sharedParts,SHARED_ASSET_VERSION } from './shared-assets.ts';
import { harbourMaterials } from './harbour-materials.ts';
import type { BuildKind } from '../shared/planets.ts';
export function builtObject(kind: BuildKind) {
  if(kind==='cottage')return habitatCabin();
  if(kind==='lamp')return sharedParts([{part:'service.light',position:[0,0,0]}]);
  if(kind==='path'){const g=sharedParts([{part:'floor.deck',position:[0,.055,0]}]);g.scale.set(.82,1,.72);return g;}
  const g=new T.Group(),p=harbourMaterials();
  const add=(geo:T.BufferGeometry,m:T.Material,pos:number[])=>{const mesh=new T.Mesh(geo,m);mesh.position.fromArray(pos);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;};
  if(kind==='bench'){
    for(const x of [-.43,.43]){add(new T.BoxGeometry(.075,.44,.46),p.dark,[x,.22,0]);add(new T.BoxGeometry(.20,.045,.53),p.metal,[x,.028,0]);}
    for(let i=0;i<4;i++)add(new T.BoxGeometry(1.13,.055,.10),p.copper,[0,.46,(i-1.5)*.115]);
    for(const x of [-.47,.47])add(new T.BoxGeometry(.055,.35,.055),p.pale,[x,.64,-.25]);
    for(let i=0;i<2;i++)add(new T.BoxGeometry(1.13,.105,.05),p.metal,[0,.65+i*.13,-.26]);
  }else if(kind==='tree'){
    const bark=new T.MeshStandardMaterial({color:'#5d6253',roughness:.95});bark.userData.ownedResource=true;const leaf=new T.MeshStandardMaterial({color:'#4f7062',roughness:.85});leaf.userData.ownedResource=true;
    add(new T.CylinderGeometry(.07,.12,1.2,9),bark,[0,.6,0]);
    for(let i=0;i<5;i++){const a=i*2.4;add(new T.IcosahedronGeometry(.40,2),leaf,[Math.sin(a)*.19,1.1+i*.17,Math.cos(a)*.16]).scale.set(1,.8,.8);}
  }else{
    add(new T.BoxGeometry(.51,.17,.43),p.dark,[0,.085,0]);add(new T.BoxGeometry(.46,.025,.38),p.road,[0,.17,0]);
    const leaf=new T.MeshStandardMaterial({color:'#789380',roughness:.8});leaf.userData.ownedResource=true;
    for(let i=0;i<5;i++){const x=Math.sin(i*2)*.16,z=Math.cos(i*2)*.12;add(new T.CylinderGeometry(.013,.018,.28,6),leaf,[x,.29,z]);add(new T.SphereGeometry(.053,10,6),p.amber,[x,.45,z]);}
  }
  g.userData.assetKit=SHARED_ASSET_VERSION;return g;
}
export function disposeGeometry(root: T.Object3D) {
  if (typeof root.userData.disposeOwned === 'function') { root.userData.disposeOwned(); return; }
  const textures=new Set<T.Texture>();
  root.traverse(o=>{if(o instanceof T.Mesh || o instanceof T.Line){o.geometry.dispose(); const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(m.userData.sharedResource)continue;if(m.userData.ownedResource){if(m instanceof T.MeshStandardMaterial)for(const texture of [m.map,m.bumpMap,m.roughnessMap,m.emissiveMap,m.normalMap,m.metalnessMap,m.aoMap])if(texture?.userData.ownedResource&&!textures.has(texture)){textures.add(texture);texture.dispose();}m.dispose();}else if(m instanceof T.MeshStandardMaterial && m.map){m.map.dispose();m.dispose();}else if(m instanceof T.MeshBasicMaterial){m.map?.dispose();m.dispose();}else if(m instanceof T.LineBasicMaterial || (m instanceof T.MeshToonMaterial && (m.vertexColors || !m.gradientMap)))m.dispose();}}});
  root.removeFromParent();
}
