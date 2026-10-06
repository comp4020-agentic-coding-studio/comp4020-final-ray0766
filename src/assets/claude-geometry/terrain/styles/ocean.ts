import { fbm3, noise3 } from '../../core/noise.ts';
import { add, addK, cellAt, dc, div, fbmAt, hashUnit, lerp, lerpK, mul, point, pscale, ridgedAt, scale, smax, smooth, smooth01, smoothstep, sub } from '../dual.ts';
import type { D, P3 } from '../dual.ts';
import { hexLinear, paletteLinear } from '../env.ts';
import type { PlanetEnvironment } from '../env.ts';
import { layerSeed, makeStrata, mixRGB, nearSpawn, quantileOver, scaleRGB, tanDeg } from './program.ts';
import type { FloraRule, RGB, Shade, ShadeInput, StyleProgram } from './program.ts';

// Ocean: a high sea over an archipelago of terraced basalt islands.
//
// The land mask is a 5-octave fbm whose threshold is calibrated per seed so
// about a third of the surface is land whatever the seed. The signed distance
// to the coast (in noise units) shapes everything: a shelf and a deep basin
// below it, a short beach or a sea cliff at it (a second noise picks which),
// and ridged uplands inland. Uplands are terraced the way stacked lava flows
// weather: broad grassy treads and short dark basalt risers. Sea stacks are
// Worley cells in the shallow band raised into steep pillars.
//
// masks: 0 = signed coast distance, 1 = cliff coast, 2 = sea stack,
//        3 = upland, 4 = grove (where trees and heath cluster)

const LAND_SHARE = 0.36;
const TERRACE = 0.2;

const C = {
  sandDry: hexLinear('#a69c84'),
  sandWet: hexLinear('#59544a'),
  seabed: hexLinear('#7a755f'),
  silt: hexLinear('#33372f'),
  grass: hexLinear('#55603d'),
  grassDark: hexLinear('#3b4630'),
  tussock: hexLinear('#7a7352'),
  peat: hexLinear('#3d382c'),
};
// Weathered basalt: mid greys with a brown cast, darker fresh layers, an ochre tuff band now and then.
const BASALT: RGB[] = ['#4a4945', '#55524b', '#3d3c3a', '#605b51', '#46423b', '#6b604c'].map(hexLinear);

/** Stepped version of x: flat treads for most of each step, a short steep riser at the end. */
function terrace(x: D, step: number, riser: number): D {
  const t = scale(x, 1 / step);
  const f = Math.floor(t.v);
  const g = smooth01(scale(addK(t, -f - (1 - riser)), 1 / riser));
  return scale(addK(g, f), step);
}

