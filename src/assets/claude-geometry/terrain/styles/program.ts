import { PLANET_RADIUS, SPAWN_DIR } from '../../core/anchor.ts';
import { hash3, hashString, mulberry32 } from '../../core/noise.ts';
import type { Vec3 } from '../../core/vec.ts';
import { add, addK, mul, scale, smooth, smoothstep } from '../dual.ts';
import type { D, P3 } from '../dual.ts';
import type { PlanetEnvironment } from '../env.ts';

// What a terrain style provides. The field (field.ts) owns the shared rules:
// landing zone, height limits, normals and slope. A style only describes its
// landforms (`height`), how each point is surfaced (`shade`), its rock strata,
// water look and which plants and rocks grow where (`flora`).

export type RGB = [number, number, number];

/** Per-point masks a style computes during `height` and reads back in `shade`. */
export const MASKS = 8;

export interface ShadeInput {
  dir: Vec3;
  /** Final height in metres (after the landing zone and limits). */
  h: number;
  /** tan of the slope angle: |tangential gradient| / ground radius. */
  tanSlope: number;
  water: number | null;
  masks: Float64Array;
  /** 1 inside the landing zone, 0 outside its blend ring. */
  landing: number;
}

export interface Shade {
  biome: string;
  /** Linear RGB of the loose surface (sand, snow, soil, grass). Rock comes from strata. */
  albedo: RGB;
  /** 0 = loose surface, 1 = bare rock showing strata. */
  rock: number;
  roughness: number;
  /** 0 dry, 1 soaked: darkens and smooths in the shader. */
  wet: number;
  /** Style-specific accent: foam (ocean), crevasse (ice), desert varnish (desert). */
  special: number;
  /** Loose-surface detail: 0 = granular (sand, snow, gravel), 1 = turf (grass, moss). */
  cover: number;
}

export interface Strata {
  /** Band colours, linear RGB, bottom to top within one repeat. */
  colors: RGB[];
  /** Band top edges in metres within one repeat; last entry is the repeat height. */
  edges: number[];
  /** Height offset of the pattern (seeded) so planets of one style differ. */
  offset: number;
}

export interface WaterLook {
  kind: 'liquid' | 'ice-sheet';
  shallow: RGB;
  deep: RGB;
  /** Depth in metres at which the water reaches its deep colour. */
  depthScale: number;
  roughness: number;
  /** Shore foam strength: 1 for surf on an open sea, 0 for still lakes. */
  foam: number;
}

/** Where one kind of plant or rock may grow, evaluated on a field sample. */
export interface FloraRule {
  kind: FloraKind;
  /** Share of the vegetation budget this kind may take. */
  share: number;
  /** Probability in [0, 1] that a candidate at this sample is kept. */
  accept(s: FloraSample): number;
  /** Scale range in metres of the reference model height. */
  scale: [number, number];
  /** Align to the ground normal (rocks) rather than standing radially (trees). */
  alignToGround: boolean;
  /** Linear RGB tint applied per instance (multiplied with the kit material). */
  tint: RGB;
}

export type FloraKind = 'boulder' | 'shrub' | 'cypress' | 'agave' | 'cactus' | 'spruce' | 'spire' | 'grass' | 'broadleaf';

export interface FloraSample {
  dir: Vec3;
  h: number;
  tanSlope: number;
  water: number | null;
  biome: string;
  masks: Float64Array;
  /** Vegetation density parameter. */
  density: number;
}

/** How the shader paints the `special` channel. */
export interface SpecialLook {
  color: RGB;
  roughness: number;
  /** 0 = solid, 1 = broken up by the granular detail map (foam). */
  breakup: number;
}

export interface StyleProgram {
  biomes: readonly string[];
  height(p: P3, masks: Float64Array): D;
  shade(s: ShadeInput, out: Shade): void;
  strata: Strata;
  /** Look of open water or the frozen sheet; null for styles that never have water. */
  water: WaterLook | null;
  special: SpecialLook;
  /** Atmosphere rim tint (linear) and strength. */
  atmosphere: { color: RGB; strength: number };
  flora: FloraRule[];
}

