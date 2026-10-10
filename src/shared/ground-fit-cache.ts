import { fitGround } from '../assets/claude-geometry/core/ground.ts';
import type { Footprint, GroundFit, HeightField } from '../assets/claude-geometry/core/ground.ts';
import type { SurfaceAnchor } from '../assets/claude-geometry/core/anchor.ts';

// Only host-owned immutable fields opt in. A caller's procedural field may
// change while retaining its identity, so arbitrary HeightFields stay uncached.
const fields = new WeakMap<HeightField, Map<string, GroundFit>>();
const LIMIT = 1024;
export function cacheImmutableField<T extends HeightField>(field: T): T {
  if (!fields.has(field)) fields.set(field, new Map());
  return field;
}
export function seatedFit(field: HeightField, anchor: SurfaceAnchor, footprint: Footprint): GroundFit {
  const cache = fields.get(field);
  if (!cache) return fitGround(field, anchor, footprint);
  // Exact coordinates and samples: edits, rotations and different radii must
  // never reuse a nearby placement's support height or validation result.
  const key = JSON.stringify([anchor.dir, anchor.yaw, footprint.radius, footprint.samples]);
  let fit = cache.get(key);
  if (!fit) {
    fit = fitGround(field, anchor, footprint);
    if (cache.size >= LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, fit);
  }
  return { ...fit };
}
