import * as T from 'three';
import { mulberry32, tileFbm2, tileNoise2 } from '../core/noise.ts';

// Procedural surface maps, generated in code at load time. Each pattern is a
// tileable height field that covers SCALE.textureMetres (2 m) per repeat, so
// seams line up with the 1 m module grid when UVs are in metres.
//
// From one height field we derive a tangent-space normal map (OpenGL
// convention, as three.js expects) and an albedo multiplier that darkens
// seams and adds grime streaks. Finishes add a packed map: R = cavity
// occlusion, G = roughness, B = metalness (three reads G and B).

export type PatternName = 'panel' | 'hull' | 'corrugated' | 'deck' | 'concrete' | 'brushed' | 'plain';
export type FinishName = 'paint' | 'metal' | 'concrete' | 'rubber';
export const PATTERNS: PatternName[] = ['panel', 'hull', 'corrugated', 'deck', 'concrete', 'brushed', 'plain'];

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const frac = (x: number) => x - Math.floor(x);

interface PanelSpec { cols: number; rows: number; seam: number; stagger: boolean; rivets: number; hatches: number }
function panelHeight(u: number, v: number, spec: PanelSpec, seed: number, rnd: (i: number, j: number) => number) {
  const row = Math.floor(v * spec.rows);
  const shift = spec.stagger && row % 2 ? 0.5 : 0;
  const cu = u * spec.cols + shift, cv = v * spec.rows;
  const col = Math.floor(cu);
  const pu = frac(cu), pv = frac(cv);
  // Distance to the panel edge in UV units (aspect-correct).
  const du = Math.min(pu, 1 - pu) / spec.cols, dv = Math.min(pv, 1 - pv) / spec.rows;
  const d = Math.min(du, dv);
  let h = smooth(spec.seam * 0.35, spec.seam * 1.6, d);
  // Slightly different panel heights read as separately fixed plates.
  h = h * (0.94 + 0.06 * rnd(col % spec.cols, row));
  // Occasional access hatch: an inset groove inside the panel.
  if (spec.hatches > 0 && rnd(col % spec.cols + 17, row + 5) < spec.hatches) {
    const iu = Math.abs(pu - 0.5) * 2, iv = Math.abs(pv - 0.5) * 2;
    const edge = Math.max(iu, iv);
    h -= 0.35 * (1 - smooth(0.0, 0.02, Math.abs(edge - 0.62) / 3));
  }
  // Rivet rows along vertical seams.
  if (spec.rivets > 0) {
    const inset = spec.seam * 3.2;
    for (const side of [inset, 1 / spec.cols - inset]) {
      const ru = (pu / spec.cols) - side;
      const step = 1 / (spec.rows * spec.rivets);
      const rv = (v % step) - step / 2;
      const r = Math.hypot(ru, rv);
      h += 0.22 * (1 - smooth(spec.seam * 0.25, spec.seam * 0.85, r));
    }
  }
  return h + (tileFbm2(u, v, 8, seed) - 0.5) * 0.04;
}

/** Height field in [≈0, ≈1.5] for a pattern; row 0 is v = 0. */
export function patternHeight(pattern: PatternName, size: number, seed = 1): Float32Array {
  const out = new Float32Array(size * size);
  const rng = mulberry32(seed);
  const table = Array.from({ length: 64 * 64 }, () => rng());
  const rnd = (i: number, j: number) => table[((i & 63) * 64 + (j & 63))];
  const pits = pattern === 'concrete' ? Array.from({ length: 140 }, () => [rng(), rng(), 0.002 + rng() * 0.006] as const) : [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    let h = 1;
    switch (pattern) {
      case 'panel': h = panelHeight(u, v, { cols: 2, rows: 4, seam: 0.0045, stagger: false, rivets: 2, hatches: 0 }, seed, rnd); break;
      case 'hull': h = panelHeight(u, v, { cols: 6, rows: 5, seam: 0.0028, stagger: true, rivets: 0, hatches: 0.16 }, seed, rnd); break;
      case 'corrugated': {
        // Trapezoidal sheet profile, 0.1 m pitch.
        const p = frac(u * 20);
        h = 0.5 + 0.5 * smooth(0.1, 0.35, p) * (1 - smooth(0.6, 0.85, p)) + (tileFbm2(u, v, 6, seed) - 0.5) * 0.03;
        break;
      }
      case 'deck': {
        // Raised lozenges in alternating directions (tread plate).
        const gu = u * 40, gv = v * 40, cu = Math.floor(gu), cv = Math.floor(gv);
        const lu = frac(gu) - 0.5, lv = frac(gv) - 0.5;
        const flip = (cu + cv) % 2 === 0;
        const a = flip ? lu + lv : lu - lv, b = flip ? lu - lv : lu + lv;
        const lozenge = (a * a) / 0.09 + (b * b) / 0.006;
        h = 0.4 + 0.6 * (1 - smooth(0.6, 1.0, lozenge)) + (tileFbm2(u, v, 8, seed) - 0.5) * 0.05;
        break;
      }
      case 'concrete': {
        h = 0.8 + (tileFbm2(u, v, 6, seed) - 0.5) * 0.18 + (tileNoise2(u * 96, v * 96, 96, seed + 3) - 0.5) * 0.05;
        // Precast joint around the tile and form-tie holes on a 0.5 m grid.
        const edge = Math.min(u, 1 - u, v, 1 - v);
        h -= 0.5 * (1 - smooth(0.002, 0.007, edge));
        const tu = frac(u * 4) - 0.5, tv = frac(v * 4) - 0.5;
        h -= 0.45 * (1 - smooth(0.006, 0.011, Math.hypot(tu / 4, tv / 4)));
        for (const [pu, pv, r] of pits) {
          const dx = Math.min(Math.abs(u - pu), 1 - Math.abs(u - pu)), dy = Math.min(Math.abs(v - pv), 1 - Math.abs(v - pv));
          const d = Math.hypot(dx, dy);
          if (d < r) h -= 0.25 * (1 - d / r);
        }
        break;
      }
      case 'brushed': h = 0.5 + (tileNoise2(u * 3, v * 380, 380, seed) - 0.5) * 0.25 + (tileFbm2(u, v, 4, seed) - 0.5) * 0.04; break;
      case 'plain': h = 0.5 + (tileFbm2(u, v, 10, seed) - 0.5) * 0.03; break;
    }
    out[y * size + x] = h;
  }
  return out;
}

