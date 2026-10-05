import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOD } from './lod.ts';
import type { LodTier } from './lod.ts';
import { SCALE } from './tokens.ts';
import type { Vec3 } from '../core/vec.ts';

// Geometry helpers shared by the building and ship kits.
//
// Edges are chamfered rather than rounded: a 45° flat bevel costs 44 triangles
// per box (a rounded box with three segments costs ~590) and catches a crisp
// highlight, which is what makes machined and folded metal read as real.
// UVs are written in metres after each piece is placed, so the 2 m pattern
// textures keep one texel density across every module and seams line up with
// the 1 m grid.

/** Box with 45° chamfered edges and flat-shaded faces. Non-indexed. */
export function chamferBox(w: number, h: number, d: number, c: number): T.BufferGeometry {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  c = Math.max(0, Math.min(c, hw * 0.45, hh * 0.45, hd * 0.45));
  if (c === 0) return new T.BoxGeometry(w, h, d).toNonIndexed();
  const P = (axis: 0 | 1 | 2, sx: number, sy: number, sz: number): Vec3 => [
    sx * (axis === 0 ? hw : hw - c), sy * (axis === 1 ? hh : hh - c), sz * (axis === 2 ? hd : hd - c),
  ];
  const tris: Vec3[][] = [];
  const quad = (a: Vec3, b: Vec3, cc: Vec3, dd: Vec3) => { tris.push([a, b, cc], [a, cc, dd]); };
  const S = [-1, 1];
  // Main faces.
  for (const s of S) {
    quad(P(0, s, -1, -1), P(0, s, 1, -1), P(0, s, 1, 1), P(0, s, -1, 1));
    quad(P(1, -1, s, -1), P(1, 1, s, -1), P(1, 1, s, 1), P(1, -1, s, 1));
    quad(P(2, -1, -1, s), P(2, 1, -1, s), P(2, 1, 1, s), P(2, -1, 1, s));
  }
  // Edge bevels: between faces a and b, running along the third axis.
  for (const sa of S) for (const sb of S) {
    quad(P(0, sa, sb, -1), P(0, sa, sb, 1), P(1, sa, sb, 1), P(1, sa, sb, -1)); // X–Y edges along Z
    quad(P(0, sa, -1, sb), P(0, sa, 1, sb), P(2, sa, 1, sb), P(2, sa, -1, sb)); // X–Z edges along Y
    quad(P(1, -1, sa, sb), P(1, 1, sa, sb), P(2, 1, sa, sb), P(2, -1, sa, sb)); // Y–Z edges along X
  }
  // Corner triangles.
  for (const sx of S) for (const sy of S) for (const sz of S) tris.push([P(0, sx, sy, sz), P(1, sx, sy, sz), P(2, sx, sy, sz)]);
  const positions: number[] = [], normals: number[] = [];
  const e1 = new T.Vector3(), e2 = new T.Vector3(), n = new T.Vector3(), centre = new T.Vector3();
  for (const tri of tris) {
    const a = tri[0];
    let b = tri[1], cc = tri[2];
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); e2.set(cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]);
    n.crossVectors(e1, e2);
    centre.set((a[0] + b[0] + cc[0]) / 3, (a[1] + b[1] + cc[1]) / 3, (a[2] + b[2] + cc[2]) / 3);
    if (n.dot(centre) < 0) { [b, cc] = [cc, b]; n.negate(); }
    n.normalize();
    for (const p of [a, b, cc]) { positions.push(...p); normals.push(n.x, n.y, n.z); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  return g;
}

/** Box-projected UVs in metres (one texture repeat per SCALE.textureMetres). */
export function metreUVs(geometry: T.BufferGeometry, metres: number = SCALE.textureMetres): T.BufferGeometry {
  const pos = geometry.getAttribute('position'), nor = geometry.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u: number, w: number;
    if (ax >= ay && ax >= az) { u = nor.getX(i) > 0 ? -z : z; w = y; }
    else if (ay >= az) { u = x; w = nor.getY(i) > 0 ? -z : z; }
    else { u = nor.getZ(i) > 0 ? x : -x; w = y; }
    uv[i * 2] = u / metres; uv[i * 2 + 1] = w / metres;
  }
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return geometry;
}

export interface Placement { position?: Vec3; rotation?: Vec3; scale?: Vec3 }
const matrixOf = (p: Placement = {}) => new T.Matrix4().compose(
  new T.Vector3(...(p.position ?? [0, 0, 0])),
  new T.Quaternion().setFromEuler(new T.Euler(...(p.rotation ?? [0, 0, 0]))),
  new T.Vector3(...(p.scale ?? [1, 1, 1])),
);

export interface BuiltPart {
  group: T.Group;
  triangles: number;
  drawCalls: number;
}

/**
 * Collects primitives per material, places them, writes metre UVs and merges
 * each material's pieces into one mesh. Materials come from a StyleLibrary
 * (shared) or are owned glow materials; geometries are always owned by the
 * result and freed by disposeObject3D.
 */
