import * as T from 'three';
import { disposeObject3D } from '../assets/claude-geometry/core/dispose.ts';

/** A transient placement keeps owned model resources until its handle is released.
 * Ink shells must be hidden before tinting: their renderer callback requires the
 * original ink uniforms, and crease lines must not show through the ghost. */
export function makePlacementPreview(root: T.Group, invalid: boolean) {
  const tint = new T.MeshBasicMaterial({ color: invalid ? '#c87055' : '#7b9b70', transparent: true, opacity: .45, depthWrite: false });
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
