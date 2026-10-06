import type { Vec3 } from '../core/vec.ts';

// Indexed icosphere by recursive midpoint subdivision. Each level keeps every
// vertex of the level before it at the same index, so level n's vertices are
// a prefix of level n+1's. The planet builder relies on that: the water sphere
// (one level coarser) reuses the ground's height samples without evaluating
// the field again, and LOD tiers share vertex positions exactly.

export interface Icosphere {
  /** Unit directions, xyz interleaved, for the finest level built so far. */
  dirs: Float64Array;
  /** Vertex count and triangle indices per level. */
  levels: { vertices: number; indices: Uint32Array }[];
}

let cache: Icosphere | null = null;

function base(): Icosphere {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: Vec3[] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  const dirs = new Float64Array(raw.length * 3);
  raw.forEach((v, i) => { const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); dirs[i * 3] = v[0] / l; dirs[i * 3 + 1] = v[1] / l; dirs[i * 3 + 2] = v[2] / l; });
  const faces = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  return { dirs, levels: [{ vertices: 12, indices: Uint32Array.from(faces) }] };
}

function subdivide(sphere: Icosphere): Icosphere {
  const prev = sphere.levels[sphere.levels.length - 1];
  const tris = prev.indices.length / 3;
  // Euler: an icosphere with V vertices has V + E vertices after one split, E = 3F/2.
  const nextCount = prev.vertices + tris * 3 / 2;
  const dirs = new Float64Array(nextCount * 3);
  dirs.set(sphere.dirs.subarray(0, prev.vertices * 3));
  let count = prev.vertices;
  const mids = new Map<number, number>();
  const mid = (a: number, b: number) => {
    const key = a < b ? a * nextCount + b : b * nextCount + a;
    let m = mids.get(key);
    if (m === undefined) {
      const x = dirs[a * 3] + dirs[b * 3], y = dirs[a * 3 + 1] + dirs[b * 3 + 1], z = dirs[a * 3 + 2] + dirs[b * 3 + 2];
      const l = Math.sqrt(x * x + y * y + z * z);
      m = count++;
      dirs[m * 3] = x / l; dirs[m * 3 + 1] = y / l; dirs[m * 3 + 2] = z / l;
      mids.set(key, m);
    }
    return m;
  };
  const indices = new Uint32Array(tris * 4 * 3);
  for (let f = 0; f < tris; f++) {
    const a = prev.indices[f * 3], b = prev.indices[f * 3 + 1], c = prev.indices[f * 3 + 2];
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    indices.set([a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca], f * 12);
  }
  return { dirs, levels: [...sphere.levels, { vertices: count, indices }] };
}

/** Icosphere with at least `level` subdivisions; shared and immutable, never modify its arrays. */
export function icosphere(level: number): Icosphere {
  if (!Number.isInteger(level) || level < 0 || level > 7) throw new RangeError('Icosphere level must be 0–7.');
  cache ??= base();
  while (cache.levels.length <= level) cache = subdivide(cache);
  return cache;
}
