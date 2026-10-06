import * as T from 'three';
import { chamferBox } from '../style/geometry.ts';
import type { Placement } from '../style/geometry.ts';
import type { Vec3 } from '../core/vec.ts';

// Geometry primitives the ship kit needs on top of src/style/geometry.ts.
//
// - loft(): a flat-shaded skin through a sequence of rings. Hulls, canopies,
//   wings and fins are lofts, so their facets catch crisp highlights like
//   folded and machined plate, and each facet group can take its own material
//   (upper hull in primary paint, belly in secondary, leading edges in bare
//   metal).
// - latheZ(): a surface of revolution about +Z (the exhaust axis) that is
//   smooth around the axis but sharp at profile corners, so nozzle lips,
//   flanges and bands read as machined steps instead of soft blobs.
// - strut(): a chamfered bar between two points, for canopy frame bars,
//   actuators, rails and pylons.
//
// All three return plain non-indexed geometry in the caller's frame; the
// PartBuilder then places it, writes metre UVs and merges it per material.

export type Ring = Vec3[];

export interface LoftOptions {
  /** Connect the last point of each ring back to the first (default true). */
  closed?: boolean;
  capStart?: boolean;
  capEnd?: boolean;
  /** Group key for the facet strip between point j and point j + 1. */
  group?: (edge: number) => string;
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const centroid = (pts: Vec3[]): Vec3 => {
  const c: Vec3 = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
};

class TriangleSink {
  positions: number[] = [];
  normals: number[] = [];
  /** Adds a flat triangle facing away from `inside`; drops degenerate triangles. */
  flat(a: Vec3, b: Vec3, c: Vec3, outward: Vec3) {
    let n = cross3(sub3(b, a), sub3(c, a));
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-10) return;
    n = [n[0] / len, n[1] / len, n[2] / len];
    if (dot3(n, outward) < 0) { [b, c] = [c, b]; n = [-n[0], -n[1], -n[2]]; }
    this.positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.normals.push(...n);
  }
  geometry(): T.BufferGeometry {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.normals, 3));
    return g;
  }
}

/**
 * Skin through rings that all have the same point count. Facets face away
 * from the line through the ring centroids, which is right for the convex
 * sections used here (hull stations, airfoils, canopy hoops).
 */
export function loft(rings: Ring[], options: LoftOptions = {}): Map<string, T.BufferGeometry> {
  const closed = options.closed ?? true;
  const groupOf = options.group ?? (() => 'skin');
  const count = rings[0].length;
  if (rings.some(r => r.length !== count)) throw new Error('Every loft ring needs the same number of points.');
  const sinks = new Map<string, TriangleSink>();
  const sink = (key: string) => { let s = sinks.get(key); if (!s) { s = new TriangleSink(); sinks.set(key, s); } return s; };
  const centres = rings.map(centroid);
  const edges = closed ? count : count - 1;
  for (let i = 0; i < rings.length - 1; i++) {
    const axis: Vec3 = [(centres[i][0] + centres[i + 1][0]) / 2, (centres[i][1] + centres[i + 1][1]) / 2, (centres[i][2] + centres[i + 1][2]) / 2];
    for (let j = 0; j < edges; j++) {
      const k = (j + 1) % count;
      const a = rings[i][j], b = rings[i][k], c = rings[i + 1][k], d = rings[i + 1][j];
      const outward = sub3(centroid([a, b, c, d]), axis);
      const s = sink(groupOf(j));
      s.flat(a, b, c, outward);
      s.flat(a, c, d, outward);
    }
  }
  const cap = (index: number, neighbour: number, key: string) => {
    const ring = rings[index], c = centres[index];
    const outward = sub3(c, centres[neighbour]);
    const s = sink(key);
    for (let j = 0; j < count; j++) s.flat(c, ring[j], ring[(j + 1) % count], outward);
  };
  if (options.capStart) cap(0, 1, 'cap0');
  if (options.capEnd) cap(rings.length - 1, rings.length - 2, 'cap1');
  const out = new Map<string, T.BufferGeometry>();
  for (const [key, s] of sinks) if (s.positions.length) out.set(key, s.geometry());
  return out;
}

/**
 * Surface of revolution about +Z. Profile points are [radius, z]. A profile
 * walked towards +Z with growing radius faces outwards; walked back towards
 * −Z it faces inwards (the inside of a nozzle). Normals are smooth around the
 * axis and sharp at every profile corner.
 */
