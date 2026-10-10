import * as T from 'three';
import { PALETTE } from './tokens.ts';
import type { PaletteName } from './tokens.ts';

// Looks: how the same models are surfaced and lit.
//
// 'industrial' is the look the modules were built in: worn paint, scanned
// metal and concrete, a photographed hangar for reflections.
// 'warm' is a stylised small-world look: dusty warm colours (cream, sand,
// terracotta, ochre) over sage and teal, with darks that lean teal instead of
// black; matte surfaces with no grime, scratches or scanned wear and only a
// faint panel relief; a warm sun low enough for long shadows, softened, under
// a cool sky fill, with a teal-to-khaki sky behind.
//
// The warm look changes parameters only: every model keeps its geometry, its
// material slots and their names, and every page keeps its lights (practical
// lights included), LOD and texture pipeline.
// 'village' is the full rework that followed: its own models for buildings,
// street, props and ships (blueprint/parts/village, props/village,
// ship/parts/village), drawn as a flat illustration: two bands of light (lit,
// and shade at half of it), hand-drawn lines found on screen (src/style/lines.ts),
// a flat cloud sky and a few tonal patches on every surface, in a palette of
// its own that leans towards a small Japanese town (white plaster, dark
// timber, slate-grey tiles, deep greens). Part ids, frames, anchors, sockets
// and envelopes stay; where a shape needs a size change it is listed in
// docs/VILLAGE.md.

export type Look = 'industrial' | 'warm' | 'village';
export const LOOKS: readonly Look[] = ['industrial', 'warm', 'village'];

type FinishKey = 'paint' | 'metal' | 'concrete' | 'rubber';

/** Everything a stylised look sets; the industrial look has none of it. */
export interface LookParams {
  materials: Record<string, string>;
  paints: Partial<Record<PaletteName, string>>;
  glows: Partial<Record<PaletteName, string>>;
  finish: Record<FinishKey, readonly [number, number]>;
  relief: number;
  envIntensity: number;
  glass: { clear: GlassParams; smoked: GlassParams; canopy: GlassParams; envIntensity: number };
  hazard: readonly [string, string];
  /**
   * A flat look's hazard marking: one plain painted band in this colour (StyleLibrary.hazard()),
   * in place of the diagonal stripes and their relief.
   */
  hazardBand?: string;
  glowBase: string;
  ink: { dark: string; light: string };
  light: {
    key: string; keyIntensity: number; keyPosition: [number, number, number];
    rim: string; rimIntensity: number; sky: string; ground: string; fillIntensity: number;
    shadowRadius: number; shadowIntensity: number;
  };
  sky: { zenith: string; horizon: string; ground: string; sun: number };
  fog: string;
  thumbnail: string;
  fogDensity: number;
  practical: number;
  backgroundIntensity: number;
  backgroundBlurriness: number;
  exposure: number;
  ao: number;
  terrain: { saturation: number; scale: number; lift: number; warm: [number, number, number]; detail: number };
  bloom: { strength: number; radius: number; threshold: number };
  /** Stepped direct light (village): the lit share of a surface jumps between bands instead of fading. */
  cel?: { shade: number; mid: number; midAt: number; litAt: number; soft: number };
  /**
   * Hand-drawn lines found in screen space from the scene's depth (village,
   * src/style/lines.ts). `width` and `wobble` are in CSS pixels (a silhouette
   * is about 1.25 × width wide, a crease one pixel); `breaks` is the share of a
   * line left out as gaps; `depth` is the jump in 1/z, relative, that makes a
   * silhouette and `normal` the turn (1 − cos) that makes a crease. Creases
   * fade out over `creaseFade` metres from the camera, everything over `fade`.
   */
  edges?: {
    color: string; width: number; wobble: number; breaks: number; depth: number; normal: number;
    creaseFade: readonly [number, number]; fade: readonly [number, number];
  };
  /** A flat sky in three tones with long ragged cloud bands (src/style/sky.ts), in place of the blurred dome. */
  cloudSky?: { deep: string; mid: string; light: string; scale: number };
  /** Posterised patches on every stylised surface, darkened by this share of their colour (src/style/surface.ts). */
  mottle?: number;
  /** 'none': colours are drawn as lit, without a tone curve, so lit = colour and shade = half of it. */
  toneMapping?: 'none';
  /**
   * Daylight indoors (src/style/surface.ts): under a roof the sun is scaled by
   * `key` and the sky fill by `fill`, so a room is lighter than the shade
   * outside without a lamp lit.
   */
  interior?: { fill: number; key: number };
}
interface GlassParams { color: string; opacity: number; roughness: number }

