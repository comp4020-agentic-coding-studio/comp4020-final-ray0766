import * as T from 'three';
import { markShared } from '../core/dispose.ts';
import { LOD } from './lod.ts';
import type { LodTier } from './lod.ts';
import { finishMap, makeDataTexture, patternTextures } from './textures.ts';
import type { FinishName, PatternName, PatternTextures } from './textures.ts';
import { GLOW, PALETTE } from './tokens.ts';
import type { PaletteName } from './tokens.ts';
import { applyCel } from './cel.ts';
import { applyHueKeep, applyInterior, applyMottle } from './surface.ts';
import type { MottleSpace } from './surface.ts';
import { lookParams, warmColour } from './look.ts';
import type { Look, LookParams } from './look.ts';
import { assetUrl, SCAN_TEXTURE_SIZE, SCANS, scanPath, scanRepeat, TRANSCODER_PATH } from './scans.ts';
import type { ScanId, ScanMap, TextureFormat } from './scans.ts';

// The material vocabulary every module draws from. A StyleLibrary owns its
// textures and preset materials (all marked shared, freed by library.dispose()).
// Custom paint colours are reference-counted leases so cycling through colours
// in a workshop never accumulates materials. Glow materials are created per
// model, because thrust and status lights animate their intensity.
//
// With scans enabled (browser only), each material is still created at once
// with the procedural maps, then upgraded in place when its CC0 texture set has
// loaded: colour and packed AO/roughness/metalness from the scan, and the
// scan's normal unless the recipe keeps the procedural one (panel and hull
// seams that must line up with the 1 m module grid). A failed load leaves the
// procedural look. ready() resolves once every requested set has settled.
//
// Texture sets travel as WebP (decoded to RGBA8, mipmapped on the GPU) unless
// attachRenderer() asks for KTX2 and the GPU has a compressed format (ASTC,
// BC7, ETC2 or S3TC): then each map is fetched as KTX2 and transcoded in a
// worker, with its mips, and a map that fails falls back to its WebP.
// scanStats() records bytes, timings, the GPU format and GPU bytes per map.

export interface SurfaceRecipe {
  finish: FinishName;
  pattern: PatternName;
  color: string;
  /** Strength of the normal map (1 = as generated). */
  relief?: number;
  envIntensity?: number;
  /** Texture set used when scans are on; null keeps the procedural look. Defaults by finish and pattern. */
  scan?: ScanId | null;
  /** Use the scan's normal map (default) or keep the procedural pattern's. */
  scanNormal?: boolean;
  /** Colour applied to 'natural' scans (default white: the source colour). */
  scanTint?: string;
  /** Multiplies the scan's roughness (the source paint is semi-gloss; cladding and hulls read better duller). */
  scanRoughness?: number;
}

/** Default roughness factor per scan mode. */
const SCAN_ROUGHNESS = { natural: 1, paint: 1.6, steel: 1, tread: 1 } as const;

/** Which texture set a recipe gets when it does not name one. Panels and hulls keep their seam normals. */
export function defaultScan(recipe: SurfaceRecipe): { id: ScanId; normal: boolean } | null {
  if (recipe.scan === null) return null;
  if (recipe.scan) return { id: recipe.scan, normal: recipe.scanNormal ?? true };
  switch (recipe.finish) {
    case 'paint':
      if (recipe.pattern === 'corrugated') return { id: 'corrugated_iron_02', normal: true };
      return { id: 'blue_metal_plate', normal: recipe.pattern === 'plain' };
    case 'metal': return recipe.pattern === 'deck' ? { id: 'metal_plate', normal: true } : { id: 'metal_plate_02', normal: true };
    case 'concrete': return { id: 'hangar_concrete_floor', normal: true };
    case 'rubber': return null;
  }
}

export interface StyleLibraryOptions {
  /** Upgrade materials with the CC0 texture sets (needs a browser). Default off. */
  scans?: boolean;
  /**
   * Which tier's texture-set sizes to load (default: the library's LOD). Pages
   * that show buildings small on screen (a planet from orbit) pass 'medium'
   * at high LOD: 1024 px maps would cost download and memory for no visible detail.
   */
  scanDetail?: LodTier;
  /**
   * How materials are surfaced (src/style/look.ts); default 'industrial'. The
   * warm look keeps every material and name but makes them matte and clean,
   * with its own colours, and loads no texture sets.
   */
  look?: Look;
}

