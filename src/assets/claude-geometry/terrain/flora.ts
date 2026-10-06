import * as T from 'three';
import { PLANET_RADIUS, SPAWN_DIR } from '../core/anchor.ts';
import { hash3, hashString, mulberry32 } from '../core/noise.ts';
import type { Vec3 } from '../core/vec.ts';
import { PartBuilder } from '../style/geometry.ts';
import type { LodTier } from '../style/lod.ts';
import { LANDING_RADIUS } from './field.ts';
import type { TerrainField } from './field.ts';
import { icosphere } from './icosphere.ts';
import type { FloraMaterialName, TerrainKit } from './kit.ts';
import { chord2, layerSeed } from './styles/program.ts';
import type { FloraKind, FloraRule } from './styles/program.ts';

// Plants and loose rocks. Each kind is one reference model, 1 m tall with its
// base at y = 0, built with PartBuilder so its pieces merge per material and
// carry metre UVs like every other kit. A planet draws each (kind, material)
// pair as one InstancedMesh; instances are placed deterministically from the
// environment seed, so the same planet always grows the same plants, and a
// lower LOD shows a prefix of the same placement sequence.

/** Highest point any plant may reach above PLANET_RADIUS, kept well under the 13 m flight radius. */
export const FLORA_CEILING = 2.6;
/** Extra clearance kept between plants and the landing zone edge. */
export const LANDING_MARGIN = 0.35;

interface Piece { material: FloraMaterialName; geometry: T.BufferGeometry }

/** Indexed sphere blob with seeded lumps; smooth normals for foliage, flat for rock. */
function blob(level: number, seed: number, lumpiness: number, flat: boolean): T.BufferGeometry {
  const ico = icosphere(level);
  const lv = ico.levels[level];
  const pos = new Float32Array(lv.vertices * 3);
  for (let i = 0; i < lv.vertices; i++) {
    const x = ico.dirs[i * 3], y = ico.dirs[i * 3 + 1], z = ico.dirs[i * 3 + 2];
    const k = 1 + lumpiness * ((hash3(i, level, 3, seed) / 4294967296) * 2 - 1);
    pos[i * 3] = x * k; pos[i * 3 + 1] = y * k; pos[i * 3 + 2] = z * k;
  }
  let g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setIndex(new T.BufferAttribute(new Uint32Array(lv.indices), 1));
  if (flat) { const flatG = g.toNonIndexed(); g.dispose(); g = flatG; }
  g.computeVertexNormals();
  return g;
}

/** Flat-shaded triangles from a list of corner triples. */
function triangles(tris: Vec3[][]): T.BufferGeometry {
  const p = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((v, k) => p.set(v, i * 9 + k * 3)));
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

/** Fit a model so its base is at y = 0 and its top at y = 1, keeping proportions. */
function normaliseHeight(group: T.Group) {
  const box = new T.Box3().setFromObject(group);
  const k = 1 / (box.max.y - box.min.y);
  for (const child of group.children) {
    const g = (child as T.Mesh).geometry;
    g.translate(0, -box.min.y, 0);
    g.scale(k, k, k);
    g.computeBoundingBox(); g.computeBoundingSphere();
  }
}

/**
 * A clump of foliage drawn as crossed cards. `flat` 0 stands the cards up
 * around a vertical axis (a round clump); 1 lays them into a flat pad, the
 * way pine foliage grows in layers. Card normals point away from `crown`, so
 * the whole crown shades as one volume.
 */
interface Clump { centre: Vec3; radius: number; flat: number; crown: Vec3 }

const cardsPerClump = (lod: LodTier) => (lod === 'low' ? 2 : 3);