export const WARM: LookParams = {
  /**
   * Colour per library material name (a preset name or a custom key), so a
   * material keeps its role: frames stay the darkest, cladding stays light.
   * Names not listed go through warmColour().
   */
  materials: {
    // Presets.
    cladding: '#e2cfa8',        // exterior wall panels: cream sand
    claddingDark: '#6d857b',    // sage slate
    corrugated: '#97aa82',      // sage
    frame: '#b9ab90',           // bare steel: warm stone
    frameLight: '#d9cfb9',      // light alloy: pale stone
    framePainted: '#4d655b',    // structural paint: pine teal, the darkest tone
    sheet: '#bd6c4c',           // doors, housings, roof sheet: terracotta
    deck: '#b49269',            // tread plate: warm timber tone
    concrete: '#cdbd9b',        // sandstone
    rubber: '#7a5b49',          // warm brown
    hull: '#e2cfa8',
    hullDark: '#4d655b',
    accent: '#d6a04f',          // ochre
    // Building kit.
    'blueprint:tube': '#c79a57',     // handrails and pipes: brass ochre
    'blueprint:lining': '#efe2c6',   // inside walls: warm off-white
    'blueprint:precast': '#d3c3a1',
    'blueprint:pavers': '#dac9a3',
    'blueprint:asphalt': '#8e8273',  // warm taupe road, never black
    'blueprint:marking': '#f1e4c3',
    'blueprint:bay-floor': '#a7b38a', // the workshop's ground: sage meadow
    // Ships and the shipyard.
    'ship:bare-steel': '#a89d87',
    'ship:bare-alloy': '#d5cbb5',
    'ship:heat': '#8b6751',          // warm bronze nozzles
    'ship:hangar-slab': '#cbb995',
  } as Record<string, string>,
  /** Ship paint per palette name: players keep choosing the same names. */
  paints: {
    bone: '#e4d2ad', graphite: '#40534d', gunmetal: '#6b827a', alloy: '#cdc5b1', amber: '#d69b4b',
    teal: '#5c978e', crimson: '#b55a45', cobalt: '#5d7d97', olive: '#8a9a68', oxide: '#95684b',
  } as Partial<Record<PaletteName, string>>,
  /** Glow colours per palette name (liner and plume): softer, warmer versions of the same choices. */
  glows: { cyan: '#9fe6d6', sodium: '#ffc684', signalRed: '#ff8e6b', magenta: '#f096b8' } as Partial<Record<PaletteName, string>>,
  /** Roughness and metalness per finish: matte, almost no metal anywhere. */
  finish: { paint: [0.8, 0], metal: [0.55, 0.12], concrete: [0.92, 0], rubber: [0.9, 0] } as Record<FinishKey, [number, number]>,
  /** Panel and hull seams stay as a faint relief (times each recipe's own). */
  relief: 0.35,
  /** Reflections are soft colour, not mirrored highlights (times each recipe's own, capped at 1). */
  envIntensity: 0.3,
  glass: {
    clear: { color: '#9ec4bd', opacity: 0.42, roughness: 0.3 },
    smoked: { color: '#5d7d78', opacity: 0.6, roughness: 0.3 },
    canopy: { color: '#567d78', opacity: 0.78, roughness: 0.25 },
    envIntensity: 0.6,
  },
  /** Hazard striping as cream and terracotta. */
  hazard: ['#ecdcb8', '#b8674a'] as const,
  /** Unlit lens base of glow materials: a warm dark instead of near black. */
  glowBase: '#5a4636',
  /** Ship markings ink: dark on light paint, light on dark. */
  ink: { dark: '#3b4f49', light: '#f3e8cf' },
  light: {
    key: '#ffe0b8', keyIntensity: 3.2,
    /**
     * About 39° up, from +x and −z: the sides the workshop and shipyard cameras
     * look at are lit or half-lit, and long shadows fall towards −x, +z, into view.
     */
    keyPosition: [6.5, 7.5, -6.5] as [number, number, number],
    rim: '#d3ebe4', rimIntensity: 0.6,
    sky: '#a9d3cb', ground: '#a88b62', fillIntensity: 0.45,
    /** PCF kernel radius and how dark a full shadow gets (1 = black under the key). */
    shadowRadius: 3, shadowIntensity: 0.85,
  },
  /** Sky dome for the environment and the backdrop: teal zenith, pale khaki horizon, sand below. */
  sky: { zenith: '#86bcbb', horizon: '#e3dcbc', ground: '#b7a27c', sun: 3 },
  fog: '#d2d7bd',
  /** Background of part and library thumbnails (the warm interface's tile colour). */
  thumbnail: '#efe6d2',
  /** Times the page's fog density: haze at the far edge, not over the subject. */
  fogDensity: 0.5,
  /** Times every practical light's candela (src/style/practical.ts). */
  practical: 0.5,
  backgroundIntensity: 1,
  backgroundBlurriness: 0.3,
  exposure: 1,
  /** GTAO blend at high LOD: softer contact shadows. */
  ao: 0.5,
  /**
   * Terrain (src/terrain/kit.ts) is graded in its shaders, after it has worked
   * out a surface's colour and before lighting, in linear space: saturation
   * kept to this share, then colour × scale + lift (darks lifted, nothing
   * black), then warmed per channel. Fine detail maps (rock, grain, turf,
   * ripples, bark) keep `detail` of their strength: fewer specks and pits.
   */
  terrain: { saturation: 0.78, scale: 0.8, lift: 0.045, warm: [1.05, 1.0, 0.88] as [number, number, number], detail: 0.45 },
  /** Bloom at high LOD: only lamps, a little wider and fainter. */
  bloom: { strength: 0.2, radius: 0.35, threshold: 1 },
};

