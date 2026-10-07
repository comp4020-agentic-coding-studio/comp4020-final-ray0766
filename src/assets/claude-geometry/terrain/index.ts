// Public API of the terrain module, for adapters in the main project and for
// other modules. Everything else under src/terrain is an implementation detail.

export {
  GENERATOR_ID, GENERATOR_VERSION, ENVIRONMENT_VERSION, STYLES, STYLE_SPECS, COMMON_PARAMS, PALETTE_SLOTS, HERO_SEED,
  environmentCodec, encodeEnvironment, decodeEnvironment, canonicalEnvironment, environmentId,
  defaultEnvironment, switchStyle, paramSpecs, randomSeed, SAVED_ENVIRONMENT_KEY,
} from './env.ts';
export type { PlanetEnvironment, TerrainStyle, TerrainParams, PaletteOverrides, PaletteSlot, ParamSpec, StyleSpec } from './env.ts';
export { createHeightField, LANDING_RADIUS, HEIGHT_LIMITS } from './field.ts';
export type { TerrainField, SurfaceSample } from './field.ts';
export { buildPlanet, ATMOSPHERE_HEIGHT, GRADE_DEPTH } from './planet.ts';
export type { PlanetHandle, PlanetStats, BuildOptions, Foundation } from './planet.ts';
export { TerrainKit } from './kit.ts';
export { FLORA_CEILING } from './flora.ts';
export type { Clearing } from './flora.ts';
export { checkTerrainChange, describeConflicts } from './policy.ts';
export type { AnchoredObject, Refit, Conflict, TerrainChangeCheck } from './policy.ts';
export { TerrainSession } from './session.ts';
export type { ApplyResult } from './session.ts';
export { PAD_SPECS, PAD_SAMPLE_STEP, choosePadSites, chooseSites, buildPad, padFootprint, padCovers, padFoundation } from './pads.ts';
export type { PadSpec, PadShape, PadOptions, PlacedPad, PadModel, SiteSpec } from './pads.ts';
export { GLINT_LIMITS } from './kit.ts';
export { PROBE_DIRS } from './probes.ts';