export class PartBuilder {
  readonly lod: LodTier;
  private buckets = new Map<T.Material, T.BufferGeometry[]>();
  private frame: T.Matrix4 = new T.Matrix4();
  constructor(lod: LodTier) { this.lod = lod; }

  get settings() { return LOD[this.lod]; }

  /** Run `fn` with every placement relative to `placement` (nested frames). */
  within(placement: Placement, fn: () => void) {
    const saved = this.frame.clone();
    this.frame = saved.clone().multiply(matrixOf(placement));
    try { fn(); } finally { this.frame = saved; }
  }

  geometry(material: T.Material, source: T.BufferGeometry, placement?: Placement, options: { uvMetres?: number } = {}) {
    let g = source.index ? source.toNonIndexed() : source;
    if (g === source) g = source.clone();
    source.dispose();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const m = this.frame.clone().multiply(matrixOf(placement));
    g.applyMatrix4(m);
    if (m.determinant() < 0) {
      // Mirrored pieces (left/right wings) need their winding flipped to stay front-facing.
      const pos = g.getAttribute('position') as T.BufferAttribute, nor = g.getAttribute('normal') as T.BufferAttribute;
      for (let i = 0; i < pos.count; i += 3) for (const a of [pos, nor]) {
        for (let k = 0; k < 3; k++) { const t = a.array[(i + 1) * 3 + k]; a.array[(i + 1) * 3 + k] = a.array[(i + 2) * 3 + k]; a.array[(i + 2) * 3 + k] = t; }
      }
    }
    metreUVs(g, options.uvMetres);
    const list = this.buckets.get(material) ?? [];
    list.push(g);
    this.buckets.set(material, list);
  }

  /** Chamfered box; chamfer collapses to a hard box at low LOD. */
  box(material: T.Material, size: Vec3, placement?: Placement, chamfer: number = SCALE.bevel) {
    this.geometry(material, chamferBox(size[0], size[1], size[2], this.settings.bevelSegments ? chamfer : 0), placement);
  }

  cylinder(material: T.Material, radiusTop: number, radiusBottom: number, height: number, placement?: Placement, options: { segments?: number; open?: boolean } = {}) {
    const segments = options.segments ?? this.settings.radialSegments;
    this.geometry(material, new T.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, options.open ?? false), placement);
  }

  /** Hex bolt head lying on a surface whose normal is +Y in the placement frame. Skipped when LOD drops hardware. */
  bolt(material: T.Material, placement: Placement, radius = 0.014) {
    if (!this.settings.hardware) return;
    this.within(placement, () => this.cylinder(material, radius, radius, radius * 0.9, { position: [0, radius * 0.45, 0] }, { segments: 6 }));
  }

  /** Lathe a 2D profile (x = radius, y = height) around +Y. */
  lathe(material: T.Material, profile: [number, number][], placement?: Placement, segments?: number) {
    const g = new T.LatheGeometry(profile.map(([x, y]) => new T.Vector2(x, y)), segments ?? this.settings.radialSegments);
    this.geometry(material, g, placement);
  }

  /** Extrude a 2D outline (x, y) along +Z by `depth`, with an optional bevel. */
  extrude(material: T.Material, outline: [number, number][], depth: number, placement?: Placement, bevel = 0, holes: [number, number][][] = []) {
    const shape = new T.Shape(outline.map(([x, y]) => new T.Vector2(x, y)));
    for (const h of holes) shape.holes.push(new T.Path(h.map(([x, y]) => new T.Vector2(x, y))));
    const useBevel = bevel > 0 && this.settings.bevelSegments > 0;
    const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: useBevel, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: Math.max(4, this.settings.radialSegments / 2) });
    this.geometry(material, g, placement);
  }

  build(name = 'part'): BuiltPart {
    const group = new T.Group();
    group.name = name;
    let triangles = 0;
    const shadows = this.settings.shadows;
    for (const [material, geometries] of this.buckets) {
      const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
      if (geometries.length > 1) geometries.forEach(g => g.dispose());
      if (!merged) throw new Error(`Could not merge geometry for ${material.name || 'material'}.`);
      merged.computeBoundingBox(); merged.computeBoundingSphere();
      const mesh = new T.Mesh(merged, material);
      const transparent = material.transparent;
      mesh.castShadow = shadows && !transparent;
      mesh.receiveShadow = shadows;
      group.add(mesh);
      triangles += merged.getAttribute('position').count / 3;
    }
    this.buckets.clear();
    return { group, triangles, drawCalls: group.children.length };
  }
}

/** Triangles and draw calls under an object (meshes only; instanced meshes count every instance). */
export function measure(root: T.Object3D): { triangles: number; drawCalls: number } {
  let triangles = 0, drawCalls = 0;
  root.traverse(o => {
    const mesh = o as T.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const g = mesh.geometry;
    const count = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
    const instances = (o as T.InstancedMesh).isInstancedMesh ? (o as T.InstancedMesh).count : 1;
    triangles += count * instances;
    drawCalls += Array.isArray(mesh.material) ? mesh.material.length : 1;
  });
  return { triangles, drawCalls };
}
