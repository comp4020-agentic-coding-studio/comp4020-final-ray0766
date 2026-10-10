import * as T from 'three';
import {VILLAGE_UI} from '../assets/claude-geometry/style/tokens.ts';
import { disposeObject3D } from '../assets/claude-geometry/core/dispose.ts';

/* A transient placement restores the exact indoor/material twins before release.
 * Transparent state overlays write no depth, so the pen never traces them. */
export function makePlacementPreview(root: T.Group, invalid: boolean) {
  const tint = new T.MeshBasicMaterial({ color: invalid ? VILLAGE_UI.scene.bad : VILLAGE_UI.scene.ok, transparent: true, opacity: .2, depthWrite: false });
  const originals: { mesh: T.Mesh; material: T.Material | T.Material[] }[] = [];
  root.userData.noPracticalLights = true;
  root.traverse(o => {
    if (o.name === 'ink-shell' || o.name === 'ink-lines') { o.visible = false; return; }
    if (o instanceof T.Mesh) { originals.push({ mesh: o, material: o.material }); o.material = tint; o.castShadow = false; }
  });
  const release = root.userData.disposeOwned as (() => void) | undefined;
  let disposed = false;
  root.userData.disposeOwned = () => {
    if (disposed) return;
    disposed = true;
    for (const { mesh, material } of originals) mesh.material = material;
    tint.dispose();
    if (release) release(); else disposeObject3D(root);
  };
  return root;
}
