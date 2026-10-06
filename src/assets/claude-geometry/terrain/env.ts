import { Check, FORMAT, decodeDoc, encodeDoc, roundTrip } from '../core/doc.ts';
import type { DocCodec, Result } from '../core/doc.ts';
import { PALETTE } from '../style/tokens.ts';
import type { PaletteName } from '../style/tokens.ts';
import { sha256Hex } from './sha256.ts';

// PlanetEnvironment: everything needed to regenerate a planet's ground,
// water and vegetation exactly. It is the only thing a server stores per
// planet; heights, meshes and placements are always derived from it.
//
//   { format, version, generator, generatorVersion, seed, style, params, palette? }
//
// `generatorVersion` is separate from the document version: the document
// shape can stay at v1 while a future generator changes the terrain it
// produces, and an old build must refuse terrain it would draw differently.

export const GENERATOR_ID = 'planet-terrain';
/**
 * 2: reshaped landforms so planets read as geology from orbit (tablelands,
 * transverse dunes, flat ice caps with clean rims, cleaner coasts) and lower
 * default relief and roughness. Documents made by generator 1 keep their
 * heights, plants and water look: every style program keeps its v1
 * landforms for them (heights checked against
 * docs/samples/terrain-probes-v1.json). Shader fixes (water glint limits,
 * the plants' planet shadow) apply to every document.
 */
export const GENERATOR_VERSION = 2;
export const ENVIRONMENT_VERSION = 1;

export const STYLES = ['ocean', 'desert', 'ice', 'temperate'] as const;
export type TerrainStyle = typeof STYLES[number];

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Why the parameter exists, shown as help text in the demo. */
  help: string;
}

export interface WaterSpec {
  /** null (no open water) is allowed. */
  nullable: boolean;
  /** A numeric sea level is allowed at all. */
  numeric: boolean;
  min: number;
  max: number;
  default: number | null;
  /** Shown when a null/number is given where the style does not allow it. */
  rule: string;
}

export interface StyleSpec {
  label: string;
  summary: string;
  water: WaterSpec;
  /** Parameters beyond relief, roughness, waterLevel and vegetation. */
  extra: ParamSpec[];
  defaults: Record<string, number>;
}

/** Parameters every style has. waterLevel is handled by WaterSpec because it may be null. */
export const COMMON_PARAMS: ParamSpec[] = [
  { key: 'relief', label: 'Relief', min: 0.3, max: 1.4, step: 0.01, unit: 'm', help: 'Height of the main landforms above their surroundings.' },
  { key: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.01, help: 'How much small-scale detail sits on top of the large shapes (fractal gain).' },
  { key: 'vegetation', label: 'Vegetation', min: 0, max: 1, step: 0.01, help: 'Density of plants and loose rocks, before the LOD cap.' },
];

export const STYLE_SPECS: Record<TerrainStyle, StyleSpec> = {
  ocean: {
    label: 'Ocean',
    summary: 'High sea, archipelago of basalt islands, sea stacks, beaches with a wet sand band.',
    water: { nullable: false, numeric: true, min: -0.3, max: 0.7, default: 0.04, rule: 'an ocean planet needs a sea level in metres' },
    extra: [
      { key: 'archipelago', label: 'Archipelago', min: 0, max: 1, step: 0.01, help: 'Few large islands (0) to many small ones (1): the frequency of the land mask.' },
      { key: 'stacks', label: 'Sea stacks', min: 0, max: 1, step: 0.01, help: 'Share of shallow-water cells that hold an eroded rock pillar.' },
    ],
    defaults: { relief: 0.8, roughness: 0.3, vegetation: 0.6, archipelago: 0.55, stacks: 0.5 },
  },
  desert: {
    label: 'Desert',
    summary: 'Dry erg of ridged dunes, layered mesas and buttes, sparse succulents and boulders.',
    water: { nullable: true, numeric: false, min: 0, max: 0, default: null, rule: 'desert planets have no open water; use null' },
    extra: [
      { key: 'wind', label: 'Wind bearing', min: 0, max: 359, step: 1, unit: '°', help: 'Prevailing wind; dune crests form across it.' },
      { key: 'mesas', label: 'Mesas', min: 0, max: 1, step: 0.01, help: 'Share of the surface raised into flat-topped mesas and buttes.' },
    ],
    defaults: { relief: 0.8, roughness: 0.3, vegetation: 0.3, wind: 60, mesas: 0.55 },
  },
  ice: {
    label: 'Ice',
    summary: 'Glacial plateaus with crevasse bands, a frozen sea sheet, ice spires and sparse dark conifers.',
    water: { nullable: true, numeric: true, min: -0.6, max: 0.4, default: 0.03, rule: 'ice planets take a frozen sea level from -0.6 to 0.4 m, or null' },
    extra: [
      { key: 'crevasses', label: 'Crevasses', min: 0, max: 1, step: 0.01, help: 'Depth and continuity of crevasse bands near plateau edges.' },
      { key: 'spires', label: 'Ice spires', min: 0, max: 1, step: 0.01, help: 'How many ice pinnacles stand on plateau rims and the frozen sea (up to the detail level\'s plant limit).' },
    ],
    defaults: { relief: 0.8, roughness: 0.3, vegetation: 0.4, crevasses: 0.6, spires: 0.5 },
  },
  temperate: {
    label: 'Temperate',
    summary: 'Rolling meadow, lakes and low rock outcrops; the closest to the main project hub.',
    water: { nullable: true, numeric: true, min: -0.8, max: 0.3, default: -0.12, rule: 'temperate planets take a lake level from -0.8 to 0.3 m, or null' },
    extra: [
      { key: 'outcrops', label: 'Outcrops', min: 0, max: 1, step: 0.01, help: 'How often bedrock breaks through the meadow as rocky knolls.' },
      { key: 'woodland', label: 'Woodland', min: 0, max: 1, step: 0.01, help: 'How much of the meadow is woodland: broadleaf trees grow only there, on a darker forest floor.' },
    ],
    defaults: { relief: 0.6, roughness: 0.3, vegetation: 0.55, outcrops: 0.4, woodland: 0.5 },
  },
};

