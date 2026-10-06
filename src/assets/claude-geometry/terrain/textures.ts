import { hash3, mulberry32, tileFbm2, tileNoise2 } from '../core/noise.ts';
import { normalFromHeight } from '../style/textures.ts';

// Natural detail maps for terrain, rocks and plants. The shared library only
// has man-made patterns (panels, tread plate, concrete), so terrain makes its
// own with the same helpers and conventions: tileable height fields from
// src/core/noise.ts, tangent-space normals from normalFromHeight (OpenGL
// convention), generated at the LOD texture size. Each map packs the normal
// in RGB and the height in A, so one fetch gives both the bump and a cavity
// value for darkening crevices.

export type DetailName = 'rock' | 'grain' | 'turf' | 'ripple' | 'ice' | 'foliage' | 'bark';
export const DETAIL_NAMES: DetailName[] = ['rock', 'grain', 'turf', 'ripple', 'ice', 'foliage', 'bark'];

/** World metres covered by one repeat of each map. */
export const DETAIL_METRES: Record<DetailName, number> = { rock: 1.6, grain: 0.7, turf: 0.45, ripple: 2.4, ice: 3.4, foliage: 0.35, bark: 0.4 };

const STRENGTH: Record<DetailName, number> = { rock: 7, grain: 3.2, turf: 4.5, ripple: 2.2, ice: 3.5, foliage: 4, bark: 6 };
const frac = (x: number) => x - Math.floor(x);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Tileable distance to the nearest and second-nearest jittered cell centre (for cracks). */
function cells(u: number, v: number, period: number, seed: number): [number, number] {
  const x = u * period, y = v * period, ix = Math.floor(x), iy = Math.floor(y);
  let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j;
    const wx = ((cx % period) + period) % period, wy = ((cy % period) + period) % period;
    const px = cx + 0.15 + 0.7 * (hash3(wx, wy, 1, seed) / 4294967296), py = cy + 0.15 + 0.7 * (hash3(wx, wy, 2, seed) / 4294967296);
    const d = Math.hypot(x - px, y - py);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return [d1, d2];
}

export function detailHeight(name: DetailName, size: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    let h = 0;
    switch (name) {
      case 'rock': {
        // Fractured rock: broad lumps, sharp ridges, a crack network and grit.
        const lumps = tileFbm2(u, v, 3, seed, 5);
        const ridge = 1 - Math.abs(tileFbm2(u, v, 5, seed + 1, 4) * 2 - 1);
        const [d1, d2] = cells(u, v, 4, seed + 2);
        // Joints: a sparse fracture network, broken up so it never reads as tiles.
        const crack = (1 - smooth(0.0, 0.05, d2 - d1)) * smooth(0.35, 0.6, tileFbm2(u, v, 6, seed + 17, 3));
        h = 0.5 * lumps + 0.4 * ridge * ridge - 0.22 * crack + 0.08 * tileNoise2(u * 96, v * 96, 96, seed + 3);
        break;
      }
      case 'grain': {
        // Sand or snow: wind ripples (asymmetric, wandering) over fine grain.
        const wander = tileFbm2(u, v, 4, seed, 3);
        const s = frac(v * 14 + wander * 1.6);
        const ripple = s < 0.7 ? s / 0.7 : (1 - s) / 0.3;
        h = 0.45 * smooth(0, 1, ripple) * (0.6 + 0.4 * tileFbm2(u, v, 2, seed + 4, 2)) + 0.35 * tileNoise2(u * 128, v * 128, 128, seed + 5) + 0.2 * tileFbm2(u, v, 16, seed + 6, 3);
        break;
      }
      case 'turf': {
        // Grass and moss: dense tufts with dark gaps, a slight lay in one direction.
        const [t1] = cells(u, v, 18, seed + 18);
        const [t2] = cells(u, v, 41, seed + 19);
        h = 0.45 * (1 - smooth(0.05, 0.7, t1)) + 0.3 * (1 - smooth(0.05, 0.7, t2)) + 0.25 * tileNoise2(u * 128, v * 32, 32, seed + 20);
        break;
      }
      case 'ripple': h = tileFbm2(u, v, 3, seed, 4) * 0.7 + tileFbm2(u, v, 9, seed + 1, 3) * 0.3; break;
      case 'ice': {
        // Sea ice: wandering pressure ridges (sharp crests of a warped fbm),
        // a few dark refrozen leads, and frost. No cell pattern, so it never
        // reads as tiles or crackle glaze.
        const w = tileFbm2(u, v, 3, seed + 23, 3);
        const ridgeA = 1 - Math.abs(tileFbm2(u + 0.15 * w, v, 4, seed + 7, 4) * 2 - 1);
        const ridgeB = 1 - Math.abs(tileFbm2(u, v + 0.15 * w, 7, seed + 8, 3) * 2 - 1);
        const ridges = ridgeA ** 10 * 0.8 + ridgeB ** 14 * 0.45;
        const leadField = Math.abs(tileFbm2(u * 1 + 0.2 * w, v, 2, seed + 24, 3) - 0.5);
        const lead = (1 - smooth(0.0, 0.012, leadField)) * smooth(0.45, 0.6, tileFbm2(u, v, 3, seed + 25, 2));
        h = 0.45 + 0.4 * ridges - 0.3 * lead + 0.12 * tileFbm2(u, v, 9, seed + 9, 4) + 0.04 * tileNoise2(u * 128, v * 128, 128, seed + 10);
        break;
      }
      case 'foliage': {
        // Clumped leaves and needles: cell bumps with dark gaps between them.
        const [d1] = cells(u, v, 14, seed + 11);
        const [f1] = cells(u, v, 37, seed + 12);
        h = 0.45 * (1 - smooth(0.1, 0.8, d1)) + 0.4 * (1 - smooth(0.05, 0.75, f1)) + 0.15 * tileNoise2(u * 128, v * 128, 128, seed + 13);
        break;
      }
      case 'bark': {
        // Vertical furrows broken into plates.
        const wander = tileFbm2(u, v, 3, seed + 14, 3);
        const furrow = 1 - Math.abs(frac(u * 7 + wander * 0.8) * 2 - 1);
        const plates = tileNoise2(u * 7, v * 21, 7, seed + 15);
        h = 0.6 * smooth(0.15, 0.6, furrow) * (0.7 + 0.3 * plates) + 0.15 * tileNoise2(u * 64, v * 64, 64, seed + 16);
        break;
      }
    }
    out[y * size + x] = h;
  }
  return out;
}