/** Non-indexed card quads with UVs 0–1 (turned and mirrored per card, never wrapped) and crown normals. */
function cardGeometry(clumps: Clump[], lod: LodTier, seed: number): T.BufferGeometry {
  const rnd = mulberry32(seed), n = cardsPerClump(lod);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const UV: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const c of clumps) {
    for (let k = 0; k < n; k++) {
      const yaw = (k / n) * Math.PI + rnd() * 0.6;
      const a: Vec3 = [Math.cos(yaw), 0, Math.sin(yaw)];
      // Second in-plane axis: up for an upright card, horizontal for a pad; the first card of a pad lies flat.
      const lie = c.flat * (k === 0 ? 1 : 0.7) + (1 - c.flat) * rnd() * 0.35;
      const bx = -Math.sin(yaw) * lie, by = 1 - lie, bz = Math.cos(yaw) * lie, bl = Math.hypot(bx, by, bz);
      const bv: Vec3 = [bx / bl, by / bl, bz / bl];
      const r = c.radius, rb = r * (0.85 + 0.3 * rnd());
      const corners: Vec3[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [c.centre[0] + a[0] * r * s + bv[0] * rb * t, c.centre[1] + a[1] * r * s + bv[1] * rb * t, c.centre[2] + a[2] * r * s + bv[2] * rb * t]);
      const turn = Math.floor(rnd() * 4), mirror = rnd() < 0.5;
      const cuv = UV.map((_, i) => { const q = UV[(i + turn) % 4]; return [mirror ? 1 - q[0] : q[0], q[1]] as [number, number]; });
      const up = 0.35 + 0.3 * c.flat;
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const v = corners[i];
        const d: Vec3 = [v[0] - c.crown[0], v[1] - c.crown[1], v[2] - c.crown[2]];
        const dl = Math.hypot(...d) || 1;
        const nx = d[0] / dl * (1 - up), ny = d[1] / dl * (1 - up) + up, nz = d[2] / dl * (1 - up), nl = Math.hypot(nx, ny, nz);
        pos.push(...v); nor.push(nx / nl, ny / nl, nz / nl); uv.push(...cuv[i]);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  return g;
}

const Y_AXIS = new T.Vector3(0, 1, 0);
/** A tapered branch from `from` along unit `dir`; returns its tip. */
function limb(b: PartBuilder, material: T.Material, from: Vec3, dir: Vec3, length: number, r0: number, r1: number, segments: number): Vec3 {
  const e = new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(Y_AXIS, new T.Vector3(...dir)));
  b.cylinder(material, r1, r0, length, { position: [from[0] + dir[0] * length / 2, from[1] + dir[1] * length / 2, from[2] + dir[2] * length / 2], rotation: [e.x, e.y, e.z] }, { segments });
  return [from[0] + dir[0] * length, from[1] + dir[1] * length, from[2] + dir[2] * length];
}
const unitV = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
/** Unit direction from an azimuth and a tilt away from vertical. */
const tilted = (azimuth: number, tilt: number): Vec3 => [Math.sin(tilt) * Math.cos(azimuth), Math.cos(tilt), Math.sin(tilt) * Math.sin(azimuth)];

interface MakerContext { leaves: Clump[]; card: 'leafCard' | 'needleCard' }
type Maker = (b: PartBuilder, m: (n: FloraMaterialName) => T.Material, lod: LodTier, ctx: MakerContext) => void;

