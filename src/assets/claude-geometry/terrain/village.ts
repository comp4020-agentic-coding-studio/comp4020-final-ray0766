import * as T from 'three';
import { applyCel } from '../style/cel.ts';
import { lookPaint, VILLAGE } from '../style/look.ts';
import { hexLinear, paletteLinear } from './env.ts';
import type { PaletteSlot, PlanetEnvironment, TerrainStyle } from './env.ts';
import type { FloraPlan } from './flora.ts';
import type { FloraKind, RGB, StyleProgram } from './styles/program.ts';

// The village look's terrain, drawn the way the village sample is drawn: two
// bands of light (src/style/cel.ts), no specular, a faint world-fixed mottle,
// and flat colour. The terrain works out a continuous colour per point (vertex
// albedo, strata, depth tint); here that colour is only read to decide which
// flat tone a point gets, from a small palette per style:
//
// - Ground: turf against loose ground (sand, soil, snow) is a thresholded
//   cover mask with a ragged edge; inside each, the style's own albedo picks
//   the nearest of a few keys (the colours the style itself shades with, so a
//   dune crest, a trough, a gravel plain and a mesa cap stay apart) and the
//   key's flat tone is drawn. Rock is two tones, split by the strata band's
//   lightness, with a scatter of gravel marks; the style's accent (surf wash,
//   desert varnish, crevasses) is one more flat tone.
// - Water is opaque: two or three flat bands by depth and a light shore line.
//   Sea ice is drawn like snow: flat ice, snow ridges, the ice foot and a dark
//   tide crack.
// - Plants and rocks keep their instance tint, taken from the same table, as
//   one flat colour; leaf cards show their leaves in two tones.
// - The halo is a thin flat rim band just outside the limb, not a glow.
//
// The player's palette overrides (env.palette) still tint the drawn tones:
// each key moves with an override the way the style moves it (so the same
// surfaces still find the same key), and its tone is mixed towards the
// village paint of the chosen name by the same share.
//
// Nothing here changes heights, buffers, plant placement or the industrial and
// warm programs: kit.ts takes this path only when the kit's look is 'village'.

type Hex = `#${string}`;

/**
 * A flat tone. `key` is a colour the style's own shading gives a surface
 * (linear albedo, as the style computes it), `tone` the colour drawn there.
 * `slot`/`share`/`scale` say how the style mixes an override into this
 * key (mixRGB(key, override × scale, share)). `gravel` is the share of
 * gravel marks on it (0–1).
 */
interface Tone { key: Hex; tone: Hex; slot?: PaletteSlot; share?: number; scale?: number; gravel?: number }

export interface VillageTerrainStyle {
  /** Ground with turf cover (grass, moss, meadow), where the style's cover mask passes `turfAt` (0.5 unless given). */
  turf: Tone[];
  turfAt?: number;
  /** Loose ground (sand, soil, gravel, snow). */
  loose: Tone[];
  /** Bare rock: the strata's lighter and darker bands, and their share of gravel marks. */
  rock: { light: Hex; dark: Hex; gravel: number };
  /** The style's accent (vSurface.w) and the level at which it shows. */
  special: { tone: Hex; at: number };
  gravel: Hex;
  /** Open water: shallow, mid and deep bands (edges as shares of the style's depth scale), shore line and its depth in metres. */
  water: { shallow: Hex; mid: Hex; deep: Hex; edges: [number, number]; shore: Hex; line: number };
  /** Sea ice: flat ice over shallow and deep water, snow ridges, the ice foot and the tide crack. */
  ice: { shallow: Hex; deep: Hex; snow: Hex; rubble: Hex; crack: Hex };
  halo: Hex;
  /** Instance colour per plant or rock kind (the style's own tint carries the per-instance variation). */
  flora: Partial<Record<FloraKind, Hex>>;
}

const SNOW: Hex = '#eef3f1';
const SHORE: Hex = '#eef3ea';

