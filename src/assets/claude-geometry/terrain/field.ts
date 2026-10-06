import { PLANET_RADIUS, SPAWN_DIR } from '../core/anchor.ts';
import type { HeightField } from '../core/ground.ts';
import type { Vec3 } from '../core/vec.ts';
import { add, dc, lerp, noiseAt, point, pscale, scale, smoothstep, softCeil, softFloor } from './dual.ts';
import type { D } from './dual.ts';
import { canonicalEnvironment, environmentId } from './env.ts';
import type { PlanetEnvironment, TerrainStyle } from './env.ts';
import { chord2, layerSeed, MASKS, spawnDistance2 } from './styles/program.ts';
import type { RGB, Shade, StyleProgram } from './styles/program.ts';
import { oceanProgram } from './styles/ocean.ts';
import { desertProgram } from './styles/desert.ts';
import { iceProgram } from './styles/ice.ts';
import { temperateProgram } from './styles/temperate.ts';

// The terrain HeightField. Heights come from the style's landform function,
// then two rules that hold for every style, seed and parameter set:
//
// 1. Landing zone: within LANDING_RADIUS of SPAWN_DIR the ground is a gentle
//    pad at least LANDING_FREEBOARD above sea level, blended back into the
//    landforms by LANDING_BLEND metres. Styles also bias their own masks near
//    the spawn so the pad sits on natural ground, but this rule is the
//    guarantee.
// 2. Height limits: heights ease into [FLOOR, CEILING] with a soft knee, so
//    peaks stay clear of the 13 m flight radius and sea floors stay shallow.
//
// Every height carries its analytic gradient (dual.ts), so normals and slopes
// are exact rather than finite differences.

export const LANDING_RADIUS = 1.5;
/** Inner edge of the landing blend (a little beyond LANDING_RADIUS) and its outer edge, metres. */
export const LANDING_BLEND: [number, number] = [1.62, 2.7];
export const LANDING_FREEBOARD = 0.2;
export const HEIGHT_LIMITS = { floor: -1.45, floorKnee: -1.1, knee: 1.25, ceiling: 1.75 } as const;

export interface SurfaceSample extends Shade {
  dir: Vec3;
  height: number;
  normal: Vec3;
  /** tan of the slope; slope itself in radians is `slope`. */
  tanSlope: number;
  slope: number;
  underwater: boolean;
  /** Water depth in metres (0 above water or on a dry planet). */
  depth: number;
  /** 1 inside the landing zone, falling to 0 across the blend ring. */
  landing: number;
  masks: Float64Array;
}

export interface TerrainField extends HeightField {
  readonly env: PlanetEnvironment;
  readonly style: TerrainStyle;
  readonly program: StyleProgram;
  /** Height of the landing pad above PLANET_RADIUS. */
  readonly landingLevel: number;
  heightAt(dir: Vec3): number;
  normalAt(dir: Vec3): Vec3;
  /** Point on the ground in planet space: dir · (PLANET_RADIUS + height). */
  surfacePoint(dir: Vec3): Vec3;
  /** Angle between the ground normal and the radial up direction, radians. */
  slopeAt(dir: Vec3): number;
  isUnderwater(dir: Vec3): boolean;
  biomeAt(dir: Vec3): string;
  /** Height, normal, slope, biome and shading channels in one evaluation. */
  sample(dir: Vec3): SurfaceSample;
  /** Height with its gradient in planet space (for tests and tools). */
  heightGradient(dir: Vec3): { height: number; gradient: Vec3 };
}

export function styleProgram(env: PlanetEnvironment): StyleProgram {
  switch (env.style) {
    case 'ocean': return oceanProgram(env);
    case 'desert': return desertProgram(env);
    case 'ice': return iceProgram(env);
    case 'temperate': return temperateProgram(env);
  }
}

const unit = (d: Vec3): Vec3 => {
  const l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  if (!(l > 0) || !Number.isFinite(l)) throw new RangeError('Terrain queries need a non-zero finite direction.');
  return [d[0] / l, d[1] / l, d[2] / l];
};