/**
 * The village look. White plaster, dark timber and slate-grey tiles over deep
 * greens, so a street reads in grey as well as in colour: light walls, mid
 * roofs and boards, dark openings and iron, a teal-green paint for doors and
 * shutters. Drawn flat: a white sun and an equal white sky fill, so a lit
 * surface shows its own colour and a shaded one (or one in cast shadow) half
 * of it, in linear light; no tone curve, no image light, no rim; dark slate
 * lines on silhouettes and near creases; a flat teal sky with cloud bands.
 */
export const VILLAGE: LookParams = {
  materials: {
    // Building kit (blueprint/parts/kit.ts maps each KitMaterial to one of these in this look).
    'village:plaster': '#e9e5d3',
    'village:plaster-in': '#f1ede0',
    'village:timber': '#5f4c3e',
    // Darks stay off the ink (#283034) in shade: iron there is sRGB (61, 70, 72), the dark tile
    // (52, 64, 74); at #394447 and #46525a they fell to (39, 47, 50) and (49, 58, 64), so lines on
    // a shaded lamp post, hull or roof drowned.
    'village:iron': '#566265',
    'village:brass': '#c09a55',
    'village:boards': '#a88e6c',
    'village:stone': '#c7c2b1',
    'village:paint': '#4e8a84',
    'village:tile': '#5c6a72',       // kawara slate
    'village:tile-dark': '#4b5a66',
    'village:cobble': '#cec8b5',
    'village:lane': '#6b8184',
    'village:line': '#f1f2ea',
    'village:ground': '#5ea476',
    // Props and planting.
    'village:leaf': '#52a06d', 'village:leaf-light': '#7abb88', 'village:leaf-dark': '#2f6e4d',
    'village:bark': '#6a5c4e', 'village:pot': '#b56a52', 'village:soil': '#6a5948',
    'village:bloom-yellow': '#e3c25e', 'village:bloom-coral': '#dc8571', 'village:bloom-white': '#f1f2ea',
    // Shared presets other modules ask for (props, shipyard), in the same palette.
    cladding: '#e9e5d3', claddingDark: '#5f7a76', corrugated: '#8fae86', frame: '#bdb8a8', frameLight: '#dcd8c8',
    framePainted: '#566265', sheet: '#4e8a84', deck: '#a88e6c', concrete: '#c7c2b1', rubber: '#6a5948',
    hull: '#ebe7d6', hullDark: '#566265', accent: '#d79a4a',
    'ship:bare-steel': '#bdb8a8', 'ship:bare-alloy': '#dcd8c8', 'ship:heat': '#8a705c', 'ship:hangar-slab': '#cfc9b6',
    'blueprint:bay-floor': '#86b48f',
    // Module keys a caller may still ask for in this look, in the nearest village tone so that
    // StyleLibrary.unlisted() stays empty: cast concrete is stone, rails and staffs are timber, a
    // hatch is boards, a planting bed's mulch is soil, loose basalt is a darker stone. Since round 9
    // no village model or page in this repository asks for them (their callers draw only in the
    // industrial look now); they are kept for a host that builds those pieces in the village look.
    // 'timeline:regolith' only lends its finish maps to a ground, so its colour is never drawn.
    'blueprint:precast': '#c7c2b1', 'blueprint:tube': '#5f4c3e',
    'showcase:staff-bone': '#f1f2ea', 'showcase:staff-red': '#b85a4a',
    'terrain:hatch-plate': '#a88e6c', 'terrain:bed-mulch': '#6a5948',
    'timeline:basalt': '#9a9384', 'timeline:regolith': '#ffffff',
    // props-ships: the village ships' own surfaces (src/ship/factory.ts villageShipMaterials):
    // canopy glass drawn as an opaque slate-teal, and the dark role (throats, the lookout's slit,
    // the mast) a warm dark whose shade band stays clear of the line ink, as iron's does not.
    'ship:canopy': '#4a6f70', 'ship:dark': '#6b5c4f',
  },
  paints: {
    bone: '#ebe7d6', graphite: '#566265', gunmetal: '#6f8784', alloy: '#d3d0c2', amber: '#d79a4a',
    teal: '#4e8a84', crimson: '#b85a4a', cobalt: '#58799a', olive: '#86a06a', oxide: '#9a6449',
  },
  glows: { cyan: '#a8eadb', sodium: '#ffcf8c', signalRed: '#ff9473', magenta: '#f39cbd' },
  finish: { paint: [0.88, 0], metal: [0.7, 0.05], concrete: [0.95, 0], rubber: [0.95, 0] },
  relief: 0,
  // No image light: it would shade surfaces in gradients between the two bands. three takes a
  // material's image light from scene.environmentIntensity when it lights from scene.environment,
  // so the Stage (and the thumbnails) set that to this; glass reflects nothing either.
  envIntensity: 0,
  // Drawn flat in the two bands and writing depth (StyleLibrary.glass): the pane is outlined and
  // what is behind it shows faintly, without its lines, through a slate-blue tint (darker and bluer
  // than the teal-green shutters beside the windows); off the ink in shade like every other tone.
  glass: {
    clear: { color: '#4f6e78', opacity: 0.88, roughness: 1 },
    smoked: { color: '#455e68', opacity: 0.92, roughness: 1 },
    canopy: { color: '#4a6f70', opacity: 0.82, roughness: 1 },
    envIntensity: 0,
  },
  hazard: ['#f1f2ea', '#b85a4a'],
  // Pad corner marks, the survey pin and the workshop's border are painted red, like the staff bands.
  hazardBand: '#b85a4a',
  glowBase: '#5e5040',
  ink: { dark: '#283034', light: '#f1f2ea' },
  light: {
    // Lit = (key + fill) / π = 1 and shade = fill / π = 0.5 of a surface's colour,
    // in linear light; white, so colours come out as given.
    key: '#ffffff', keyIntensity: 1.571,
    /** About 43° up from the front left of the village scene: fronts and left sides lit, shadows to the back right. */
    keyPosition: [-5, 8, 6],
    rim: '#ffffff', rimIntensity: 0,
    sky: '#ffffff', ground: '#ffffff', fillIntensity: 1.571,
    // A full shadow takes all of the key: cast shadows are the shade band.
    shadowRadius: 1, shadowIntensity: 1,
  },
  // The dome glass reflects; the backdrop itself is the cloud sky.
  sky: { zenith: '#6fc2b8', horizon: '#a9e2d3', ground: '#a8a088', sun: 2 },
  fog: '#a9d9cc',
  thumbnail: '#efe6d2',
  fogDensity: 0.08,
  // Lamps glow but light nothing by day (src/shell/stage.ts turns the pool off).
  practical: 0,
  backgroundIntensity: 1,
  backgroundBlurriness: 0.35,
  exposure: 1,
  // No ambient occlusion pass: the two bands and the lines already draw where
  // things meet, the pass's soft halos fight the flat bands, and it redraws the
  // whole scene (about half a frame's draw calls on the village sample).
  ao: 0,
  terrain: { saturation: 0.7, scale: 0.8, lift: 0.06, warm: [1.04, 1.0, 0.9], detail: 0.25 },
  // Without a tone curve a lit surface is at most its colour (≤ 1), and a glow keeps its hue at no
  // more than 1 in any channel (StyleLibrary.createGlow): only additive effects (plumes) can bloom.
  bloom: { strength: 0.12, radius: 0.25, threshold: 1 },
  // Two bands: shade below a tenth of the way round, lit above, with a narrow soft edge.
  cel: { shade: 0, mid: 0, midAt: 0.5, litAt: 0.1, soft: 0.012 },
  edges: { color: '#283034', width: 1.6, wobble: 0.9, breaks: 0.1, depth: 0.02, normal: 0.5, creaseFade: [15, 40], fade: [45, 90] },
  cloudSky: { deep: '#4c9fa6', mid: '#6fc2b8', light: '#a9e2d3', scale: 1 },
  mottle: 0.04,
  toneMapping: 'none',
  // Indoors: sun × 0.5, fill × 1.5, so shade is 0.75 of a colour and lit stays at it.
  interior: { fill: 1.5, key: 0.5 },
};