/** The village tones per terrain style. Keys are the styles' own colours (src/terrain/styles/*.ts). */
export const VILLAGE_TERRAIN: Record<TerrainStyle, VillageTerrainStyle> = {
  ocean: {
    turf: [
      { key: '#55603d', tone: '#5ea476', slot: 'flora', share: 0.55 },   // grass
      { key: '#3b4630', tone: '#4a8c62' },                                // dark grass
      { key: '#7a7352', tone: '#93ad6e' },                                // tussock
    ],
    loose: [
      { key: '#a69c84', tone: '#e0d3ab', slot: 'ground', share: 0.5, gravel: 0.15 },             // dry sand
      { key: '#59544a', tone: '#bcac85', slot: 'ground', share: 0.5, scale: 0.45, gravel: 0.4 },  // wet sand
      { key: '#7a755f', tone: '#c4b58e' },                                                         // sea bed
      { key: '#33372f', tone: '#8f8b75' },                                                         // silt
    ],
    rock: { light: '#828a84', dark: '#5f6866', gravel: 0.5 },
    special: { tone: SHORE, at: 0.12 },
    gravel: '#4b5451',
    water: { shallow: '#5aaec2', mid: '#3f8ab3', deep: '#30699c', edges: [0.14, 0.5], shore: SHORE, line: 0.022 },
    ice: { shallow: '#d3e4ea', deep: '#a7c6d4', snow: SNOW, rubble: '#c9d4d6', crack: '#3c5260' },
    halo: '#e2f4ec',
    flora: { boulder: '#7c827d', cypress: '#2f6e4d', shrub: '#52a06d' },
  },
  desert: {
    turf: [],
    loose: [
      { key: '#c9a375', tone: '#e8c98f', slot: 'ground', share: 0.45 },              // dune crest
      { key: '#a8805a', tone: '#d3a670', slot: 'ground', share: 0.45, scale: 0.8 },  // dune trough
      { key: '#8a6a4f', tone: '#b78d65', gravel: 0.7 },                               // talus
      { key: '#7d6047', tone: '#a8815d', gravel: 0.8 },                               // gravel plain
      { key: '#6a523e', tone: '#97715a', gravel: 1 },                                 // pebbly plain
      { key: '#644837', tone: '#8c6047', gravel: 0.3 },                               // mesa cap
    ],
    rock: { light: '#d0966a', dark: '#ab6b4a', gravel: 0.3 },
    special: { tone: '#5e4033', at: 0.12 },
    gravel: '#6a4938',
    water: { shallow: '#5aaec2', mid: '#3f8ab3', deep: '#30699c', edges: [0.14, 0.5], shore: SHORE, line: 0.022 },
    ice: { shallow: '#d3e4ea', deep: '#a7c6d4', snow: SNOW, rubble: '#c9d4d6', crack: '#3c5260' },
    halo: '#f4e7cf',
    flora: { boulder: '#b17d59', agave: '#86a88a', cactus: '#6e9a70' },
  },
  ice: {
    turf: [
      { key: '#5c5d55', tone: '#8a947f', gravel: 0.5 },   // tundra
      { key: '#4b5243', tone: '#6f8a6c', gravel: 0.2 },   // moss
      { key: '#77756d', tone: '#a4a297', gravel: 0.8 },   // frost-shattered gravel
    ],
    loose: [
      { key: '#d2dbe1', tone: SNOW, slot: 'ground', share: 0.35 },        // snow
      { key: '#aebfcb', tone: SNOW, slot: 'ground', share: 0.35 },        // snow in shade: the same flat snow
      { key: '#a9b2b6', tone: '#dce4e5' },                                // wind-packed lowland snow
      { key: '#88a9bb', tone: '#a6cfde' },                                // glacier ice
      { key: '#77756d', tone: '#a4a297', gravel: 0.8 },                   // gravel (under the sea ice)
    ],
    rock: { light: '#727a80', dark: '#535c62', gravel: 0.4 },
    special: { tone: '#2f5f78', at: 0.3 },
    gravel: '#40484d',
    water: { shallow: '#5aaec2', mid: '#3f8ab3', deep: '#30699c', edges: [0.14, 0.5], shore: SHORE, line: 0.022 },
    ice: { shallow: '#d6e6ec', deep: '#a9c7d5', snow: SNOW, rubble: '#c8d3d5', crack: '#3c5260' },
    halo: '#eaf4f6',
    flora: { spruce: '#356b57', spire: '#d6ecf3', boulder: '#737b80' },
  },
  temperate: {
    turf: [
      { key: '#5b6a3d', tone: '#5ea476', slot: 'flora', share: 0.5 },   // meadow
      { key: '#7f7b4d', tone: '#a2b46c' },                               // dry meadow
      { key: '#46592f', tone: '#4d9563' },                               // clover
      { key: '#3d4130', tone: '#3f7a55' },                               // woodland floor
    ],
    // The style's shore mask fades over 7 cm of height, a wide strip on flat ground: soil only on the lower part of it.
    turfAt: 0.25,
    loose: [
      { key: '#4c4639', tone: '#9a8566', gravel: 0.5 },   // lake shore soil
      { key: '#353127', tone: '#7f6e57' },                // lake bed
    ],
    rock: { light: '#c4c0b0', dark: '#9d9a8d', gravel: 0.4 },
    special: { tone: '#e9ebe2', at: 9 },
    gravel: '#6f6c62',
    water: { shallow: '#5fa8a8', mid: '#44878f', deep: '#346877', edges: [0.16, 0.55], shore: SHORE, line: 0.018 },
    ice: { shallow: '#d3e4ea', deep: '#a7c6d4', snow: SNOW, rubble: '#c9d4d6', crack: '#3c5260' },
    halo: '#e3f3ed',
    flora: { broadleaf: '#52a06d', shrub: '#7abb88', boulder: '#b2ae9f' },
  },
};

