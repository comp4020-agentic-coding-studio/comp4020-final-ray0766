import { fbm3, noise3 } from '../../core/noise.ts';
import { abs, add, addK, fbmAt, mul, noiseAt, point, pscale, ridgedAt, scale, smooth, smoothstep, sub } from '../dual.ts';
import type { D, P3 } from '../dual.ts';
import { hexLinear, paletteLinear } from '../env.ts';
import type { PlanetEnvironment } from '../env.ts';
import { layerSeed, makeStrata, mixRGB, nearSpawn, quantileOver, scaleRGB, tanDeg } from './program.ts';
import type { FloraRule, RGB, Shade, ShadeInput, StyleProgram } from './program.ts';

// Ice: glacial plateaus over frozen lowlands and a frozen sea.
//
// A calibrated fbm mask lifts about a third of the surface into ice
// plateaus with steep, blue ice cliffs and a gently domed snow cap. Just
// inside each rim the ice is under tension, so crevasses open along the
// contours of the plateau mask (parallel to the edge), broken into segments.
// The lowlands are frost-shattered rock and gravel with snow patches, darker
// conifers in sheltered low ground, and a frozen sea sheet where they dip
// below sea level.
//
// masks: 0 = plateau, 1 = crevasse, 2 = distance inside the rim (mask units),
//        3 = rock outcrop, 4 = shelter (low ground away from the poles)

const C = {
  snow: hexLinear('#d2dbe1'),
  snowShade: hexLinear('#aebfcb'),
  packed: hexLinear('#a9b2b6'),
  glacier: hexLinear('#88a9bb'),
  tundra: hexLinear('#5c5d55'),
  moss: hexLinear('#4b5243'),
  gravel: hexLinear('#77756d'),
};
const GNEISS: RGB[] = ['#3c3f42', '#4b4e51', '#34373a', '#585a5b', '#43403c', '#2f3134'].map(hexLinear);

