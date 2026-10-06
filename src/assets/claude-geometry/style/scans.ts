import type { LodTier } from './lod.ts';

// CC0 surface textures from Poly Haven, prepared by scripts/assets/build_scans.py
// into public/assets/scans/<id>/<size>/{albedo,normal,arm}.webp. Provenance,
// authors and file sizes are in public/assets/scans/manifest.json and
// docs/ASSETS.md. Poly Haven does not state per asset whether a texture was
// photo-scanned, so nothing here is described as a scan beyond its name.
//
// Modes describe how the albedo was prepared:
// - natural: the source colour (concrete, pavers, asphalt);
// - paint / steel / tread: a light, low-contrast luminance base that the
//   material tints with the house palette, so one texture serves every colour
//   and wear stays restrained.

export type ScanId = 'hangar_concrete_floor' | 'concrete_pavement' | 'clean_asphalt' | 'metal_plate' | 'metal_plate_02' | 'blue_metal_plate' | 'corrugated_iron_02';
export type ScanMode = 'natural' | 'paint' | 'steel' | 'tread';
export type ScanMap = 'albedo' | 'normal' | 'arm';

export interface ScanSet {
  id: ScanId;
  /** Real-world width the texture covers, from Poly Haven's dimensions (metres). */
  sizeMetres: number;
  mode: ScanMode;
}

export const SCANS: Record<ScanId, ScanSet> = {
  hangar_concrete_floor: { id: 'hangar_concrete_floor', sizeMetres: 2, mode: 'natural' },
  concrete_pavement: { id: 'concrete_pavement', sizeMetres: 1.8, mode: 'natural' },
  clean_asphalt: { id: 'clean_asphalt', sizeMetres: 2.1, mode: 'natural' },
  metal_plate: { id: 'metal_plate', sizeMetres: 0.5, mode: 'tread' },
  metal_plate_02: { id: 'metal_plate_02', sizeMetres: 2, mode: 'steel' },
  blue_metal_plate: { id: 'blue_metal_plate', sizeMetres: 2.5, mode: 'paint' },
  corrugated_iron_02: { id: 'corrugated_iron_02', sizeMetres: 2.7, mode: 'paint' },
};
export const SCAN_IDS = Object.keys(SCANS) as ScanId[];
export const SCAN_SIZES = [1024, 512, 256] as const;

/** Texture edge per map and tier: roughness/AO/metal carry less visible detail than colour and normal. */
export const SCAN_TEXTURE_SIZE: Record<LodTier, Record<ScanMap, number>> = {
  high: { albedo: 1024, normal: 1024, arm: 512 },
  medium: { albedo: 512, normal: 512, arm: 256 },
  low: { albedo: 256, normal: 256, arm: 256 },
};

/** HDR environments (Poly Haven, CC0, 1K equirectangular) per lighting mood. */
export const HDRI_FILES = {
  hangar: 'assets/hdri/aircraft_workshop_01_1k.hdr',
  dusk: 'assets/hdri/qwantani_dusk_2_puresky_1k.hdr',
} as const;

/** Site-root URL for a file under public/, honouring Vite's base path. */
export function assetUrl(path: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return base.replace(/\/?$/, '/') + path;
}

/** How texture sets travel: WebP (decoded to RGBA8) or KTX2 (Basis UASTC, transcoded to the GPU's compressed format). */
export type TextureFormat = 'webp' | 'ktx2';

/**
 * Default delivery per texture-set tier (the sizes loaded, SCAN_TEXTURE_SIZE),
 * chosen by measurement (docs/STYLE.md, "Texture delivery"). KTX2 cuts GPU
 * memory fourfold on every tier and makes every download six- to eightfold
 * larger. With 1024 px maps it also removes the main-thread upload stalls of
 * RGBA8 (up to 29 ms per map), so it is worth its download there; with 512 px
 * and smaller those stalls are 1 ms or less and the network matters more, so
 * they stay WebP. ?textures= and StageOptions override it; KTX2 falls back to
 * WebP where unsupported.
 */
export const TEXTURE_FORMAT: Record<LodTier, TextureFormat> = { high: 'ktx2', medium: 'webp', low: 'webp' };

/** Where three.js's Basis transcoder (basis_transcoder.js/.wasm) is served, under public/. */
export const TRANSCODER_PATH = 'assets/basis/';

export const scanPath = (id: ScanId, map: ScanMap, size: number, format: TextureFormat = 'webp') => `assets/scans/${id}/${size}/${map}.${format}`;

/**
 * UV repeat that maps the 2 m metre-UVs of PartBuilder onto a texture covering
 * `sizeMetres`: one UV unit is SCALE.textureMetres (2 m) of surface.
 */
export const scanRepeat = (id: ScanId, uvMetres = 2) => uvMetres / SCANS[id].sizeMetres;