/** Palette overrides: each slot accepts a few house colours that make sense for it. */
export const PALETTE_SLOTS = {
  rock: ['graphite', 'gunmetal', 'steel', 'concrete', 'bone', 'oxide'],
  ground: ['bone', 'concrete', 'oxide', 'olive', 'amber', 'steel'],
  water: ['teal', 'cobalt', 'graphite', 'olive'],
  flora: ['olive', 'teal', 'oxide', 'graphite', 'amber'],
} as const satisfies Record<string, readonly PaletteName[]>;
export type PaletteSlot = keyof typeof PALETTE_SLOTS;
export const PALETTE_SLOT_NAMES = Object.keys(PALETTE_SLOTS) as PaletteSlot[];
export type PaletteOverrides = Partial<{ [K in PaletteSlot]: typeof PALETTE_SLOTS[K][number] }>;

export type TerrainParams = { relief: number; roughness: number; waterLevel: number | null; vegetation: number } & Record<string, number | null>;

export interface PlanetEnvironment {
  generator: typeof GENERATOR_ID;
  generatorVersion: number;
  /** uint32 */
  seed: number;
  style: TerrainStyle;
  params: TerrainParams;
  palette?: PaletteOverrides;
}

export const paramKeys = (style: TerrainStyle) => [...COMMON_PARAMS.map(p => p.key), 'waterLevel', ...STYLE_SPECS[style].extra.map(p => p.key)];
export const paramSpecs = (style: TerrainStyle): ParamSpec[] => [...COMMON_PARAMS, ...STYLE_SPECS[style].extra];

/**
 * localStorage key under which the terrain demo's Save keeps the draft
 * (canonical JSON). Other demos read it to offer "the planet saved in the
 * terrain demo"; nothing else writes it.
 */
export const SAVED_ENVIRONMENT_KEY = 'planet-modules.terrain.saved';

/** The seed the demo opens with; picked because its ocean planet frames well from the default camera. */
export const HERO_SEED = 20261005;

export function defaultEnvironment(style: TerrainStyle, seed: number = HERO_SEED): PlanetEnvironment {
  const spec = STYLE_SPECS[style];
  return { generator: GENERATOR_ID, generatorVersion: GENERATOR_VERSION, seed: seed >>> 0, style, params: { ...spec.defaults, waterLevel: spec.water.default } as TerrainParams };
}

/**
 * Move to another style with that style's own defaults, keeping only the seed
 * and palette overrides. Each style is tuned at its defaults (relief 0.9 suits
 * an ocean, 0.7 a meadow), and the compare gallery draws exactly these, so
 * "Edit" from the gallery opens the planet that was shown.
 */
export function switchStyle(env: PlanetEnvironment, style: TerrainStyle): PlanetEnvironment {
  const next = defaultEnvironment(style, env.seed);
  return env.palette ? { ...next, palette: { ...env.palette } } : next;
}

