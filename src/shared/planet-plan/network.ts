import { HUB_DOCK } from '../ports.ts';
import { HUB_SHIP } from '../harbour-layout.ts';
import { NPCS, SPAWN } from '../world.ts';
import { PLAN_RADIUS, ROAD_PROFILES, roadHalfWidth } from './params.ts';
import type { RoadClass } from './params.ts';
import type { PlanetPlan, PlanPoint, PlanPlaza } from './schema.ts';
import { angle, arc, cross, dirOf, dot, frameAt, fromLocal, heading, segmentDistance, slerp, tangent, toLocal, unit, walk } from './sphere.ts';
import type { V2, V3 } from './sphere.ts';

/** A centreline sample: position, unit tangent, unit right (t × up), arclength. */
export interface Sample { p: V3; t: V3; r: V3; s: number }
export interface NetworkRoad {
  id: string; class: RoadClass; name: string; nameZh: string; district: string;
  /** The full filleted centreline, before junction and plaza trimming. */
  line: Sample[]; length: number;
  /** Arclength of each named node the road passes through. */
  nodes: { node: string; s: number }[];
}
export type PieceEnd = { kind: 'junction'; node: string } | { kind: 'plaza'; plaza: string } | { kind: 'cap' } | { kind: 'join'; road: string };
/** A drawable run of one road between junctions/plazas, already trimmed. */
export interface Piece { id: string; road: string; class: RoadClass; samples: Sample[]; start: PieceEnd; end: PieceEnd }
export interface JunctionCorner {
  /** Paved boundary from the left edge of one end to the right edge of the next (CCW), in junction-local metres. */
  points: V2[];
  /** Outward unit normal (towards the outside of the paving) at each point. */
  normals: V2[];
  kerb: boolean; edge: number; kerbWidth: number; kerbHeight: number;
}
export interface Junction {
  node: string; center: V3; class: RoadClass;
  /** Closed CCW paved outline in local metres (east, north) about `center`. */
  outline: V2[];
  corners: JunctionCorner[];
}
export interface Plaza { id: string; kind: PlanPlaza['kind']; district: string; name: string; nameZh: string; centres: V3[]; radius: number }
export interface Network {
  radius: number; roads: NetworkRoad[]; pieces: Piece[]; junctions: Junction[]; plazas: Plaza[];
  point(p: PlanPoint): V3;
}

const ANCHORS: Record<string, V3> = {
  $spawn: SPAWN as V3, $dock: HUB_DOCK as V3, $mica: NPCS.mica.position as V3, $sol: NPCS.sol.position as V3, $ship: HUB_SHIP as V3,
};
export function resolvePoint(plan: Pick<PlanetPlan, 'nodes'>, p: PlanPoint): V3 {
  if (typeof p === 'string') {
    if (p in ANCHORS) return [...ANCHORS[p]];
    const node = plan.nodes[p];
    if (!node) throw new Error(`Unknown plan point ${p}`);
    return dirOf(node[0], node[1]);
  }
  return dirOf(p[0], p[1]);
}
const rot90 = (v: V2): V2 => [-v[1], v[0]];
const v2 = {
  add: (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]], sub: (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]],
  scale: (a: V2, k: number): V2 => [a[0] * k, a[1] * k], dot: (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1],
  len: (a: V2) => Math.hypot(a[0], a[1]), unit: (a: V2): V2 => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
};
export { v2 };

/** Centreline radius of a bend: the paved inner edge keeps the class fillet. */
const bendRadius = (c: RoadClass) => ROAD_PROFILES[c].fillet + ROAD_PROFILES[c].paved / 2;

