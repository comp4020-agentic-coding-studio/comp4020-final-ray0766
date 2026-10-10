import * as T from 'three';
import { hash3 } from '../core/noise.ts';
import type { Vec3 } from '../core/vec.ts';
import type { PartBuilder } from '../style/geometry.ts';
import type { LodTier } from '../style/lod.ts';
import { icosphere } from './icosphere.ts';
import type { FloraMaterialName } from './kit.ts';
import type { FloraKind } from './styles/program.ts';

// Plant and rock models for the village look (docs/restyle/terrain.md). The
// village draws in two bands of light with ink lines found from depth, so a
// plant reads by its outline: solid low-poly clumps with clean silhouettes,
// no foliage cards. Alpha-to-coverage cards dither their depth along every
// leaf edge, and the lines turn that into ink speckle over every crown
// (checked in Chrome on the timeline). The vocabulary leans to a small
// Japanese town: a pine with layered, cloud-pruned pads, round mounded shrubs,
// round broadleaf crowns, tiered conifers, rocks of a few large facets.
//
// Each model costs no more triangles than its industrial kind at every LOD
// (tests/unit/terrain/village-flora.test.ts), reaches no further sideways and
// uses no foliage card, so a planet plans exactly the same plants in both
// looks (planFlora is given the industrial cost) and never draws more. Like
// the industrial models they are built about 1 m tall and normalised to
// exactly 1 m by floraModel. Seracs and the unused grass keep their industrial
// models, which are already a few broad faces.

type Material = (name: FloraMaterialName) => T.Material;
export type VillageMaker = (b: PartBuilder, m: Material, lod: LodTier) => void;

/** A random number in [-1, 1] per vertex and seed. */
const jitter = (i: number, seed: number) => (hash3(i, 7, 13, seed) / 4294967296) * 2 - 1;

/**
 * A closed solid from corner points and triangles. Each triangle is turned to
 * face away from `centre` (every shape here is star-shaped about it). Smooth
 * shares normals between faces (a rounded clump); flat gives each face its own.
 */
function solid(points: Vec3[], tris: [number, number, number][], centre: Vec3, smooth: boolean): T.BufferGeometry {
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3(), mid = new T.Vector3();
  const index: number[] = [];
  for (const [i, j, k] of tris) {
    a.set(...points[i]); b.set(...points[j]); c.set(...points[k]);
    n.subVectors(b, a).cross(c.clone().sub(a));
    mid.copy(a).add(b).add(c).divideScalar(3).sub(new T.Vector3(...centre));
    if (n.dot(mid) < 0) index.push(i, k, j); else index.push(i, j, k);
  }
  let g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(points.flat(), 3));
  g.setIndex(index);
  if (!smooth) { const flat = g.toNonIndexed(); g.dispose(); g = flat; }
  g.computeVertexNormals();
  return g;
}

/**
 * A rounded clump of leaves: a unit ellipsoid of `rings` rings of `n` corners
 * between two poles, every corner pushed in or out a little (`lump`), smooth
 * shaded. 2·n·rings triangles.
 */
function clump(n: number, rings: number, seed: number, lump: number): T.BufferGeometry {
  const pts: Vec3[] = [[0, 1 + lump * 0.5 * jitter(0, seed), 0]];
  for (let k = 1; k <= rings; k++) {
    const polar = Math.PI * k / (rings + 1), y = Math.cos(polar), s = Math.sin(polar);
    for (let j = 0; j < n; j++) {
      const az = (j + (k % 2) * 0.5) / n * Math.PI * 2, r = 1 + lump * jitter(k * n + j + 1, seed);
      pts.push([Math.cos(az) * s * r, y * r, Math.sin(az) * s * r]);
    }
  }
  pts.push([0, -1, 0]);
  const tris: [number, number, number][] = [];
  const at = (k: number, j: number) => 1 + (k - 1) * n + ((j % n) + n) % n;
  const bottom = pts.length - 1;
  for (let j = 0; j < n; j++) {
    tris.push([0, at(1, j), at(1, j + 1)], [bottom, at(rings, j), at(rings, j + 1)]);
    for (let k = 1; k < rings; k++) {
      // Rings are staggered by half a corner, so each band is a strip of alternating triangles.
      if (k % 2 === 0) tris.push([at(k, j), at(k + 1, j), at(k, j + 1)], [at(k, j + 1), at(k + 1, j), at(k + 1, j + 1)]);
      else tris.push([at(k, j), at(k + 1, j), at(k + 1, j + 1)], [at(k, j), at(k + 1, j + 1), at(k, j + 1)]);
    }
  }
  return solid(pts, tris, [0, 0, 0], true);
}