const MAKERS: Record<FloraKind, Maker> = {
  boulder(b, m, lod) {
    // Fractured boulder: lumpy, squat, flat-bottomed, faceted like split rock.
    const g = blob(lod === 'low' ? 0 : 1, 101, 0.3, true);
    const p = g.getAttribute('position') as T.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, Math.max(-0.3, p.getY(i)) * 0.6);
    g.computeVertexNormals();
    b.geometry(m('rock'), g, { scale: [0.75, 1, 0.62] });
  },
  shrub(b, m, lod, ctx) {
    // Low heath or gorse clump: short woody stems under a mound of leafy sprays.
    if (lod !== 'low') for (const [az, tilt] of [[0.4, 0.5], [2.4, 0.6], [4.3, 0.45]]) limb(b, m('bark'), [0, 0, 0], tilted(az, tilt), 0.3, 0.02, 0.01, 4);
    const crown: Vec3 = [0, 0.22, 0];
    const clumps: [number, number, number, number][] = [[0, 0.5, 0, 0.3], [0.26, 0.36, 0.1, 0.26], [-0.24, 0.35, -0.13, 0.26], [0.05, 0.33, -0.28, 0.23], [-0.1, 0.38, 0.26, 0.24], [0.2, 0.28, -0.2, 0.2]];
    for (const [x, y, z, r] of lod === 'low' ? clumps.slice(0, 3) : clumps) ctx.leaves.push({ centre: [x, y, z], radius: r, flat: 0.15, crown });
  },
  cypress(b, m, lod, ctx) {
    // Windswept coastal pine: a leaning, kinked trunk carrying flat layered
    // pads of needles that stream leeward (+X), the shape salt wind gives
    // trees on sea cliffs. Branches reach into every pad.
    ctx.card = 'needleCard';
    const seg = lod === 'low' ? 5 : 7, bark = m('bark');
    let p = limb(b, bark, [0, 0, 0], unitV([0.12, 1, 0]), 0.36, 0.062, 0.042, seg);
    p = limb(b, bark, p, unitV([0.45, 1, 0.02]), 0.3, 0.042, 0.03, seg);
    const top = limb(b, bark, p, unitV([1, 0.7, 0.05]), 0.26, 0.03, 0.018, Math.max(4, seg - 2));
    // [x, y, z, radius] of each pad; a branch runs from the trunk to each.
    const pads: [number, number, number, number][] = [
      [top[0] + 0.06, top[1] + 0.05, top[2], 0.26], [0.16, 0.8, -0.04, 0.24], [0.52, 0.78, 0.1, 0.19],
      [-0.06, 0.62, -0.1, 0.19], [0.28, 0.98, -0.06, 0.19], [0.22, 0.6, 0.16, 0.16], [0.42, 0.68, -0.14, 0.15],
    ];
    const used = lod === 'low' ? pads.slice(0, 3) : lod === 'medium' ? pads.slice(0, 5) : pads;
    used.forEach(([x, y, z, r], i) => {
      if (i > 0 && lod !== 'low') {
        const from: Vec3 = [p[0] * 0.7, Math.min(y - 0.08, p[1]), p[2] * 0.7];
        const to: Vec3 = [x - from[0], y - 0.03 - from[1], z - from[2]];
        limb(b, bark, from, unitV(to), Math.hypot(...to), 0.016, 0.008, 4);
      }
      ctx.leaves.push({ centre: [x, y, z], radius: r, flat: 1, crown: [x, y - 0.12, z] });
    });
  },
  spruce(b, m, lod) {
    // Dark spruce: a thin trunk under drooping star-shaped tiers of branches.
    const tiers = lod === 'low' ? 4 : lod === 'medium' ? 5 : 6;
    const arms = lod === 'low' ? 7 : 9;
    b.cylinder(m('bark'), 0.012, 0.035, 0.5, { position: [0, 0.25, 0] }, { segments: lod === 'low' ? 4 : 6 });
    const tris: Vec3[][] = [];
    for (let t = 0; t < tiers; t++) {
      const f = t / tiers;
      const y = 0.16 + f * 0.74, R = 0.3 * (1 - f) + 0.05, H = 0.24 * (1 - 0.4 * f);
      const twist = t * 0.37;
      const apex: Vec3 = [0, y + H, 0], under: Vec3 = [0, y + H * 0.15, 0];
      const ring: Vec3[] = [];
      for (let k = 0; k < arms * 2; k++) {
        const a = twist + k / (arms * 2) * Math.PI * 2;
        const tip = k % 2 === 0, r = tip ? R : R * 0.56;
        ring.push([Math.cos(a) * r, y - (tip ? H * 0.22 : -H * 0.05), Math.sin(a) * r]);
      }
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k], c = ring[(k + 1) % ring.length];
        tris.push([apex, c, a], [under, a, c]);
      }
    }
    tris.push([[0, 1.02, 0], [0.03, 0.88, 0], [-0.015, 0.88, 0.026]], [[0, 1.02, 0], [-0.015, 0.88, 0.026], [-0.015, 0.88, -0.026]], [[0, 1.02, 0], [-0.015, 0.88, -0.026], [0.03, 0.88, 0]]);
    b.geometry(m('needles'), triangles(tris));
  },
  agave(b, m, lod) {
    // Rosette of channelled, tapering leaves; inner leaves stand up, outer ones arch out.
    const leaves = lod === 'low' ? 8 : 14, segs = lod === 'low' ? 2 : 3;
    const tris: Vec3[][] = [];
    for (let i = 0; i < leaves; i++) {
      const a = i * 2.39996, outer = (i % 7) / 6;
      const ca = Math.cos(a), sa = Math.sin(a);
      const reach = 0.28 + 0.24 * outer, rise = 0.85 - 0.45 * outer, width = 0.07 + 0.02 * outer;
      const pts: { c: Vec3; l: Vec3; r: Vec3; v: Vec3 }[] = [];
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const rad = 0.02 + reach * t, up = rise * (1 - (1 - t) * (1 - t)) * (1 - 0.35 * outer * t * t);
        const w = width * (1 - t) ** 0.8;
        const cx = ca * rad, cz = sa * rad;
        pts.push({ c: [cx, up, cz], l: [cx - sa * w, up + w * 0.25, cz + ca * w], r: [cx + sa * w, up + w * 0.25, cz - ca * w], v: [cx, up - w * 0.35, cz] });
      }
      for (let s = 0; s < segs; s++) {
        const p = pts[s], q = pts[s + 1];
        tris.push([p.l, p.c, q.c], [p.l, q.c, q.l], [p.c, p.r, q.r], [p.c, q.r, q.c]);
        tris.push([p.l, q.v, p.v], [p.l, q.l, q.v], [p.r, p.v, q.v], [p.r, q.v, q.r]);
      }
    }
    b.geometry(m('succulent'), triangles(tris));
  },
  cactus(b, m, lod) {
    // Barrel cactus: a ribbed body narrowing to a crown, smooth-shaded between ribs.
    const ribs = lod === 'low' ? 8 : lod === 'medium' ? 11 : 14;
    const rings: [number, number][] = [[0, 0.3], [0.12, 0.37], [0.4, 0.4], [0.7, 0.36], [0.88, 0.26], [0.97, 0.12]];
    const n = ribs * 2;
    const pos: number[] = [];
    for (const [y, r] of rings) for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, rr = r * (k % 2 === 0 ? 1 : 0.76);
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
    }
    pos.push(0, 1, 0);
    const idx: number[] = [];
    for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < n; k++) {
      const a = j * n + k, b2 = j * n + (k + 1) % n, c = (j + 1) * n + k, d = (j + 1) * n + (k + 1) % n;
      idx.push(a, c, b2, b2, c, d);
    }
    const top = rings.length * n, last = (rings.length - 1) * n;
    for (let k = 0; k < n; k++) idx.push(last + k, top, last + (k + 1) % n);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.geometry(m('succulent'), g);
  },
  spire(b, m, lod) {
    // Seracs: a cluster of broad, leaning ice blocks broken off along their
    // tops, the way glacier ice splits at a rim or a pressure ridge. Tops are
    // flat but tilted, so snow lies on them; no block comes to a point.
    // [x, z, radius, height, lean, top tilt bearing]
    const blocks: [number, number, number, number, number, number][] = [[0, 0, 0.42, 1, 0.08, 0.4], [0.42, 0.14, 0.32, 0.7, 0.18, 2.2], [-0.38, -0.18, 0.3, 0.6, -0.16, 3.6], [0.08, -0.42, 0.26, 0.48, -0.06, 5.0]];
    const sides = lod === 'low' ? 4 : 6;
    for (const [x, z, r, hgt, lean, bearing] of lod === 'low' ? blocks.slice(0, 2) : blocks) {
      const tris: Vec3[][] = [];
      const ring = (k: number, top: boolean): Vec3[] => Array.from({ length: sides }, (_, i) => {
        const a = bearing * 0.7 + i / sides * Math.PI * 2, rr = r * k * (i % 2 ? 0.86 : 1);
        // The top is cut by a plane sloping down towards `bearing`.
        const y = top ? hgt * (1 - 0.22 * (1 + Math.cos(a - bearing)) / 2) : 0;
        return [Math.cos(a) * rr, y, Math.sin(a) * rr] as Vec3;
      });
      const r0 = ring(1, false), r1 = ring(0.82, true);
      const cap: Vec3 = [r1.reduce((t, v) => t + v[0], 0) / sides, r1.reduce((t, v) => t + v[1], 0) / sides, r1.reduce((t, v) => t + v[2], 0) / sides];
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        tris.push([r0[k], r1[k], r1[k1]], [r0[k], r1[k1], r0[k1]], [r1[k], cap, r1[k1]]);
      }
      b.geometry(m('ice'), triangles(tris), { position: [x, -0.05, z], rotation: [lean * 0.5, 0, lean] });
    }
  },
  grass(b, m) {
    b.geometry(m('foliage'), blob(0, 900, 0.3, false), { position: [0, 0.3, 0], scale: [0.4, 0.3, 0.4] });
  },
  broadleaf(b, m, lod, ctx) {
    // Broadleaf tree: a flared trunk forking into four limbs, each splitting
    // into twigs that carry the leaf clumps, so the crown is open enough to
    // show its branches and its outline breaks up into sprays.
    const seg = lod === 'low' ? 5 : 7, bark = m('bark');
    b.cylinder(bark, 0.05, 0.085, 0.07, { position: [0, 0.035, 0] }, { segments: seg });
    b.cylinder(bark, 0.036, 0.05, 0.36, { position: [0, 0.25, 0] }, { segments: seg });
    const fork: Vec3 = [0, 0.42, 0], crown: Vec3 = [0, 0.68, 0];
    const tips: Vec3[] = [];
    for (const [az, tilt, len] of [[0.3, 0.62, 0.3], [1.9, 0.72, 0.28], [3.6, 0.55, 0.31], [5.0, 0.78, 0.26]]) {
      const d = tilted(az, tilt);
      const tip = limb(b, bark, fork, d, len, 0.025, 0.013, Math.max(4, seg - 2));
      tips.push(tip);
      if (lod === 'low') continue;
      for (const [at, turn] of [[0.55, 0.9], [1, -0.7]]) {
        const from: Vec3 = [fork[0] + d[0] * len * at, fork[1] + d[1] * len * at, fork[2] + d[2] * len * at];
        tips.push(limb(b, bark, from, tilted(az + turn, tilt * 0.8), 0.13, 0.011, 0.006, 4));
      }
    }
    for (const t of tips) ctx.leaves.push({ centre: [t[0], t[1] + 0.03, t[2]], radius: lod === 'low' ? 0.2 : 0.15, flat: 0.2, crown });
    // Fill the top and the heart of the crown.
    for (const [x, y, z, r] of [[0, 0.86, 0, 0.18], [0.12, 0.76, -0.1, 0.15], [-0.12, 0.74, 0.12, 0.15], [0.02, 0.62, 0.02, 0.16]] as const) {
      if (lod === 'low' && y < 0.8) continue;
      ctx.leaves.push({ centre: [x, y, z], radius: r, flat: 0.2, crown });
    }
  },
};