export function createHeightField(input: PlanetEnvironment): TerrainField {
  const env = canonicalEnvironment(input);
  const id = environmentId(env);
  const program = styleProgram(env);
  const water = env.params.waterLevel;
  const masks = new Float64Array(MASKS);
  const sPad = layerSeed(env, 'landing.pad');

  // Pad level: the landforms' own height at the spawn, capped below the hills,
  // then raised to stay LANDING_FREEBOARD above sea level (dry always wins).
  const atSpawn = program.height(point(SPAWN_DIR[0], SPAWN_DIR[1], SPAWN_DIR[2]), masks).v;
  const dryFloor = water === null ? -0.3 : water + LANDING_FREEBOARD;
  const landingLevel = Math.max(dryFloor, Math.min(0.6, atSpawn));
  const inner2 = chord2(LANDING_BLEND[0]), outer2 = chord2(LANDING_BLEND[1]);

  function evaluate(d: Vec3): { h: D; landing: number } {
    const p = point(d[0], d[1], d[2]);
    let h = program.height(p, masks);
    const blend = smoothstep(inner2, outer2, spawnDistance2(p));
    let landing = 0;
    if (blend.v < 1) {
      // A 3 cm undulation over about 2 m keeps the pad natural while staying under ~6°.
      const pad = add(dc(landingLevel), scale(noiseAt(pscale(p, 5), sPad), 0.03));
      h = lerp(pad, h, blend);
      landing = 1 - blend.v;
    }
    h = softFloor(softCeil(h, HEIGHT_LIMITS.knee, HEIGHT_LIMITS.ceiling), HEIGHT_LIMITS.floorKnee, HEIGHT_LIMITS.floor);
    return { h, landing };
  }

  /** Normal and tan(slope) of r(u) = (R + h(u))·u from the gradient of h. */
  function surfaceFrame(d: Vec3, h: D): { normal: Vec3; tanSlope: number } {
    const g = h.x * d[0] + h.y * d[1] + h.z * d[2];
    const tx = h.x - g * d[0], ty = h.y - g * d[1], tz = h.z - g * d[2];
    const r = PLANET_RADIUS + h.v;
    const nx = d[0] - tx / r, ny = d[1] - ty / r, nz = d[2] - tz / r;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return { normal: [nx / l, ny / l, nz / l], tanSlope: Math.sqrt(tx * tx + ty * ty + tz * tz) / r };
  }

  const shadeOut: Shade = { biome: '', albedo: [0, 0, 0] as RGB, rock: 0, roughness: 1, wet: 0, special: 0, cover: 0 };
  function sample(raw: Vec3): SurfaceSample {
    const dir = unit(raw);
    const { h, landing } = evaluate(dir);
    const { normal, tanSlope } = surfaceFrame(dir, h);
    const own = Float64Array.from(masks);
    program.shade({ dir, h: h.v, tanSlope, water, masks: own, landing }, shadeOut);
    const depth = water === null ? 0 : Math.max(0, water - h.v);
    return {
      ...shadeOut, albedo: [...shadeOut.albedo] as RGB,
      dir, height: h.v, normal, tanSlope, slope: Math.atan(tanSlope),
      underwater: water !== null && h.v < water, depth, landing, masks: own,
    };
  }

  const heightAt = (d: Vec3) => evaluate(unit(d)).h.v;
  return {
    id, env, style: env.style, program, landingLevel,
    waterLevel: water,
    heightAt,
    normalAt(d) { const dir = unit(d); return surfaceFrame(dir, evaluate(dir).h).normal; },
    surfacePoint(d) { const dir = unit(d); const r = PLANET_RADIUS + evaluate(dir).h.v; return [dir[0] * r, dir[1] * r, dir[2] * r]; },
    slopeAt(d) { const dir = unit(d); return Math.atan(surfaceFrame(dir, evaluate(dir).h).tanSlope); },
    isUnderwater(d) { return water !== null && heightAt(d) < water; },
    biomeAt(d) { return sample(d).biome; },
    sample,
    heightGradient(d) { const dir = unit(d); const { h } = evaluate(dir); return { height: h.v, gradient: [h.x, h.y, h.z] }; },
  };
}
