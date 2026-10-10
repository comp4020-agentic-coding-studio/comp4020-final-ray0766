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

/**
 * Interface tokens of the village look (the pages' default; look: 'village' in
 * the API). The page tones are the ones src/shell/theme.css declares under
 * :root[data-look="village"]: paper from the plaster and trim colours, ink
 * text, a deep green for the primary action (the darkest green of the planting,
 * and not a colour of any wall, roof or sky), a blue for selection and
 * information. Every text tone is at least 4.5:1 on every panel ground it is
 * drawn on (tests/unit/core/village-ui.test.ts computes it;
 * tests/e2e/village-pages.spec.ts measures it on the pages).
 *
 * `scene` holds the state colours drawn inside the 3D view: selection, the
 * fits and refused placement ghosts, the locate ring, the build grids, faded
 * levels and the thumbnail ground. Selection and the three states are clear,
 * saturated hues the village palette does not use, so a state never reads as
 * a material: each is at least 0.1 apart in OKLab from every village material
 * colour, lit or in shade, from the sky and from the other states (also tested).
 */
export const VILLAGE_UI = {
  bg: '#e9e5d3',
  panel: '#f1f2ea',
  tile: '#f8f8f3',
  field: '#fbfbf8',
  line: '#d3d2c4',
  lineStrong: '#8d9698',
  text: '#283034',
  muted: '#535f63',
  accent: '#2f6e4d',
  accentInk: '#f1f2ea',
  info: '#2c5c9a',
  danger: '#a93a2b',
  ok: '#3d6a1e',
  warn: '#8a5a12',
  scene: {
    select: '#3b6ff0',
    ok: '#a8d61e',
    bad: '#f2243a',
    locate: '#c43fd0',
    /** Pencil grid on the work yard, and the faded upper levels' tint: the lines' ink. */
    grid: '#283034',
    faded: '#283034',
    /** Ground of palette icons and library thumbnails: a pale wash of the sky. */
    thumbnail: '#d5ebe3',
  },
} as const;