export interface FloraModel { kind: FloraKind; pieces: Piece[]; triangles: number }

/** Build (or fetch from the kit) the reference model of a plant kind at a LOD. */
export function floraModel(kind: FloraKind, kit: TerrainKit): FloraModel {
  const names: FloraMaterialName[] = [];
  const geometries = kit.cachedGeometry(`flora:${kind}`, () => {
    const b = new PartBuilder(kit.lod);
    const mats = new Map<T.Material, FloraMaterialName>();
    const m = (n: FloraMaterialName) => { const mat = kit.flora(n); mats.set(mat, n); return mat; };
    const ctx: MakerContext = { leaves: [], card: 'leafCard' };
    MAKERS[kind](b, m, kit.lod, ctx);
    const built = b.build(`flora:${kind}`);
    // Foliage cards keep their own UVs (0–1 per card), so they bypass PartBuilder's metre UVs.
    if (ctx.leaves.length) built.group.add(new T.Mesh(cardGeometry(ctx.leaves, kit.lod, hashString(kind)), m(ctx.card)));
    normaliseHeight(built.group);
    const out: T.BufferGeometry[] = [];
    for (const child of built.group.children) {
      const mesh = child as T.Mesh;
      mesh.geometry.userData.material = mats.get(mesh.material as T.Material);
      out.push(mesh.geometry);
    }
    return out;
  });
  for (const g of geometries) names.push(g.userData.material as FloraMaterialName);
  const pieces = geometries.map((geometry, i) => ({ material: names[i], geometry }));
  const triangles = geometries.reduce((n, g) => n + g.getAttribute('position').count / 3, 0);
  return { kind, pieces, triangles };
}