const STRENGTH: Record<PatternName, number> = { panel: 7, hull: 6, corrugated: 4, deck: 3.2, concrete: 4, brushed: 1.2, plain: 1.5 };

/** Tangent-space normal map from a tileable height field (wraps at edges). */
export function normalFromHeight(height: Float32Array, size: number, strength: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  // Scale so `strength` is independent of resolution.
  const k = strength * size / 256;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    out[i] = Math.round((-dx / l * 0.5 + 0.5) * 255);
    out[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
    out[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
    out[i + 3] = 255;
  }
  return out;
}

/** Albedo multiplier: darker seams and cavities, downward grime streaks, faint mottling. */
export function grimeAlbedo(height: Float32Array, size: number, seed = 7): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  let lo = Infinity, hi = -Infinity;
  for (const h of height) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    // Depth below the top surface, over at least 0.5 height units: a near-flat
    // pattern ('plain') stays clean instead of having its faint noise stretched
    // into dark cavity clouds, while real seams and pits still darken.
    const h = 1 - (hi - height[y * size + x]) / Math.max(0.5, hi - lo);
    const cavity = smooth(0.0, 0.55, h);
    const mottle = tileFbm2(u, v, 5, seed);
    const streak = tileNoise2(u * 48, v * 2, 48, seed + 11) * tileFbm2(u, v, 3, seed + 5);
    let g = 0.72 + 0.28 * cavity;
    g *= 0.9 + 0.1 * mottle;
    g *= 1 - 0.16 * smooth(0.35, 0.8, streak);
    const i = (y * size + x) * 4;
    // A slight warm cast in the grime keeps it from reading as flat grey.
    out[i] = Math.round(Math.min(1, g * 1.0) * 255);
    out[i + 1] = Math.round(Math.min(1, g * 0.985) * 255);
    out[i + 2] = Math.round(Math.min(1, g * 0.96) * 255);
    out[i + 3] = 255;
  }
  return out;
}

/** Packed cavity/roughness/metalness for a finish. Paint wears through to metal in chips. */
export function finishMap(finish: FinishName, size: number, seed = 3): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    const n = tileFbm2(u, v, 6, seed), fine = tileNoise2(u * 64, v * 64, 64, seed + 9);
    let rough = 0.5, metal = 0;
    switch (finish) {
      case 'paint': {
        // Satin paint: broad roughness drift plus fine handling scratches that
        // read only in a highlight. No random chip blotches; without real edge
        // masks they look like dirt splashes rather than wear.
        const scratch = smooth(0.965, 0.99, tileNoise2(u * 3, v * 220, 220, seed + 31)) * smooth(0.55, 0.75, n);
        rough = 0.5 + 0.16 * n + 0.04 * fine - 0.22 * scratch; metal = 0.06 + 0.5 * scratch;
        break;
      }
      case 'metal': rough = 0.26 + 0.22 * n + 0.05 * fine; metal = 1; break;
      case 'concrete': rough = 0.82 + 0.14 * n; metal = 0; break;
      case 'rubber': rough = 0.78 + 0.12 * n; metal = 0; break;
    }
    const i = (y * size + x) * 4;
    out[i] = 255;
    out[i + 1] = Math.round(Math.min(1, Math.max(0.04, rough)) * 255);
    out[i + 2] = Math.round(Math.min(1, Math.max(0, metal)) * 255);
    out[i + 3] = 255;
  }
  return out;
}

export function makeDataTexture(data: Uint8Array, size: number, srgb: boolean): T.DataTexture {
  const t = new T.DataTexture(data, size, size, T.RGBAFormat, T.UnsignedByteType);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export interface PatternTextures { normal: T.DataTexture; albedo: T.DataTexture }
export function patternTextures(pattern: PatternName, size: number, seed = 1): PatternTextures {
  const height = patternHeight(pattern, size, seed);
  return {
    normal: makeDataTexture(normalFromHeight(height, size, STRENGTH[pattern]), size, false),
    albedo: makeDataTexture(grimeAlbedo(height, size, seed + 100), size, true),
  };
}