/** Most keys (and tones) per group the shader takes. */
export const VILLAGE_KEYS = 6;

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scaled = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const vec3 = (c: RGB) => new T.Vector3(c[0], c[1], c[2]);

/** A drawn tone with an override slot applied: mixed towards the village paint of the chosen name. */
function tinted(env: PlanetEnvironment, tone: Hex, slot: PaletteSlot | undefined, share: number, scale = 1): RGB {
  const name = slot ? env.palette?.[slot] : undefined;
  const base = hexLinear(tone);
  return name ? mix(base, scaled(hexLinear(lookPaint('village', name)!), scale), share) : base;
}

/** A key moved by an override exactly the way the style moves it. */
function keyed(env: PlanetEnvironment, t: Tone): RGB {
  const name = t.slot ? env.palette?.[t.slot] : undefined;
  const base = hexLinear(t.key);
  return name ? mix(base, scaled(paletteLinear(name), t.scale ?? 1), t.share ?? 0) : base;
}

/** Keys go to the shader in sqrt space (about perceptual), where the nearest key is found. */
function toneUniforms(env: PlanetEnvironment, tones: Tone[]) {
  if (tones.length > VILLAGE_KEYS) throw new Error(`at most ${VILLAGE_KEYS} village terrain keys per group`);
  const keys = Array.from({ length: VILLAGE_KEYS }, (_, i) => { const t = tones[Math.min(i, tones.length - 1)]; return t ? vec3(keyed(env, t).map(Math.sqrt) as RGB) : new T.Vector3(); });
  const drawn = Array.from({ length: VILLAGE_KEYS }, (_, i) => {
    const t = tones[Math.min(i, tones.length - 1)];
    if (!t) return new T.Vector4();
    const c = tinted(env, t.tone, t.slot, t.share ?? 0, t.scale);
    return new T.Vector4(c[0], c[1], c[2], t.gravel ?? 0);
  });
  return { keys, drawn, count: tones.length };
}

/** Lightness that splits a planet's strata into the lighter and darker rock tone (the median band). */
export function rockSplit(program: StyleProgram): number {
  const l = program.strata.colors.map(luma).sort((a, b) => a - b);
  return l.length % 2 ? l[(l.length - 1) / 2] : (l[l.length / 2 - 1] + l[l.length / 2]) / 2;
}