export function iceProgram(env: PlanetEnvironment): StyleProgram {
  const P = env.params;
  const relief = P.relief, rough = P.roughness, veg = P.vegetation;
  const crevasses = P.crevasses as number;
  const sea = P.waterLevel;
  const sBase = layerSeed(env, 'ice.base'), sPlat = layerSeed(env, 'ice.plateau'), sEdge = layerSeed(env, 'ice.edge');
  const sCrev = layerSeed(env, 'ice.crevasse'), sSeg = layerSeed(env, 'ice.segment'), sOut = layerSeed(env, 'ice.outcrop');
  const sPatch = layerSeed(env, 'ice.patch'), sDetail = layerSeed(env, 'ice.detail');
  const gain = 0.4 + 0.2 * rough;

  // Generator 2 (see GENERATOR_VERSION): flat-topped ice caps with sheer
  // rims over smooth snow plains, instead of domed caps on rolling lowlands,
  // and cap outlines with less fine wiggle, so a rim reads as one clean ice
  // wall from orbit rather than a row of notches.
  const v2 = env.generatorVersion >= 2;
  const edgeNoise = v2 ? 0.03 : 0.07, capOctaves = v2 ? 3 : 4;
  const plateauField = (p: P3): D => add(fbmAt(pscale(p, 1.7), sPlat, capOctaves, 2, gain), scale(fbmAt(pscale(p, 6.5), sEdge, 2), edgeNoise));
  const t = quantileOver(d => plateauField(point(d[0], d[1], d[2])).v, 0.66);

  const shape = v2 ? { base: 0.3, octaves: 3, rimBand: 0.05, dome: 0.06, outcrop: 0.18 } : { base: 0.7, octaves: 5, rimBand: 0.065, dome: 0.2, outcrop: 0.32 };

  function height(p: P3, m: Float64Array): D {
    const near = nearSpawn(p, 1.4, 4.5);
    const base = scale(fbmAt(pscale(p, 1.5), sBase, shape.octaves, 2, gain), shape.base * relief);
    const g = sub(plateauField(p), scale(near, 0.4));
    const rim = smoothstep(t, t + shape.rimBand, g);
    const dome = smoothstep(t + 0.06, t + 0.32, g);
    const plateau = add(scale(rim, 0.6 * relief), scale(dome, shape.dome * relief));
    // Frost-shattered outcrops in the lowlands only.
    const r = ridgedAt(pscale(p, 3.2), sOut, 4);
    const outcrop = scale(mul(mul(mul(r, r), r), addK(scale(rim, -1), 1)), shape.outcrop * relief);
    let h = add(add(base, plateau), outcrop);
    // Crevasses: grooves along contours of the plateau mask, in a band just inside the rim.
    m[1] = 0;
    if (crevasses > 0 && g.v > t - 0.005 && g.v < t + 0.2) {
      const band = mul(smoothstep(t + 0.03, t + 0.07, g), addK(scale(smoothstep(t + 0.12, t + 0.2, g), -1), 1));
      if (band.v > 0) {
        // About one crevasse per 1.2 m, each about 0.3 m wide: wide enough for the
        // high-LOD mesh (0.16 m spacing) to draw a continuous groove, not a row of dimples.
        const arg = add(scale(addK(g, -t), 8), scale(noiseAt(pscale(p, 5), sCrev), 0.25));
        const c = addK(arg, -Math.floor(arg.v));
        const dist = abs(addK(c, -0.5));
        const groove = addK(scale(smoothstep(0.02, 0.17, dist), -1), 1);
        const seg = smoothstep(-0.12, 0.08, noiseAt(pscale(p, 7), sSeg));
        const cut = mul(mul(band, groove), seg);
        h = sub(h, scale(cut, 0.12 * crevasses));
        m[1] = cut.v * crevasses;
      }
    }
    const detail = scale(fbmAt(pscale(p, 20), sDetail, 2), 0.012 + 0.02 * rough);
    m[0] = rim.v; m[2] = g.v - t; m[3] = r.v * r.v * r.v * (1 - rim.v); m[4] = (1 - rim.v) * (1 - smooth(0.55, 0.85, Math.abs(p.y.v)));
    return add(h, detail);
  }

  const tRock0 = tanDeg(32), tRock1 = tanDeg(44), tIce0 = tanDeg(16), tIce1 = tanDeg(28);
  const ground = env.palette?.ground ? paletteLinear(env.palette.ground) : null;
  const snow = ground ? mixRGB(C.snow, ground, 0.35) : C.snow;
  const snowShade = ground ? mixRGB(C.snowShade, ground, 0.35) : C.snowShade;

  function shade(s: ShadeInput, o: Shade) {
    const [x, y, z] = s.dir;
    const plateau = s.masks[0], crev = s.masks[1], outcrop = s.masks[3];
    const polar = smooth(0.6, 0.85, Math.abs(y));
    const patch = fbm3(x * 8, y * 8, z * 8, sPatch, 3);
    if (sea !== null && s.h < sea) {
      o.biome = 'sea-ice';
      o.albedo = C.gravel; o.rock = 0; o.roughness = 0.4; o.wet = 0; o.special = 0; o.cover = 0;
      return;
    }
    const steep = smooth(tRock0, tRock1, s.tanSlope);
    // Anything on the plateau or its rising rim is ice; bare rock belongs to the lowlands.
    if (plateau > 0.12) {
      // Plateau: snow on top, blue glacier ice on its steep faces, dark crevasses.
      const iceFace = smooth(tIce0, tIce1, s.tanSlope);
      const snowCover = mixRGB(snowShade, snow, smooth(-0.2, 0.3, patch));
      o.albedo = mixRGB(snowCover, C.glacier, iceFace);
      o.rock = 0;
      o.roughness = 0.82 - 0.6 * iceFace;
      o.wet = 0;
      o.special = Math.min(1, crev * 1.3);
      o.cover = 0;
      o.biome = crev > 0.25 ? 'crevasse' : iceFace > 0.5 ? 'ice-cliff' : 'snowfield';
      return;
    }
    // Lowlands: snow lies on flats and in hollows and covers everything towards
    // the poles; bare moss and gravel only show on rises near the equator, rock
    // only on steep faces and outcrops.
    const fine = noise3(x * 26, y * 26, z * 26, sPatch + 13);
    const flatness = 1 - smooth(tanDeg(10), tanDeg(26), s.tanSlope + 0.05 * fine);
    const hollow = 1 - smooth(-0.1, 0.16, s.h - (sea ?? 0) - 0.12 + 0.08 * patch);
    const cold = smooth(0.25, 0.7, Math.abs(y));
    const snowy = Math.min(1, flatness * (0.55 + 0.45 * Math.max(hollow, cold)) + polar * 0.7 + 0.12 * fine);
    const tundra = mixRGB(mixRGB(C.tundra, C.moss, smooth(-0.1, 0.3, -patch) * (0.4 + 0.6 * veg)), C.gravel, smooth(0.1, 0.4, patch) * 0.5);
    // Lowland snow is wind-packed and dusted with grit, a step greyer than the plateau caps.
    o.albedo = mixRGB(tundra, mixRGB(C.packed, snow, 0.35 + 0.3 * polar), snowy);
    o.albedo = scaleRGB(o.albedo, 0.92 + 0.08 * noise3(x * 70, y * 70, z * 70, sPatch + 5));
    o.rock = Math.max(steep, smooth(0.3, 0.55, outcrop) * (1 - snowy));
    o.roughness = 0.88 - 0.1 * snowy;
    o.wet = 0;
    o.special = 0;
    o.cover = (1 - snowy) * 0.8;
    o.biome = o.rock > 0.5 ? 'rock' : snowy > 0.6 ? 'snowfield' : 'tundra';
  }

  const conifer = env.palette?.flora ? mixRGB(hexLinear('#2a3326'), paletteLinear(env.palette.flora), 0.4) : hexLinear('#2a3326');
  const rules: FloraRule[] = [
    {
      kind: 'spruce', share: 0.5, scale: [0.55, 1.1], alignToGround: false, tint: conifer,
      // Generator 2's smoother lowlands hold more snow; spruce also stands in lowland snowfields there.
      accept: f => !(f.biome === 'tundra' || (v2 && f.biome === 'snowfield' && f.masks[0] < 0.12)) || f.tanSlope > tanDeg(24) || (f.water !== null && f.h - f.water < 0.06) ? 0
        : 0.85 * f.density * smooth(0.3, 0.8, f.masks[4]) * smooth(-0.05, 0.2, fbm3(f.dir[0] * 4, f.dir[1] * 4, f.dir[2] * 4, sPatch + 11, 2)),
    },
    {
      kind: 'spire', share: 0.15, scale: v2 ? [0.1, 0.26] : [0.16, 0.42], alignToGround: false, tint: hexLinear('#c9dce6'),
      accept: f => {
        const spires = P.spires as number;
        if (spires <= 0) return 0;
        // On plateau rims, and as pressure pinnacles on the frozen sea near the shore.
        if (f.biome === 'sea-ice') return f.water !== null && f.water - f.h < 0.2 ? (v2 ? 0.15 : 0.25) * spires : 0;
        const rimBand = Math.abs(f.masks[2] - 0.03) < 0.03 && f.masks[0] > 0.3;
        return rimBand ? (v2 ? 0.35 : 0.5) * spires : 0;
      },
    },
    {
      kind: 'boulder', share: 0.2, scale: v2 ? [0.06, 0.22] : [0.08, 0.3], alignToGround: true, tint: scaleRGB(GNEISS[1], 1.3),
      accept: f => f.biome === 'rock' || f.biome === 'tundra' ? (f.tanSlope < tanDeg(38) ? 0.18 * (0.3 + 0.7 * f.density) : 0) : 0,
    },
  ];

  return {
    biomes: ['sea-ice', 'snowfield', 'ice-cliff', 'crevasse', 'tundra', 'rock'],
    height,
    shade,
    strata: makeStrata(layerSeed(env, 'ice.strata'), env.palette?.rock ? GNEISS.map(c => mixRGB(c, paletteLinear(env.palette!.rock!), 0.45)) : GNEISS, [0.03, 0.09], 0.8),
    water: {
      kind: 'ice-sheet',
      // Sea ice reads darker and bluer than the snow on land, so the shore shows.
      shallow: env.palette?.water ? mixRGB(hexLinear('#91a9b6'), paletteLinear(env.palette.water), 0.25) : hexLinear('#91a9b6'),
      deep: env.palette?.water ? mixRGB(hexLinear('#3d5b6c'), paletteLinear(env.palette.water), 0.4) : hexLinear('#3d5b6c'),
      depthScale: 0.6,
      roughness: 0.2,
      foam: 0,
    },
    special: { color: hexLinear('#16303f'), roughness: 0.12, breakup: 0.2 },
    atmosphere: { color: hexLinear('#9cc3e2'), strength: 0.85 },
    flora: rules,
  };
}