function readPalette(raw: unknown, check: Check): PaletteOverrides | undefined {
  if (raw === undefined) return undefined;
  const o = check.obj(raw, '$.palette', PALETTE_SLOT_NAMES, []);
  const out: Record<string, string> = {};
  for (const slot of PALETTE_SLOT_NAMES) {
    if (!(slot in o)) continue;
    out[slot] = check.oneOf(o[slot], `$.palette.${slot}`, PALETTE_SLOTS[slot] as readonly string[]);
  }
  return out as PaletteOverrides;
}

export const environmentCodec: DocCodec<PlanetEnvironment> = {
  format: FORMAT.environment,
  current: ENVIRONMENT_VERSION,
  read(raw, check) {
    const o = check.obj(raw, '$', ['generator', 'generatorVersion', 'seed', 'style', 'params', 'palette'], ['generator', 'generatorVersion', 'seed', 'style', 'params']);
    // A missing field is reported once (by check.obj), not again as the wrong type.
    const has = (k: string) => k in o;
    if (has('generator') && o.generator !== GENERATOR_ID) check.problem('$.generator', `expected "${GENERATOR_ID}"`);
    const generatorVersion = has('generatorVersion') ? check.num(o.generatorVersion, '$.generatorVersion', { min: 1, int: true }) : GENERATOR_VERSION;
    if (Number.isSafeInteger(generatorVersion) && generatorVersion > GENERATOR_VERSION) {
      check.problem('$.generatorVersion', `this terrain was made by generator v${generatorVersion}; this build has v${GENERATOR_VERSION} and would draw it differently`);
    }
    const seed = has('seed') ? check.num(o.seed, '$.seed', { min: 0, max: 0xffffffff, int: true }) : 0;
    // The parameters depend on the style; without a valid style they are not checked key by key
    // (the style's own problem is the one to fix first).
    const styleKnown = typeof o.style === 'string' && (STYLES as readonly string[]).includes(o.style);
    const style = has('style') ? check.oneOf(o.style, '$.style', STYLES) : STYLES[0];
    const spec = STYLE_SPECS[style];
    const p = !has('params') ? {} : styleKnown ? check.obj(o.params, '$.params', paramKeys(style)) : check.obj(o.params, '$.params', Object.keys((o.params ?? {}) as object), []);
    const params: Record<string, number | null> = {};
    // Missing keys are already reported by check.obj; only check the ones present.
    for (const s of paramSpecs(style)) params[s.key] = styleKnown && s.key in p ? check.num(p[s.key], `$.params.${s.key}`, { min: s.min, max: s.max }) : s.min;
    if (styleKnown && 'waterLevel' in p) {
      const w = p.waterLevel;
      if (w === null) {
        if (!spec.water.nullable) check.problem('$.params.waterLevel', spec.water.rule);
        params.waterLevel = null;
      } else if (!spec.water.numeric) {
        check.problem('$.params.waterLevel', spec.water.rule);
        params.waterLevel = null;
      } else {
        params.waterLevel = check.num(w, '$.params.waterLevel', { min: spec.water.min, max: spec.water.max });
      }
    }
    const palette = readPalette(o.palette, check);
    const env: PlanetEnvironment = { generator: GENERATOR_ID, generatorVersion, seed, style, params: params as TerrainParams };
    if (palette && Object.keys(palette).length) env.palette = palette;
    return env;
  },
  write(env) {
    const out: Record<string, unknown> = { generator: env.generator, generatorVersion: env.generatorVersion, seed: env.seed, style: env.style, params: { ...env.params } };
    if (env.palette && Object.keys(env.palette).length) out.palette = { ...env.palette };
    return out;
  },
};

export const encodeEnvironment = (env: PlanetEnvironment, pretty = false) => encodeDoc(environmentCodec, env, pretty);
export const decodeEnvironment = (input: unknown): Result<PlanetEnvironment> => decodeDoc(environmentCodec, input);

/** Quantise through one save/load cycle; throws if the environment is invalid. */
export function canonicalEnvironment(env: PlanetEnvironment): PlanetEnvironment {
  const r = roundTrip(environmentCodec, env);
  if (!r.ok) throw new RangeError(`Invalid planet environment: ${r.errors.join('; ')}`);
  return r.value;
}

/** HeightField id: generator@version:SHA-256 of the canonical compact document. */
export const environmentId = (env: PlanetEnvironment) => `${GENERATOR_ID}@${env.generatorVersion}:${sha256Hex(encodeEnvironment(env))}`;

/** A uniformly random uint32 from the platform CSPRNG. */
export function randomSeed(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0];
}

/** Linear-light RGB of a palette colour, for tinting generated surfaces. */
export function paletteLinear(name: PaletteName): [number, number, number] {
  return hexLinear(PALETTE[name]);
}
export function hexLinear(hex: string): [number, number, number] {
  const c = (i: number) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [c(1), c(3), c(5)];
}