interface Vertex { p: V3; node?: string }
/** Polyline through the vertices with circular fillets at every vertex that is not a junction. */
function filleted(vertices: Vertex[], cls: RoadClass, junctionNodes: ReadonlySet<string>, R: number): Vertex[] {
  const out: Vertex[] = [vertices[0]];
  for (let i = 1; i < vertices.length - 1; i++) {
    const v = vertices[i];
    if (v.node && junctionNodes.has(v.node)) { out.push(v); continue; }
    const prev = vertices[i - 1].p, next = vertices[i + 1].p, f = frameAt(v.p);
    const a3 = heading(v.p, prev), b3 = heading(v.p, next);
    const a: V2 = v2.unit([dot(a3, f.east), dot(a3, f.north)]), b: V2 = v2.unit([dot(b3, f.east), dot(b3, f.north)]);
    const alpha = Math.acos(Math.max(-1, Math.min(1, v2.dot(a, b))));
    if (alpha > Math.PI - .02) { out.push(v); continue; }
    let radius = bendRadius(cls), L = radius / Math.tan(alpha / 2);
    const limit = .45 * Math.min(arc(v.p, prev, R), arc(v.p, next, R));
    if (L > limit) { L = limit; radius = L * Math.tan(alpha / 2); }
    const T1 = v2.scale(a, L), T2 = v2.scale(b, L), m = v2.unit(v2.add(a, b)), C = v2.scale(m, radius / Math.sin(alpha / 2));
    const t1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]);
    let delta = Math.atan2(T2[1] - C[1], T2[0] - C[0]) - t1; while (delta > Math.PI) delta -= 2 * Math.PI; while (delta < -Math.PI) delta += 2 * Math.PI;
    const count = Math.max(2, Math.ceil(Math.abs(delta) * radius / .2));
    for (let k = 0; k <= count; k++) {
      const th = t1 + delta * k / count;
      out.push({ p: fromLocal(v.p, [C[0] + Math.cos(th) * radius, C[1] + Math.sin(th) * radius], R, f) });
    }
  }
  out.push(vertices[vertices.length - 1]);
  return out;
}
/** Uniform resampling per span between key vertices (nodes and ends stay exact samples). */
function resample(points: Vertex[], step: number, R: number): { samples: Sample[]; nodes: { node: string; s: number }[] } {
  const samples: { p: V3; s: number }[] = [], nodes: { node: string; s: number }[] = [];
  let s0 = 0, spanStart = 0;
  const flush = (end: number) => {
    // Cumulative lengths within the span.
    const cum = [0];
    for (let i = spanStart + 1; i <= end; i++) cum.push(cum[cum.length - 1] + arc(points[i - 1].p, points[i].p, R));
    const total = cum[cum.length - 1], count = Math.max(1, Math.round(total / step));
    for (let k = samples.length ? 1 : 0; k <= count; k++) {
      const target = total * k / count;
      let j = 1; while (j < cum.length - 1 && cum[j] < target) j++;
      const local = cum[j] - cum[j - 1] < 1e-9 ? 0 : (target - cum[j - 1]) / (cum[j] - cum[j - 1]);
      samples.push({ p: slerp(points[spanStart + j - 1].p, points[spanStart + j].p, Math.max(0, Math.min(1, local))), s: s0 + target });
    }
    s0 += total; spanStart = end;
  };
  for (let i = 1; i < points.length; i++) if (points[i].node || i === points.length - 1) {
    flush(i);
    if (points[i].node) nodes.push({ node: points[i].node!, s: s0 });
  }
  if (points[0].node) nodes.unshift({ node: points[0].node, s: 0 });
  const out: Sample[] = samples.map((sample, i) => {
    const a = samples[Math.max(0, i - 1)].p, b = samples[Math.min(samples.length - 1, i + 1)].p;
    const t = i === 0 ? heading(sample.p, b) : i === samples.length - 1 ? tangent(sample.p, unit(cross(cross(a, sample.p), sample.p))) : tangent(sample.p, [b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    // Last sample: continue the direction away from the previous point.
    const tt = i === samples.length - 1 && samples.length > 1 ? heading(sample.p, a).map(v => -v) as V3 : t;
    return { p: sample.p, t: tt, r: unit(cross(tt, sample.p)), s: sample.s };
  });
  return { samples: out, nodes };
}
/** Interpolated sample at arclength s (clamped). */
export function sampleAt(line: readonly Sample[], s: number): Sample {
  if (s <= line[0].s) return line[0];
  if (s >= line[line.length - 1].s) return line[line.length - 1];
  let lo = 0, hi = line.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (line[mid].s <= s) lo = mid; else hi = mid; }
  const a = line[lo], b = line[hi], k = (s - a.s) / (b.s - a.s || 1), p = slerp(a.p, b.p, k);
  const t = tangent(p, [a.t[0] + (b.t[0] - a.t[0]) * k, a.t[1] + (b.t[1] - a.t[1]) * k, a.t[2] + (b.t[2] - a.t[2]) * k]);
  return { p, t, r: unit(cross(t, p)), s };
}
function slice(line: readonly Sample[], from: number, to: number): Sample[] {
  const out = [sampleAt(line, from)];
  for (const sample of line) if (sample.s > from + 1e-6 && sample.s < to - 1e-6) out.push(sample);
  out.push(sampleAt(line, to));
  return out;
}
/** Distance from a direction to a plaza shape boundary (negative inside). */
export function plazaDistance(plaza: Plaza, p: V3, R = PLAN_RADIUS): number {
  if (plaza.centres.length === 1) return arc(p, plaza.centres[0], R) - plaza.radius;
  return segmentDistance(p, plaza.centres[0], plaza.centres[1], R).distance - plaza.radius;
}
const CLASS_RANK: Record<RoadClass, number> = { main: 3, branch: 2, lane: 1, door: 0 };

export function buildNetwork(plan: PlanetPlan, R = PLAN_RADIUS): Network {
  const point = (p: PlanPoint) => resolvePoint(plan, p);
  const plazas: Plaza[] = plan.plazas.map(p => {
    const centres = Array.isArray(p.at) && p.at.length === 2 && (typeof p.at[0] === 'string' || Array.isArray(p.at[0])) ? (p.at as [PlanPoint, PlanPoint]).map(point) : [point(p.at as PlanPoint)];
    return { id: p.id, kind: p.kind, district: p.district, name: p.name, nameZh: p.nameZh, centres, radius: p.radius };
  });
  const plazaNodes = new Map<string, string>();
  for (const p of plan.plazas) {
    const at = Array.isArray(p.at) && p.at.length === 2 && (typeof p.at[0] === 'string' || Array.isArray(p.at[0])) ? p.at as PlanPoint[] : [p.at as PlanPoint];
    for (const c of at) if (typeof c === 'string') plazaNodes.set(c, p.id);
  }
  // Any node standing inside a plaza belongs to it: roads end at the plaza border.
  for (const node of Object.keys(plan.nodes)) for (const plaza of plazas)
    if (!plazaNodes.has(node) && plazaDistance(plaza, point(node), R) < 0) plazaNodes.set(node, plaza.id);
  // Node incidence: a node used by two or more roads, or by one road at a branch, is a junction.
  const uses = new Map<string, Set<string>>(), endsAt = new Map<string, number>();
  for (const road of plan.roads) road.path.forEach((p, i) => {
    if (typeof p !== 'string' || !(p in plan.nodes)) return;
    if (!uses.has(p)) uses.set(p, new Set());
    uses.get(p)!.add(road.id);
    endsAt.set(p, (endsAt.get(p) ?? 0) + (i === 0 || i === road.path.length - 1 ? 1 : 2));
  });
  const junctionNodes = new Set([...uses.entries()].filter(([node, roads]) => !plazaNodes.has(node) && (roads.size > 1 || (endsAt.get(node) ?? 0) > 2)).map(([node]) => node));
  const splitNodes = new Set([...junctionNodes, ...plazaNodes.keys()]);
  const roads: NetworkRoad[] = plan.roads.map(road => {
    const vertices: Vertex[] = road.path.map(p => ({ p: point(p), node: typeof p === 'string' && splitNodes.has(p) ? p : undefined }));
    const line = resample(filleted(vertices, road.class, splitNodes, R), ROAD_PROFILES[road.class].step, R);
    return { id: road.id, class: road.class, name: road.name, nameZh: road.nameZh, district: road.district, line: line.samples,
      length: line.samples[line.samples.length - 1].s, nodes: line.nodes };
  });
  // Pieces between split nodes.
  interface Draft { id: string; road: NetworkRoad; from: number; to: number; start: PieceEnd; end: PieceEnd; startNode?: string; endNode?: string }
  const drafts: Draft[] = [];
  for (const road of roads) {
    const cuts = road.nodes.filter(n => n.s > 1e-6 && n.s < road.length - 1e-6);
    const bounds = [{ s: 0, node: road.nodes.find(n => n.s <= 1e-6)?.node }, ...cuts.map(c => ({ s: c.s, node: c.node as string | undefined })), { s: road.length, node: road.nodes.find(n => n.s >= road.length - 1e-6)?.node }];
    for (let i = 1; i < bounds.length; i++) {
      const a = bounds[i - 1], b = bounds[i];
      const endOf = (node: string | undefined): PieceEnd => node && plazaNodes.has(node) ? { kind: 'plaza', plaza: plazaNodes.get(node)! } : node && junctionNodes.has(node) ? { kind: 'junction', node } : { kind: 'cap' };
      drafts.push({ id: `${road.id}#${i}`, road, from: a.s, to: b.s, start: endOf(a.node), end: endOf(b.node), startNode: a.node, endNode: b.node });
    }
  }
  // Plaza trimming: every piece end inside a plaza shape is cut back to its border.
  for (const d of drafts) for (const plaza of plazas) {
    const inside = (s: number) => plazaDistance(plaza, sampleAt(d.road.line, s).p, R) < -.12;
    if (inside(d.from)) { let s = d.from; while (s < d.to && inside(s)) s += .05; d.from = Math.min(s, d.to); d.start = { kind: 'plaza', plaza: plaza.id }; }
    if (inside(d.to)) { let s = d.to; while (s > d.from && inside(s)) s -= .05; d.to = Math.max(s, d.from); d.end = { kind: 'plaza', plaza: plaza.id }; }
  }
  // Junctions.
  const junctions: Junction[] = [];
  for (const node of junctionNodes) {
    const center = point(node), f = frameAt(center);
    const ends: { d: Draft; atStart: boolean; u: V2; w: number; cls: RoadClass; trim: number }[] = [];
    for (const d of drafts) for (const atStart of [true, false]) {
      if ((atStart ? d.startNode : d.endNode) !== node) continue;
      const ref = sampleAt(d.road.line, atStart ? d.from + 1.2 : d.to - 1.2).p, u3 = heading(center, ref);
      ends.push({ d, atStart, u: v2.unit([dot(u3, f.east), dot(u3, f.north)]), w: ROAD_PROFILES[d.road.class].paved / 2, cls: d.road.class, trim: 0 });
    }
    ends.sort((a, b) => Math.atan2(a.u[1], a.u[0]) - Math.atan2(b.u[1], b.u[0]));
    const cls = ends.reduce((best, e) => CLASS_RANK[e.cls] > CLASS_RANK[best] ? e.cls : best, ends[0].cls);
    interface CornerDraft { i: number; j: number; inner: V2[]; sA: number; sB: number; reflex: boolean }
    const drafts2: CornerDraft[] = [];
    for (let i = 0; i < ends.length; i++) {
      const j = (i + 1) % ends.length, a = ends[i], b = ends[j];
      let phi = Math.atan2(b.u[1], b.u[0]) - Math.atan2(a.u[1], a.u[0]);
      while (phi <= 0) phi += 2 * Math.PI;
      if (ends.length === 1) phi = 2 * Math.PI;
      const na = rot90(a.u), nb = rot90(b.u);
      // Near-straight corners join with a straight taper: their edge lines are almost parallel.
      if (phi < 2.45) {
        // a.u s + na wa = b.u t - nb wb
        const rhs = v2.sub(v2.scale(nb, -b.w), v2.scale(na, a.w)), det = a.u[0] * -b.u[1] - a.u[1] * -b.u[0];
        const s = (rhs[0] * -b.u[1] - rhs[1] * -b.u[0]) / det;
        const X = v2.add(v2.scale(a.u, s), v2.scale(na, a.w));
        // Sharp corners keep a short tangent: the fillet shrinks rather than eating the road.
        const k = Math.min(Math.min(ROAD_PROFILES[a.cls].corner, ROAD_PROFILES[b.cls].corner) / Math.tan(phi / 2), 1.6), rc = k * Math.tan(phi / 2);
        const A = v2.add(X, v2.scale(a.u, k)), B = v2.add(X, v2.scale(b.u, k));
        const C = v2.add(X, v2.scale(v2.unit(v2.add(a.u, b.u)), rc / Math.sin(phi / 2)));
        const ta = Math.atan2(A[1] - C[1], A[0] - C[0]); let delta = Math.atan2(B[1] - C[1], B[0] - C[0]) - ta;
        while (delta > Math.PI) delta -= 2 * Math.PI; while (delta < -Math.PI) delta += 2 * Math.PI;
        const n = Math.max(2, Math.ceil(Math.abs(delta) * rc / .15)), inner: V2[] = [];
        for (let k2 = 0; k2 <= n; k2++) { const th = ta + delta * k2 / n; inner.push([C[0] + Math.cos(th) * rc, C[1] + Math.sin(th) * rc]); }
        drafts2.push({ i, j, inner, sA: v2.dot(A, a.u), sB: v2.dot(B, b.u), reflex: false });
      } else drafts2.push({ i, j, inner: [], sA: 0, sB: 0, reflex: phi > Math.PI + .35 });
    }
    for (const c of drafts2) { ends[c.i].trim = Math.max(ends[c.i].trim, c.sA); ends[c.j].trim = Math.max(ends[c.j].trim, c.sB); }
    if (typeof process !== 'undefined' && process.env.PLAN_DEBUG === node) console.log(node, ends.map(e => ({ road: e.d.id, at: e.atStart, deg: Math.atan2(e.u[1], e.u[0]) * 180 / Math.PI, w: e.w, trim: e.trim, from: e.d.from, to: e.d.to })), drafts2.map(c => ({ i: c.i, j: c.j, sA: c.sA, sB: c.sB, n: c.inner.length })));
    for (const e of ends) {
      e.trim = Math.max(e.trim, Math.min(e.w, .6), .25);
      if (e.atStart) e.d.from = Math.min(e.d.to, e.d.from + e.trim); else e.d.to = Math.max(e.d.from, e.d.to - e.trim);
    }
    // Outline: R_i, L_i, corner(i→j)...
    const outline: V2[] = [], corners: JunctionCorner[] = [];
    // Use the road's own trimmed cross-section points so seams are exact.
    const edgePoint = (e: typeof ends[number], side: 1 | -1): V2 => {
      const s = e.atStart ? e.d.from : e.d.to, sample = sampleAt(e.d.road.line, s);
      // Right of the road direction at the cut; the road direction leaves the node for atStart.
      const right = e.atStart ? sample.r : sample.r.map(v => -v) as V3;
      const q = fromLocalRight(sample.p, right, -side * e.w, R);
      return toLocal(center, q, R, f);
    };
    for (const c of drafts2) {
      const a = ends[c.i], b = ends[c.j];
      const Ri = edgePoint(a, -1), Li = edgePoint(a, 1), Rj = edgePoint(b, -1);
      if (!outline.length) outline.push(Ri);
      outline.push(Li);
      let path: V2[];
      if (c.inner.length) path = [Li, ...c.inner, Rj];
      else if (c.reflex) {
        // Round the outside of a one-sided junction about the node.
        const ra = v2.len(Li), rb = v2.len(Rj), t1 = Math.atan2(Li[1], Li[0]); let delta = Math.atan2(Rj[1], Rj[0]) - t1;
        while (delta <= 0) delta += 2 * Math.PI;
        const n = Math.max(4, Math.ceil(delta * Math.max(ra, rb) / .2));
        path = Array.from({ length: n + 1 }, (_, k) => { const th = t1 + delta * k / n, rr = ra + (rb - ra) * k / n; return [Math.cos(th) * rr, Math.sin(th) * rr] as V2; });
      } else path = [Li, Rj];
      for (const q of path.slice(1, -1)) outline.push(q);
      if (c.j !== 0) outline.push(Rj);
      // Outward normals: left of a.u is outward on the a side; right of b.u on the b side; toward the arc centre on the arc.
      const normals = path.map((q, k) => {
        if (k === 0) return rot90(a.u);
        if (k === path.length - 1) return v2.scale(rot90(b.u), -1);
        const prev = path[k - 1], next = path[k + 1], tan = v2.unit(v2.sub(next, prev));
        return [tan[1], -tan[0]] as V2; // right of the CCW boundary direction = outward
      });
      const kerb = a.cls === 'main' && b.cls === 'main';
      const lower = CLASS_RANK[a.cls] < CLASS_RANK[b.cls] ? a.cls : b.cls;
      corners.push({ points: path, normals, kerb, edge: ROAD_PROFILES[kerb ? 'main' : lower].edge, kerbWidth: kerb ? ROAD_PROFILES.main.kerb : 0, kerbHeight: kerb ? ROAD_PROFILES.main.kerbHeight : 0 });
    }
    junctions.push({ node, center, class: cls, outline, corners });
  }
  const pieces: Piece[] = drafts.filter(d => d.to - d.from > .05).map(d => ({
    id: d.id, road: d.road.id, class: d.road.class, samples: slice(d.road.line, d.from, d.to), start: d.start, end: d.end,
  }));
  return { radius: R, roads, pieces, junctions, plazas, point };
}
/** Point offset sideways from p along the unit right vector (negative = left). */
export function fromLocalRight(p: V3, right: V3, offset: number, R: number): V3 {
  if (Math.abs(offset) < 1e-12) return [...p];
  const a = offset / R;
  return unit([p[0] * Math.cos(a) + right[0] * Math.sin(a), p[1] * Math.cos(a) + right[1] * Math.sin(a), p[2] * Math.cos(a) + right[2] * Math.sin(a)]);
}
/** Nearest road or plaza surface to a direction: distance from its outer edge (negative inside). */
export function surfaceClearance(network: Network, p: V3): { distance: number; road?: string; plaza?: string; class?: RoadClass } {
  let best: { distance: number; road?: string; plaza?: string; class?: RoadClass } = { distance: Infinity };
  for (const piece of network.pieces) {
    const half = roadHalfWidth(piece.class);
    for (let i = 1; i < piece.samples.length; i++) {
      const a = piece.samples[i - 1].p, b = piece.samples[i].p;
      if (angle(p, a) * network.radius > 6 + half) { i += 4; continue; }
      const d = segmentDistance(p, a, b, network.radius).distance - half;
      if (d < best.distance) best = { distance: d, road: piece.road, class: piece.class };
    }
  }
  for (const j of network.junctions) {
    const local = toLocal(j.center, p, network.radius);
    if (v2.len(local) > 8) continue;
    if (pointInPolygon(local, j.outline)) best = { distance: -1, road: `junction:${j.node}`, class: j.class };
  }
  for (const plaza of network.plazas) {
    const d = plazaDistance(plaza, p, network.radius);
    if (d < best.distance) best = { distance: d, plaza: plaza.id };
  }
  return best;
}
export function pointInPolygon(p: V2, poly: readonly V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Door paths as short 'door' pieces from an entrance to the paving it meets. */
export function doorPieces(doorPaths: readonly { lot: string; from: V3; to: V3 }[], R = PLAN_RADIUS): Piece[] {
  return doorPaths.map(raw => {
    // Drawn on under the step foot or apron edge the entrance point stands clear of.
    const d = { ...raw, from: walk(raw.from, heading(raw.from, raw.to), -.24, R) };
    const count = Math.max(1, Math.ceil(arc(d.from, d.to, R) / ROAD_PROFILES.door.step)), samples: Sample[] = [];
    for (let i = 0; i <= count; i++) {
      const p = slerp(d.from, d.to, i / count), t = i === count ? heading(p, d.from).map(v => -v) as V3 : heading(p, d.to);
      samples.push({ p, t, r: unit(cross(t, p)), s: arc(d.from, p, R) });
    }
    return { id: `door:${d.lot}`, road: `door:${d.lot}`, class: 'door' as const, samples, start: { kind: 'cap' as const }, end: { kind: 'join' as const, road: 'street' } };
  });
}