/** GLSL shared by every village terrain material: world-fixed noise, an antialiased step, nearest-key tones, gravel marks. */
const GLSL_VILLAGE = /* glsl */ `
float vlHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float vlNoise( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( vlHash( i ), vlHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( vlHash( i + vec3( 0.0, 1.0, 0.0 ) ), vlHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
              mix( mix( vlHash( i + vec3( 0.0, 0.0, 1.0 ) ), vlHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( vlHash( i + vec3( 0.0, 1.0, 1.0 ) ), vlHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ), f.z );
}
float vlFbm( vec3 p ) { return 0.62 * vlNoise( p ) + 0.38 * vlNoise( p * 2.17 + 11.3 ); }
// A step with a one-pixel antialiased edge: flat colour with a clean boundary.
float vlStep( float edge, float x ) { float w = max( fwidth( x ), 1e-5 ) * 0.75; return smoothstep( edge - w, edge + w, x ); }
// The tone of the key nearest to c (sqrt space), blended with the second nearest over one pixel at the boundary.
vec4 vlPick( vec3 c, vec3 keys[ ${VILLAGE_KEYS} ], vec4 tones[ ${VILLAGE_KEYS} ], int n ) {
  float d1 = 1e9, d2 = 1e9; vec4 t1 = tones[ 0 ], t2 = tones[ 0 ];
  for ( int i = 0; i < ${VILLAGE_KEYS}; i ++ ) {
    if ( i >= n ) break;
    vec3 e = c - keys[ i ]; float d = dot( e, e );
    if ( d < d1 ) { d2 = d1; t2 = t1; d1 = d; t1 = tones[ i ]; }
    else if ( d < d2 ) { d2 = d; t2 = tones[ i ]; }
  }
  float g = sqrt( d2 ) - sqrt( d1 );
  return mix( t2, t1, clamp( 0.5 + g / max( fwidth( g ), 1e-5 ), 0.0, 1.0 ) );
}
// Small dark gravel marks scattered in world space (about one per 30 cm), dropped where they would shrink below a few pixels.
float vlGravel( vec3 p ) {
  vec3 q = p * 9.0, i = floor( q ), f = fract( q );
  vec3 o = vec3( vlHash( i ), vlHash( i + 19.19 ), vlHash( i + 47.7 ) ) * 0.5 + 0.25;
  float r = length( f - o ), size = 0.12 + 0.08 * vlHash( i + 5.5 ), w = max( fwidth( r ), 1e-5 );
  float mark = step( 0.62, vlHash( i + 71.3 ) ) * ( 1.0 - smoothstep( size - w, size + w, r ) );
  return mark * ( 1.0 - smoothstep( 0.25, 0.5, length( fwidth( q ) ) ) );
}
`;

/** The flat tonal patches every village surface carries (src/style/surface.ts), here in 3D on the world position, so a sphere and every instance get them. */
const mottle = (amount: number) => /* glsl */ `
  diffuseColor.rgb *= 1.0 - ${amount.toFixed(3)} * vlStep( 0.56, vlFbm( vTriPos * 1.15 + 3.7 ) );`;

function replaceOnce(source: string, target: string, by: string, what: string): string {
  if (!source.includes(target)) throw new Error(`the village terrain patch did not find ${what}`);
  return source.replace(target, by);
}

/**
 * No specular layer, set on three's material struct right after it is filled
 * in. Zeroing the specular light afterwards is not enough: three gives the
 * diffuse only what the specular layer leaves, (1 − Fresnel) of the sun and
 * (1 − the lobe's energy) of the fill, so a glossy surface (water at roughness
 * 0.12–0.15, sea ice, wet sand) darkened smoothly towards the horizon inside
 * one flat band. With F0 = F90 = 0 there is no lobe and nothing is taken off:
 * a surface is its colour lit and half of it in shade from every view.
 */
const NO_SPECULAR_LAYER = 'material.roughness = 1.0;\nmaterial.specularColor = vec3( 0.0 );\nmaterial.specularColorBlended = vec3( 0.0 );\nmaterial.specularF90 = 0.0;';
const SPECULAR_FIELDS = ['material.roughness =', 'material.specularColor =', 'material.specularColorBlended =', 'material.specularF90 ='];

/**
 * Chain the village drawing onto a terrain material: extra declarations, the
 * flat colour code (run where the warm grade runs, after the terrain has
 * worked out its colour and before lighting), the mottle, the flat normal,
 * no specular, then the stepped light.
 */