/** The parameters of a stylised look, or null for the industrial look. */
export function lookParams(look: Look): LookParams | null {
  return look === 'warm' ? WARM : look === 'village' ? VILLAGE : null;
}

/**
 * A colour in the warm look for a material that has no entry in
 * WARM.materials: hue kept, saturation held to the look's dusty range,
 * lightness lifted so darks become mid-dark (never black), and neutral greys
 * turned into a warm stone.
 */
export function warmColour(color: T.ColorRepresentation): string {
  // In sRGB, as the colour is seen: in three's linear working space greys look more saturated than they are.
  const c = new T.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, T.SRGBColorSpace);
  const l = 0.32 + 0.6 * hsl.l;
  if (hsl.s < 0.1) return '#' + new T.Color().setHSL(38 / 360, 0.2, l, T.SRGBColorSpace).getHexString();
  return '#' + new T.Color().setHSL(hsl.h, Math.min(0.42, hsl.s * 0.75 + 0.06), l, T.SRGBColorSpace).getHexString();
}

/** Ship paint for a palette name in a look; null means "the industrial rule" (hullTone). */
export function lookPaint(look: Look, name: PaletteName): string | null {
  const P = lookParams(look);
  return P ? P.paints[name] ?? warmColour(PALETTE[name]) : null;
}

/** Glow colour for a palette name in a look. */
export function lookGlow(look: Look, name: PaletteName, industrial: string): string {
  return lookParams(look)?.glows[name] ?? industrial;
}
