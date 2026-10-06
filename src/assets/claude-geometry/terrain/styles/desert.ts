import { PLANET_RADIUS } from '../../core/anchor.ts';
import { fbm3, noise3 } from '../../core/noise.ts';
import { abs, add, addK, fbmAt, mul, noiseAt, padd, pdot, point, pscale, ridgedAt, scale, smooth, smoothstep, sub } from '../dual.ts';
import type { D, P3 } from '../dual.ts';
import { hexLinear, paletteLinear } from '../env.ts';
import type { PlanetEnvironment } from '../env.ts';
import { layerSeed, makeStrata, mixRGB, nearSpawn, quantileOver, scaleRGB, tanDeg } from './program.ts';
import { sinCos } from '../trig.ts';
import type { FloraRule, RGB, Shade, ShadeInput, StyleProgram } from './program.ts';

// Desert: a dry erg of wind-built dunes between layered mesas and buttes.
//
// Mesas come from a warped fbm mask cut at two calibrated levels: the first
// cut is the mesa cliff, the second a butte standing on top. A talus apron
// rises towards each cliff foot. Dunes are ridged noise compressed along the
// wind axis, so crests run across the wind, warped so they meander; they only
// form inside an erg mask and never on mesa tops. Rock faces show red and
// buff sandstone strata; mesa caps are darkened by desert varnish.
//
// masks: 0 = mesa (first step), 1 = erg, 2 = talus, 3 = butte (second step), 4 = dune crest

const C = {
  dune: hexLinear('#c9a375'),
  duneShade: hexLinear('#a8805a'),
  serir: hexLinear('#7d6047'),
  pebble: hexLinear('#5a4637'),
  cap: hexLinear('#644837'),
  talus: hexLinear('#8a6a4f'),
};
// Sandstone and siltstone: reds and buffs within a narrow value range, the odd paler bed.
/** Generator 2 dunes: crest spacing in metres and where the crest sits within one wavelength (the rest is the slip face). */
const DUNE_SPACING = 2.0;
const DUNE_CREST = 0.74;
const SANDSTONE: RGB[] = ['#8e5639', '#9d6443', '#a8744f', '#83503a', '#a2704f', '#b48a63', '#7a4a36', '#946042'].map(hexLinear);