export function villageSurface<M extends T.MeshStandardMaterial>(m: M, o: {
  tag: string; uniforms?: Record<string, T.IUniform>; decl?: string; colour: string; normal?: [string, string]; drop?: string[]; swap?: [string, string][];
}): M {
  const P = VILLAGE;
  for (const field of SPECULAR_FIELDS) if (!T.ShaderChunk.lights_physical_fragment.includes(field)) throw new Error(`three no longer sets ${field} in lights_physical_fragment; the village terrain's matte patch needs updating.`);
  const compile = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, renderer) => {
    compile.call(m, shader, renderer);
    if (o.uniforms) Object.assign(shader.uniforms, o.uniforms);
    let fs = shader.fragmentShader;
    fs = replaceOnce(fs, 'void main() {', `${GLSL_VILLAGE}\n${o.decl ?? ''}\nvoid main() {`, 'main()');
    for (const text of o.drop ?? []) fs = replaceOnce(fs, text, '', 'a block to drop');
    for (const [from, to] of o.swap ?? []) fs = replaceOnce(fs, from, to, 'a block to swap');
    if (o.normal) fs = replaceOnce(fs, o.normal[0], o.normal[1], 'the detail normal');
    fs = replaceOnce(fs, '#include <lights_physical_fragment>', `{\n${o.colour}\n}\n${mottle(P.mottle ?? 0)}\n#include <lights_physical_fragment>\n${NO_SPECULAR_LAYER}`, 'the lighting chunk');
    // And whatever the glint and day-side code still add to the specular light after the lights is dropped.
    fs = replaceOnce(fs, '#include <aomap_fragment>', 'reflectedLight.directSpecular = vec3( 0.0 );\nreflectedLight.indirectSpecular = vec3( 0.0 );\n#include <aomap_fragment>', 'the ao chunk');
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `${key.call(m)}|village${P.mottle ?? 0}`;
  m.userData.village = o.tag;
  applyCel(m, P.cel!);
  return m;
}

/** Uniforms for the ground of one planet: its style's tones with the planet's overrides. */
export function groundUniforms(env: PlanetEnvironment, program: StyleProgram): Record<string, T.IUniform> {
  const S = VILLAGE_TERRAIN[env.style];
  const turf = toneUniforms(env, S.turf), loose = toneUniforms(env, S.loose);
  return {
    uVlTurfKey: { value: turf.keys }, uVlTurf: { value: turf.drawn }, uVlTurfN: { value: turf.count }, uVlTurfAt: { value: S.turfAt ?? 0.5 },
    uVlLooseKey: { value: loose.keys }, uVlLoose: { value: loose.drawn }, uVlLooseN: { value: loose.count },
    uVlRockLight: { value: vec3(tinted(env, S.rock.light, 'rock', 0.45)) }, uVlRockDark: { value: vec3(tinted(env, S.rock.dark, 'rock', 0.45)) },
    uVlRockSplit: { value: rockSplit(program) }, uVlRockGravel: { value: S.rock.gravel },
    uVlSpecial: { value: vec3(hexLinear(S.special.tone)) }, uVlSpecialAt: { value: S.special.at },
    uVlGravel: { value: vec3(hexLinear(S.gravel)) },
  };
}

export const GROUND_DECL = /* glsl */ `
uniform vec3 uVlTurfKey[ ${VILLAGE_KEYS} ]; uniform vec4 uVlTurf[ ${VILLAGE_KEYS} ]; uniform int uVlTurfN; uniform float uVlTurfAt;
uniform vec3 uVlLooseKey[ ${VILLAGE_KEYS} ]; uniform vec4 uVlLoose[ ${VILLAGE_KEYS} ]; uniform int uVlLooseN;
uniform vec3 uVlRockLight, uVlRockDark, uVlSpecial, uVlGravel; uniform float uVlRockSplit, uVlRockGravel, uVlSpecialAt;
`;

/**
 * Ground colour in flat tones. Reads what the ground code above it worked out
 * (vColor, vCover, vSurface, the detail heights, the strata) and replaces the
 * colour; the ragged edges come from world-fixed noise and the detail heights.
 */
export const GROUND_COLOUR = /* glsl */ `
  float vlN = vlFbm( vTriPos * 2.7 );
  // Turf against loose ground: a thresholded edge, broken by the turf texture and the noise.
  float vlTurfW = uVlTurfN > 0 ? vlStep( uVlTurfAt, vCover + ( vlN - 0.5 ) * 0.45 + ( hTurf - 0.5 ) * 0.25 ) : 0.0;
  vec3 vlAlb = sqrt( max( vColor.rgb * ( 1.0 + ( vlN - 0.5 ) * 0.35 + ( hSand - 0.5 ) * 0.06 ), 0.0 ) );
  vec4 vlSoil = mix( vlPick( vlAlb, uVlLooseKey, uVlLoose, uVlLooseN ), vlPick( vlAlb, uVlTurfKey, uVlTurf, uVlTurfN ), vlTurfW );
  // Rock where it pokes through, in two tones: the strata band's lightness picks one.
  float vlRockW = vlStep( 0.5, vSurface.x + ( hRock - 0.5 ) * 0.7 + ( vlN - 0.5 ) * 0.2 );
  vec3 vlBand = strataColor( hNow + ( hRock - 0.5 ) * 0.03 + ( macro - 0.5 ) * 0.06 );
  float vlLight = vlStep( uVlRockSplit, dot( vlBand, vec3( 0.2126, 0.7152, 0.0722 ) ) );
  vec4 vlC = mix( vlSoil, vec4( mix( uVlRockDark, uVlRockLight, vlLight ), uVlRockGravel ), vlRockW );
  // The style's accent as one more flat tone.
  float vlAccent = vlStep( uVlSpecialAt, vSurface.w * ( 0.7 + 0.6 * hSand ) );
  vlC = mix( vlC, vec4( uVlSpecial, 0.0 ), vlAccent );
  diffuseColor.rgb = mix( vlC.rgb, uVlGravel, vlGravel( vTriPos ) * vlC.a );
`;