export function latheZ(profile: [number, number][], segments: number, options: { arc?: number; phase?: number; faceted?: boolean } = {}): T.BufferGeometry {
  const arc = options.arc ?? Math.PI * 2, phase = options.phase ?? 0;
  const positions: number[] = [], normals: number[] = [];
  const at = (r: number, z: number, t: number): Vec3 => [r * Math.cos(t), r * Math.sin(t), z];
  for (let k = 0; k < profile.length - 1; k++) {
    const [r0, z0] = profile[k], [r1, z1] = profile[k + 1];
    const dr = r1 - r0, dz = z1 - z0, len = Math.hypot(dr, dz);
    if (len < 1e-9) continue;
    // Profile normal in the (radius, z) plane: walking +z with the solid on the axis side.
    const nr = dz / len, nz = -dr / len;
    for (let i = 0; i < segments; i++) {
      const t0 = phase + arc * i / segments, t1 = phase + arc * (i + 1) / segments;
      const quad: Vec3[] = [at(r0, z0, t0), at(r0, z0, t1), at(r1, z1, t1), at(r1, z1, t0)];
      const tm = (t0 + t1) / 2;
      const ns: Vec3[] = options.faceted
        ? [0, 1, 2, 3].map(() => [nr * Math.cos(tm), nr * Math.sin(tm), nz] as Vec3)
        : [t0, t1, t1, t0].map(t => [nr * Math.cos(t), nr * Math.sin(t), nz] as Vec3);
      for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
        const pa = quad[a], pb = quad[b], pc = quad[c];
        const face = cross3(sub3(pb, pa), sub3(pc, pa));
        if (Math.hypot(face[0], face[1], face[2]) < 1e-12) continue;
        const avg: Vec3 = [ns[a][0] + ns[b][0] + ns[c][0], ns[a][1] + ns[b][1] + ns[c][1], ns[a][2] + ns[b][2] + ns[c][2]];
        const order = dot3(face, avg) >= 0 ? [a, b, c] : [a, c, b];
        for (const v of order) { positions.push(...quad[v]); normals.push(...ns[v]); }
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  return g;
}

/** Matrix whose +Z runs from a to b, with +Y as close to `up` as possible. */
export function frameBetween(a: Vec3, b: Vec3, up: Vec3 = [0, 1, 0]): { matrix: T.Matrix4; length: number } {
  const z = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const length = z.length();
  z.normalize();
  let u = new T.Vector3(...up);
  if (Math.abs(u.dot(z)) > 0.98) u = Math.abs(z.x) < 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 0, 1);
  const x = new T.Vector3().crossVectors(u, z).normalize();
  const y = new T.Vector3().crossVectors(z, x).normalize();
  const matrix = new T.Matrix4().makeBasis(x, y, z).setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return { matrix, length };
}

/** Chamfered bar of section w × h from a to b. */
export function strutGeometry(a: Vec3, b: Vec3, w: number, h: number, chamfer: number, up?: Vec3): T.BufferGeometry {
  const { matrix, length } = frameBetween(a, b, up);
  return chamferBox(w, h, length, chamfer).applyMatrix4(matrix);
}

/** Round rod from a to b (pipes, piston rods, antennae). */
export function rodGeometry(a: Vec3, b: Vec3, radius: number, segments: number): T.BufferGeometry {
  const { matrix, length } = frameBetween(a, b);
  return latheZ([[radius, -length / 2], [radius, length / 2]], segments).applyMatrix4(matrix);
}

/** Same composition as PartBuilder placements: translate · rotate (XYZ Euler) · scale. */
export function placementMatrix(p: Placement = {}): T.Matrix4 {
  return new T.Matrix4().compose(
    new T.Vector3(...(p.position ?? [0, 0, 0])),
    new T.Quaternion().setFromEuler(new T.Euler(...(p.rotation ?? [0, 0, 0]))),
    new T.Vector3(...(p.scale ?? [1, 1, 1])),
  );
}

/** Euler rotation (XYZ) that turns +Y onto `normal`; used to seat bolts and lenses on sloped faces. */
export function rotationToNormal(normal: Vec3): Vec3 {
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...normal).normalize());
  const e = new T.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}
