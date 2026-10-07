import * as T from 'three';
import { sharedParts } from './shared-assets.ts';
import { legacyBuiltObject } from './legacy-build-art.ts';
import type { BuildKind } from '../shared/planets.ts';
import { QUICK_PARTS } from '../shared/quick-parts.ts';
export function builtObject(kind:BuildKind,assetVersion=2){
  const contract=QUICK_PARTS[kind];
  if(assetVersion!==2||!contract)return legacyBuiltObject(kind);
  const model=sharedParts([{part:contract.part,position:contract.offset}]);
  model.userData.sourcePart=contract.part;model.userData.assetVersion=2;
  return model;
}

export function disposeGeometry(root: T.Object3D) {
  if (typeof root.userData.disposeOwned === 'function') { root.userData.disposeOwned(); return; }
  const textures=new Set<T.Texture>();
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  root.traverse(o=>{if(o instanceof T.Mesh || o instanceof T.Line){if(!o.geometry.userData.sharedResource&&!geometries.has(o.geometry)){geometries.add(o.geometry);o.geometry.dispose();}const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(m.userData.sharedResource||materials.has(m))continue;materials.add(m);if(m.userData.ownedResource){if(m instanceof T.MeshStandardMaterial)for(const texture of [m.map,m.bumpMap,m.roughnessMap,m.emissiveMap,m.normalMap,m.metalnessMap,m.aoMap])if(texture?.userData.ownedResource&&!textures.has(texture)){textures.add(texture);texture.dispose();}m.dispose();}else if(m instanceof T.MeshStandardMaterial && m.map){m.map.dispose();m.dispose();}else if(m instanceof T.MeshBasicMaterial){m.map?.dispose();m.dispose();}else if(m instanceof T.LineBasicMaterial || (m instanceof T.MeshToonMaterial && (m.vertexColors || !m.gradientMap)))m.dispose();}}});
  root.removeFromParent();
}