export function waterUniforms(env: PlanetEnvironment): Record<string, T.IUniform> {
  const W = VILLAGE_TERRAIN[env.style].water;
  return {
    uVlWater: { value: [tinted(env, W.shallow, 'water', 0.45), tinted(env, W.mid, 'water', 0.45), tinted(env, W.deep, 'water', 0.45, 0.6), hexLinear(W.shore)].map(vec3) },
    uVlWaterEdges: { value: new T.Vector3(W.edges[0], W.edges[1], W.line) },
  };
}

export const WATER_DECL = /* glsl */ `uniform vec3 uVlWater[ 4 ]; uniform vec3 uVlWaterEdges;`;

/** Opaque water in flat depth bands with a light line along the shore. */
export const WATER_COLOUR = /* glsl */ `
  float vlN = vlFbm( vTriPos * 2.7 );
  float vlD = vDepth / uDepthScale + ( vlN - 0.5 ) * 0.12;
  vec3 vlC = mix( uVlWater[ 0 ], uVlWater[ 1 ], vlStep( uVlWaterEdges.x, vlD ) );
  vlC = mix( vlC, uVlWater[ 2 ], vlStep( uVlWaterEdges.y, vlD ) );
  // The shore line: shallower than the given depth, and never wider than a few pixels where the shallows are flat.
  float vlW = min( uVlWaterEdges.z, fwidth( vDepth ) * 2.5 );
  float vlLine = 1.0 - vlStep( vlW, vDepth + ( vlN - 0.5 ) * vlW * 0.6 );
  diffuseColor.rgb = mix( vlC, uVlWater[ 3 ], vlLine );
  diffuseColor.a = 1.0;
`;

export function seaIceUniforms(env: PlanetEnvironment): Record<string, T.IUniform> {
  const I = VILLAGE_TERRAIN[env.style].ice;
  return { uVlIce: { value: [tinted(env, I.shallow, 'water', 0.25), tinted(env, I.deep, 'water', 0.4), hexLinear(I.snow), hexLinear(I.rubble), hexLinear(I.crack)].map(vec3) } };
}

export const SEA_ICE_DECL = /* glsl */ `uniform vec3 uVlIce[ 5 ];`;

/** Sea ice like snow: flat young and old ice, snow ridges, the grounded ice foot and a dark tide crack. */
export const SEA_ICE_COLOUR = /* glsl */ `
  float vlN = vlFbm( vTriPos * 2.7 );
  vec3 vlC = mix( uVlIce[ 0 ], uVlIce[ 1 ], vlStep( 0.5, depthT + ( 0.5 - floe ) * 0.6 + ( vlN - 0.5 ) * 0.3 ) );
  vlC = mix( vlC, uVlIce[ 2 ], vlStep( 0.5, snow + ( vlN - 0.5 ) * 0.25 ) );
  // The ice foot where the sheet is shallower than 3.5 cm, its edge wandering with the world noise. (The industrial
  // foot wobbles with the snow texture's heights; thresholded, those streaked the foot with thin lines.)
  vlC = mix( vlC, uVlIce[ 3 ], 1.0 - vlStep( 0.035, vDepth + ( vlN - 0.5 ) * 0.02 ) );
  // The tide crack: a dark line along one depth contour, wandering with the world noise (the ice texture's heights
  // kinked and branched it), its width measured by the whole contour's own rate on screen: about a pixel at full
  // tone, gone two pixels across.
  float vlTide = vDepth + ( vlN - 0.5 ) * 0.02 - 0.06;
  float vlCrack = abs( vlTide ) / max( fwidth( vlTide ), 1e-6 );
  diffuseColor.rgb = mix( vlC, uVlIce[ 4 ], 1.0 - smoothstep( 0.5, 1.0, vlCrack ) );
`;

