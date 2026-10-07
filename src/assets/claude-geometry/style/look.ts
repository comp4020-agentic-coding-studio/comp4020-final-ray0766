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
// ship/parts/village), drawn with ink outlines and stepped direct light, in a
// palette of its own. Part ids, frames, anchors, sockets and envelopes stay;
// where a shape needs a size change it is listed in docs/VILLAGE.md.
// The colours are this module's own; they follow the relationships of the main
// project's early world (warm key, cool fill, mid-to-high values, teal darks,
// terracotta accents), not its values.

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
  /** Ink outlines (village): silhouettes from an inverted shell, creases from edges sharper than `crease`. */
  outline?: { color: string; width: number; crease: number; lineOpacity: number };
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
 * The village look. Light walls, mid roofs and wood, dark openings and iron,
 * so a facade reads in grey as well as in colour: cream plaster and stone,
 * terracotta tiles, honey floorboards, teal-sage doors and shutters, dark teal
 * glass, iron in a teal-tinted dark. Lit and shaded sides are flat bands under
 * a warm sun and a cool sky, with ink lines on silhouettes and edges.
 */
export const VILLAGE: LookParams = {
  materials: {
    // Building kit (blueprint/parts/kit.ts maps each KitMaterial to one of these in this look).
    'village:plaster': '#efe3c6',
    'village:plaster-in': '#f4ebd8',
    'village:timber': '#7d5b43',
    'village:iron': '#46514f',
    'village:brass': '#c8a05a',
    'village:boards': '#b88e62',
    'village:stone': '#cbbfa6',
    'village:paint': '#5f8b82',
    'village:tile': '#c26b4b',
    'village:tile-dark': '#8c5a46',
    'village:cobble': '#d4c7a6',
    'village:lane': '#8e968e',
    'village:line': '#f2ead3',
    'village:ground': '#93a77e',
    // Props and planting.
    'village:leaf': '#7fa36b', 'village:leaf-light': '#9cbb7c', 'village:leaf-dark': '#5f8a5a',
    'village:bark': '#8a6a4f', 'village:pot': '#c47a55', 'village:soil': '#6f5240',
    'village:bloom-yellow': '#ecc45a', 'village:bloom-coral': '#e98f7d', 'village:bloom-white': '#f6f0e1',
    // Shared presets other modules ask for (props, shipyard), in the same palette.
    cladding: '#efe3c6', claddingDark: '#6f8a83', corrugated: '#9db58b', frame: '#c7c1b0', frameLight: '#e3dccb',
    framePainted: '#46514f', sheet: '#5f8b82', deck: '#b88e62', concrete: '#cbbfa6', rubber: '#6f5240',
    hull: '#f1e6cc', hullDark: '#46514f', accent: '#e0a24f',
    'ship:bare-steel': '#c7c1b0', 'ship:bare-alloy': '#e3dccb', 'ship:heat': '#9b7a62', 'ship:hangar-slab': '#d8cdb1',
    'blueprint:bay-floor': '#a8bb8c',
  },
  paints: {
    bone: '#f1e6cc', graphite: '#46514f', gunmetal: '#7e9690', alloy: '#d9d3c4', amber: '#e0a24f',
    teal: '#5f9b92', crimson: '#c4614b', cobalt: '#6585a3', olive: '#93a571', oxide: '#a06c4d',
  },
  glows: { cyan: '#a8eadb', sodium: '#ffcf8c', signalRed: '#ff9473', magenta: '#f39cbd' },
  finish: { paint: [0.88, 0], metal: [0.7, 0.05], concrete: [0.95, 0], rubber: [0.95, 0] },
  relief: 0,
  envIntensity: 0.22,
  glass: {
    clear: { color: '#3f5a5e', opacity: 0.88, roughness: 0.35 },
    smoked: { color: '#33494c', opacity: 0.92, roughness: 0.35 },
    canopy: { color: '#4a6f70', opacity: 0.82, roughness: 0.3 },
    envIntensity: 0.5,
  },
  hazard: ['#f2ead3', '#c26b4b'],
  glowBase: '#6b5640',
  ink: { dark: '#3a4a46', light: '#f6eedb' },
  light: {
    key: '#fff0d6', keyIntensity: 2.8,
    /** About 43° up from the front left of the village scene: fronts and left sides lit, shadows to the back right. */
    keyPosition: [-5, 8, 6],
    rim: '#d8eee8', rimIntensity: 0.35,
    sky: '#cde6df', ground: '#b8a27c', fillIntensity: 1.05,
    shadowRadius: 2, shadowIntensity: 0.62,
  },
  sky: { zenith: '#83bdb9', horizon: '#cfe4dc', ground: '#b9ad8c', sun: 2 },
  fog: '#cfe2da',
  thumbnail: '#efe6d2',
  fogDensity: 0.45,
  practical: 0.6,
  backgroundIntensity: 1,
  backgroundBlurriness: 0.35,
  exposure: 1,
  // No ambient occlusion pass: the stepped light and the ink already draw where
  // things meet, the pass's soft halos fight the flat bands, and it redraws the
  // whole scene (about half a frame's draw calls on the village sample).
  ao: 0,
  terrain: { saturation: 0.7, scale: 0.8, lift: 0.06, warm: [1.04, 1.0, 0.9], detail: 0.25 },
  // Only the plume at full thrust blooms: lit plaster under the key is well over 1
  // before tone mapping, and a threshold of 1 hazed every sunny wall.
  bloom: { strength: 0.12, radius: 0.25, threshold: 2.8 },
  cel: { shade: 0, mid: 0.55, midAt: 0.1, litAt: 0.42, soft: 0.03 },
  outline: { color: '#2f3d3a', width: 1.5, crease: 35, lineOpacity: 0.7 },
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
