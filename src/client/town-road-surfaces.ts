import * as T from 'three';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import type { StyleLibrary } from '../assets/claude-geometry/style/materials.ts';
import { villageMaterial } from '../assets/claude-geometry/style/village.ts';
import { PLAZA, ROAD_PROFILES, SURFACE } from '../shared/planet-plan/params.ts';
import type { RoadClass } from '../shared/planet-plan/params.ts';
import type { Network, Piece } from '../shared/planet-plan/network.ts';
import { fromLocalRight, sampleAt, v2 } from '../shared/planet-plan/network.ts';
import { kerbRuns } from '../shared/planet-plan/kerbs.ts';
import { PAVING, PAVING_KEYS } from '../shared/village-kit/style.ts';
import { arc, cross, frameAt, fromLocal, heading, slerp, toLocal, unit } from '../shared/planet-plan/sphere.ts';
import type { V2, V3 } from '../shared/planet-plan/sphere.ts';

// Continuous street surfaces for the planned main planet, draped on the same
// natural ground the walker stands on (src/shared/planet-plan). One vocabulary
// with the workshop's road parts (src/shared/village-kit): blue-grey lane with a
// dashed centre line, dressed-stone edge bands and a chamfered kerb on main
// streets; staggered flagstones on branches, lanes and door paths; fan-and-ring
// paving on plazas. Joints are thin dark strips laid on the stone.

type Key = keyof typeof PAVING_KEYS;
class Buckets {
  readonly data = new Map<Key, { pos: number[]; uv: number[] }>();
  tri(key: Key, a: T.Vector3, b: T.Vector3, c: T.Vector3, ua: V2 = [0, 0], ub: V2 = [0, 0], uc: V2 = [0, 0], facing?: T.Vector3) {
    let d = this.data.get(key); if (!d) { d = { pos: [], uv: [] }; this.data.set(key, d); }
    // Face away from the planet centre, or along `facing` for side faces.
    const n = b.clone().sub(a).cross(c.clone().sub(a)), mid = facing ?? a.clone().add(b).add(c);
    if (n.dot(mid) < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    d.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); d.uv.push(...ua, ...ub, ...uc);
  }
  quad(key: Key, a: T.Vector3, b: T.Vector3, c: T.Vector3, d: T.Vector3, uv?: [V2, V2, V2, V2], facing?: T.Vector3) {
    this.tri(key, a, b, c, uv?.[0], uv?.[1], uv?.[2], facing); this.tri(key, a, c, d, uv?.[0], uv?.[2], uv?.[3], facing);
  }
  /** Outward skirt from a top edge down below the ground, facing `out`. */
  skirt(key: Key, a: T.Vector3, b: T.Vector3, out: T.Vector3, depth: number) {
    const ad = a.clone().setLength(a.length() - depth), bd = b.clone().setLength(b.length() - depth);
    let dd = this.data.get(key); if (!dd) { dd = { pos: [], uv: [] }; this.data.set(key, dd); }
    const push = (p: T.Vector3, q: T.Vector3, r: T.Vector3) => {
      const n = q.clone().sub(p).cross(r.clone().sub(p));
      if (n.dot(out) < 0) dd!.pos.push(p.x, p.y, p.z, r.x, r.y, r.z, q.x, q.y, q.z); else dd!.pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
      dd!.uv.push(0, 0, 0, 0, 0, 0);
    };
    push(a, b, bd); push(a, bd, ad);
  }
}

export interface RoadSurfacesOptions { network: Network; field: HeightField; library: StyleLibrary; lod?: 'medium' | 'low' }
export interface RoadSurfaces { object: T.Group; triangles: number; drawCalls: number; dispose(): void }

const CARRIAGEWAY: Record<RoadClass, Key> = { main: 'carriageway', branch: 'flag', lane: 'flag', door: 'edge' };