/** One loaded texture-set map: what crossed the network, what it cost, what the GPU holds. */
export interface ScanStat {
  url: string;
  format: TextureFormat;
  /** Bytes fetched (the file size; HTTP compression aside). */
  bytes: number;
  fetchMs: number;
  /** createImageBitmap for WebP, worker transcode for KTX2. */
  decodeMs: number;
  /** renderer.initTexture on the main thread (0 when no renderer is attached). */
  uploadMs: number;
  /** GPU texture format the map ended up in. */
  gpuFormat: string;
  /** Bytes of texture data handed to the GPU, all mips. Exact for KTX2; RGBA8 with a full mip chain for WebP (an estimate: the driver builds the mips). */
  gpuBytes: number;
  gpuBytesEstimated: boolean;
}

const COMPRESSED_EXTENSIONS = ['WEBGL_compressed_texture_astc', 'EXT_texture_compression_bptc', 'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_s3tc'];
const FORMAT_NAMES: Record<number, string> = {
  [T.RGBA_ASTC_4x4_Format]: 'ASTC 4x4', [T.RGBA_BPTC_Format]: 'BC7', [T.RGB_ETC2_Format]: 'ETC2 RGB', [T.RGBA_ETC2_EAC_Format]: 'ETC2 RGBA',
  [T.RGB_ETC1_Format]: 'ETC1', [T.RGBA_S3TC_DXT1_Format]: 'BC1', [T.RGB_S3TC_DXT1_Format]: 'BC1', [T.RGBA_S3TC_DXT5_Format]: 'BC3', [T.RGBAFormat]: 'RGBA8',
};
interface Ktx2Like { parse(buffer: ArrayBuffer, onLoad: (t: T.CompressedTexture) => void, onError: (e: unknown) => void): unknown; dispose(): void }

export const PRESETS = {
  /** Insulated sandwich cladding, painted. */
  cladding: { finish: 'paint', pattern: 'panel', color: PALETTE.bone },
  claddingDark: { finish: 'paint', pattern: 'panel', color: PALETTE.gunmetal },
  corrugated: { finish: 'paint', pattern: 'corrugated', color: PALETTE.steel, relief: 1.2 },
  /** Structural steel: frames, posts, stringers. */
  frame: { finish: 'metal', pattern: 'brushed', color: PALETTE.gunmetal },
  frameLight: { finish: 'metal', pattern: 'brushed', color: PALETTE.alloy },
  /** Painted structural steel. */
  framePainted: { finish: 'paint', pattern: 'plain', color: PALETTE.graphite },
  /** Smooth painted sheet: door leaves, housings, equipment cases. */
  sheet: { finish: 'paint', pattern: 'plain', color: PALETTE.gunmetal },
  deck: { finish: 'metal', pattern: 'deck', color: PALETTE.steel },
  concrete: { finish: 'concrete', pattern: 'concrete', color: PALETTE.concrete },
  rubber: { finish: 'rubber', pattern: 'plain', color: PALETTE.rubber },
  hull: { finish: 'paint', pattern: 'hull', color: PALETTE.bone },
  hullDark: { finish: 'paint', pattern: 'hull', color: PALETTE.graphite },
  accent: { finish: 'paint', pattern: 'plain', color: PALETTE.amber },
} as const satisfies Record<string, SurfaceRecipe>;
export type PresetName = keyof typeof PRESETS;