/**
 * A cloud-pruned foliage pad: a wide, low dome over a nearly flat underside,
 * the way a trained pine carries its needles in layers. A ring of `n` corners
 * at the pad's widest, a crown point above and a shallow point below, smooth
 * shaded so the top takes the sun and the underside the shade. 2·n triangles.
 */
function pad(n: number, seed: number): T.BufferGeometry {
  const pts: Vec3[] = [[0, 1, 0]];
  for (let j = 0; j < n; j++) {
    const az = j / n * Math.PI * 2, r = 1 + 0.16 * jitter(j + 1, seed);
    pts.push([Math.cos(az) * r, 0.08 * jitter(j + 40, seed), Math.sin(az) * r]);
  }
  pts.push([0, -0.32, 0]);
  const tris: [number, number, number][] = [];
  for (let j = 0; j < n; j++) tris.push([0, 1 + j, 1 + (j + 1) % n], [n + 1, 1 + j, 1 + (j + 1) % n]);
  return solid(pts, tris, [0, 0.2, 0], true);
}

/** A rock of a few large facets: an icosahedron with its corners pushed about, its base sliced flat. 20 triangles. */
function rock(seed: number, lump: number): T.BufferGeometry {
  const ico = icosphere(0), lv = ico.levels[0];
  const pts: Vec3[] = [];
  for (let i = 0; i < lv.vertices; i++) {
    const k = 1 + lump * jitter(i, seed);
    pts.push([ico.dirs[i * 3] * k, Math.max(-0.35, ico.dirs[i * 3 + 1] * k), ico.dirs[i * 3 + 2] * k]);
  }
  const tris: [number, number, number][] = [];
  for (let f = 0; f < lv.indices.length; f += 3) tris.push([lv.indices[f], lv.indices[f + 1], lv.indices[f + 2]]);
  return solid(pts, tris, [0, 0.1, 0], false);
}

const Y = new T.Vector3(0, 1, 0);
const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
/** Unit direction from an azimuth and a tilt away from vertical. */
const tilted = (azimuth: number, tilt: number): Vec3 => [Math.sin(tilt) * Math.cos(azimuth), Math.cos(tilt), Math.sin(tilt) * Math.sin(azimuth)];

/** A tapered limb from `from` along unit `dir`; open ends where it disappears into a trunk or a crown. Returns its tip. */
function stick(b: PartBuilder, material: T.Material, from: Vec3, dir: Vec3, length: number, r0: number, r1: number, segments: number, open = false): Vec3 {
  const e = new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(Y, new T.Vector3(...dir)));
  b.cylinder(material, r1, r0, length, { position: [from[0] + dir[0] * length / 2, from[1] + dir[1] * length / 2, from[2] + dir[2] * length / 2], rotation: [e.x, e.y, e.z] }, { segments, open });
  return [from[0] + dir[0] * length, from[1] + dir[1] * length, from[2] + dir[2] * length];
}

/** Flat-shaded triangles from corner triples, wound as given. */
function faces(tris: Vec3[][]): T.BufferGeometry {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(tris.flat(2), 3));
  g.computeVertexNormals();
  return g;
}