export function desertProgram(env: PlanetEnvironment): StyleProgram {
  const P = env.params;
  const relief = P.relief, rough = P.roughness;
  const mesas = P.mesas as number;
  // Compression axis for the dunes: the horizontal wind direction (rotation
  // about +Y), from arithmetic-only trig so heights match in every engine.
  const [windSin, windCos] = sinCos((P.wind as number) * Math.PI / 180);
  const W: [number, number, number] = [windCos, 0, windSin];
  const sBase = layerSeed(env, 'desert.base'), sMesa = layerSeed(env, 'desert.mesa'), sEdge = layerSeed(env, 'desert.edge');
  const sErg = layerSeed(env, 'desert.erg'), sDune = layerSeed(env, 'desert.dune'), sWarp = layerSeed(env, 'desert.warp');
  const sDetail = layerSeed(env, 'desert.detail'), sPatch = layerSeed(env, 'desert.patch');
  const gain = 0.38 + 0.22 * rough;

  // Generator 2 (see GENERATOR_VERSION): a flatter plain, transverse dunes
  // (long parallel crests across the wind) instead of ridged-noise mounds, and
  // mesa outlines with less fine wiggle, so a rim reads as one clean wall from
  // orbit rather than a row of notches.
  const v2 = env.generatorVersion >= 2;
  const edgeNoise = v2 ? 0.04 : 0.1, mesaOctaves = v2 ? 3 : 4;
  const mesaField = (p: P3): D => add(fbmAt(pscale(p, 2.1), sMesa, mesaOctaves, 2, gain), scale(fbmAt(pscale(p, 7), sEdge, 2), edgeNoise));
  const share = 0.05 + 0.3 * mesas;
  const t1 = quantileOver(d => mesaField(point(d[0], d[1], d[2])).v, 1 - share);
  const t2 = quantileOver(d => mesaField(point(d[0], d[1], d[2])).v, 1 - share * 0.3);
  const k = 2.6;

  function height(p: P3, m: Float64Array): D {
    const near = nearSpawn(p, 1.4, 4.5);
    const base = scale(fbmAt(pscale(p, 1.3), sBase, 4, 2, gain), (v2 ? 0.12 : 0.24) * relief);
    const mf = sub(mesaField(p), scale(near, 0.45));
    // Cliff bands about 0.3–0.5 m wide in plan: steep, eroded walls the mesh can draw cleanly.
    const step1 = smoothstep(t1, t1 + 0.05, mf);
    const step2 = smoothstep(t2, t2 + 0.045, mf);
    const talus = smoothstep(t1 - 0.09, t1 + 0.01, mf);
    const mesa = add(scale(step1, 0.52 * relief), scale(step2, 0.36 * relief));
    const apron = scale(mul(talus, talus), 0.13 * relief);
    const cap = scale(mul(step1, fbmAt(pscale(p, 24), sDetail, 2)), 0.02 + 0.02 * rough);
    const erg = mul(smoothstep(-0.06, 0.18, fbmAt(pscale(p, 1.6), sErg, 3)), addK(scale(add(step1, scale(near, 0.85)), -1), 1));

    let dunes: D, crest: number;
    if (v2) {
      // Transverse dunes: crests DUNE_SPACING apart across the wind, each a long
      // windward slope and a short slip face near the angle of repose. The
      // phase meanders with a low-frequency warp and crest height varies along
      // each crest, so the field breaks into segments rather than stripes.
      // Crests are planes across the wind axis, so they close into rings near
      // the two points the wind blows straight at and away from; dune fields
      // stay in the belt between them (|along| < 0.72, crests at most 1.45 ×
      // DUNE_SPACING apart) and give way to flat sand sheets beyond it.
      const along = pdot(p, W);
      const belt = addK(scale(smoothstep(0.55, 0.72, abs(along)), -1), 1);
      const phase = add(scale(along, PLANET_RADIUS / DUNE_SPACING), scale(noiseAt(pscale(p, 2.4), sWarp), 0.9));
      const t = addK(phase, -Math.floor(phase.v));
      let profile: D;
      if (t.v < DUNE_CREST) { const a = scale(t, 1 / DUNE_CREST); profile = mul(a, a); }
      else { const b = addK(scale(addK(t, -DUNE_CREST), -1 / (1 - DUNE_CREST)), 1); profile = mul(b, b); }
      const segment = mul(smoothstep(-0.35, 0.3, noiseAt(pscale(p, 4.2), sDune)), belt);
      dunes = scale(mul(mul(erg, segment), profile), 0.07 + 0.12 * relief);
      crest = profile.v * segment.v;
    } else {
      // Dunes: compress along the wind so ridges form across it, warp so they meander.
      const along = pdot(p, W);
      const q0: P3 = { x: add(p.x, scale(along, W[0] * (k - 1))), y: p.y, z: add(p.z, scale(along, W[2] * (k - 1))) };
      const warp = (o: number) => scale(noiseAt(pscale(p, 3.1), (sWarp + o) >>> 0), 0.12);
      const q = padd(q0, warp(0), warp(1), warp(2));
      const ridge = ridgedAt(pscale(q, 3.6), sDune, 3);
      dunes = scale(mul(mul(erg, ridge), ridge), 0.08 + 0.18 * relief);
      crest = ridge.v;
    }

    m[0] = step1.v; m[1] = erg.v; m[2] = talus.v * (1 - step1.v); m[3] = step2.v; m[4] = crest;
    return add(add(add(base, mesa), add(apron, cap)), dunes);
  }

  const tRock0 = tanDeg(33), tRock1 = tanDeg(46);
  const ground = env.palette?.ground ? paletteLinear(env.palette.ground) : null;
  const dune = ground ? mixRGB(C.dune, ground, 0.45) : C.dune;
  const duneShade = ground ? mixRGB(C.duneShade, scaleRGB(ground, 0.8), 0.45) : C.duneShade;

  function shade(s: ShadeInput, o: Shade) {
    const [x, y, z] = s.dir;
    const mesa = s.masks[0], erg = s.masks[1], talus = s.masks[2], crest = s.masks[4];
    const rock = smooth(tRock0, tRock1, s.tanSlope);
    const patch = fbm3(x * 9, y * 9, z * 9, sPatch, 3);
    // Dune sand is lighter on crests, darker and coarser in troughs.
    const sand = mixRGB(duneShade, dune, smooth(0.25, 0.75, crest));
    const plain = mixRGB(C.serir, C.pebble, smooth(0.0, 0.3, patch) * 0.6);
    let albedo = mixRGB(plain, sand, smooth(0.15, 0.6, erg));
    albedo = mixRGB(albedo, C.talus, talus * 0.7);
    albedo = mixRGB(albedo, C.cap, mesa * (1 - rock) * 0.85);
    o.albedo = scaleRGB(albedo, 0.93 + 0.07 * noise3(x * 70, y * 70, z * 70, sPatch + 3));
    o.rock = rock;
    o.roughness = 0.95 - 0.12 * mesa;
    o.wet = 0;
    // Desert varnish: dark streaks just below mesa rims.
    o.special = mesa > 0.05 && mesa < 0.95 ? 0.35 * smooth(0.0, 0.3, patch + 0.1) : 0;
    o.cover = 0;
    o.biome = rock > 0.5 ? 'cliff' : mesa > 0.5 ? 'mesa-top' : talus > 0.4 ? 'talus' : erg > 0.45 ? 'dune' : 'gravel-plain';
  }

  const tint = env.palette?.flora ? mixRGB(hexLinear('#5f6853'), paletteLinear(env.palette.flora), 0.5) : hexLinear('#5f6853');
  const flat = (f: { tanSlope: number }, deg: number) => f.tanSlope < tanDeg(deg);
  // Succulents thin out towards the cold poles; boulders do not care.
  const warm = (f: { dir: [number, number, number] }) => 1 - smooth(0.65, 0.92, Math.abs(f.dir[1]));
  const rules: FloraRule[] = [
    {
      kind: 'boulder', share: 0.4, scale: v2 ? [0.06, 0.24] : [0.08, 0.34], alignToGround: true, tint: mixRGB(SANDSTONE[3], hexLinear('#5b5148'), 0.5),
      accept: f => !flat(f, 40) ? 0 : (f.biome === 'talus' ? (v2 ? 0.55 : 0.85) : f.biome === 'gravel-plain' ? 0.04 : f.biome === 'mesa-top' ? 0.05 : 0) * (0.35 + 0.65 * f.density),
    },
    {
      kind: 'agave', share: 0.32, scale: [0.18, 0.4], alignToGround: false, tint,
      accept: f => !flat(f, 20) ? 0 : (f.biome === 'gravel-plain' ? 0.32 : f.biome === 'mesa-top' ? 0.22 : 0) * f.density * warm(f),
    },
    {
      kind: 'cactus', share: 0.28, scale: [0.16, 0.42], alignToGround: false, tint: scaleRGB(tint, 0.85),
      accept: f => !flat(f, 18) ? 0 : (f.biome === 'gravel-plain' ? 0.24 : f.biome === 'talus' ? 0.1 : 0) * f.density * warm(f),
    },
  ];

  return {
    biomes: ['dune', 'gravel-plain', 'mesa-top', 'cliff', 'talus'],
    height,
    shade,
    strata: makeStrata(layerSeed(env, 'desert.strata'), env.palette?.rock ? SANDSTONE.map(c => mixRGB(c, paletteLinear(env.palette!.rock!), 0.45)) : SANDSTONE, [0.035, 0.12], 1.1),
    water: null,
    special: { color: hexLinear('#2a1d16'), roughness: 0.6, breakup: 0.6 },
    atmosphere: { color: hexLinear('#c79d72'), strength: 0.8 },
    flora: rules,
  };
}