export function createTownRoadSurfaces(options: RoadSurfacesOptions): RoadSurfaces {
  const { network, field } = options, R = network.radius, low = options.lod === 'low';
  const ground = (p: V3) => 10 + field.heightAt(p);
  const at = (p: V3, lift: number) => new T.Vector3(...p).multiplyScalar(ground(p) + lift);
  const out = new Buckets();
  const lift = SURFACE.lift;
  const layerOf = (c: RoadClass) => c === 'door' ? SURFACE.doorLayer : 0;

  // ---- Street pieces: carriageway, edge bands, joints, centre dashes.
  const strip = (piece: Piece, key: Key, a0: number, a1: number, y: number, skirtOuter: boolean) => {
    const s = piece.samples;
    for (let i = 1; i < s.length; i++) {
      const p0 = fromLocalRight(s[i - 1].p, s[i - 1].r, a0, R), p1 = fromLocalRight(s[i - 1].p, s[i - 1].r, a1, R);
      const q0 = fromLocalRight(s[i].p, s[i].r, a0, R), q1 = fromLocalRight(s[i].p, s[i].r, a1, R);
      const A = at(p0, y), B = at(p1, y), C = at(q1, y), D = at(q0, y);
      out.quad(key, A, B, C, D, [[s[i - 1].s, a0], [s[i - 1].s, a1], [s[i].s, a1], [s[i].s, a0]]);
      if (skirtOuter) for (const [edge0, edge1, a] of [[A, D, a0], [B, C, a1]] as const) {
        if (Math.abs(a) < Math.max(Math.abs(a0), Math.abs(a1)) - 1e-6) continue;
        out.skirt(key, edge0, edge1, new T.Vector3(...s[i].r).multiplyScalar(Math.sign(a) || 1), SURFACE.skirt);
      }
    }
  };
  /** Thin transverse joints across [a0, a1] every `every` metres along the piece. */
  const joints = (piece: Piece, a0: number, a1: number, y: number, every: number, offset = 0, width = PAVING.joint * 1.4) => {
    const s = piece.samples, start = s[0].s, end = s[s.length - 1].s;
    for (let d = start + offset + every; d < end - every * .4; d += every) {
      let i = 1; while (i < s.length - 1 && s[i].s < d) i++;
      const k = (d - s[i - 1].s) / (s[i].s - s[i - 1].s || 1), p = slerp(s[i - 1].p, s[i].p, k), t = unit(new T.Vector3(...s[i].p).sub(new T.Vector3(...s[i - 1].p)).toArray() as V3);
      const r = unit(cross(t, p)), w = width / 2 / R;
      const front = unit([p[0] + t[0] * w, p[1] + t[1] * w, p[2] + t[2] * w]), back = unit([p[0] - t[0] * w, p[1] - t[1] * w, p[2] - t[2] * w]);
      out.quad('joint', at(fromLocalRight(back, r, a0, R), y), at(fromLocalRight(back, r, a1, R), y), at(fromLocalRight(front, r, a1, R), y), at(fromLocalRight(front, r, a0, R), y));
    }
  };
  /** Longitudinal joint line at lateral offset a. */
  const seam = (piece: Piece, a: number, y: number, width = PAVING.joint * 1.4) => strip(piece, 'joint', a - width / 2, a + width / 2, y, false);
  for (const piece of network.pieces) {
    const P = ROAD_PROFILES[piece.class], half = P.paved / 2, y = lift + layerOf(piece.class);
    strip(piece, CARRIAGEWAY[piece.class], -half, half, y, false);
    if (P.edge === 0) { strip(piece, 'joint', -half, -half + .001, y, true); strip(piece, 'joint', half - .001, half, y, true); }
    if (P.edge > 0) for (const side of [-1, 1]) {
      strip(piece, 'edge', side * half, side * (half + P.edge), y + .003, P.kerb === 0);
      if (!low) joints(piece, side * half, side * (half + P.edge), y + .0045, PAVING.course, side > 0 ? .25 : 0);
    }
    if (low) continue;
    if (piece.class === 'main') {
      // Dashed centre marking.
      const s = piece.samples, total = s[s.length - 1].s - s[0].s;
      for (let d = 1.0; d < total - .8; d += 1.7) {
        const a = s[0].s + d, sub: Piece = { ...piece, samples: [0, .5, 1].map(k => sampleAt(s, a + .6 * k)) };
        strip(sub, 'marking', -.045, .045, y + .002, false);
      }
    } else {
      // Flagstone courses: transverse joints and a staggered centre seam.
      const course = piece.class === 'branch' ? .62 : piece.class === 'lane' ? .5 : .45;
      joints(piece, -half, half, y + .0015, course);
      if (piece.class === 'branch') { seam(piece, -half / 3, y + .0015); seam(piece, half / 3, y + .0015); }
      else seam(piece, 0, y + .0015);
    }
  }
  // ---- Kerbs: chamfered profile along every kerb run (main streets, kerbed corners).
  const P = ROAD_PROFILES.main, kw = P.kerb, kh = P.kerbHeight, ch = PAVING.kerbChamfer;
  const profile: V2[] = [[-kw / 2, -.02], [-kw / 2, kh - ch], [-kw / 2 + ch, kh], [kw / 2 - ch, kh], [kw / 2, kh - ch], [kw / 2, -SURFACE.skirt]];
  for (const run of kerbRuns(network)) {
    const pts = run.points, rights = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], t = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      return unit(cross(t, p));
    });
    const rings = pts.map((p, i) => profile.map(([x, y]) => at(fromLocalRight(p, rights[i], x, R), lift + y)));
    for (let i = 1; i < rings.length; i++) for (let k = 0; k < profile.length - 1; k++) {
      // Outward normal of the profile edge (the profile runs across the kerb, up and over).
      const [x0, y0] = profile[k], [x1, y1] = profile[k + 1], nx = -(y1 - y0), ny = x1 - x0;
      const up = new T.Vector3(...pts[i]), facing = new T.Vector3(...rights[i]).multiplyScalar(nx).addScaledVector(up, ny);
      out.quad('edge', rings[i - 1][k], rings[i - 1][k + 1], rings[i][k + 1], rings[i][k], undefined, facing);
    }
    // End caps where a kerb drops for a crossing.
    for (const [ring, along] of [[rings[0], heading(pts[0], pts[1])], [rings[rings.length - 1], heading(pts[pts.length - 1], pts[pts.length - 2])]] as [T.Vector3[], V3][]) {
      const facing = new T.Vector3(...along).negate();
      for (let k = 1; k < profile.length - 1; k++) out.tri('edge', ring[0], ring[k], ring[k + 1], undefined, undefined, undefined, facing);
    }
    if (!low) for (let i = 2; i < pts.length - 1; i += 2) {
      // A joint every metre across the kerb top.
      const p = pts[i], r = rights[i];
      out.quad('joint', at(fromLocalRight(p, r, -kw / 2 + ch, R), lift + kh + .0015), at(fromLocalRight(p, r, kw / 2 - ch, R), lift + kh + .0015),
        at(fromLocalRight(slerp(p, pts[i + 1], .03), r, kw / 2 - ch, R), lift + kh + .0015), at(fromLocalRight(slerp(p, pts[i + 1], .03), r, -kw / 2 + ch, R), lift + kh + .0015));
    }
  }
  // ---- Junctions: a subdivided fan over the paved outline, edge bands round the corners.
  for (const j of network.junctions) {
    const f = frameAt(j.center), y = lift + SURFACE.layer, key = CARRIAGEWAY[j.class];
    const ring = (q: V2, t: number): T.Vector3 => at(fromLocal(j.center, [q[0] * t, q[1] * t], R, f), y);
    const steps = 4;
    for (let i = 0; i < j.outline.length; i++) {
      const a = j.outline[i], b = j.outline[(i + 1) % j.outline.length];
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        if (k === 0) out.tri(key, ring(a, 0), ring(a, t1), ring(b, t1));
        else out.quad(key, ring(a, t0), ring(a, t1), ring(b, t1), ring(b, t0));
      }
    }
    for (const corner of j.corners) {
      const w = corner.edge, pts = corner.points, n = corner.normals;
      for (let i = 1; i < pts.length; i++) {
        const inner0 = fromLocal(j.center, pts[i - 1], R, f), inner1 = fromLocal(j.center, pts[i], R, f);
        const outer0 = fromLocal(j.center, v2.add(pts[i - 1], v2.scale(n[i - 1], w)), R, f), outer1 = fromLocal(j.center, v2.add(pts[i], v2.scale(n[i], w)), R, f);
        out.quad('edge', at(inner0, y + .003), at(outer0, y + .003), at(outer1, y + .003), at(inner1, y + .003));
        if (!corner.kerb) out.skirt('edge', at(outer0, y + .003), at(outer1, y + .003), new T.Vector3(...outer0).sub(new T.Vector3(...inner0)), SURFACE.skirt);
      }
    }
  }
  // ---- Plazas: rings of fan paving, radial joints, a dressed-stone border.
  for (const plaza of network.plazas) {
    const y = lift + SURFACE.layer * 1.5, border = PLAZA.border;
    if (plaza.centres.length === 1) {
      const c = plaza.centres[0], f = frameAt(c), rOut = plaza.radius + border, sectors = Math.max(24, Math.round(rOut * 9));
      const point = (r: number, a: number, dy: number) => at(fromLocal(c, [Math.cos(a) * r, Math.sin(a) * r], R, f), y + dy);
      const rings: number[] = []; for (let r = 0; r < plaza.radius - .05; r += PLAZA.ringStep) rings.push(r); rings.push(plaza.radius);
      for (let s = 0; s < sectors; s++) {
        const a0 = s / sectors * Math.PI * 2, a1 = (s + 1) / sectors * Math.PI * 2;
        for (let k = 1; k < rings.length; k++) {
          if (k === 1) out.tri('flag', point(0, 0, 0), point(rings[1], a0, 0), point(rings[1], a1, 0));
          else out.quad('flag', point(rings[k - 1], a0, 0), point(rings[k], a0, 0), point(rings[k], a1, 0), point(rings[k - 1], a1, 0));
        }
        out.quad('edge', point(plaza.radius, a0, .003), point(rOut, a0, .003), point(rOut, a1, .003), point(plaza.radius, a1, .003));
        out.skirt('edge', point(rOut, a0, .003), point(rOut, a1, .003), new T.Vector3(...fromLocal(c, [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2)], R, f)).sub(new T.Vector3(...c)), SURFACE.skirt);
        if (!low) {
          // Ring joints and radial joints, staggered course by course.
          for (let k = 1; k < rings.length - 1; k++) out.quad('joint', point(rings[k] - .01, a0, .0015), point(rings[k] + .01, a0, .0015), point(rings[k] + .01, a1, .0015), point(rings[k] - .01, a1, .0015));
          for (let k = 1; k < rings.length; k++) {
            const per = Math.max(1, Math.round(sectors * PLAZA.ringStep / (Math.PI * 2 * rings[k] / 1.6)));
            if ((s + k) % per) continue;
            const w = .012 / Math.max(rings[k - 1], .3);
            out.quad('joint', point(rings[k - 1], a0 - w, .0015), point(rings[k], a0 - w, .0015), point(rings[k], a0 + w, .0015), point(rings[k - 1], a0 + w, .0015));
          }
        }
      }
    } else {
      // Quay: a capsule of large flags with a stone border.
      const [a, b] = plaza.centres, f = frameAt(a), axis = v2.unit(toLocal(a, b, R, f)), lengthAB = arc(a, b, R), normal: V2 = [-axis[1], axis[0]];
      const local = (u: number, v: number): V3 => fromLocal(a, v2.add(v2.scale(axis, u), v2.scale(normal, v)), R, f);
      const outline: V2[] = [];
      for (let k = 0; k <= 16; k++) { const th = -Math.PI / 2 + k / 16 * Math.PI; outline.push([lengthAB + Math.cos(th) * plaza.radius, Math.sin(th) * plaza.radius]); }
      for (let k = 0; k <= 16; k++) { const th = Math.PI / 2 + k / 16 * Math.PI; outline.push([Math.cos(th) * plaza.radius, Math.sin(th) * plaza.radius]); }
      const centre: V2 = [lengthAB / 2, 0], steps = 5;
      const P2 = (q: V2, t: number, dy: number) => at(local(centre[0] + (q[0] - centre[0]) * t, centre[1] + (q[1] - centre[1]) * t), y + dy);
      for (let i = 0; i < outline.length; i++) {
        const p = outline[i], q = outline[(i + 1) % outline.length];
        for (let k = 0; k < steps; k++) {
          if (k === 0) out.tri('flag', P2(p, 0, 0), P2(p, 1 / steps, 0), P2(q, 1 / steps, 0));
          else out.quad('flag', P2(p, k / steps, 0), P2(p, (k + 1) / steps, 0), P2(q, (k + 1) / steps, 0), P2(q, k / steps, 0));
        }
        const grow = (v: V2) => v2.add(v, v2.scale(v2.unit(v2.sub(v, [Math.max(0, Math.min(lengthAB, v[0])), 0])), border));
        const po = grow(p), qo = grow(q);
        out.quad('edge', at(local(p[0], p[1]), y + .003), at(local(po[0], po[1]), y + .003), at(local(qo[0], qo[1]), y + .003), at(local(q[0], q[1]), y + .003));
        out.skirt('edge', at(local(po[0], po[1]), y + .003), at(local(qo[0], qo[1]), y + .003), new T.Vector3(...local(po[0], po[1])).sub(new T.Vector3(...local(p[0], p[1]))), SURFACE.skirt);
      }
      if (!low) for (let u = .9; u < lengthAB; u += .9) {
        const w = Math.sqrt(Math.max(0, plaza.radius ** 2)), v0 = -w, v1 = w;
        out.quad('joint', at(local(u - .01, v0), y + .0015), at(local(u + .01, v0), y + .0015), at(local(u + .01, v1), y + .0015), at(local(u - .01, v1), y + .0015));
      }
    }
  }
  // ---- Meshes: one per material, in regional chunks for culling.
  const group = new T.Group(); group.name = 'town-road-surfaces';
  let triangles = 0;
  for (const [key, data] of out.data) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(data.pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(data.uv, 2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new T.Mesh(g, villageMaterial(options.library, PAVING_KEYS[key]));
    mesh.name = `paving:${key}`; mesh.castShadow = false; mesh.receiveShadow = true;
    // Never a camera boom obstacle: the outdoor boom raycasts the scenery.
    mesh.raycast = () => {};
    group.add(mesh); triangles += data.pos.length / 9;
  }
  return { object: group, triangles, drawCalls: group.children.length, dispose() { group.traverse(o => { if (o instanceof T.Mesh) o.geometry.dispose(); }); } };
}
