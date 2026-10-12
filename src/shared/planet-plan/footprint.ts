import type { PartPlacement, Rot } from '../blueprint-model.ts';
import { groundCells, partTransform, pivotOf } from '../blueprint-model.ts';
import { PART_INFO, PARTS, hostSecondCell } from '../blueprint-parts.ts';
import type { PartId } from '../blueprint-parts.ts';
import { PART_COLLIDERS } from '../physics/parts.ts';
import { STOREY } from '../../assets/claude-geometry/blueprint/parts/kit.ts';

/** Axis-aligned rectangle in a composition's local metres (x right, z front, pivot origin). */
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
export interface Footprint {
  /** Everything a person could bump into up to 2 m: walls, steps, plinths, garden boundaries. */
  base: Rect;
  /** Eaves, hoods and awnings as well: the whole plan outline seen from above. */
  canopy: Rect;
  pivot: { x: number; z: number };
}
const grow = (r: Rect, x: number, z: number) => { r.minX = Math.min(r.minX, x); r.maxX = Math.max(r.maxX, x); r.minZ = Math.min(r.minZ, z); r.maxZ = Math.max(r.maxZ, z); };
const empty = (): Rect => ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

/** Plan footprints from the actual colliders and village envelopes of every part. */
export function compositionFootprint(parts: readonly PartPlacement[]): Footprint {
  const pivot = pivotOf(parts), base = empty(), canopy = empty();
  for (const [x, z] of groundCells(parts)) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { grow(base, x + dx - pivot.x, z + dz - pivot.z); grow(canopy, x + dx - pivot.x, z + dz - pivot.z); }
  for (const part of parts) {
    const t = partTransform(part, pivot), c = Math.cos(t.yaw), s = Math.sin(t.yaw);
    const place = (lx: number, lz: number): [number, number] => [t.position[0] + lx * c + lz * s, t.position[2] - lx * s + lz * c];
    for (const box of PART_COLLIDERS[part.part]()) {
      const bc = Math.cos(box.yaw ?? 0), bs = Math.sin(box.yaw ?? 0), y0 = t.position[1] + box.center[1] - box.half[1];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const lx = box.center[0] + (sx * box.half[0]) * bc + (sz * box.half[2]) * bs, lz = box.center[2] - (sx * box.half[0]) * bs + (sz * box.half[2]) * bc;
        const [px, pz] = place(lx, lz);
        if (y0 < 2.0 && part.level === 0) grow(base, px, pz);
        grow(canopy, px, pz);
      }
    }
    const env = PART_INFO[part.part].envelope?.village;
    if (env) for (const ex of [env.min[0], env.max[0]]) for (const ez of [env.min[2], env.max[2]]) { const [px, pz] = place(ex, ez); grow(canopy, px, pz); }
    // Roof eaves reach beyond their cells (vendor panel envelope 0.9622).
    if (PARTS[part.part].role === 'slope' && !env) for (const ex of [-.5, .5]) for (const ez of [-.5, .9622]) { const [px, pz] = place(ex, ez); grow(canopy, px, pz); }
  }
  void STOREY;
  return { base, canopy, pivot };
}

/** Mirror a composition across its local X axis: grid x, rotations, handed parts. */
const SWAP: Partial<Record<PartId, PartId>> = {
  'roof.verge.left': 'roof.verge.right', 'roof.verge.right': 'roof.verge.left',
  'roof.verge.long.left': 'roof.verge.long.right', 'roof.verge.long.right': 'roof.verge.long.left',
};
const CORNER_PARTS = new Set<PartId>(['structure.column', 'roof.slope.hip', 'roof.slope.valley']);
export function mirrorParts(parts: readonly PartPlacement[]): PartPlacement[] {
  const xs = parts.flatMap(p => { const second = hostSecondCell(p.part); return second === 'side' ? [p.x, p.x + [1, 0, -1, 0][p.rot]] : second === 'back' ? [p.x, p.x + [0, -1, 0, 1][p.rot]] : [p.x]; });
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const mx = (x: number) => lo + hi - x, flip = (r: number) => ((4 - r) % 4) as Rot;
  return parts.map(p => {
    const part = SWAP[p.part] ?? p.part;
    if (CORNER_PARTS.has(p.part)) return { ...p, part, x: mx(p.x), rot: ((3 - p.rot + 4) % 4) as Rot };
    if (hostSecondCell(p.part) === 'side') {
      // The second cell along local +X lands on the other side: re-anchor there.
      const dx = [1, 0, -1, 0][p.rot], dz = [0, -1, 0, 1][p.rot];
      return { ...p, part, x: mx(p.x + dx), z: p.z + dz, rot: flip(p.rot) };
    }
    return { ...p, part, x: mx(p.x), rot: flip(p.rot) };
  });
}
