import * as T from 'three';
import { mulberry32 } from '../core/noise.ts';
import type { PartBuilder, Placement } from '../style/geometry.ts';
import type { Vec3 } from '../core/vec.ts';

// Small generated pieces for the village props (village.ts). The village look
// draws its lines from the depth on screen (src/style/lines.ts): a surface that
// turns by more than about 60° draws a crease, a step of more than 2% in depth
// a silhouette. So these shapes are built to choose their lines: a hard-edged
// box draws every edge it shows, a dome with eight or more sides draws only its
// outline, and a flat underside meets a dome in one sharp rim.

/** An outline in the x/z plane, unit-sized (scaled per ring), around the origin. */
export type Ring2 = [number, number][];

/**
 * One horizontal ring of a ring solid: the outline scaled by r (0 is a single
 * point), at height y, centred on x, z; `outline` replaces the solid's own for
 * this ring (same number of points), so a jagged rim can rise into a round dome.
 */
export interface Ring { r: number; y: number; x?: number; z?: number; outline?: Ring2 }

/** A regular polygon of n corners on the unit circle, the first `phase` radians from +X towards +Z. */
export function polygon(n: number, phase = 0): Ring2 {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)] as [number, number];
  });
}

/** An irregular flat outline (a stepping stone): n corners at radius 1 ± jitter, nudged round a little, seeded. */
export function pebble(n: number, jitter: number, seed: number): Ring2 {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const a = ((i + (rnd() - 0.5) * 0.5) / n) * Math.PI * 2;
    const r = 1 - jitter + 2 * jitter * rnd();
    return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
  });
}

/**
 * A closed solid from horizontal rings of one outline: consecutive rings are
 * joined by bands, a ring of radius 0 is an apex, and the first and last rings
 * are capped flat (from below and from above) unless they are points. With
 * `smooth` the bands share normals, so a dome turns smoothly from lit to shade
 * in the two bands instead of facet by facet; caps always keep their own flat
 * normal, so where a cap meets a band there is one sharp rim. Non-indexed.
 */
export function ringSolid(outline: Ring2, rings: Ring[], options: { smooth?: boolean; capBottom?: boolean; capTop?: boolean } = {}): T.BufferGeometry {
  const { smooth = false, capBottom = true, capTop = true } = options;
  const n = outline.length;
  if (rings.some(r => r.outline && r.outline.length !== n)) throw new Error('Every ring of a ring solid needs the same number of points.');
  const at = (ring: Ring, j: number): Vec3 => {
    const [ox, oz] = ring.r === 0 ? [0, 0] : (ring.outline ?? outline)[j % n];
    return [(ring.x ?? 0) + ring.r * ox, ring.y, (ring.z ?? 0) + ring.r * oz];
  };
  const positions: number[] = [];
  const index: number[] = [];
  // Ring vertices for the bands (shared, for smooth normals).
  const start: number[] = [];
  for (const ring of rings) {
    start.push(positions.length / 3);
    const count = ring.r === 0 ? 1 : n;
    for (let j = 0; j < count; j++) positions.push(...at(ring, j));
  }
  const v = (i: number, j: number) => (rings[i].r === 0 ? start[i] : start[i] + (j % n));
  const centreOf = (i: number) => new T.Vector3(rings[i].x ?? 0, rings[i].y, rings[i].z ?? 0);
  const p = (k: number) => new T.Vector3(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
  /** Add a triangle wound to face away from `inside`. */
  const tri = (a: number, b: number, c: number, inside: T.Vector3) => {
    const pa = p(a), pb = p(b), pc = p(c);
    const normal = new T.Vector3().crossVectors(pb.clone().sub(pa), pc.clone().sub(pa));
    if (normal.lengthSq() < 1e-14) return;
    const centroid = pa.add(pb).add(pc).divideScalar(3);
    if (normal.dot(centroid.sub(inside)) < 0) index.push(a, c, b); else index.push(a, b, c);
  };
  for (let i = 0; i + 1 < rings.length; i++) {
    const inside = centreOf(i).add(centreOf(i + 1)).multiplyScalar(0.5);
    for (let j = 0; j < n; j++) {
      const a = v(i, j), b = v(i, j + 1), c = v(i + 1, j + 1), d = v(i + 1, j);
      if (rings[i].r === 0) tri(a, c, d, inside);
      else if (rings[i + 1].r === 0) tri(a, b, d, inside);
      else { tri(a, b, c, inside); tri(a, c, d, inside); }
    }
  }
  // Caps: their own vertices, fanned from the ring's centre (the outline is star-shaped about it).
  const caps: { first: number; up: boolean }[] = [];
  const cap = (i: number, up: boolean) => {
    const ring = rings[i];
    if (ring.r === 0) return;
    const c = positions.length / 3;
    caps.push({ first: c, up });
    positions.push(ring.x ?? 0, ring.y, ring.z ?? 0);
    for (let j = 0; j < n; j++) positions.push(...at(ring, j));
    const inside = centreOf(i).add(new T.Vector3(0, up ? -1 : 1, 0));
    for (let j = 0; j < n; j++) tri(c, c + 1 + j, c + 1 + ((j + 1) % n), inside);
  };
  if (capBottom) cap(0, false);
  if (capTop) cap(rings.length - 1, true);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  if (smooth) {
    g.computeVertexNormals();
    // The caps are flat whatever the bands do.
    const nor = g.getAttribute('normal') as T.BufferAttribute;
    for (const { first, up } of caps) for (let k = first; k <= first + n; k++) nor.setXYZ(k, 0, up ? 1 : -1, 0);
  }
  const flat = g.toNonIndexed();
  g.dispose();
  if (!smooth) flat.computeVertexNormals();
  return flat;
}

/** Rotation (Euler XYZ) that turns +Y onto `direction`. */
export function aim(direction: Vec3): Vec3 {
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...direction).normalize());
  const e = new T.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z];
}

/** A tapered limb (trunk piece or branch) from a to b, open at both ends (they sit inside other pieces or the ground). */
export function limb(b: PartBuilder, material: T.Material, from: Vec3, to: Vec3, r0: number, r1: number, segments: number, overlap = 0) {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(...d);
  // Run `overlap` past the far end, so a bend's outer side shows no gap where the next piece starts.
  const placement: Placement = { position: [from[0] + d[0] * (0.5 + overlap / length / 2), from[1] + d[1] * (0.5 + overlap / length / 2), from[2] + d[2] * (0.5 + overlap / length / 2)], rotation: aim(d) };
  b.geometry(material, new T.CylinderGeometry(r1, r0, length + overlap, segments, 1, true), placement);
}

/** A face of a box by its outward axis. */
export type BoxFace = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
const FACE_ORDER: BoxFace[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

/**
 * A hard-edged box without the faces that can never be seen (the one against a
 * wall, the one on the ground): two triangles saved for each. `hidden` names
 * them in the box's own frame, before the placement turns it.
 */
export function plate(b: PartBuilder, material: T.Material, size: Vec3, placement: Placement, hidden: BoxFace[]) {
  const box = new T.BoxGeometry(...size).toNonIndexed();
  const keep = FACE_ORDER.map((f, i) => (hidden.includes(f) ? -1 : i)).filter(i => i >= 0);
  const src = box.getAttribute('position'), nor = box.getAttribute('normal');
  const positions: number[] = [], normals: number[] = [];
  for (const face of keep) for (let k = face * 6; k < face * 6 + 6; k++) {
    positions.push(src.getX(k), src.getY(k), src.getZ(k));
    normals.push(nor.getX(k), nor.getY(k), nor.getZ(k));
  }
  box.dispose();
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  b.geometry(material, g, placement);
}