const lin = (hex: string) => hexLinear(hex).map(v => v.toFixed(4)).join(', ');

/**
 * Plants and rocks: the instance colour (the village tint from planFlora's
 * draw, see villageFloraPlans) as one flat colour; bark in the village's bark
 * colour; snow on the seracs' upward faces as a flat cap.
 */
export function floraColour(name: string): string {
  const base = name === 'bark' ? `vec3 vlBase = vec3( ${lin(VILLAGE.materials['village:bark'])} );`
    : '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )\n  vec3 vlBase = diffuse * vColor.rgb;\n#else\n  vec3 vlBase = diffuse;\n#endif';
  return /* glsl */ `
  ${base}
  #ifdef FLORA_SNOW
    vlBase = mix( vlBase, vec3( ${lin(SNOW)} ), vlStep( 0.5, dot( gN, normalize( vTreeUp ) ) + ( hD - 0.5 ) * 0.35 ) );
  #endif
  diffuseColor.rgb = vlBase;
`;
}

/** Leaf and needle cards: the instance colour in two tones, the card's darker leaves (and twigs) a step down. */
export const CARD_COLOUR = /* glsl */ `
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    vec3 vlTint = diffuse * vColor.rgb;
  #else
    vec3 vlTint = diffuse;
  #endif
  diffuseColor.rgb = vlTint * mix( 0.7, 1.0, vlStep( 0.5, dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );
`;

/** The planet shadow on plants, stepped: direct sun on the day side only; the fill stays whole, as on the ground. */
export const PLANET_SHADOW = /* glsl */ `
  {
    reflectedLight.directDiffuse *= vlStep( 0.0, dot( normalize( vRadialW ), uSunDir ) );
  }
`;

/** Plans with every instance's tint taken from the village table (per-instance variation kept as a ratio to the style's tint). */
export function villageFloraPlans(plans: FloraPlan[], env: PlanetEnvironment): FloraPlan[] {
  const S = VILLAGE_TERRAIN[env.style];
  return plans.map(plan => {
    const hex = S.flora[plan.kind];
    if (!hex) return plan;
    const slot: PaletteSlot = plan.kind === 'boulder' ? 'rock' : 'flora';
    const tone = tinted(env, hex, slot, 0.4);
    const ref = plan.rule.tint;
    return {
      ...plan,
      instances: plan.instances.map(inst => ({ ...inst, tint: [0, 1, 2].map(c => tone[c] * (ref[c] > 1e-6 ? inst.tint[c] / ref[c] : 1)) as RGB })),
    };
  });
}

/**
 * The halo in the village look: a thin flat band just outside the limb (the
 * back faces of the shell nearest the ground), in one pale tone, drawn over
 * the sky like the rest of the planet. No glow, no lit side.
 *
 * The band's edge is worked out per pixel against the round shell, not from
 * the mesh: the shell is a coarse icosphere (level 3 at most), and a cosine
 * from its interpolated normals drew the edge as a polyline with a corner at
 * every vertex. Here the view ray's closest approach to the planet's centre
 * (its impact radius b) gives the cosine at which it leaves a sphere of the
 * shell's radius, √(1 − (b / R)²), which is what the normals approximated.
 * Only rays that head towards the planet pass its limb. From a camera inside
 * the shell and below √(1 − 0.5²) of its radius (within about 30 cm of the
 * 10 m ground), a ray heading away from the planet comes nearest at the camera
 * itself, which lies inside the band: such rays draw nothing, or the whole sky
 * would take the halo tone. Where they meet the rest, the band ends in an edge
 * a pixel wide.
 */
