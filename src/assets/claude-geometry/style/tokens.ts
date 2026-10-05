// One scale, palette and finish vocabulary for all four modules.
//
// Direction (decided with the student, 2026-10-05): grounded industrial sci-fi.
// Credible structure first: real thickness, chamfered edges, frames, flanges,
// bolts and panel seams; metal and glass read through roughness and normal
// detail. Light is restrained: warm sodium work lights and a few cool
// instrument accents, never a wall of neon. All textures are generated in
// code; nothing is taken from any game or film.

/** 1 world unit = 1 metre. The main project's courier stands about 1.6 m tall. */
export const SCALE = {
  metre: 1,
  characterHeight: 1.6,
  planetRadius: 10,
  /** Blueprint grid cell edge. */
  cell: 1.0,
  /** Floor-to-floor height of one blueprint level. */
  storey: 2.2,
  /** Structural slab and wall thickness. */
  slab: 0.16,
  wall: 0.18,
  /** Clear door opening. */
  doorWidth: 0.86,
  doorHeight: 1.86,
  /** Default chamfer on visible structural edges. */
  bevel: 0.018,
  /** One texture repeat on structural surfaces. */
  textureMetres: 2,
} as const;

/**
 * Colours are linear-friendly sRGB hex. Neutrals carry most surfaces; paint
 * accents are desaturated; emissive colours are reserved for small elements.
 */
export const PALETTE = {
  // Structural neutrals
  graphite: '#1c1f23',
  gunmetal: '#363b41',
  steel: '#7c838b',
  alloy: '#a7adb3',
  concrete: '#827f78',
  bone: '#bab6ab',
  oxide: '#5e4433',
  rubber: '#141517',
  // Paint accents (muted, for panels and liveries)
  amber: '#c98a2a',
  teal: '#2c6468',
  crimson: '#7d2a2a',
  cobalt: '#2b4670',
  olive: '#4d5340',
  // Emissive (use on small areas only)
  sodium: '#ffae55',
  cyan: '#56dcf5',
  signalRed: '#ff4636',
  magenta: '#ff3c86',
  // Glass
  glass: '#8fa8b6',
} as const;
export type PaletteName = keyof typeof PALETTE;

/** Colours a user may pick for paint (ships, structure trims). */
export const PAINT_CHOICES: PaletteName[] = ['bone', 'graphite', 'gunmetal', 'alloy', 'amber', 'teal', 'crimson', 'cobalt', 'olive', 'oxide'];
export const GLOW_CHOICES: PaletteName[] = ['cyan', 'sodium', 'signalRed', 'magenta'];

/** Emissive intensity steps. Bloom (high LOD only) starts above 1.0. */
export const GLOW = { off: 0, pilot: 0.6, lit: 1.6, hot: 3.2 } as const;

/** Interface tokens; src/shell/theme.css declares the same values as CSS variables. */
export const UI = {
  bg: '#0b0d10',
  panel: 'rgba(15, 18, 22, 0.86)',
  line: '#2a3138',
  text: '#d9dde0',
  muted: '#8a949c',
  accent: '#e3a03a',
  info: '#5fd4e6',
  danger: '#ff5a4c',
  ok: '#7fcf8f',
} as const;