/** Independent 32-bit seed per named noise layer. */
export function layerSeed(env: PlanetEnvironment, name: string): number {
  return hash3(env.seed | 0, hashString(name) | 0, 0x51, 0x2c1b3c6d);
}

/**
 * Fixed calibration directions (pure arithmetic, no trig), used to turn a
 * coverage parameter into a noise threshold so a "30 % land" setting means
 * about 30 % on every seed.
 */
const CALIBRATION: Vec3[] = (() => {
  const r = mulberry32(0x0ca1b0);
  const out: Vec3[] = [];
  while (out.length < 384) {
    const x = r() * 2 - 1, y = r() * 2 - 1, z = r() * 2 - 1;
    const l2 = x * x + y * y + z * z;
    if (l2 > 1e-4 && l2 <= 1) { const l = Math.sqrt(l2); out.push([x / l, y / l, z / l]); }
  }
  return out;
})();

/** Value below which `share` of the calibration directions fall. */
export function quantileOver(f: (d: Vec3) => number, share: number): number {
  const v = CALIBRATION.map(f).sort((a, b) => a - b);
  const i = Math.min(v.length - 1, Math.max(0, Math.round(share * (v.length - 1))));
  return v[i];
}

/** Mix two linear colours. */
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scaleRGB = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

/** Build strata bands from a seeded sequence of colours and thicknesses. */
export function makeStrata(seed: number, palette: RGB[], thickness: [number, number], repeat: number): Strata {
  const r = mulberry32(seed);
  const colors: RGB[] = [], edges: number[] = [];
  let top = 0;
  while (top < repeat && colors.length < 12) {
    const c = palette[Math.floor(r() * palette.length)];
    const k = 0.88 + r() * 0.24;
    colors.push(scaleRGB(c, k));
    top = Math.min(repeat, top + thickness[0] + r() * (thickness[1] - thickness[0]));
    edges.push(top);
  }
  edges[edges.length - 1] = repeat;
  return { colors, edges, offset: r() * repeat };
}

/** Strata colour at a height (CPU mirror of the shader lookup). */
export function strataAt(s: Strata, h: number): RGB {
  const repeat = s.edges[s.edges.length - 1];
  let y = (h + s.offset) % repeat;
  if (y < 0) y += repeat;
  for (let i = 0; i < s.edges.length; i++) if (y < s.edges[i]) return s.colors[i];
  return s.colors[s.colors.length - 1];
}

/** tan of an angle in degrees, from arithmetic only (see trig.ts); thresholds are computed once per field. */
export { tanDeg } from '../trig.ts';

/**
 * Squared chord between two unit directions an arc of `metres` apart on the
 * planet, 2 − 2·cos(θ), from a Taylor series so it is plain arithmetic.
 */
export function chord2(metres: number): number {
  const t = metres / PLANET_RADIUS, t2 = t * t;
  const cos = 1 - t2 / 2 + (t2 * t2) / 24 - (t2 * t2 * t2) / 720 + (t2 * t2 * t2 * t2) / 40320;
  return 2 - 2 * cos;
}

/** Squared distance from p to the landing direction, with gradient. */
export function spawnDistance2(p: P3): D {
  const dx = addK(p.x, -SPAWN_DIR[0]), dy = addK(p.y, -SPAWN_DIR[1]), dz = addK(p.z, -SPAWN_DIR[2]);
  return add(add(mul(dx, dx), mul(dy, dy)), mul(dz, dz));
}

/** 1 within `inner` metres of the landing spot, easing to 0 at `outer` metres. */
export function nearSpawn(p: P3, inner: number, outer: number): D {
  return addK(scale(smoothstep(chord2(inner), chord2(outer), spawnDistance2(p)), -1), 1);
}
export function nearSpawnScalar(d: Vec3, inner: number, outer: number): number {
  const x = d[0] - SPAWN_DIR[0], y = d[1] - SPAWN_DIR[1], z = d[2] - SPAWN_DIR[2], d2 = x * x + y * y + z * z;
  return 1 - smooth(chord2(inner), chord2(outer), d2);
}
