import { fbm3, noise3 } from '../../core/noise.ts';
import { add, fbmAt, mul, point, pscale, ridgedAt, scale, smooth, smoothstep } from '../dual.ts';
import type { D, P3 } from '../dual.ts';
import { hexLinear, paletteLinear } from '../env.ts';
import type { PlanetEnvironment } from '../env.ts';
import { layerSeed, makeStrata, mixRGB, nearSpawn, quantileOver, scaleRGB, tanDeg } from './program.ts';
import type { FloraRule, RGB, Shade, ShadeInput, StyleProgram } from './program.ts';

// Temperate: rolling meadow with lakes in the hollows, pale limestone knolls
// and broadleaf woods. It is the closest style to the main project's hub
// (green, gentle, walkable), but with physically based ground, water and
// trees instead of flat toon colours.
//
// masks: 0 = woodland, 1 = outcrop, 2 = hollow (low ground)

const C = {
  meadow: hexLinear('#5b6a3d'),
  meadowDry: hexLinear('#7f7b4d'),
  forestFloor: hexLinear('#3d4130'),
  shore: hexLinear('#4c4639'),
  clover: hexLinear('#46592f'),
};
// Weathered limestone: lichen-greyed, darker than fresh rock, with an occasional pale bed.
const LIMESTONE: RGB[] = ['#6f6b62', '#7b766b', '#625f58', '#86806f', '#6a665d', '#57544e'].map(hexLinear);