export function oceanProgram(env: PlanetEnvironment): StyleProgram {
  const P = env.params;
  const relief = P.relief, rough = P.roughness, veg = P.vegetation;
  const arch = P.archipelago as number, stacks = P.stacks as number;
  const sea = P.waterLevel ?? 0;
  const sCont = layerSeed(env, 'ocean.continent'), sCoast = layerSeed(env, 'ocean.coast'), sHill = layerSeed(env, 'ocean.hills');
  const sCliff = layerSeed(env, 'ocean.cliff'), sStack = layerSeed(env, 'ocean.stack'), sBed = layerSeed(env, 'ocean.bed');
  const sDetail = layerSeed(env, 'ocean.detail'), sPatch = layerSeed(env, 'ocean.patch'), sGrove = layerSeed(env, 'ocean.grove');
  const fC = 1.0 + 1.9 * arch;
  const gain = 0.4 + 0.2 * rough;

  // Generator 2 (see GENERATOR_VERSION): basalt tablelands instead of ridged
  // hills, and a quieter coast noise so shorelines read clean from orbit.
  const v2 = env.generatorVersion >= 2;
  const coastNoise = v2 ? 0.1 : 0.18;
  const continent = (p: P3): D => add(fbmAt(pscale(p, fC), sCont, 5, 2, gain), scale(fbmAt(pscale(p, fC * 3.3), sCoast, 3), coastNoise));
  const threshold = quantileOver(d => continent(point(d[0], d[1], d[2])).v, 1 - LAND_SHARE);

  function height(p: P3, m: Float64Array): D {
    // Raise the land mask around the landing spot so it sits on a natural home
    // island, with calmer uplands there so settlers have somewhere to build.
    const home = nearSpawn(p, 2.2, 7.5);
    const s = sub(add(continent(p), scale(home, 0.5)), dc(threshold));
    const cliff = smoothstep(0.04, 0.24, fbmAt(pscale(p, 4.2), sCliff, 2));
    m[0] = s.v; m[1] = cliff.v; m[2] = 0; m[3] = 0;
    let h: D;
    if (s.v >= 0) {
      // A short beach, or a sea cliff where the cliff mask is high.
      const width = addK(scale(cliff, -0.03), 0.04);
      const coast = scale(smooth01(div(s, width)), 0.08);
      const cliffFace = scale(mul(cliff, smooth01(scale(s, 1 / 0.03))), 0.28 * relief);
      const up = smoothstep(0.02, 0.32, s);
      let stepped: D, detail: D;
      if (v2) {
        // Tablelands: a broad, low rise inland cut into flat basalt treads with
        // short steep risers, the way stacked lava flows weather, plus a little
        // rough ground on the treads.
        const broad = addK(scale(fbmAt(pscale(p, 1.6), sHill, 3, 2, 0.45), 0.8), 0.6);
        const rise = scale(mul(mul(up, broad), addK(scale(home, -0.6), 1)), 0.7 * relief);
        const rugged = scale(mul(up, ridgedAt(pscale(p, 3.1), sHill + 1, 3)), 0.07 * relief);
        stepped = add(terrace(rise, TERRACE * (0.8 + 0.4 * relief), 0.3), rugged);
        detail = scale(mul(up, fbmAt(pscale(p, 15), sDetail, 2)), 0.02 * (0.3 + rough));
      } else {
        const r = ridgedAt(pscale(p, 2.3), sHill, 4);
        const raw = mul(up, addK(scale(mul(r, r), 0.85), 0.15));
        const uplands = scale(mul(raw, addK(scale(home, -0.6), 1)), 1.1 * relief);
        stepped = lerpK(uplands, terrace(uplands, TERRACE * (0.8 + 0.4 * relief), 0.42), 0.55);
        detail = scale(mul(up, fbmAt(pscale(p, 15), sDetail, 2)), 0.035 * (0.3 + rough));
      }
      h = add(add(coast, cliffFace), add(stepped, detail));
      m[3] = up.v;
    } else {
      const shelf = scale(smoothstep(0, 0.03, scale(s, -1)), -0.14);
      const basin = scale(smoothstep(0.04, 0.36, scale(s, -1)), -1.0);
      const bed = scale(mul(fbmAt(pscale(p, 9), sBed, 2), smoothstep(0, 0.06, scale(s, -1))), 0.06);
      h = add(add(shelf, basin), bed);
    }
    // Sea stacks: steep basalt pillars in the shallow band off the coast.
    const gate = mul(smoothstep(-0.18, -0.09, s), addK(scale(smoothstep(-0.02, 0.02, s), -1), 1));
    if (stacks > 0 && gate.v > 0) {
      const cell = cellAt(pscale(p, 8), sStack, 0.55);
      if (hashUnit(cell.hash, 1) < stacks * 0.5) {
        const r = 0.34 + 0.12 * hashUnit(cell.hash, 2);
        const inside = addK(scale(smoothstep(r * 0.7, r, cell.d), -1), 1);
        if (inside.v > 0) {
          const top = 0.22 + 0.42 * relief * hashUnit(cell.hash, 3);
          const cap = addK(scale(mul(cell.d, cell.d), -0.5), top);
          // Never lower the ground: a stack on the shore only adds rock.
          h = lerp(h, smax(h, mul(cap, gate), 0.04), inside);
          m[2] = inside.v * gate.v;
        }
      }
    }
    return h;
  }

  const tRock0 = tanDeg(36), tRock1 = tanDeg(50), tBeach0 = tanDeg(12), tBeach1 = tanDeg(22);
  const floraTint = env.palette?.flora ? mixRGB(C.grass, paletteLinear(env.palette.flora), 0.55) : C.grass;
  const ground = env.palette?.ground ? paletteLinear(env.palette.ground) : null;
  const sandDry = ground ? mixRGB(C.sandDry, ground, 0.5) : C.sandDry;
  const sandWet = ground ? mixRGB(C.sandWet, scaleRGB(ground, 0.45), 0.5) : C.sandWet;

  function shade(s: ShadeInput, o: Shade) {
    const depth = sea - s.h;
    const rockSlope = smooth(tRock0, tRock1, s.tanSlope);
    const stack = s.masks[2];
    const [x, y, z] = s.dir;
    if (depth > 0) {
      o.biome = stack > 0.5 ? 'sea-stack' : depth > 0.35 ? 'deep-water' : 'shallows';
      o.albedo = mixRGB(C.seabed, C.silt, smooth(0.05, 0.6, depth));
      o.rock = Math.max(rockSlope * 0.8, stack);
      o.roughness = 0.45; o.wet = 1;
      o.special = 0; o.cover = 0;
      return;
    }
    const above = -depth;
    const coast = s.masks[0];
    const patch = fbm3(x * 6, y * 6, z * 6, sPatch, 3);
    const wet = 1 - smooth(0.008, 0.04, above);
    // Sand only on the low, gentle strip right at the coast.
    const beach = (1 - smooth(0.05, 0.11, above)) * (1 - smooth(tBeach0, tBeach1, s.tanSlope)) * (1 - smooth(0.02, 0.06, coast));
    const sand = mixRGB(sandDry, sandWet, wet);
    let grass = mixRGB(floraTint, C.grassDark, smooth(-0.1, 0.25, patch) * 0.7);
    grass = mixRGB(grass, C.tussock, smooth(0.15, 0.4, -patch) * (1 - 0.5 * veg));
    grass = mixRGB(grass, C.peat, smooth(0.2, 0.45, patch) * 0.35);
    // Rock is laid over this in the shader; underneath it the cover stays turf, never sand.
    o.cover = (1 - beach) * smooth(0.0, 0.05, above);
    o.albedo = mixRGB(sand, grass, o.cover);
    // Mottling at the scale of a few vertices (tufts, bare earth, stones).
    o.albedo = scaleRGB(o.albedo, 0.9 + 0.1 * noise3(x * 61, y * 61, z * 61, sPatch + 7) + 0.06 * noise3(x * 150, y * 150, z * 150, sPatch + 9));
    o.rock = Math.max(rockSlope, stack);
    o.roughness = 0.93 - 0.6 * wet;
    o.wet = wet;
    // A thin, broken line of wash at the waterline, only where waves run up a gentle shore.
    o.special = (1 - smooth(0, 0.008, above)) * 0.35 * (1 - smooth(tBeach0, tBeach1, s.tanSlope));
    o.biome = stack > 0.5 ? 'sea-stack' : o.rock > 0.5 ? 'cliff' : beach > 0.5 ? 'beach' : 'grassland';
  }

  /** Low-frequency grove mask so plants cluster in sheltered patches instead of an even scatter. */
  /** Towards the poles trees give out first, then the heath thins. */
  const polar = (f: { dir: [number, number, number] }) => smooth(0.6, 0.88, Math.abs(f.dir[1]));
  const grove = (f: { dir: [number, number, number] }) => smooth(-0.05, 0.25, fbm3(f.dir[0] * 4.5, f.dir[1] * 4.5, f.dir[2] * 4.5, sGrove, 3));
  const rules: FloraRule[] = [
    {
      kind: 'boulder', share: 0.2, scale: v2 ? [0.06, 0.2] : [0.08, 0.26], alignToGround: true, tint: scaleRGB(BASALT[2], 0.95),
      accept: f => (f.water !== null && f.h - f.water < 0.015) || f.tanSlope > tRock1 ? 0
        : (f.biome === 'beach' || f.biome === 'cliff' ? 0.5 : 0.05) * (0.3 + 0.7 * f.density),
    },
    // Trees are offered a candidate before heath, so a denser setting adds
    // pines in the groves instead of letting heath take every spot.
    {
      kind: 'cypress', share: 0.25, scale: [0.5, 0.95], alignToGround: false, tint: env.palette?.flora ? mixRGB(hexLinear('#46522f'), paletteLinear(env.palette.flora), 0.4) : hexLinear('#46522f'),
      accept: f => f.biome !== 'grassland' || f.h - sea < 0.18 || f.tanSlope > tanDeg(22) ? 0 : 0.7 * f.density * grove(f) * smooth(0.3, 0.9, f.masks[3]) * (1 - polar(f)),
    },
    {
      kind: 'shrub', share: 0.55, scale: [0.12, 0.3], alignToGround: false, tint: mixRGB(floraTint, C.grassDark, 0.5),
      accept: f => f.biome !== 'grassland' || f.h - sea < 0.08 || f.tanSlope > tanDeg(28) ? 0 : 0.95 * f.density * (0.15 + 0.85 * grove(f)) * (1 - 0.6 * polar(f)),
    },
  ];

  const waterTint = env.palette?.water ? paletteLinear(env.palette.water) : null;
  return {
    biomes: ['deep-water', 'shallows', 'beach', 'grassland', 'cliff', 'sea-stack'],
    height,
    shade,
    strata: makeStrata(layerSeed(env, 'ocean.strata'), env.palette?.rock ? BASALT.map(c => mixRGB(c, paletteLinear(env.palette!.rock!), 0.45)) : BASALT, [0.025, 0.08], 0.7),
    water: {
      kind: 'liquid',
      shallow: waterTint ? mixRGB(hexLinear('#2b5f5c'), waterTint, 0.5) : hexLinear('#2b5f5c'),
      deep: waterTint ? mixRGB(hexLinear('#0a1f2b'), scaleRGB(waterTint, 0.35), 0.5) : hexLinear('#0a1f2b'),
      depthScale: 0.9,
      // Generator 2's calmer water; generator-1 planets keep round one's 0.2.
      roughness: v2 ? 0.15 : 0.2,
      foam: 1,
    },
    special: { color: [0.62, 0.64, 0.62], roughness: 0.75, breakup: 1 },
    atmosphere: { color: hexLinear('#6f9fca'), strength: 0.75 },
    flora: rules,
  };
}
