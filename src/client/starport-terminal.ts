import * as T from 'three';
import { anchorQuaternion } from '../assets/claude-geometry/core/anchor.ts';
import { disposeObject3D } from '../assets/claude-geometry/core/dispose.ts';
import { buildEmit } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { HUB_TERMINAL, HUB_TERMINAL_YAW, TERMINAL, terminalTower } from '../shared/starport-terminal.ts';
import { applyArtMaterial } from './art-profile.ts';
import { worldMaterials } from './shared-assets.ts';
import { surfacePoint } from './terrain.ts';

/** Bilingual board for both faces of the shaft; the text is fixed, not a saved name. */
function signMaterial() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 356;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f3ecdb'; ctx.fillRect(0, 0, 1024, 356);
  ctx.fillStyle = '#c26b4b'; ctx.fillRect(0, 0, 1024, 26); ctx.fillRect(0, 330, 1024, 26);
  ctx.fillStyle = '#2f4a43'; ctx.textAlign = 'center';
  ctx.font = '700 150px system-ui'; ctx.fillText('STARPORT', 512, 190);
  ctx.font = '600 92px system-ui'; ctx.fillText('登机口 · BOARDING', 512, 300);
  const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace;
  const material = applyArtMaterial(new T.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: .22, roughness: .88 }));
  return { material, dispose() { map.dispose(); material.dispose(); } };
}

/** Builds the terminal on the planned harbour, oriented exactly as its collision (vendor anchor frame). */
export function starportTerminal(parent: T.Object3D) {
  const root = new T.Group(); root.name = 'starport-terminal';
  root.position.copy(surfacePoint(new T.Vector3(...HUB_TERMINAL)));
  root.quaternion.fromArray(anchorQuaternion({ dir: HUB_TERMINAL, yaw: HUB_TERMINAL_YAW }));
  const built = buildEmit(terminalTower, 'starport-terminal', worldMaterials());
  root.add(built.group);
  const sign = signMaterial(), s = TERMINAL.sign;
  for (const face of [1, -1]) {
    const board = new T.Mesh(new T.PlaneGeometry(s.width, s.height), sign.material);
    board.position.set(0, s.y, face * (TERMINAL.shaft + .06)); board.rotation.y = face > 0 ? 0 : Math.PI; root.add(board);
  }
  parent.add(root);
  return { root, dispose() { root.removeFromParent(); root.traverse(o => { if (o instanceof T.Mesh && o.material === sign.material) o.geometry.dispose(); }); sign.dispose(); disposeObject3D(built.group); } };
}
