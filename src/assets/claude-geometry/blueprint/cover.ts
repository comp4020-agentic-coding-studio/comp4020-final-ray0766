import * as T from 'three';
import { PARTS } from './parts/catalogue.ts';
import { STOREY } from './parts/kit.ts';
import type { PartPlacement } from './model.ts';

// Which surfaces of a placed building are indoors, for the village look's
// daylight indoors (src/style/surface.ts applyInterior). A surface is under
// cover when its cell has a floor deck, a roof deck or a roof panel at some
// level above it; grated catwalks let the sky through and street decks are
// ground. Each vertex is tested a little way out along its normal, so a
// wall's outer skin falls in the cell outside it and its lining in the room.

/** How far out along its normal a vertex is tested, in metres: past a skin, not past a room. */
const PROBE = 0.02;

/** Whether a part keeps the sky off the cell it stands in, at the level it stands on. */
export function coversCell(part: PartPlacement['part']): boolean {
  const def = PARTS[part];
  if (def.role === 'slope') return true;
  return def.role === 'deck' && part !== 'floor.grate' && def.category !== 'Street';
}

/**
 * For each cell (grid x, z), the highest level whose deck plane (level × STOREY)
 * is covered: a point in that cell lower than it is indoors.
 */
export function coverHeights(parts: readonly PartPlacement[]): Map<string, number> {
  const top = new Map<string, number>();
  for (const p of parts) {
    if (!coversCell(p.part)) continue;
    const key = `${p.x},${p.z}`, y = p.level * STOREY;
    top.set(key, Math.max(top.get(key) ?? -Infinity, y));
  }
  return top;
}

/**
 * Write a `cover` attribute (1 indoors, 0 outdoors) on every mesh of a built
 * blueprint group, whose geometry is in the group's frame: grid cell (x, z)
 * spans [x − pivot.x, x + 1 − pivot.x] and level 0's deck is at y = 0.
 * Returns how many vertices are indoors.
 */
export function writeCover(group: T.Object3D, parts: readonly PartPlacement[], pivot: { x: number; z: number }): number {
  const heights = coverHeights(parts);
  let indoors = 0;
  group.traverse(o => {
    const mesh = o as T.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position'), nor = mesh.geometry.getAttribute('normal');
    const cover = new Float32Array(pos.count);
    if (heights.size && nor) {
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + nor.getX(i) * PROBE, y = pos.getY(i) + nor.getY(i) * PROBE, z = pos.getZ(i) + nor.getZ(i) * PROBE;
        const top = heights.get(`${Math.floor(x + pivot.x)},${Math.floor(z + pivot.z)}`);
        if (top !== undefined && y < top) { cover[i] = 1; indoors++; }
      }
    }
    mesh.geometry.setAttribute('cover', new T.BufferAttribute(cover, 1));
  });
  return indoors;
}