export class StyleLibrary {
  readonly lod: LodTier;
  private patterns = new Map<PatternName, PatternTextures>();
  private finishes = new Map<FinishName, T.DataTexture>();
  private presets = new Map<string, T.MeshStandardMaterial>();
  private paints = new Map<string, { material: T.MeshStandardMaterial; refs: number }>();
  private specials = new Map<string, T.Material>();
  private hazardTexture: T.DataTexture | null = null;
  /** 1×1 roughness/metalness maps of the warm look, per finish. */
  private flats = new Map<FinishName, T.DataTexture>();
  /** Indoor twins of stylised materials (indoor()). */
  private indoors = new Map<T.MeshStandardMaterial, T.MeshStandardMaterial>();
  /** Twins with their patches fixed to the model, for things that move (moving()). */
  private movers = new Map<T.MeshStandardMaterial, T.MeshStandardMaterial>();
  /** Material names the look's table has no colour for (unlisted()). */
  private unlistedNames = new Set<string>();
  private anisotropy = 1;
  private disposed = false;
  readonly scans: boolean;
  readonly look: Look;
  /** The look's parameters; null for the industrial look. */
  private readonly P: LookParams | null;
  /** Tier whose SCAN_TEXTURE_SIZE row the texture sets are loaded at. */
  readonly scanDetail: LodTier;
  private scanTextures = new Map<string, Promise<T.Texture>>();
  private scanLoaded: T.Texture[] = [];
  private pending = new Set<Promise<void>>();
  private scanBytes = new Map<string, number>();
  private scanStatList: ScanStat[] = [];
  private renderer: T.WebGLRenderer | null = null;
  private ktx2: Promise<Ktx2Like | null> = Promise.resolve(null);
  private ktx2Loader: Ktx2Like | null = null;
  /** The delivery actually in use once attachRenderer has settled. */
  textureFormat: TextureFormat = 'webp';

  constructor(lod: LodTier = 'high', options: StyleLibraryOptions = {}) {
    this.lod = lod;
    this.look = options.look ?? 'industrial';
    this.P = lookParams(this.look);
    // Stylised looks draw clean matte surfaces: no scanned wear to load.
    this.scans = !!options.scans && typeof document !== 'undefined' && this.P === null;
    this.scanDetail = options.scanDetail ?? lod;
  }