export interface Clearing { dir: Vec3; radius: number }

export interface FloraInstance { dir: Vec3; base: number; height: number; yaw: number; up: Vec3; widthX: number; widthZ: number; tint: [number, number, number] }

export interface FloraPlan { kind: FloraKind; rule: FloraRule; instances: FloraInstance[]; cap: number }

/** True when two directions are closer than `metres` of arc (compared as chords, no trig). */
const within = (a: Vec3, b: Vec3, metres: number) => {
  const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
  return x * x + y * y + z * z < chord2(metres);
};

/**
 * Choose where plants grow. Candidates are a seeded sequence of uniform
 * directions; each is sampled from the field and offered to the style's rules
 * in order. Per-kind caps come from the LOD instance limit and the triangle
 * budget left after the ground and water, so the planet stays within BUDGET.
 */
export function planFlora(field: TerrainField, rules: FloraRule[], options: { vegetationMax: number; triangleBudget: number; triangles: Record<string, number>; clearings?: Clearing[] }): FloraPlan[] {
  const plans: FloraPlan[] = rules.map(rule => {
    const byCount = Math.floor(rule.share * options.vegetationMax);
    const byTris = Math.floor(rule.share * Math.max(0, options.triangleBudget) / Math.max(1, options.triangles[rule.kind]));
    return { kind: rule.kind, rule, instances: [], cap: Math.max(0, Math.min(byCount, byTris)) };
  });
  const density = field.env.params.vegetation;
  if (density <= 0 || plans.every(p => p.cap === 0)) return plans;
  const rand = mulberry32(layerSeed(field.env, 'flora.place'));
  const water = field.waterLevel;
  const attempts = Math.max(2000, options.vegetationMax * 9);
  for (let n = 0; n < attempts; n++) {
    const x = rand() * 2 - 1, y = rand() * 2 - 1, z = rand() * 2 - 1;
    const roll = rand(), sizeRoll = rand(), yawRoll = rand(), jitter = rand(), tone = rand();
    const l2 = x * x + y * y + z * z;
    if (l2 < 1e-4 || l2 > 1) continue;
    const l = Math.sqrt(l2);
    const dir: Vec3 = [x / l, y / l, z / l];
    if (plans.every(p => p.instances.length >= p.cap)) break;
    const s = field.sample(dir);
    let acc = 0;
    for (const plan of plans) {
      // The kind a candidate becomes never depends on caps, so a lower LOD
      // (smaller caps) keeps a prefix of each kind's sequence.
      const p = plan.rule.accept({ dir, h: s.height, tanSlope: s.tanSlope, water, biome: s.biome, masks: s.masks, density });
      acc += p;
      if (roll >= acc) continue;
      if (plan.instances.length >= plan.cap) break;
      const [lo, hi] = plan.rule.scale;
      const height = lo + (hi - lo) * sizeRoll;
      const radius = height * 0.5;
      // On a frozen sea, spires stand on the ice sheet rather than the sea bed.
      const ground = plan.kind === 'spire' && water !== null ? Math.max(s.height, water) : s.height;
      if (plan.kind !== 'spire' && water !== null && s.height < water + 0.02) break;
      if (within(dir, SPAWN_DIR, LANDING_RADIUS + LANDING_MARGIN + radius)) break;
      if (options.clearings?.some(c => within(dir, c.dir, c.radius + radius))) break;
      if (ground + height > FLORA_CEILING) break;
      const k = 0.85 + 0.3 * tone;
      plan.instances.push({
        dir, base: ground, height, yaw: yawRoll * Math.PI * 2,
        up: plan.rule.alignToGround ? s.normal : dir,
        widthX: 0.85 + 0.3 * jitter, widthZ: 1.15 - 0.3 * jitter,
        tint: [plan.rule.tint[0] * k, plan.rule.tint[1] * k, plan.rule.tint[2] * (0.92 + 0.16 * tone)],
      });
      break;
    }
  }
  return plans;
}