export function villageAtmosphere(env: PlanetEnvironment): T.ShaderMaterial {
  const c = hexLinear(VILLAGE_TERRAIN[env.style].halo);
  return new T.ShaderMaterial({
    name: 'terrain:atmosphere',
    uniforms: { uColor: { value: vec3(c) }, uBand: { value: VILLAGE_HALO_BAND } },
    vertexShader: /* glsl */ `
      varying vec3 vP; varying vec3 vCentre; varying float vShell;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vP = w.xyz;
        // The planet's centre and the shell's radius in world space: the same at every vertex (all lie on the sphere).
        vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vShell = length(position) * length(modelMatrix[0].xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uBand;
      varying vec3 vP; varying vec3 vCentre; varying float vShell;
      void main() {
        vec3 ray = normalize(vP - cameraPosition), toCentre = vCentre - cameraPosition;
        float along = dot(toCentre, ray), d2 = dot(toCentre, toCentre);
        float b2 = max(d2 - along * along, 0.0);
        float facing = sqrt(max(1.0 - b2 / (vShell * vShell), 0.0));
        float w = max(fwidth(facing), 1e-5) * 0.75;
        // A ray heading away from the planet (from inside the shell) never passes the limb.
        float ahead = clamp(along / max(fwidth(along), 1e-6) + 0.5, 0.0, 1.0);
        float band = smoothstep(uBand - w, uBand + w, facing) * ahead;
        if (band <= 0.0) discard;
        gl_FragColor = vec4(uColor, band);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: T.BackSide, transparent: true, depthWrite: false,
  });
}

/**
 * Where the halo band starts, as the cosine between the shell's normal and the
 * view ray: a ray grazing the ground (impact radius r) leaves the 11.9 m shell
 * at √(1 − (r / 11.9)²), 0.54 at the 10 m ground; 0.5 keeps the band to the
 * 30 cm above it.
 */
export const VILLAGE_HALO_BAND = 0.5;

/**
 * A village ground for a plain vertex-coloured planet mesh (the blueprint
 * planet view's and the timeline's legacy grounds, which are not built by the
 * terrain kit): drawn the way the kit's ground is drawn, in flat tones from
 * the mesh's own colours. Each vertex colour picks the tone of its nearest
 * key, with a ragged edge from world noise, gravel marks where a tone carries
 * them, the mottle, no specular and two bands of light. Lit by the mesh's
 * smooth normals; no texture. One program for every such ground (the tones
 * are uniforms).
 */
export interface FlatGroundTone { key: Hex; tone: Hex; gravel?: number }

export function villageFlatGround(name: string, tones: FlatGroundTone[], gravel: Hex): T.MeshStandardMaterial {
  if (tones.length > VILLAGE_KEYS) throw new Error(`at most ${VILLAGE_KEYS} flat ground tones`);
  const at = (i: number) => tones[Math.min(i, tones.length - 1)];
  const uniforms: Record<string, T.IUniform> = {
    uVlKey: { value: Array.from({ length: VILLAGE_KEYS }, (_, i) => vec3(hexLinear(at(i).key).map(Math.sqrt) as RGB)) },
    uVlTone: { value: Array.from({ length: VILLAGE_KEYS }, (_, i) => { const c = hexLinear(at(i).tone); return new T.Vector4(c[0], c[1], c[2], at(i).gravel ?? 0); }) },
    uVlN: { value: tones.length },
    uVlGravel: { value: vec3(hexLinear(gravel)) },
  };
  const m = new T.MeshStandardMaterial({ name, vertexColors: true, roughness: 1, metalness: 0 });
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvTriPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
  };
  m.customProgramCacheKey = () => 'terrain.flat-ground.v1';
  m.userData.uniforms = uniforms;
  return villageSurface(m, { tag: 'flat-ground', decl: FLAT_GROUND_DECL, colour: FLAT_GROUND_COLOUR });
}

const FLAT_GROUND_DECL = /* glsl */ `
varying vec3 vTriPos;
uniform vec3 uVlKey[ ${VILLAGE_KEYS} ]; uniform vec4 uVlTone[ ${VILLAGE_KEYS} ]; uniform int uVlN; uniform vec3 uVlGravel;
`;

const FLAT_GROUND_COLOUR = /* glsl */ `
  float vlN = vlFbm( vTriPos * 2.7 );
  vec3 vlAlb = sqrt( max( vColor.rgb * ( 1.0 + ( vlN - 0.5 ) * 0.3 ), 0.0 ) );
  vec4 vlC = vlPick( vlAlb, uVlKey, uVlTone, uVlN );
  diffuseColor.rgb = mix( vlC.rgb, uVlGravel, vlGravel( vTriPos ) * vlC.a );
`;