export const VILLAGE_MAKERS: Partial<Record<FloraKind, VillageMaker>> = {
  boulder(b, m, lod) {
    // One squat rock, and at high and medium a smaller one leaning on it.
    b.geometry(m('rock'), rock(101, 0.24), { scale: [0.6, 0.62, 0.52] });
    if (lod !== 'low') b.geometry(m('rock'), rock(131, 0.3), { position: [0.42, -0.1, 0.2], rotation: [0.2, 0.9, -0.15], scale: [0.32, 0.3, 0.3] });
  },
  shrub(b, m, lod) {
    // A round mounded shrub, the kind clipped into balls along a lane: one dome, two smaller ones at its foot.
    const leaf = m('foliage');
    if (lod === 'low') { b.geometry(leaf, clump(6, 1, 7, 0.08), { position: [0, 0.4, 0], scale: [0.5, 0.42, 0.46] }); return; }
    b.geometry(leaf, clump(7, 3, 7, 0.08), { position: [0, 0.44, 0], scale: [0.44, 0.44, 0.42] });
    b.geometry(leaf, clump(5, 2, 11, 0.1), { position: [0.24, 0.26, 0.12], scale: [0.28, 0.26, 0.28] });
    b.geometry(leaf, clump(5, 2, 13, 0.1), { position: [-0.22, 0.24, -0.15], scale: [0.27, 0.24, 0.26] });
  },
  cypress(b, m, lod) {
    // A coastal pine trained into cloud pads: a leaning, kinked trunk and
    // flat layered pads streaming leeward (+X), a branch into the outer ones.
    const bark = m('bark'), needles = m('needles'), low = lod === 'low', seg = low ? 4 : 5;
    let p = stick(b, bark, [0, 0, 0], unit([0.12, 1, 0]), 0.36, 0.062, 0.042, seg);
    if (!low) p = stick(b, bark, p, unit([0.45, 1, 0.02]), 0.3, 0.042, 0.03, seg);
    const top = stick(b, bark, p, unit([1, 0.7, 0.05]), low ? 0.42 : 0.26, low ? 0.04 : 0.03, 0.018, seg);
    // [x, y, z, radius] of each pad; the first sits on the trunk's tip.
    const pads: [number, number, number, number][] = [
      [top[0] + 0.04, top[1] + 0.04, top[2], 0.25], [0.14, 0.8, -0.04, 0.23], [0.5, 0.76, 0.1, 0.19],
      [-0.06, 0.62, -0.1, 0.18], [0.3, 0.97, -0.06, 0.18], [0.22, 0.58, 0.17, 0.15], [0.42, 0.66, -0.15, 0.14],
    ];
    const used = low ? pads.slice(0, 3) : lod === 'medium' ? pads.slice(0, 5) : pads;
    const branches = lod === 'high' ? 4 : 3;
    used.forEach(([x, y, z, r], i) => {
      if (i > 0 && !low && i <= branches) {
        const from: Vec3 = [p[0] * 0.7, Math.min(y - 0.06, p[1]), p[2] * 0.7];
        const to: Vec3 = [x - from[0], y - from[1], z - from[2]];
        stick(b, bark, from, unit(to), Math.hypot(...to), 0.016, 0.009, 4, true);
      }
      b.geometry(needles, pad(low ? 6 : 8, 300 + i), { position: [x, y, z], rotation: [0, i * 1.3, 0], scale: [r * 1.05, r * 0.4, r * 0.95] });
    });
  },
  spruce(b, m, lod) {
    // A tiered conifer: a short trunk under drooping star-shaped tiers, flat shaded so each branch tip takes the sun or the shade.
    const tiers = lod === 'low' ? 4 : lod === 'medium' ? 5 : 6, arms = lod === 'low' ? 4 : 5;
    b.cylinder(m('bark'), 0.014, 0.035, 0.4, { position: [0, 0.2, 0] }, { segments: lod === 'low' ? 4 : 5 });
    const tris: Vec3[][] = [];
    for (let t = 0; t < tiers; t++) {
      const f = t / tiers;
      const y = 0.16 + f * 0.74, R = 0.25 * (1 - f) + 0.05, H = 0.26 * (1 - 0.35 * f);
      const twist = t * 0.53;
      const apex: Vec3 = [0, y + H, 0], under: Vec3 = [0, y + H * 0.15, 0];
      const ring: Vec3[] = [];
      for (let k = 0; k < arms * 2; k++) {
        const a = twist + k / (arms * 2) * Math.PI * 2, tip = k % 2 === 0, r = tip ? R : R * 0.62;
        ring.push([Math.cos(a) * r, y - (tip ? H * 0.24 : -H * 0.04), Math.sin(a) * r]);
      }
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k], c = ring[(k + 1) % ring.length];
        tris.push([apex, c, a], [under, a, c]);
      }
    }
    b.geometry(m('needles'), faces(tris));
  },
  agave(b, m, lod) {
    // A rosette of a few broad, channelled leaves, each folded along its keel and arching out.
    const leaves = lod === 'low' ? 6 : 10;
    const tris: Vec3[][] = [];
    for (let i = 0; i < leaves; i++) {
      const a = i * 2.39996, outer = (i % 5) / 4;
      const ca = Math.cos(a), sa = Math.sin(a);
      const reach = 0.26 + 0.22 * outer, rise = 0.9 - 0.45 * outer, width = 0.085 + 0.02 * outer;
      const row = (t: number) => {
        const rad = 0.03 + reach * t, up = rise * (1 - (1 - t) * (1 - t)) * (1 - 0.35 * outer * t * t), w = width * (1 - t * 0.55);
        const cx = ca * rad, cz = sa * rad;
        return { l: [cx - sa * w, up + w * 0.3, cz + ca * w] as Vec3, c: [cx, up, cz] as Vec3, r: [cx + sa * w, up + w * 0.3, cz - ca * w] as Vec3, v: [cx, up - w * 0.4, cz] as Vec3 };
      };
      const p = row(0), q = row(0.5), t1 = 1;
      const tip: Vec3 = [ca * (0.03 + reach * t1), rise * (1 - 0.35 * outer), sa * (0.03 + reach * t1)];
      tris.push([p.l, p.c, q.c], [p.l, q.c, q.l], [p.c, p.r, q.r], [p.c, q.r, q.c], [q.l, q.c, tip], [q.c, q.r, tip]);
      tris.push([p.l, q.v, p.v], [p.l, q.l, q.v], [p.r, p.v, q.v], [p.r, q.v, q.r], [q.l, tip, q.v], [q.r, q.v, tip]);
    }
    b.geometry(m('succulent'), faces(tris));
  },
  cactus(b, m, lod) {
    // A barrel cactus with a few broad ribs, smooth between them, narrowing to its crown.
    const ribs = lod === 'low' ? 6 : 8, n = ribs * 2;
    const rings: [number, number][] = [[0, 0.3], [0.18, 0.38], [0.6, 0.37], [0.88, 0.22]];
    const pts: Vec3[] = [];
    for (const [y, r] of rings) for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, rr = r * (k % 2 === 0 ? 1 : 0.8);
      pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
    }
    pts.push([0, 1, 0]);
    const tris: [number, number, number][] = [];
    for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < n; k++) {
      const a = j * n + k, b2 = j * n + (k + 1) % n, c = (j + 1) * n + k, d = (j + 1) * n + (k + 1) % n;
      tris.push([a, c, b2], [b2, c, d]);
    }
    const crown = rings.length * n, last = (rings.length - 1) * n;
    for (let k = 0; k < n; k++) tris.push([last + k, crown, last + (k + 1) % n]);
    b.geometry(m('succulent'), solid(pts, tris, [0, 0.45, 0], true));
  },
  broadleaf(b, m, lod) {
    // A round broadleaf tree, the village prop's grammar: a tapered trunk, two limbs and a crown of overlapping rounded clumps.
    const bark = m('bark'), leaf = m('foliage'), low = lod === 'low';
    b.cylinder(bark, 0.032, 0.058, 0.5, { position: [0, 0.25, 0] }, { segments: low ? 5 : 6 });
    if (!low) for (const [az, tilt] of [[0.5, 0.62], [3.4, 0.58]]) stick(b, bark, [0, 0.42, 0], tilted(az, tilt), 0.2, 0.026, 0.016, 4, true);
    const crowns: [number, number, number, number, number][] = low
      ? [[0, 0.72, 0, 0.3, 0.24], [0.13, 0.58, 0.06, 0.2, 0.17], [-0.12, 0.6, -0.08, 0.2, 0.17]]
      : [[0, 0.74, 0, 0.27, 0.23], [0.16, 0.6, 0.06, 0.19, 0.16], [-0.15, 0.62, -0.08, 0.19, 0.16], [0.03, 0.58, -0.17, 0.17, 0.14], [-0.04, 0.88, 0.04, 0.16, 0.12]];
    // At high and medium the three big clumps are rounder (three rings), so their outlines read as round and no ring makes a crease line.
    crowns.forEach(([x, y, z, r, ry], i) => b.geometry(leaf, low ? clump(6, 2, 500 + i, 0.1) : i < 3 ? clump(8, 3, 500 + i, 0.08) : clump(7, 2, 500 + i, 0.1), { position: [x, y, z], scale: [r, ry, r] }));
  },
};