/** RGB = tangent-space normal, A = height normalised to 0–255. */
export function detailMap(name: DetailName, size: number, seed = 31): Uint8Array {
  const height = detailHeight(name, size, seed);
  const data = normalFromHeight(height, size, STRENGTH[name]);
  let lo = Infinity, hi = -Infinity;
  for (const h of height) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
  const span = Math.max(1e-6, hi - lo);
  for (let i = 0; i < height.length; i++) data[i * 4 + 3] = Math.round((height[i] - lo) / span * 255);
  return data;
}

export type CardName = 'leaf' | 'needle';

/**
 * Foliage card: a cluster of small leaves (or needle sprays) on twigs, RGBA.
 * RGB is a brightness and hue jitter that the per-instance tint multiplies; A
 * is coverage. Leaves are densest in the middle and thin out towards the
 * rim, so the averaged mip levels fall off radially too: with alpha to
 * coverage a distant card becomes a soft round clump, never a square.
 * Transparent texels carry the mean leaf colour, so mips do not darken at
 * the leaf edges.
 */
export function foliageCard(name: CardName, size: number, seed = 61): Uint8Array {
  const rgb = new Float32Array(size * size * 3), alpha = new Float32Array(size * size);
  const rand = mulberry32(seed);
  const paint = (cx: number, cy: number, reach: number, shade: (u: number, v: number) => { a: number; k: number; hue: number } | null) => {
    const x0 = Math.max(0, Math.floor((cx - reach) * size)), x1 = Math.min(size - 1, Math.ceil((cx + reach) * size));
    const y0 = Math.max(0, Math.floor((cy - reach) * size)), y1 = Math.min(size - 1, Math.ceil((cy + reach) * size));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const s = shade((x + 0.5) / size - cx, (y + 0.5) / size - cy);
      if (!s || s.a <= 0) continue;
      const i = y * size + x, a = Math.min(1, s.a);
      const r = s.k * (1 + 0.08 * s.hue), g = s.k, b = s.k * (1 - 0.18 * s.hue);
      rgb[i * 3] += (r - rgb[i * 3]) * a; rgb[i * 3 + 1] += (g - rgb[i * 3 + 1]) * a; rgb[i * 3 + 2] += (b - rgb[i * 3 + 2]) * a;
      alpha[i] = Math.max(alpha[i], a);
    }
  };
  const px = 1 / size;
  // Twigs: a few dark strokes from near the centre outwards.
  const twigs: [number, number, number, number][] = [];
  for (let t = 0; t < 7; t++) {
    const a = t / 7 * Math.PI * 2 + rand() * 0.6, len = 0.24 + rand() * 0.16;
    twigs.push([0.5 + Math.cos(a) * 0.04, 0.5 + Math.sin(a) * 0.04, Math.cos(a) * len, Math.sin(a) * len]);
  }
  for (const [x, y, dx, dy] of twigs) {
    const l = Math.hypot(dx, dy), w = 1.6 * px;
    paint(x + dx / 2, y + dy / 2, l / 2 + w * 2, (u, v) => {
      const t = Math.max(-0.5, Math.min(0.5, (u * dx + v * dy) / (l * l)));
      const d = Math.hypot(u - t * dx, v - t * dy);
      return d < w * (1.2 - t) ? { a: 1, k: 0.32, hue: 0.6 } : null;
    });
  }
  // Leaves or needle sprays: some along the twigs, the rest filling the
  // disc, thinning towards the rim.
  const count = name === 'leaf' ? 720 : 300;
  for (let n = 0; n < count; n++) {
    let cx: number, cy: number, angle: number;
    if (rand() < 0.4) {
      const twig = twigs[Math.floor(rand() * twigs.length)], along = Math.sqrt(rand());
      cx = twig[0] + twig[2] * along + (rand() - 0.5) * 0.05; cy = twig[1] + twig[3] * along + (rand() - 0.5) * 0.05;
      angle = Math.atan2(twig[3], twig[2]) + (rand() - 0.5) * 1.8;
    } else {
      const a = rand() * Math.PI * 2, rr = 0.43 * Math.sqrt(rand());
      cx = 0.5 + Math.cos(a) * rr; cy = 0.5 + Math.sin(a) * rr;
      angle = a + (rand() - 0.5) * 2.2;
    }
    const r = Math.hypot(cx - 0.5, cy - 0.5);
    if (r > 0.44 || rand() < (r / 0.44) ** 2 * 0.85) continue;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const k = 0.6 + 0.4 * rand(), hue = rand() * 1.4 - 0.4;
    if (name === 'leaf') {
      const L = 0.026 + 0.02 * rand(), W = L * (0.4 + 0.14 * rand());
      paint(cx, cy, L, (u, v) => {
        const a = (u * ca + v * sa) / L, b = (-u * sa + v * ca) / W;   // a along the leaf, -1..1
        if (a < -1 || a > 1) return null;
        const half = Math.pow(Math.max(0, 1 - a * a), 0.65) * (a > 0 ? 1 - 0.35 * a : 1);
        const e = Math.abs(b) / Math.max(1e-6, half);
        if (e > 1) return null;
        // Darker towards the stalk and the rim, a lighter midrib.
        const shade = k * (0.78 + 0.22 * (a + 1) / 2) * (1 - 0.25 * e * e) * (Math.abs(b) < 0.08 ? 1.1 : 1);
        return { a: Math.min(1, (1 - e) * W * size * 0.9), k: shade, hue };
      });
    } else {
      // A short, dense spray of needles fanning from one point.
      const L = 0.05 + 0.035 * rand();
      for (let j = 0; j < 11; j++) {
        const aj = angle + (j - 5) * 0.12, cj = Math.cos(aj), sj = Math.sin(aj), w = 1.1 * px;
        paint(cx + cj * L / 2, cy + sj * L / 2, L / 2 + 2 * px, (u, v) => {
          const t = (u * cj + v * sj) / L;
          if (t < -0.5 || t > 0.5) return null;
          const d = Math.abs(-u * sj + v * cj);
          return d < w ? { a: 1, k: k * (0.75 + 0.25 * (t + 0.5)), hue } : null;
        });
      }
    }
  }
  // Pack, filling transparent texels with the mean visible colour.
  let mr = 0, mg = 0, mb = 0, mn = 0;
  for (let i = 0; i < size * size; i++) if (alpha[i] > 0.5) { mr += rgb[i * 3]; mg += rgb[i * 3 + 1]; mb += rgb[i * 3 + 2]; mn++; }
  mn = Math.max(1, mn); mr /= mn; mg /= mn; mb /= mn;
  const out = new Uint8Array(size * size * 4);
  const enc = (lin: number) => Math.round(Math.min(1, Math.max(0, lin <= 0.0031308 ? lin * 12.92 : 1.055 * lin ** (1 / 2.4) - 0.055)) * 255);
  for (let i = 0; i < size * size; i++) {
    const a = alpha[i];
    const f = Math.min(1, a * 2);
    out[i * 4] = enc(mr + (rgb[i * 3] - mr) * f); out[i * 4 + 1] = enc(mg + (rgb[i * 3 + 1] - mg) * f); out[i * 4 + 2] = enc(mb + (rgb[i * 3 + 2] - mb) * f);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}
