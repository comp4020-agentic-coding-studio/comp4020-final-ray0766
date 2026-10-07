import * as T from 'three';
import { mulberry32 } from '../core/noise.ts';
import type { StyleLibrary } from '../style/materials.ts';

// 2D outlines and small generated meshes shared by the prop models. Outlines
// are [x, y] lists for PartBuilder.extrude(); orientation does not matter,
// three.js re-winds shapes and holes itself.

export type Outline = [number, number][];

/** Rectangle with its corners cut at 45°: half extents hx, hy and corner cut c. */
export function clippedRect(hx: number, hy: number, c: number): Outline {
  return [[-hx + c, -hy], [hx - c, -hy], [hx, -hy + c], [hx, hy - c], [hx - c, hy], [-hx + c, hy], [-hx, hy - c], [-hx, -hy + c]];
}

export function rect(x0: number, y0: number, x1: number, y1: number): Outline {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** Regular polygon (also used as a round hole); first vertex on +x unless `phase` turns it. */
export function circle(r: number, segments: number, cx = 0, cy = 0, phase = 0): Outline {
  return Array.from({ length: segments }, (_, i) => {
    const a = phase + (i / segments) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number];
  });
}

/** Rotation that turns an outline drawn in x/y into a flat plate (outline y becomes −z) extruded upwards along +Y. */
export const LAY_FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

function geometryFrom(positions: number[]): T.BufferGeometry {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * One conifer branch spray, pointing along +X from the origin. The centre rib
 * is raised so the spray has a shallow ridge that catches light, the edge is
 * serrated into needle tufts, and the tip droops. Double-sided material only.
 */
export function frondGeometry(length: number, width: number, droop: number, steps: number, seed: number): T.BufferGeometry {
  const rnd = mulberry32(seed);
  const rows: { x: number; y: number; hw: number; ridge: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Widest a little past the middle; serrations alternate along the edge.
    const envelope = Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.35 * t);
    const tuft = i % 2 === 0 ? 1 : 0.62;
    rows.push({
      x: length * t,
      y: -droop * t * t + (rnd() - 0.5) * 0.02,
      hw: i === 0 ? width * 0.08 : width * 0.5 * envelope * tuft * (0.9 + rnd() * 0.2),
      ridge: width * 0.16 * (1 - t),
    });
  }
  const p: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => p.push(...a, ...b, ...c);
  for (let i = 0; i < steps; i++) {
    const a = rows[i], b = rows[i + 1];
    const ca = [a.x, a.y + a.ridge, 0], cb = [b.x, b.y + b.ridge, 0];
    // Edges sag below the rib, as real sprays hang from it.
    const la = [a.x, a.y - a.hw * 0.25, -a.hw], lb = [b.x, b.y - b.hw * 0.25, -b.hw];
    const ra = [a.x, a.y - a.hw * 0.25, a.hw], rb = [b.x, b.y - b.hw * 0.25, b.hw];
    tri(ca, cb, lb); tri(ca, lb, la);
    tri(ca, ra, rb); tri(ca, rb, cb);
  }
  return geometryFrom(p);
}

/**
 * A strap-shaped leaf or grass blade rising along +Y and arching towards +X.
 * Two triangles per segment; double-sided material only.
 */
export function bladeGeometry(height: number, width: number, lean: number, steps: number): T.BufferGeometry {
  const p: number[] = [];
  const at = (t: number) => {
    const w = width * (1 - t) * (t < 0.15 ? 0.6 + t * 2.6 : 1);
    return { x: lean * t * t, y: height * (t - 0.18 * t * t * Math.abs(lean) / Math.max(0.01, height)), w };
  };
  for (let i = 0; i < steps; i++) {
    const a = at(i / steps), b = at((i + 1) / steps);
    p.push(a.x, a.y, -a.w / 2, b.x, b.y, -b.w / 2, b.x, b.y, b.w / 2);
    p.push(a.x, a.y, -a.w / 2, b.x, b.y, b.w / 2, a.x, a.y, a.w / 2);
  }
  return geometryFrom(p);
}

/**
 * A clean painted finish under a props-owned key: the library's paint
 * (roughness, metalness and its fine normal) without the 'plain' pattern's
 * grime map. That map normalises tiny noise to the full 0.72–1.0 range, which
 * shows as large dark clouds on a flat painted leaf or slat. Only this
 * module's own custom keys are changed, never a shared preset.
 */
export function cleanPaint(lib: StyleLibrary, key: string, color: string): T.MeshStandardMaterial {
  const m = lib.custom(key, { finish: 'paint', pattern: 'plain', color });
  if (m.map) { m.map = null; m.needsUpdate = true; }
  return m;
}
