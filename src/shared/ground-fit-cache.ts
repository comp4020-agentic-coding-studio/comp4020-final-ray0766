import { fitGround } from '../assets/claude-geometry/core/ground.ts';
import type { Footprint, GroundFit, HeightField } from '../assets/claude-geometry/core/ground.ts';
import type { SurfaceAnchor } from '../assets/claude-geometry/core/anchor.ts';

// Only host-owned immutable fields opt in. A caller's procedural field may
// change while retaining its identity, so arbitrary HeightFields stay uncached.
const fields = new WeakMap<HeightField, Map<string, GroundFit>>();
const LIMIT = 1024;
let recording: Map<HeightField, Set<string>> | null = null;
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
  if (recording) { let keys = recording.get(field); if (!keys) recording.set(field, keys = new Set()); keys.add(key); }
  let fit = cache.get(key);
  if (!fit) {
    fit = fitGround(field, anchor, footprint);
    if (cache.size >= LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, fit);
  }
  return { ...fit };
}
/** Seed a host-owned field with fits another thread computed for the same environment and radius.
 * Keys are the exact anchor and samples, so a seeded entry is the same value fitGround would return;
 * the same bound applies and existing entries are kept. */
export function importFits(field: HeightField, entries: readonly (readonly [string, GroundFit])[]): number {
  const cache = fields.get(field);
  if (!cache) return 0;
  let added = 0;
  for (const [key, fit] of entries) {
    if (cache.has(key)) continue;
    if (cache.size >= LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, fit); added++;
  }
  return added;
}
/** Run `work` and also return the fits it read or computed on host-owned fields, so a worker thread
 * can hand exactly that preparation back to the server's cache. */
export function recordFits<T>(work: () => T): { value: T; fits: { field: HeightField; entries: [string, GroundFit][] }[] } {
  const previous = recording, seen = new Map<HeightField, Set<string>>();
  recording = seen;
  try {
    const value = work();
    return { value, fits: [...seen].map(([field, keys]) => ({ field, entries: [...keys].flatMap(key => { const fit = fields.get(field)?.get(key); return fit ? [[key, fit] as [string, GroundFit]] : []; }) })) };
  } finally { recording = previous; }
}
