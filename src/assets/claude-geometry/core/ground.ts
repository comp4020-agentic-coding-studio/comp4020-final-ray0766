import { PLANET_RADIUS, localToDir } from './anchor.ts';
import type { SurfaceAnchor } from './anchor.ts';
import type { Vec3 } from './vec.ts';

/**
 * What every module may ask of a planet's ground. The terrain generator
 * implements it; blueprints, props, ships and the timeline only consume it.
 * Heights are world units above PLANET_RADIUS.
 */
export interface HeightField {
  /** Stable identity: generator version + config hash, or "legacy-a76575a". */
  readonly id: string;
  /** Sea level above PLANET_RADIUS, or null when the planet has no open water. */
  readonly waterLevel: number | null;
  heightAt(dir: Vec3): number;
  /** Outward unit normal of the ground. */
  normalAt(dir: Vec3): Vec3;
}

/** Ground radius (distance from the planet centre) at a direction. */
export const groundRadius = (field: HeightField, dir: Vec3) => PLANET_RADIUS + field.heightAt(dir);

/** Normal by central differences on the sphere; shared fallback for analytic fields. */
export function numericNormal(heightAt: (dir: Vec3) => number, dir: Vec3, step = 1e-3): Vec3 {
  // Two tangents orthogonal to dir.
  const helper: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let t1: Vec3 = [helper[1] * dir[2] - helper[2] * dir[1], helper[2] * dir[0] - helper[0] * dir[2], helper[0] * dir[1] - helper[1] * dir[0]];
  const l1 = Math.hypot(...t1); t1 = [t1[0] / l1, t1[1] / l1, t1[2] / l1];
  const t2: Vec3 = [dir[1] * t1[2] - dir[2] * t1[1], dir[2] * t1[0] - dir[0] * t1[2], dir[0] * t1[1] - dir[1] * t1[0]];
  const at = (a: number, b: number): Vec3 => {
    const p: Vec3 = [dir[0] + t1[0] * a + t2[0] * b, dir[1] + t1[1] * a + t2[1] * b, dir[2] + t1[2] * a + t2[2] * b];
    const l = Math.hypot(...p); const u: Vec3 = [p[0] / l, p[1] / l, p[2] / l];
    const r = PLANET_RADIUS + heightAt(u);
    return [u[0] * r, u[1] * r, u[2] * r];
  };
  const px = at(step, 0), nx = at(-step, 0), py = at(0, step), ny = at(0, -step);
  const du: Vec3 = [px[0] - nx[0], px[1] - nx[1], px[2] - nx[2]];
  const dv: Vec3 = [py[0] - ny[0], py[1] - ny[1], py[2] - ny[2]];
  let n: Vec3 = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
  const ln = Math.hypot(...n); n = [n[0] / ln, n[1] / ln, n[2] / ln];
  return n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0 ? [-n[0], -n[1], -n[2]] : n;
}

/**
 * The main project's terrain at a76575a (src/client/terrain.ts), reproduced
 * exactly so anything placed against it today stays grounded after integration.
 * Note the amplitude step at y = 0.35 is part of the original formula.
 */
export function legacyHeightField(): HeightField {
  const heightAt = (p: Vec3) => {
    const amplitude = p[1] > .35 ? .055 : .20;
    return .055 + amplitude * (Math.sin(p[0] * 8 + p[2] * 3) * .5 + Math.cos(p[2] * 7 - p[1] * 4) * .5);
  };
  return { id: 'legacy-a76575a', waterLevel: null, heightAt, normalAt: dir => numericNormal(heightAt, dir) };
}

/** Local (x, z) sample points under an object, plus its bounding radius. */
export interface Footprint { samples: [number, number][]; radius: number }

export function circleFootprint(radius: number, ring = 8): Footprint {
  const samples: [number, number][] = [[0, 0]];
  for (let i = 0; i < ring; i++) samples.push([Math.cos(i / ring * Math.PI * 2) * radius, Math.sin(i / ring * Math.PI * 2) * radius]);
  return { samples, radius };
}

export function rectFootprint(minX: number, maxX: number, minZ: number, maxZ: number, step = 0.5): Footprint {
  const samples: [number, number][] = [];
  const nx = Math.max(1, Math.ceil((maxX - minX) / step)), nz = Math.max(1, Math.ceil((maxZ - minZ) / step));
  for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) samples.push([minX + (maxX - minX) * i / nx, minZ + (maxZ - minZ) * k / nz]);
  const radius = Math.max(...samples.map(([x, z]) => Math.hypot(x, z)));
  return { samples, radius };
}

/** Deepest foundation a structure may stand on before the spot counts as too uneven. */
export const MAX_FOUNDATION_DEPTH = 0.6;

export type GroundProblem = 'underwater' | 'too-uneven';
export interface GroundFit {
  /** Distance from the planet centre to the object's local origin (local y = 0). */
  baseRadius: number;
  /** baseRadius minus the ground radius straight under the anchor. */
  lift: number;
  /** Largest gap between the local floor plane and the ground under the footprint. */
  foundationDepth: number;
  underwater: boolean;
  problem: GroundProblem | null;
  message: string | null;
}

/**
 * Seat a flat-bottomed object on curved, uneven ground. The local floor is
 * raised until no footprint sample is buried, then the deepest remaining gap
 * becomes the foundation depth. Heights are always derived from the field, so
 * changing terrain re-seats an object; a fit with a problem must be refused.
 */
export function fitGround(field: HeightField, anchor: SurfaceAnchor, footprint: Footprint): GroundFit {
  let base = groundRadius(field, anchor.dir);
  let foundation = 0, underwater = false;
  for (let pass = 0; pass < 2; pass++) {
    const ground = footprint.samples.map(([x, z]) => {
      const dir = localToDir(anchor, base, [x, 0, z]);
      const h = field.heightAt(dir);
      return { d2: x * x + z * z, g: PLANET_RADIUS + h, h };
    });
    // The plane point at lateral offset d sits sqrt(b² + d²) from the centre.
    const needed = Math.max(...ground.map(s => Math.sqrt(Math.max(0, s.g * s.g - s.d2))));
    if (pass === 0) { base = needed; continue; }
    base = Math.max(base, needed);
    foundation = Math.max(0, ...ground.map(s => Math.sqrt(base * base + s.d2) - s.g));
    underwater = field.waterLevel !== null && ground.some(s => s.h < field.waterLevel!);
  }
  const lift = base - groundRadius(field, anchor.dir);
  const problem: GroundProblem | null = underwater ? 'underwater' : foundation > MAX_FOUNDATION_DEPTH ? 'too-uneven' : null;
  const message = problem === 'underwater' ? 'Part of this footprint is under water.'
    : problem === 'too-uneven' ? `The ground here drops ${foundation.toFixed(2)} m under the footprint (limit ${MAX_FOUNDATION_DEPTH} m).`
    : null;
  return { baseRadius: base, lift, foundationDepth: foundation, underwater, problem, message };
}
