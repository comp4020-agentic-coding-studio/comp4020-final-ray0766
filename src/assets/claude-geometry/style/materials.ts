import * as T from 'three';
import { markShared } from '../core/dispose.ts';
import { LOD } from './lod.ts';
import type { LodTier } from './lod.ts';
import { finishMap, makeDataTexture, patternTextures } from './textures.ts';
import type { FinishName, PatternName, PatternTextures } from './textures.ts';
import { GLOW, PALETTE } from './tokens.ts';

// The material vocabulary every module draws from. A StyleLibrary owns its
// textures and preset materials (all marked shared, freed by library.dispose()).
// Custom paint colours are reference-counted leases so cycling through colours
// in a workshop never accumulates materials. Glow materials are created per
// model, because thrust and status lights animate their intensity.

export interface SurfaceRecipe {
  finish: FinishName;
  pattern: PatternName;
  color: string;
  /** Strength of the normal map (1 = as generated). */
  relief?: number;
  envIntensity?: number;
}

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
  private anisotropy = 1;
  private disposed = false;

  constructor(lod: LodTier = 'high') { this.lod = lod; }

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

  private build(recipe: SurfaceRecipe): T.MeshStandardMaterial {
    const p = this.pattern(recipe.pattern), orm = this.finish(recipe.finish);
    const relief = recipe.relief ?? 1;
    return new T.MeshStandardMaterial({
      color: recipe.color,
      map: p.albedo,
      normalMap: p.normal,
      normalScale: new T.Vector2(relief, relief),
      roughnessMap: orm, metalnessMap: orm,
      roughness: 1, metalness: 1,
      envMapIntensity: recipe.envIntensity ?? 1,
    });
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
    if (!m) { m = markShared(this.build(recipe)); m.name = id; this.presets.set(id, m); }
    return m;
  }

  /** A permanent shared material. */
  preset(name: PresetName): T.MeshStandardMaterial {
    this.alive();
    let m = this.presets.get(name);
    if (!m) { m = markShared(this.build(PRESETS[name])); m.name = name; this.presets.set(name, m); }
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
      entry = { material: markShared(this.build({ finish, pattern, color, relief, envIntensity: env })), refs: 0 };
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

  /** Clear or tinted glass with a faint smudge in its roughness. Shared. */
  glass(tint: 'clear' | 'smoked' = 'clear'): T.MeshPhysicalMaterial {
    return this.special(`glass:${tint}`, () => new T.MeshPhysicalMaterial({
      color: tint === 'clear' ? PALETTE.glass : '#2e3a40',
      metalness: 0, roughness: 0.08,
      roughnessMap: this.finish('rubber'),
      transparent: true, opacity: tint === 'clear' ? 0.3 : 0.55,
      envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: 0.06,
      ior: 1.5, depthWrite: false,
    })) as T.MeshPhysicalMaterial;
  }

  /** Diagonal hazard striping for door frames, stair nosings and landing gear. Shared. */
  hazard(): T.MeshStandardMaterial {
    return this.special('hazard', () => {
      const size = LOD[this.lod].textureSize;
      const data = new Uint8Array(size * size * 4);
      // Stored as sRGB bytes, so take the hex channels directly.
      const bytes = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      const amber = bytes(PALETTE.amber), dark = bytes(PALETTE.graphite);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const c = Math.floor(((x + y) / size) * 8) % 2 === 0 ? amber : dark;
        const i = (y * size + x) * 4;
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
      }
      this.hazardTexture = markShared(makeDataTexture(data, size, true));
      return new T.MeshStandardMaterial({ map: this.hazardTexture, normalMap: this.pattern('plain').normal, roughnessMap: this.finish('paint'), metalnessMap: this.finish('paint'), roughness: 1, metalness: 1 });
    }) as T.MeshStandardMaterial;
  }

  /**
   * A glow material owned by the caller (not shared): its intensity animates per
   * model. Dark base colour so unlit it reads as a lens, not a painted stripe.
   */
  createGlow(color: string = PALETTE.sodium, intensity: number = GLOW.lit): T.MeshStandardMaterial {
    return new T.MeshStandardMaterial({ color: '#15171a', emissive: color, emissiveIntensity: intensity, roughness: 0.35, metalness: 0 });
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
    return { presets: this.presets.size, paints: this.paints.size, specials: this.specials.size, textures: this.patterns.size * 2 + this.finishes.size + (this.hazardTexture ? 1 : 0) };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const m of this.presets.values()) m.dispose();
    for (const e of this.paints.values()) e.material.dispose();
    for (const m of this.specials.values()) m.dispose();
    for (const p of this.patterns.values()) { p.normal.dispose(); p.albedo.dispose(); }
    for (const f of this.finishes.values()) f.dispose();
    this.hazardTexture?.dispose();
    this.presets.clear(); this.paints.clear(); this.specials.clear(); this.patterns.clear(); this.finishes.clear();
  }
}
