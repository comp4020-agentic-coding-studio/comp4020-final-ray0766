import * as T from 'three';
import { anchorQuaternion } from '../assets/claude-geometry/core/anchor.ts';
import { disposeObject3D } from '../assets/claude-geometry/core/dispose.ts';
import { buildEmit } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import type { Kit } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { BOARD_RING, boardingConsole, CONSOLE, TERMINAL, terminalTower } from '../shared/starport-terminal.ts';
import type { TowerSpec } from '../shared/starport-terminal.ts';
import type { Vec3 } from '../shared/world.ts';
import { applyArtMaterial } from './art-profile.ts';
import { worldMaterials } from './shared-assets.ts';
import { surfacePoint } from './terrain.ts';

/** A fixed bilingual board (not a saved name), drawn on a canvas. */
function board(lines: readonly [string, string], width: number, height: number) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * height / width);
  const ctx = c.getContext('2d')!, h = c.height;
  ctx.fillStyle = '#f3ecdb'; ctx.fillRect(0, 0, 1024, h);
  ctx.fillStyle = '#c26b4b'; ctx.fillRect(0, 0, 1024, h * .07); ctx.fillRect(0, h * .93, 1024, h * .07);
  ctx.fillStyle = '#2f4a43'; ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(h * .4)}px system-ui`; ctx.fillText(lines[0], 512, h * .53);
  ctx.font = `600 ${Math.round(h * .24)}px system-ui`; ctx.fillText(lines[1], 512, h * .84);
  const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace;
  const material = applyArtMaterial(new T.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: .22, roughness: .88 }));
  const geometry = new T.PlaneGeometry(width, height);
  return { geometry, material, dispose() { geometry.dispose(); map.dispose(); material.dispose(); } };
}

/** Kit geometry placed exactly as its collision: vendor anchor frame on the ground at `dir`. */
function placed(parent: T.Object3D, dir: Vec3, yaw: number, emit: (k: Kit) => void, name: string) {
  const root = new T.Group(); root.name = name;
  root.position.copy(surfacePoint(new T.Vector3(...dir)));
  root.quaternion.fromArray(anchorQuaternion({ dir, yaw }));
  const built = buildEmit(emit, name, worldMaterials());
  root.add(built.group); parent.add(root);
  return { root, built };
}

/** A starport terminal tower with its STARPORT boards. Each handle frees its resources once, however often a planet switch asks. */
export function starportTerminal(parent: T.Object3D, dir: Vec3, yaw: number, spec: TowerSpec) {
  const { root, built } = placed(parent, dir, yaw, k => terminalTower(k, spec), 'starport-terminal');
  const sign = board(['STARPORT', '登机口 · BOARDING'], spec.signWidth, TERMINAL.sign.height);
  for (const face of spec.signs) {
    const mesh = new T.Mesh(sign.geometry, sign.material);
    mesh.position.set(0, TERMINAL.sign.y, face * (spec.shaft + .06)); mesh.rotation.y = face > 0 ? 0 : Math.PI; root.add(mesh);
  }
  let disposed = false;
  return { root, dispose() { if (disposed) return; disposed = true; root.removeFromParent(); sign.dispose(); disposeObject3D(built.group); } };
}

/** The boarding console: a lit slanted screen reading BOARD / 登机, facing +Z. */
export function boardingConsoleModel(parent: T.Object3D, dir: Vec3, yaw: number) {
  const { root, built } = placed(parent, dir, yaw, boardingConsole, 'boarding-console');
  const label = board(['BOARD', '站进光圈登机'], .46, .27), s = CONSOLE.screen, mesh = new T.Mesh(label.geometry, label.material);
  mesh.position.set(0, s.y + Math.cos(s.tilt) * .075, Math.sin(s.tilt) * .075); mesh.rotation.x = s.tilt - Math.PI / 2; root.add(mesh);
  let disposed = false;
  return { root, dispose() { if (disposed) return; disposed = true; root.removeFromParent(); label.dispose(); disposeObject3D(built.group); } };
}

/** The lit ring that shows where boarding works (drawing only; it carries no collision). */
export function boardingRing(parent: T.Object3D, dir: Vec3, lift = .03) {
  const up = new T.Vector3(...dir).normalize(), geometry = new T.RingGeometry(BOARD_RING - .06, BOARD_RING + .06, 64);
  geometry.rotateX(-Math.PI / 2);
  const inner = new T.RingGeometry(.12, .2, 32); inner.rotateX(-Math.PI / 2);
  const material = new T.MeshBasicMaterial({ color: '#ffc061', transparent: true, opacity: .9, depthWrite: false, side: T.DoubleSide });
  const root = new T.Group(); root.name = 'boarding-ring';
  root.position.copy(surfacePoint(up)).addScaledVector(up, lift); root.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), up);
  for (const g of [geometry, inner]) { const mesh = new T.Mesh(g, material); mesh.renderOrder = 4; mesh.raycast = () => {}; root.add(mesh); }
  parent.add(root);
  let disposed = false;
  return { root, dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometry.dispose(); inner.dispose(); material.dispose(); } };
}