export function temperateProgram(env: PlanetEnvironment): StyleProgram {
  const P = env.params;
  const relief = P.relief, rough = P.roughness, veg = P.vegetation;
  const outcrops = P.outcrops as number, woodland = P.woodland as number;
  const lake = P.waterLevel;
  const sHill = layerSeed(env, 'temperate.hills'), sBroad = layerSeed(env, 'temperate.broad'), sKnoll = layerSeed(env, 'temperate.knoll');
  const sWood = layerSeed(env, 'temperate.wood'), sPatch = layerSeed(env, 'temperate.patch'), sDetail = layerSeed(env, 'temperate.detail');
  const gain = 0.4 + 0.2 * rough;

  const knollField = (p: P3): D => ridgedAt(pscale(p, 3.4), sKnoll, 4);
  const tk = quantileOver(d => knollField(point(d[0], d[1], d[2])).v, 1 - (0.02 + 0.14 * outcrops));

  // Generator 2 (see GENERATOR_VERSION): lower, broader hills, so the
  // meadow reads as rolling country rather than lumps from orbit.
  const v2 = env.generatorVersion >= 2;

  function height(p: P3, m: Float64Array): D {
    const near = nearSpawn(p, 1.4, 4.5);
    const hills = scale(fbmAt(pscale(p, 2.2), sHill, v2 ? 4 : 5, 2, gain), (v2 ? 0.45 : 0.62) * relief);
    const broad = scale(fbmAt(pscale(p, 0.9), sBroad, 3), (v2 ? 0.32 : 0.4) * relief);
    const knoll = knollField(p);
    const rise = smoothstep(tk - 0.05, tk + 0.12, knoll);
    const outcrop = scale(mul(rise, knoll), 0.34 * relief);
    const detail = scale(fbmAt(pscale(p, 16), sDetail, 2), 0.02 + 0.025 * rough);
    m[1] = rise.v;
    m[2] = 0;
    return add(add(add(hills, broad), outcrop), add(detail, scale(near, 0.18)));
  }

  const tRock0 = tanDeg(30), tRock1 = tanDeg(44);
  const flora = env.palette?.flora ? mixRGB(C.meadow, paletteLinear(env.palette.flora), 0.5) : C.meadow;
  const groundTint = env.palette?.ground ? paletteLinear(env.palette.ground) : null;
  const woods = (d: [number, number, number]) => smooth(0.05 - 0.25 * woodland, 0.3 - 0.25 * woodland, fbm3(d[0] * 3.2, d[1] * 3.2, d[2] * 3.2, sWood, 3));

  function shade(s: ShadeInput, o: Shade) {
    const [x, y, z] = s.dir;
    const wood = woods(s.dir);
    s.masks[0] = wood;
    const patch = fbm3(x * 7, y * 7, z * 7, sPatch, 3);
    if (lake !== null && s.h < lake) {
      o.biome = 'lake';
      o.albedo = mixRGB(C.shore, scaleRGB(C.shore, 0.5), smooth(0.02, 0.4, lake - s.h));
      o.rock = 0; o.roughness = 0.5; o.wet = 1; o.special = 0; o.cover = 0;
      return;
    }
    const above = lake === null ? 1 : s.h - lake;
    const rock = Math.max(smooth(tRock0, tRock1, s.tanSlope), smooth(0.45, 0.8, s.masks[1]) * smooth(tanDeg(14), tanDeg(26), s.tanSlope));
    let meadow = mixRGB(flora, C.meadowDry, smooth(0.05, 0.35, patch) * (1 - 0.4 * veg));
    meadow = mixRGB(meadow, C.clover, smooth(0.1, 0.35, -patch) * 0.6);
    if (groundTint) meadow = mixRGB(meadow, groundTint, 0.25);
    const shoreline = 1 - smooth(0.01, 0.07, above);
    let albedo = mixRGB(meadow, C.forestFloor, wood * 0.75);
    albedo = mixRGB(albedo, C.shore, shoreline);
    o.albedo = scaleRGB(albedo, 0.9 + 0.1 * noise3(x * 61, y * 61, z * 61, sPatch + 2));
    o.rock = rock;
    o.wet = shoreline * 0.8;
    o.roughness = 0.92 - 0.5 * o.wet;
    o.special = 0;
    o.cover = 1 - shoreline;
    o.biome = rock > 0.5 ? 'outcrop' : shoreline > 0.5 ? 'shore' : wood > 0.5 ? 'woodland' : 'meadow';
  }

  const rules: FloraRule[] = [
    {
      kind: 'broadleaf', share: 0.42, scale: [0.6, 1.15], alignToGround: false, tint: mixRGB(flora, C.clover, 0.5),
      // Broadleaf woods give way to scrub towards the poles.
      accept: f => f.biome !== 'woodland' || f.tanSlope > tanDeg(26) ? 0 : 0.9 * f.density * (1 - smooth(0.6, 0.88, Math.abs(f.dir[1]))),
    },
    {
      kind: 'shrub', share: 0.38, scale: [0.14, 0.34], alignToGround: false, tint: scaleRGB(flora, 0.9),
      accept: f => f.biome === 'woodland' ? 0.3 * f.density : f.biome === 'meadow' && f.tanSlope < tanDeg(26) ? 0.12 * f.density : 0,
    },
    {
      kind: 'boulder', share: 0.2, scale: v2 ? [0.06, 0.22] : [0.08, 0.3], alignToGround: true, tint: scaleRGB(LIMESTONE[2], 0.9),
      accept: f => f.biome === 'outcrop' ? 0.25 * (0.3 + 0.7 * f.density) : f.biome === 'meadow' ? 0.01 : 0,
    },
  ];

  return {
    biomes: ['lake', 'shore', 'meadow', 'woodland', 'outcrop'],
    height,
    shade,
    strata: makeStrata(layerSeed(env, 'temperate.strata'), env.palette?.rock ? LIMESTONE.map(c => mixRGB(c, paletteLinear(env.palette!.rock!), 0.45)) : LIMESTONE, [0.04, 0.12], 0.9),
    water: {
      kind: 'liquid',
      shallow: env.palette?.water ? mixRGB(hexLinear('#3a5649'), paletteLinear(env.palette.water), 0.5) : hexLinear('#3a5649'),
      deep: env.palette?.water ? mixRGB(hexLinear('#0e1d22'), scaleRGB(paletteLinear(env.palette.water), 0.35), 0.5) : hexLinear('#0e1d22'),
      depthScale: 0.3,
      roughness: 0.12,
      foam: 0,
    },
    special: { color: [0.55, 0.56, 0.53], roughness: 0.7, breakup: 1 },
    atmosphere: { color: hexLinear('#86acd2'), strength: 0.7 },
    flora: rules,
  };
}