  /** Resolves once every texture set requested so far has loaded or failed. */
  async ready(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  /** Bytes fetched for scan textures, per URL (transfer size of the files actually used). */
  scanFiles(): { url: string; bytes: number }[] {
    return [...this.scanBytes].map(([url, bytes]) => ({ url, bytes }));
  }

  /** Per map: bytes, fetch/decode/upload time, GPU format and GPU bytes (see ScanStat). */
  scanStats(): ScanStat[] { return this.scanStatList.map(s => ({ ...s })); }

  /**
   * Give the library its renderer. Textures are then uploaded as soon as they
   * arrive (and the upload is timed). With `format` 'ktx2' the texture sets are
   * fetched as KTX2 and transcoded to the GPU's compressed format, provided the
   * GPU has one, workers and WebAssembly exist, and the transcoder loads;
   * otherwise they stay WebP. Call before materials are created.
   */
  attachRenderer(renderer: T.WebGLRenderer, format: TextureFormat = 'webp') {
    this.renderer = renderer;
    if (format !== 'ktx2' || !this.scans) return;
    const compressed = COMPRESSED_EXTENSIONS.some(name => renderer.extensions.has(name));
    if (!compressed || typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return;
    this.ktx2 = import('three/addons/loaders/KTX2Loader.js').then(({ KTX2Loader }) => {
      if (this.disposed) return null;
      const loader = new KTX2Loader().setTranscoderPath(assetUrl(TRANSCODER_PATH)).setWorkerLimit(2).detectSupport(renderer);
      this.ktx2Loader = loader as unknown as Ktx2Like;
      this.textureFormat = 'ktx2';
      return this.ktx2Loader;
    }).catch(error => { console.warn('KTX2 unavailable; texture sets stay WebP.', error); return null; });
  }

  private scanTexture(id: ScanId, map: ScanMap): Promise<T.Texture> {
    const size = SCAN_TEXTURE_SIZE[this.scanDetail][map];
    const key = `${id}|${map}|${size}`;
    let texture = this.scanTextures.get(key);
    if (!texture) {
      texture = this.ktx2.then(loader => loader
        ? this.loadKtx2(loader, id, map, size).catch(error => { console.warn(`KTX2 ${key} failed; using WebP.`, error); return this.loadWebp(id, map, size); })
        : this.loadWebp(id, map, size))
        .then(({ t, stat }) => {
          t.wrapS = t.wrapT = T.RepeatWrapping;
          t.repeat.setScalar(scanRepeat(id));
          t.colorSpace = map === 'albedo' ? T.SRGBColorSpace : T.NoColorSpace;
          t.anisotropy = this.anisotropy;
          t.name = `scan:${key}`;
          t.needsUpdate = true;
          if (this.disposed) { this.free(t); throw new Error('StyleLibrary disposed while loading.'); }
          markShared(t);
          this.scanLoaded.push(t);
          stat.uploadMs = this.upload(t);
          this.scanBytes.set(stat.url, stat.bytes);
          this.scanStatList.push(stat);
          return t;
        });
      this.scanTextures.set(key, texture);
    }
    return texture;
  }

  private async loadWebp(id: ScanId, map: ScanMap, size: number): Promise<{ t: T.Texture; stat: ScanStat }> {
    const url = assetUrl(scanPath(id, map, size, 'webp'));
    const t0 = performance.now();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    const blob = await response.blob();
    const t1 = performance.now();
    const image = await createImageBitmap(blob, { imageOrientation: 'flipY' });
    const t2 = performance.now();
    const stat: ScanStat = { url, format: 'webp', bytes: blob.size, fetchMs: t1 - t0, decodeMs: t2 - t1, uploadMs: 0, gpuFormat: 'RGBA8', gpuBytes: Math.round(image.width * image.height * 4 * 4 / 3), gpuBytesEstimated: true };
    const t = new T.Texture(image as unknown as HTMLImageElement);
    t.flipY = false; // flipped while decoding: ImageBitmaps ignore flipY at upload
    return { t, stat };
  }

  private async loadKtx2(loader: Ktx2Like, id: ScanId, map: ScanMap, size: number): Promise<{ t: T.Texture; stat: ScanStat }> {
    const url = assetUrl(scanPath(id, map, size, 'ktx2'));
    const t0 = performance.now();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    const buffer = await response.arrayBuffer();
    // Read before parsing: the buffer is transferred to a worker and detached.
    const bytes = buffer.byteLength;
    const t1 = performance.now();
    // Rows were flipped when encoding (scripts/assets/build_scans.py), matching the WebP path.
    const t = await new Promise<T.CompressedTexture>((resolve, reject) => { loader.parse(buffer, resolve, reject); });
    const t2 = performance.now();
    const gpuBytes = (t.mipmaps as unknown as { data: ArrayBufferView }[]).reduce((sum, m) => sum + m.data.byteLength, 0);
    const stat: ScanStat = { url, format: 'ktx2', bytes, fetchMs: t1 - t0, decodeMs: t2 - t1, uploadMs: 0, gpuFormat: FORMAT_NAMES[t.format] ?? String(t.format), gpuBytes, gpuBytesEstimated: false };
    return { t, stat };
  }

  /** Upload now, on the main thread, and return how long it took (ms). */
  private upload(t: T.Texture): number {
    if (!this.renderer) return 0;
    const begin = performance.now();
    this.renderer.initTexture(t);
    return performance.now() - begin;
  }

  private free(t: T.Texture) {
    t.dispose();
    (t.image as unknown as ImageBitmap | undefined)?.close?.();
  }

  private upgrade(material: T.MeshStandardMaterial, recipe: SurfaceRecipe) {
    const scan = this.scans ? defaultScan(recipe) : null;
    if (!scan) return;
    const job = Promise.all([this.scanTexture(scan.id, 'albedo'), this.scanTexture(scan.id, 'arm'), scan.normal ? this.scanTexture(scan.id, 'normal') : null])
      .then(([albedo, arm, normal]) => {
        if (this.disposed) return;
        material.map = albedo;
        material.roughnessMap = arm; material.metalnessMap = arm; material.aoMap = arm;
        material.aoMapIntensity = 0.8;
        if (normal) material.normalMap = normal;
        const mode = SCANS[scan.id].mode;
        if (mode === 'natural') material.color.set(recipe.scanTint ?? '#ffffff');
        material.roughness = recipe.scanRoughness ?? SCAN_ROUGHNESS[mode];
        material.userData.scan = scan.id;
        material.needsUpdate = true;
      })
      .catch(() => { /* keep the procedural maps */ });
    this.pending.add(job);
    void job.finally(() => this.pending.delete(job));
  }

  /** Call once a renderer exists; applies to existing and future textures. */
  setAnisotropy(value: number) {
    this.anisotropy = Math.max(1, Math.min(8, value));
    for (const p of this.patterns.values()) { p.normal.anisotropy = this.anisotropy; p.albedo.anisotropy = this.anisotropy; }
    for (const f of this.finishes.values()) f.anisotropy = this.anisotropy;
  }

  private pattern(name: PatternName): PatternTextures {
    let p = this.patterns.get(name);
    if (!p) {
      p = patternTextures(name, LOD[this.lod].textureSize, 11);
      p.normal.anisotropy = p.albedo.anisotropy = this.anisotropy;
      markShared(p.normal); markShared(p.albedo);
      this.patterns.set(name, p);
    }
    return p;
  }

  private finish(name: FinishName): T.DataTexture {
    let f = this.finishes.get(name);
    if (!f) {
      f = markShared(makeDataTexture(finishMap(name, LOD[this.lod].textureSize, 5), LOD[this.lod].textureSize, false));
      f.anisotropy = this.anisotropy;
      this.finishes.set(name, f);
    }
    return f;
  }

  /**
   * The warm look's roughness/metalness map for a finish: one texel, so the
   * surface is evenly matte. A map rather than plain numbers, so code that
   * copies a material's maps (timeline:ground) keeps the same response.
   */
  private flat(name: FinishName): T.DataTexture {
    let f = this.flats.get(name);
    if (!f) {
      const [rough, metal] = this.P!.finish[name];
      f = markShared(makeDataTexture(new Uint8Array([255, Math.round(rough * 255), Math.round(metal * 255), 255]), 1, false));
      this.flats.set(name, f);
    }
    return f;
  }

  /**
   * `name` is the preset name or custom key, used by the warm look to pick the
   * material's colour; `keepColour` leaves an explicit colour (a leased paint) as given.
   */
  private build(recipe: SurfaceRecipe, name = '', keepColour = false, space: MottleSpace = 'world'): T.MeshStandardMaterial {
    const P = this.P;
    if (P) {
      const relief = (recipe.relief ?? 1) * P.relief, flat = this.flat(recipe.finish);
      if (!keepColour && P.materials[name] === undefined) this.unlistedNames.add(name);
      const material = new T.MeshStandardMaterial({
        color: keepColour ? recipe.color : P.materials[name] ?? warmColour(recipe.color),
        ...(relief > 0 ? { normalMap: this.pattern(recipe.pattern).normal, normalScale: new T.Vector2(relief, relief) } : {}),
        roughnessMap: flat, metalnessMap: flat,
        roughness: 1, metalness: 1,
        envMapIntensity: Math.min(1, recipe.envIntensity ?? 1) * P.envIntensity,
      });
      return this.stylise(material, space);
    }
    const p = this.pattern(recipe.pattern), orm = this.finish(recipe.finish);
    const relief = recipe.relief ?? 1;
    const material = new T.MeshStandardMaterial({
      color: recipe.color,
      map: p.albedo,
      normalMap: p.normal,
      normalScale: new T.Vector2(relief, relief),
      roughnessMap: orm, metalnessMap: orm,
      roughness: 1, metalness: 1,
      envMapIntensity: recipe.envIntensity ?? 1,
    });
    this.upgrade(material, recipe);
    return material;
  }

  /**
   * Light a material the caller made (and frees) the way this look lights its
   * own: in the village look, the stepped light and no image light, so a decal
   * on a hull turns into shade where the hull does. Other looks leave it alone.
   */
  lightAsLook<M extends T.MeshStandardMaterial>(material: M): M {
    const P = this.P;
    if (!P?.cel) return material;
    material.envMapIntensity = P.envIntensity;
    applyCel(material, P.cel);
    return material;
  }

  /**
   * Preset names and custom keys this library has coloured by rule (warmColour)
   * because its look's table (LookParams.materials) has no entry for them. The
   * warm look does that by design; in the village look every name a model asks
   * for should be in the table, so this is a list of misses (held empty by
   * tests/unit/core/look.test.ts and on every page in Chrome).
   */
  unlisted(): string[] { return [...this.unlistedNames].sort(); }

  /** Whether the look lights surfaces under a roof as indoors (indoor()). */
  get daylightIndoors(): boolean { return !!this.P?.interior; }

  /**
   * The twin of a stylised library material that lights surfaces under a roof
   * as indoors (src/style/surface.ts applyInterior): for buildings, whose
   * geometry carries the `cover` attribute (src/blueprint/cover.ts) — never for
   * geometry without it. Shared and cached per material; the material itself
   * where the look has no daylight indoors or did not stylise it.
   */
  indoor<M extends T.Material>(material: M): M {
    const P = this.P;
    const standard = material as unknown as T.MeshStandardMaterial;
    if (!P?.interior || !P.cel || !standard.isMeshStandardMaterial || !material.userData.cel || material.userData.interior) return material;
    this.alive();
    let twin = this.indoors.get(standard);
    if (!twin) {
      // A clone carries the colour and maps but not the shader patches; its copied flags would skip them.
      const mottled = material.userData.mottle === true, space = (material.userData.mottleSpace as MottleSpace | undefined) ?? 'world';
      twin = standard.clone();
      twin.userData.cel = false; twin.userData.mottle = false; twin.userData.mottleSpace = undefined; twin.userData.interior = false;
      twin.name = `${material.name}+indoor`;
      applyCel(twin, P.cel);
      if (P.mottle && mottled) applyMottle(twin, P.mottle, space);
      applyInterior(twin, P.interior);
      this.indoors.set(standard, markShared(twin));
    }
    return twin as unknown as M;
  }

  /**
   * The village look's finishing touches on any opaque material it makes:
   * stepped direct light and tonal patches (src/style/cel.ts, src/style/surface.ts).
   * Daylight indoors goes on the indoor twins only (indoor()); the lines are
   * drawn on screen, not by the materials.
   */
  private stylise<M extends T.MeshStandardMaterial>(material: M, space: MottleSpace | null = 'world'): M {
    const P = this.P;
    if (!P?.cel) return material;
    applyCel(material, P.cel);
    if (P.mottle && space) applyMottle(material, P.mottle, space);
    return material;
  }

  /**
   * The twin of a stylised library material for a model that moves (a ship,
   * a turntable): its tonal patches are fixed to the model instead of the
   * world, so they turn and fly with it rather than crawl over it. Shared and
   * cached per material; the material itself where it has no world-fixed
   * patches (other looks, glass, glows, leased paints, which are already
   * fixed to their ship).
   */
  moving<M extends T.Material>(material: M): M {
    const P = this.P;
    const standard = material as unknown as T.MeshStandardMaterial;
    if (!P?.mottle || !P.cel || !standard.isMeshStandardMaterial || material.userData.mottle !== true || material.userData.mottleSpace !== 'world' || material.userData.interior) return material;
    this.alive();
    let twin = this.movers.get(standard);
    if (!twin) {
      twin = standard.clone();
      twin.userData.cel = false; twin.userData.mottle = false; twin.userData.mottleSpace = undefined;
      twin.name = `${material.name}+moving`;
      applyCel(twin, P.cel);
      applyMottle(twin, P.mottle, 'object');
      this.movers.set(standard, markShared(twin));
    }
    return twin as unknown as M;
  }

  /**
   * A module-defined look that is not in PRESETS, cached under a namespaced key
   * (e.g. "ship:canopy-frame"). Shared and permanent like a preset, so modules
   * can extend the vocabulary without editing this file.
   */
  custom(key: string, recipe: SurfaceRecipe): T.MeshStandardMaterial {
    this.alive();
    const id = `custom:${key}`;
    let m = this.presets.get(id);
    if (!m) { m = markShared(this.build(recipe, key)); m.name = id; this.presets.set(id, m); }
    return m;
  }

  /** A permanent shared material. */
  preset(name: PresetName): T.MeshStandardMaterial {
    this.alive();
    let m = this.presets.get(name);
    if (!m) { m = markShared(this.build(PRESETS[name], name)); m.name = name; this.presets.set(name, m); }
    return m;
  }

  /** A shared paint in any colour; release() it when the model using it is disposed. */
  leasePaint(color: string, pattern: PatternName = 'hull', finish: FinishName = 'paint', options: { relief?: number; envIntensity?: number } = {}): { material: T.MeshStandardMaterial; release: () => void } {
    this.alive();
    const relief = options.relief ?? 1, env = options.envIntensity ?? 1;
    // Default relief and env keep the plain name, so existing material names stay stable.
    const key = `${finish}|${pattern}|${new T.Color(color).getHexString()}` + (relief !== 1 || env !== 1 ? `|r${relief}|e${env}` : '');
    let entry = this.paints.get(key);
    if (!entry) {
      // Only ships lease paints: their patches are fixed to the ship (object space), so they do not crawl as it turns or flies.
      entry = { material: markShared(this.build({ finish, pattern, color, relief, envIntensity: env }, '', true, 'object')), refs: 0 };
      entry.material.name = `paint:${key}`;
      this.paints.set(key, entry);
    }
    entry.refs++;
    let released = false;
    return {
      material: entry.material,
      release: () => {
        if (released) return; released = true;
        const e = this.paints.get(key);
        if (e && --e.refs === 0) { e.material.dispose(); this.paints.delete(key); }
      },
    };
  }

  /**
   * Clear or tinted glass with a faint smudge in its roughness. Shared.
   * 'canopy' is the coated glass of ship canopies and sensor windows: darker
   * and more reflective than window glass, so under image-based light it reads
   * as a surface with the hangar in it rather than as an empty frame.
   */
  glass(tint: 'clear' | 'smoked' | 'canopy' = 'clear'): T.MeshPhysicalMaterial {
    const P = this.P;
    if (P?.cel) {
      // Drawn flat like every other surface: a tinted tone in the two bands that writes depth, so a
      // pane is outlined and nothing behind it is inked through it; no mottle (glass is one even
      // tone, and canopies move). Below opacity 1 (the village's) what is behind shows faintly through,
      // without its lines; at 1 the glass would be opaque.
      const g = P.glass[tint];
      return this.special(`glass:${tint}`, () => {
        const m = new T.MeshPhysicalMaterial({
          color: g.color, metalness: 0, roughness: g.roughness, envMapIntensity: P.envIntensity,
          transparent: g.opacity < 1, opacity: g.opacity, depthWrite: true,
        });
        return applyCel(m, P.cel!);
      }) as T.MeshPhysicalMaterial;
    }
    if (P) {
      // Tinted glass with a soft sheen: it reads as glass by colour, not by mirrored highlights.
      const g = P.glass[tint];
      return this.special(`glass:${tint}`, () => new T.MeshPhysicalMaterial({
        color: g.color, metalness: 0, roughness: g.roughness, specularIntensity: 0.4,
        transparent: true, opacity: g.opacity, envMapIntensity: P.glass.envIntensity,
        ior: 1.5, depthWrite: false,
      })) as T.MeshPhysicalMaterial;
    }
    if (tint === 'canopy') {
      return this.special('glass:canopy', () => new T.MeshPhysicalMaterial({
        // Same softened highlight as the window glass, so the hangar key
        // light stays a small glint and does not bloom across the canopy.
        color: '#1a2024', metalness: 0, roughness: 0.14, specularIntensity: 0.6,
        roughnessMap: this.finish('rubber'),
        transparent: true, opacity: 0.78,
        envMapIntensity: 1.8, clearcoat: 0.4, clearcoatRoughness: 0.14,
        ior: 1.5, depthWrite: false,
      })) as T.MeshPhysicalMaterial;
    }
    return this.special(`glass:${tint}`, () => new T.MeshPhysicalMaterial({
      color: tint === 'clear' ? PALETTE.glass : '#2e3a40',
      // Slightly rough with a softened clearcoat: the sun's reflection stays a
      // small highlight instead of a bloomed white spot under the dusk key light.
      metalness: 0, roughness: 0.12, specularIntensity: 0.6,
      roughnessMap: this.finish('rubber'),
      transparent: true, opacity: tint === 'clear' ? 0.3 : 0.55,
      envMapIntensity: 1.4, clearcoat: 0.5, clearcoatRoughness: 0.12,
      ior: 1.5, depthWrite: false,
    })) as T.MeshPhysicalMaterial;
  }

  /**
   * Diagonal hazard striping for door frames, stair nosings and landing gear. Shared.
   * A look with a `hazardBand` (the village) paints it as one plain band instead.
   */
  hazard(): T.MeshStandardMaterial {
    const band = this.P?.hazardBand;
    if (band) {
      return this.special('hazard', () => {
        const flat = this.flat('paint');
        return this.stylise(new T.MeshStandardMaterial({ color: band, roughnessMap: flat, metalnessMap: flat, roughness: 1, metalness: 1, envMapIntensity: this.P!.envIntensity }));
      }) as T.MeshStandardMaterial;
    }
    return this.special('hazard', () => {
      const size = LOD[this.lod].textureSize;
      const data = new Uint8Array(size * size * 4);
      // Stored as sRGB bytes, so take the hex channels directly.
      const bytes = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      const P = this.P, warm = P !== null;
      const amber = bytes(P ? P.hazard[0] : PALETTE.amber), dark = bytes(P ? P.hazard[1] : PALETTE.graphite);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const c = Math.floor(((x + y) / size) * 8) % 2 === 0 ? amber : dark;
        const i = (y * size + x) * 4;
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
      }
      this.hazardTexture = markShared(makeDataTexture(data, size, true));
      const orm = warm ? this.flat('paint') : this.finish('paint');
      return this.stylise(new T.MeshStandardMaterial({ map: this.hazardTexture, normalMap: this.pattern('plain').normal, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, ...(P ? { envMapIntensity: P.envIntensity } : {}) }));
    }) as T.MeshStandardMaterial;
  }

  /**
   * A glow material owned by the caller (not shared): its intensity animates per
   * model. Dark base colour so unlit it reads as a lens, not a painted stripe.
   */
  createGlow(color: string = PALETTE.sodium, intensity: number = GLOW.lit): T.MeshStandardMaterial {
    const P = this.P;
    // In the village look the lens takes no image light either: it is drawn flat, like everything else,
    // in the look's own glow colour, which it keeps at any intensity instead of clipping (applyHueKeep).
    // No tonal patches on a lens (its light covers them, and liners and nav lights move with their ship).
    const glow = this.stylise(new T.MeshStandardMaterial({ color: P ? P.glowBase : '#15171a', emissive: P?.cel ? this.glowColour(color) : color, emissiveIntensity: intensity, roughness: 0.35, metalness: 0, ...(P?.cel ? { envMapIntensity: P.envIntensity } : {}) }), null);
    return P?.cel ? applyHueKeep(glow) : glow;
  }

  /**
   * The colour a glow is drawn in. In a flat look (the village) a palette glow
   * colour (cyan, sodium, signal red, magenta) becomes the look's own
   * (LookParams.glows), so every caller that passes PALETTE.sodium gets the
   * village lamp light; any other colour, and every colour in the other looks,
   * is kept. For glows a model draws without createGlow (a ship's nav lenses).
   */
  glowColour(color: T.ColorRepresentation): string {
    const hex = '#' + new T.Color(color).getHexString();
    const P = this.P;
    if (!P?.cel) return hex;
    for (const [name, glow] of Object.entries(P.glows)) if (glow && '#' + new T.Color(PALETTE[name as PaletteName]).getHexString() === hex) return glow;
    return hex;
  }

  private special(key: string, make: () => T.Material): T.Material {
    this.alive();
    let m = this.specials.get(key);
    if (!m) { m = markShared(make()); m.name = key; this.specials.set(key, m); }
    return m;
  }

  private alive() { if (this.disposed) throw new Error('StyleLibrary has been disposed.'); }

  /** Live counts for leak checks and the demo HUD. */
  stats() {
    return { presets: this.presets.size, paints: this.paints.size, specials: this.specials.size, textures: this.patterns.size * 2 + this.finishes.size + this.flats.size + (this.hazardTexture ? 1 : 0) + this.scanLoaded.length };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const m of this.presets.values()) m.dispose();
    for (const e of this.paints.values()) e.material.dispose();
    for (const m of this.specials.values()) m.dispose();
    for (const m of this.indoors.values()) m.dispose();
    this.indoors.clear();
    for (const m of this.movers.values()) m.dispose();
    this.movers.clear();
    for (const p of this.patterns.values()) { p.normal.dispose(); p.albedo.dispose(); }
    for (const f of this.finishes.values()) f.dispose();
    for (const f of this.flats.values()) f.dispose();
    this.hazardTexture?.dispose();
    for (const t of this.scanLoaded) this.free(t);
    this.scanLoaded = [];
    this.ktx2Loader?.dispose();
    this.ktx2Loader = null;
    this.presets.clear(); this.paints.clear(); this.specials.clear(); this.patterns.clear(); this.finishes.clear(); this.flats.clear();
  }
}