const Y = new T.Vector3(0, 1, 0);
/** InstancedMeshes for a plan; geometry and materials stay with the kit, instance buffers belong to the meshes. */
export function instanceFlora(plans: FloraPlan[], kit: TerrainKit, shadows: boolean): T.Group {
  const group = new T.Group();
  group.name = 'flora';
  const m = new T.Matrix4(), q = new T.Quaternion(), yawQ = new T.Quaternion(), up = new T.Vector3(), pos = new T.Vector3(), scl = new T.Vector3(), color = new T.Color();
  for (const plan of plans) {
    if (!plan.instances.length) continue;
    const model = floraModel(plan.kind, kit);
    for (const piece of model.pieces) {
      const mesh = new T.InstancedMesh(piece.geometry, kit.flora(piece.material), plan.instances.length);
      mesh.name = `flora:${plan.kind}:${piece.material}`;
      plan.instances.forEach((inst, i) => {
        up.set(inst.up[0], inst.up[1], inst.up[2]);
        q.setFromUnitVectors(Y, up).multiply(yawQ.setFromAxisAngle(Y, inst.yaw));
        // Sink the base a little so nothing floats on a slope.
        const r = PLANET_RADIUS + inst.base - inst.height * 0.04;
        pos.set(inst.dir[0] * r, inst.dir[1] * r, inst.dir[2] * r);
        scl.set(inst.height * inst.widthX, inst.height, inst.height * inst.widthZ);
        mesh.setMatrixAt(i, m.compose(pos, q, scl));
        mesh.setColorAt(i, color.setRGB(inst.tint[0], inst.tint[1], inst.tint[2], T.LinearSRGBColorSpace));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = shadows; mesh.receiveShadow = shadows;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return group;
}
