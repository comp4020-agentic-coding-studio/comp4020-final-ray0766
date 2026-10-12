import type { PartPlacement } from '../blueprint-model.ts';
import { structureFit, structureSize } from '../blueprints.ts';
import { objectRadius } from '../planets.ts';
import type { HeightField } from '../../assets/claude-geometry/core/ground.ts';
import { NPCS, SPAWN } from '../world.ts';
import { HUB_DOCK } from '../ports.ts';
import { HUB_SHIP } from '../harbour-layout.ts';
import { CLEARANCE, PLAN_RADIUS, PLAZA, RESERVES, ROAD_PROFILES, STREET_PROPS, roadHalfWidth } from './params.ts';
import type { RoadClass } from './params.ts';
import type { PlanetPlan, PlanLot } from './schema.ts';
import { buildNetwork, doorPieces, plazaDistance, pointInPolygon, sampleAt, v2 } from './network.ts';
import type { Network, Piece } from './network.ts';
import { PUBLIC_COMPOSITIONS } from './compositions.ts';
import type { Composition } from './compositions.ts';
import { compositionFootprint, mirrorParts } from './footprint.ts';
import type { Footprint, Rect } from './footprint.ts';
import { anchorPoint, angle, arc, cross, dot, frameAt, heading, latLonOf, madd, scale, seeded, segmentDistance, slerp, tangent, toLocal, unit, walk, yawFacing } from './sphere.ts';
import type { V2, V3 } from './sphere.ts';

export interface PlannedLot {
  id: string; district: string; composition: Composition; mirror: boolean; parts: PartPlacement[];
  position: V3; rotation: number; footprint: Footprint;
  /** Outside point of the main entrance (door path start), world unit direction. */
  entry: V3;
  /** World corners of the base and canopy rectangles (CCW from above). */
  base: V3[]; canopy: V3[];
  frontRoad?: string; frontPlaza?: string;
  /** The explicit or frontage-generated lot this came from. */
  spec: PlanLot;
}
export interface PlannedProp { id: string; kind: 'lamp' | 'tree' | 'bench' | 'flowers'; position: V3; rotation: number; area?: string }
export interface PlanConflict { id: string; severity: 'error' | 'warning'; kind: string; at: V3; message: string }
export interface PlannedResident { id: string; position: V3; facing?: V3; route?: V3[]; place: string }
export interface PlannedTown {
  plan: PlanetPlan; network: Network; lots: PlannedLot[]; doorPaths: { lot: string; from: V3; to: V3 }[];
  props: PlannedProp[]; residents: PlannedResident[]; conflicts: PlanConflict[];
  routes: { id: string; width: number; points: V3[] }[];
  npcFacing: Record<'mica' | 'sol', V3>;
}

const R = PLAN_RADIUS;
const COMPOSITIONS = new Map(PUBLIC_COMPOSITIONS.map(c => [c.id, c]));
const MIRRORABLE = new Set(PUBLIC_COMPOSITIONS.map(c => c.id));

function rectCorners(position: V3, yaw: number, r: Rect): V3[] {
  return [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]].map(([x, z]) => anchorPoint(position, yaw, x, z, R));
}
/** Points spread over a rectangle's area and perimeter, for clearance probes. */
function rectSamples(position: V3, yaw: number, r: Rect, step = .3): V3[] {
  const out: V3[] = [];
  const nx = Math.max(1, Math.ceil((r.maxX - r.minX) / step)), nz = Math.max(1, Math.ceil((r.maxZ - r.minZ) / step));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) out.push(anchorPoint(position, yaw, r.minX + (r.maxX - r.minX) * i / nx, r.minZ + (r.maxZ - r.minZ) * j / nz, R));
  return out;
}
/** Signed separation of two convex polygons given on the sphere (negative = overlap), metres. */
function polygonGap(a: V3[], b: V3[]): number {
  const centre = unit(a.concat(b).reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]] as V3, [0, 0, 0] as V3)), f = frameAt(centre);
  const pa = a.map(p => toLocal(centre, p, R, f)), pb = b.map(p => toLocal(centre, p, R, f));
  let best = -Infinity;
  for (const [poly, other] of [[pa, pb], [pb, pa]]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], e = v2.unit(v2.sub(q, p)), n: V2 = [e[1], -e[0]];
    // Outward normal of a CCW polygon is the right-hand normal; ensure orientation by testing the centroid.
    const c = poly.reduce((s, v) => v2.add(s, v), [0, 0] as V2).map(v => v / poly.length) as V2;
    const out = v2.dot(v2.sub(c, p), n) > 0 ? v2.scale(n, -1) : n;
    const minOther = Math.min(...other.map(v => v2.dot(v2.sub(v, p), out)));
    best = Math.max(best, minOther);
  }
  return best;
}

export interface PlanOptions { field: HeightField; radius?: number }

export function planTown(plan: PlanetPlan, options: PlanOptions): PlannedTown {
  const network = buildNetwork(plan, R), conflicts: PlanConflict[] = [];
  const report = (severity: PlanConflict['severity'], kind: string, id: string, at: V3, message: string) => conflicts.push({ id, severity, kind, at, message });
  const roadById = new Map(network.roads.map(r => [r.id, r])), plazaById = new Map(network.plazas.map(p => [p.id, p]));
  const fieldRadius = (p: V3) => 10 + options.field.heightAt(p);
  // ---- Lots: explicit lots first, then frontage runs filled around them.
  const lots: PlannedLot[] = [];
  const buildLot = (lot: PlanLot): PlannedLot | null => {
    const composition = COMPOSITIONS.get(lot.composition)!;
    const mirror = lot.mirror ?? (MIRRORABLE.has(composition.id) && seeded(plan.seed, 'mirror', lot.id) < .5);
    const parts = mirror ? mirrorParts(composition.blueprint.parts) : composition.blueprint.parts.map(p => ({ ...p }));
    const footprint = compositionFootprint(parts);
    const xs = composition.blueprint.parts.map(p => p.x), lo = Math.min(...xs), hi = Math.max(...xs);
    const entryX = mirror ? lo + hi - composition.entry.x : composition.entry.x;
    // A body's width outside the last support edge, so a walker standing there clears the step or apron.
    const entryLocal: V2 = [entryX + .5 - footprint.pivot.x, composition.entry.z - footprint.pivot.z + .22];
    const placed = placeLot(lot, network, roadById, plazaById, footprint, plan.seed);
    if (!placed) return null;
    return { id: lot.id, district: lot.district, composition, mirror, parts, position: placed.position, rotation: placed.yaw, footprint,
      entry: anchorPoint(placed.position, placed.yaw, entryLocal[0], entryLocal[1], R),
      base: rectCorners(placed.position, placed.yaw, footprint.base), canopy: rectCorners(placed.position, placed.yaw, footprint.canopy),
      frontRoad: lot.road, frontPlaza: lot.plaza, spec: { ...lot } };
  };
  for (const lot of plan.lots) {
    const planned = buildLot(lot);
    if (!planned) { report('error', 'lot', lot.id, [0, 1, 0], `Lot ${lot.id} refers to a missing road or plaza.`); continue; }
    lots.push(planned);
  }
  const streetsOnly = () => network.pieces.filter(p => p.class !== 'door');
  const fitProblem = (lot: PlannedLot, extraGap: number): string | null => {
    const probe = rectSamples(lot.position, lot.rotation, lot.footprint.base, .35);
    for (const p of probe) {
      const s = streetDistance(network, streetsOnly(), p);
      if (s.road === lot.frontRoad ? s.d < .02 : s.d < ROAD_PROFILES[s.cls].setback - .12) return `street ${s.road} ${s.d.toFixed(2)}`;
      for (const plaza of network.plazas) if (plazaDistance(plaza, p, R) < PLAZA.border + .3) return `plaza ${plaza.id}`;
      for (const r of RESERVE_LIST) if (arc(p, r.at, R) < r.radius) return `reserve ${r.id}`;
    }
    for (const p of rectSamples(lot.position, lot.rotation, lot.footprint.canopy, .45)) { const s = streetDistance(network, streetsOnly(), p); if (s.d < CLEARANCE.canopyToRoad) return `eave ${s.road} ${s.d.toFixed(2)}`; }
    for (const other of lots) {
      if (arc(other.position, lot.position, R) > 9) continue;
      if (polygonGap(other.base, lot.base) < CLEARANCE.buildingGap + extraGap || polygonGap(other.canopy, lot.canopy) < .05) return `gap ${other.id}`;
    }
    // The shared placement contract keeps every structure's circle 2.5 m off the parked craft.
    if (arc(lot.position, HUB_SHIP as V3, R) < structureSize(lot.parts).radius + 2.5) return 'reserve ship landing';
    return null;
  };
  for (const f of plan.frontages ?? []) {
    const road = roadById.get(f.road)!;
    let s = f.from, k = 0, prev = '';
    while (s < f.to && k < 40) {
      let pick = f.compositions[Math.floor(seeded(plan.seed, f.id, k, s.toFixed(1)) * f.compositions.length)];
      if (pick === prev && f.compositions.length > 1) pick = f.compositions[(f.compositions.indexOf(pick) + 1) % f.compositions.length];
      const spec: PlanLot = { id: `${f.id}-${k + 1}`, district: f.district, composition: pick, road: f.road, side: f.side, at: s, setback: f.setback };
      let lot = buildLot(spec)!;
      // Shift so the lot's along-road extent starts at s.
      const sample = sampleAt(road.line, spec.at), along = lot.canopy.map(c => dot(madd(c, sample.p, -dot(c, sample.p)), sample.t) * R);
      spec.at = s - Math.min(...along);
      lot = buildLot(spec)!;
      const sample2 = sampleAt(road.line, spec.at), along2 = lot.canopy.map(c => dot(madd(c, sample2.p, -dot(c, sample2.p)), sample2.t) * R);
      const end = spec.at + Math.max(...along2);
      if (end > f.to) break;
      const why = fitProblem(lot, f.gap ?? 0);
      if (typeof process !== 'undefined' && (process.env.PLAN_DEBUG === f.id || process.env.PLAN_DEBUG === 'frontages')) console.log(f.id, pick, spec.at.toFixed(2), end.toFixed(2), why ?? 'ok');
      // The along-road gap is measured at the centreline; neighbours' backs converge on a sphere.
      if (!why) { lots.push(lot); prev = pick; k++; s = end + CLEARANCE.buildingGap + .2 + (f.gap ?? 0); }
      else s += why.startsWith('gap') ? .2 : .5;
    }
  }
  // ---- Door paths: from the entrance to the nearest paved surface, as short 'door' pieces.
  const doorPaths: PlannedTown['doorPaths'] = [];
  for (const lot of lots) {
    const spec = lot.spec;
    if (spec.noDoorPath) continue;
    const target = nearestSurface(network, lot.entry, spec);
    if (!target) { report('error', 'entrance', lot.id, lot.entry, `No street within reach of ${lot.id}'s entrance.`); continue; }
    const length = arc(lot.entry, target, R);
    if (length > CLEARANCE.maxDoorPath) report('warning', 'entrance', lot.id, lot.entry, `${lot.id}: door path ${length.toFixed(1)} m long.`);
    if (length > .05) doorPaths.push({ lot: lot.id, from: lot.entry, to: target });
  }
  network.pieces.push(...doorPieces(doorPaths, R));
  // ---- Checks: buildings against streets, plazas, reserves, each other.
  const reserves = RESERVE_LIST;
  const streets = network.pieces.filter(p => p.class !== 'door');
  const surfaceDistance = (p: V3, pieces: Piece[]) => streetDistance(network, pieces, p);
  for (const lot of lots) {
    const probe = rectSamples(lot.position, lot.rotation, lot.footprint.base);
    let worst = { d: Infinity, cls: 'lane' as RoadClass, road: '', at: lot.position };
    for (const p of probe) { const s = surfaceDistance(p, streets); if (s.d < worst.d) worst = { ...s, at: p }; }
    if (worst.d < .02) report('error', 'street', lot.id, worst.at, `${lot.id} stands on ${worst.road} (${worst.d.toFixed(2)} m).`);
    else if (worst.d < ROAD_PROFILES[worst.cls].setback - .12) report('warning', 'setback', lot.id, worst.at, `${lot.id} is ${worst.d.toFixed(2)} m from ${worst.road}; ${ROAD_PROFILES[worst.cls].setback} m wanted.`);
    let eave = Infinity, eaveAt = lot.position;
    for (const p of rectSamples(lot.position, lot.rotation, lot.footprint.canopy, .4)) { const s = surfaceDistance(p, streets); if (s.d < eave) { eave = s.d; eaveAt = p; } }
    if (eave < CLEARANCE.canopyToRoad) report('error', 'eave', lot.id, eaveAt, `${lot.id}'s eaves or awning reach over the street (${eave.toFixed(2)} m).`);
    for (const plaza of network.plazas) {
      const d = Math.min(...probe.map(p => plazaDistance(plaza, p, R)));
      if (d < PLAZA.border * .5) report('error', 'plaza', lot.id, lot.position, `${lot.id} stands on ${plaza.id} (${d.toFixed(2)} m).`);
    }
    for (const r of reserves) {
      const d = Math.min(...probe.map(p => arc(p, r.at, R)));
      if (d < r.radius) report('error', 'reserve', lot.id, r.at, `${lot.id} enters the ${r.id} reserve (${d.toFixed(2)} m of ${r.radius} m).`);
    }
    if (arc(lot.position, HUB_SHIP as V3, R) < structureSize(lot.parts).radius + 2.5) report('error', 'reserve', lot.id, HUB_SHIP as V3, `${lot.id} is inside the craft's landing clearance.`);
  }
  for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) {
    const a = lots[i], b = lots[j];
    if (arc(a.position, b.position, R) > 9) continue;
    const gap = polygonGap(a.base, b.base), roof = polygonGap(a.canopy, b.canopy);
    if (gap < CLEARANCE.buildingGap) report(gap < 0 ? 'error' : 'warning', 'gap', `${a.id}/${b.id}`, slerp(a.position, b.position, .5), `${a.id} and ${b.id} are ${gap.toFixed(2)} m apart (${CLEARANCE.buildingGap} m wanted).`);
    else if (roof < .05) report('error', 'eave', `${a.id}/${b.id}`, slerp(a.position, b.position, .5), `${a.id} and ${b.id} eaves touch (${roof.toFixed(2)} m).`);
  }
  for (const d of doorPaths) for (const lot of lots) {
    if (lot.id === d.lot) continue;
    const pts = Array.from({ length: 9 }, (_, i) => slerp(d.from, d.to, i / 8));
    const centre = lot.position, f = frameAt(centre), poly = lot.base.map(p => toLocal(centre, p, R, f));
    if (pts.some(p => pointInPolygon(toLocal(centre, p, R, f), poly))) report('error', 'entrance', d.lot, d.from, `${d.lot}'s door path crosses ${lot.id}.`);
  }
  // Entrance heights: floor above the ground at the entrance.
  for (const lot of lots) {
    const fit = structureFit(lot.parts, lot.position, lot.rotation, options.field), ground = fieldRadius(lot.entry);
    const rise = fit.baseRadius - ground, steps = lot.parts.some(p => p.part === 'step.entry' || p.part === 'step.entry-wide' || p.part === 'garden.gate');
    if (rise > (steps ? .62 : .24)) report('warning', 'entrance', lot.id, lot.entry, `${lot.id}'s floor is ${rise.toFixed(2)} m above its entrance ground.`);
  }
  // ---- Props: street lamps, then planting and benches in areas.
  const props: PlannedProp[] = [];
  const lotRadius = new Map(lots.map(l => [l.id, structureSize(l.parts).radius]));
  const propRadius = (kind: PlannedProp['kind']) => objectRadius({ kind, assetVersion: 2 });
  /** The ordinary placement contract's circle spacing (planets.ts placementGeometryProblem). */
  const circleBlocked = (p: V3, kind: PlannedProp['kind']) => lots.some(l => arc(p, l.position, R) < lotRadius.get(l.id)! + propRadius(kind) + .08)
    || props.some(o => arc(p, o.position, R) < propRadius(o.kind) + propRadius(kind) + .08);
  const blockers = (p: V3, clearance: number) => {
    for (const lot of lots) {
      if (arc(p, lot.position, R) > 8) continue;
      const f = frameAt(lot.position), poly = lot.canopy.map(c => toLocal(lot.position, c, R, f)), q = toLocal(lot.position, p, R, f);
      if (pointInPolygon(q, poly)) return true;
      if (polygonGap(lot.canopy, ring(p, clearance)) < 0) return true;
    }
    for (const r of reserves) if (arc(p, r.at, R) < r.radius + clearance) return true;
    for (const prop of props) if (arc(p, prop.position, R) < (prop.kind === 'tree' ? .9 : .7)) return true;
    return false;
  };
  const onSurface = (p: V3, margin: number) => {
    const s = surfaceDistance(p, network.pieces);
    if (s.d < margin) return true;
    for (const plaza of network.plazas) if (plazaDistance(plaza, p, R) < margin) return true;
    return false;
  };
  let lampIndex = 0;
  for (const road of network.roads) {
    const spacing = plan.streetLamps?.[road.id] ?? (road.class === 'main' ? STREET_PROPS.lampMain : road.class === 'branch' ? STREET_PROPS.lampBranch : 0);
    if (!spacing) continue;
    const offset = roadHalfWidth(road.class) + STREET_PROPS.lampOffset;
    for (let s = spacing / 2, k = 0; s < road.length - 1; s += spacing, k++) {
      const sample = sampleAt(road.line, s);
      for (const side of k % 2 ? [1, -1] : [-1, 1]) {
        const p = walk(sample.p, scale(sample.r, side), offset, R);
        if (onSurface(p, CLEARANCE.propToPaving) || blockers(p, .35) || circleBlocked(p, 'lamp')) continue;
        props.push({ id: `lamp-${lampIndex++}`, kind: 'lamp', position: p, rotation: yawFacing(p, scale(sample.r, -side)) });
        break;
      }
    }
  }
  for (const area of plan.areas) {
    const centre = network.point(area.at), f = frameAt(centre);
    const want: [PlannedProp['kind'], number][] = [['tree', area.trees ?? 0], ['bench', area.benches ?? 0], ['flowers', area.flowers ?? 0]];
    for (const [kind, count] of want) {
      let made = 0;
      for (let attempt = 0; attempt < 60 * count && made < count; attempt++) {
        const a = seeded(plan.seed, area.id, kind, attempt) * Math.PI * 2, r = Math.sqrt(seeded(plan.seed, area.id, kind, 'r', attempt)) * area.radius;
        const p = walk(centre, unit(madd(scale(f.east, Math.cos(a)), f.north, Math.sin(a))), r, R);
        if (onSurface(p, kind === 'tree' ? .8 : CLEARANCE.propToPaving) || blockers(p, kind === 'tree' ? .5 : .3) || circleBlocked(p, kind)) continue;
        props.push({ id: `${area.id}-${kind}-${made}`, kind, position: p, rotation: seeded(plan.seed, area.id, kind, 'yaw', attempt) * Math.PI * 2, area: area.id });
        made++;
      }
      if (made < count) report('warning', 'area', area.id, centre, `${area.id}: placed ${made} of ${count} ${kind}.`);
    }
  }
  for (const prop of plan.props) {
    const p = network.point(prop.at);
    if (onSurface(p, prop.kind === 'bench' ? -10 : CLEARANCE.propToPaving) && prop.kind !== 'bench') report('warning', 'prop', prop.id, p, `${prop.id} stands on paving.`);
    props.push({ id: prop.id, kind: prop.kind, position: p, rotation: (prop.facing ?? 0) * Math.PI / 180 });
  }
  // ---- Residents (scenery only) and the two task characters' facing.
  const residents: PlannedResident[] = [];
  for (const r of plan.residents) {
    if (r.lot) {
      const lot = lots.find(l => l.id === r.lot), door = doorPaths.find(d => d.lot === r.lot);
      if (!lot || !door) { report('error', 'resident', r.id, [0, 1, 0], `${r.id}: no lot or door path ${r.lot}.`); continue; }
      const mid = slerp(door.from, door.to, .55), along = heading(mid, door.from), side = unit(cross(along, mid));
      const position = walk(mid, scale(side, r.side === 'left' ? -1 : 1), .85, R);
      residents.push({ id: r.id, place: r.place, position, facing: walk(position, heading(position, door.from), .5, R) });
    } else if (r.road) {
      const road = roadById.get(r.road)!, sample = sampleAt(road.line, r.at!), sign = r.side === 'left' ? -1 : 1;
      if (r.to !== undefined) {
        const lane = ROAD_PROFILES[road.class].paved / 2 - .35, route: V3[] = [];
        for (let k = 0; k <= 4; k++) { const sm = sampleAt(road.line, r.at! + (r.to - r.at!) * k / 4); route.push(walk(sm.p, scale(sm.r, sign), lane, R)); }
        residents.push({ id: r.id, place: r.place, position: route[0], facing: route[1], route });
      } else {
        const position = walk(sample.p, scale(sample.r, sign), roadHalfWidth(road.class) + .55, R);
        residents.push({ id: r.id, place: r.place, position, facing: sample.p });
      }
    } else {
      const other = residents.find(o => o.id === r.near);
      if (!other) { report('error', 'resident', r.id, [0, 1, 0], `${r.id}: place ${r.near} first.`); continue; }
      const toward = other.facing ? heading(other.position, other.facing) : frameAt(other.position).north;
      const position = walk(other.position, unit(cross(other.position, toward)), r.distance ?? .9, R);
      residents.push({ id: r.id, place: r.place, position, facing: other.position });
      other.facing = position;
    }
  }
  for (const res of residents) {
    if (blockers(res.position, .25) && !res.route) report('warning', 'resident', res.id, res.position, `${res.id} stands close to a building or prop.`);
  }
  const nearestCentre = (p: V3) => {
    let best: { q: V3; d: number } = { q: p, d: Infinity };
    for (const piece of streets) for (const s of piece.samples) { const d = arc(p, s.p, R); if (d < best.d) best = { q: s.p, d }; }
    return best.q;
  };
  const npcFacing = { mica: nearestCentre(NPCS.mica.position as V3), sol: nearestCentre(NPCS.sol.position as V3) };
  // ---- Navigation routes: every street centreline, every door path, the three task walks.
  const routes: PlannedTown['routes'] = [];
  for (const road of network.roads) {
    const pts: V3[] = []; for (let s = 0; s <= road.length + 1e-6; s += Math.min(1, road.length)) pts.push(sampleAt(road.line, s).p);
    if (arc(pts[pts.length - 1], road.line[road.line.length - 1].p, R) > .05) pts.push(road.line[road.line.length - 1].p);
    routes.push({ id: `street-${road.id}`, width: ROAD_PROFILES[road.class].paved, points: pts });
  }
  for (const d of doorPaths) routes.push({ id: `door-${d.lot}`, width: ROAD_PROFILES.door.paved, points: [nearestOnStreet(streets, d.to), d.to, d.from] });
  const graph = streetGraph(network);
  for (const [id, target] of [['public-post', NPCS.mica.position], ['public-orchard', NPCS.sol.position], ['public-harbour', HUB_DOCK]] as [string, V3][]) {
    const path = graph.route(SPAWN as V3, target);
    if (!path) report('error', 'route', id, target, `No street route from the spawn to ${id}.`);
    else routes.push({ id, width: 1, points: [SPAWN as V3, ...path, target] });
  }
  return { plan, network, lots, doorPaths, props, residents, conflicts, routes, npcFacing };
}

const RESERVE_LIST: { id: string; at: V3; radius: number }[] = [
  { id: 'spawn', at: SPAWN as V3, radius: RESERVES.spawn }, { id: 'dock', at: HUB_DOCK as V3, radius: RESERVES.dock },
  { id: 'ship', at: HUB_SHIP as V3, radius: RESERVES.ship }, { id: 'mica', at: NPCS.mica.position as V3, radius: RESERVES.npc },
  { id: 'sol', at: NPCS.sol.position as V3, radius: RESERVES.npc },
];
/** Distance from p to the outer edge of the nearest street piece or junction (negative inside). */
export function streetDistance(network: Network, pieces: readonly Piece[], p: V3): { d: number; cls: RoadClass; road: string } {
  let best = { d: Infinity, cls: 'lane' as RoadClass, road: '' };
  for (const piece of pieces) {
    const half = roadHalfWidth(piece.class);
    for (let i = 1; i < piece.samples.length; i++) {
      const a = piece.samples[i - 1].p;
      if (angle(p, a) * R > half + 8) { i += Math.max(0, Math.floor(6 / ROAD_PROFILES[piece.class].step) - 1); continue; }
      const d = segmentDistance(p, a, piece.samples[i].p, R).distance - half;
      if (d < best.d) best = { d, cls: piece.class, road: piece.road };
    }
  }
  for (const j of network.junctions) {
    const local = toLocal(j.center, p, R);
    if (v2.len(local) < 9 && pointInPolygon(local, j.outline)) best = { d: -.5, cls: j.class, road: `junction ${j.node}` };
  }
  return best;
}
function ring(p: V3, r: number): V3[] {
  const f = frameAt(p);
  return Array.from({ length: 8 }, (_, i) => walk(p, unit(madd(scale(f.east, Math.cos(i * Math.PI / 4)), f.north, Math.sin(i * Math.PI / 4))), r, R));
}
function nearestOnStreet(streets: Piece[], p: V3): V3 {
  let best = { q: p, d: Infinity };
  for (const piece of streets) for (let i = 1; i < piece.samples.length; i++) {
    const a = piece.samples[i - 1].p, b = piece.samples[i].p, s = segmentDistance(p, a, b, R);
    if (s.distance < best.d) best = { q: slerp(a, b, s.t), d: s.distance };
  }
  return best.q;
}
/** Where a door path from `entry` meets the paving: the lot's own road or plaza first, else the nearest. */
function nearestSurface(network: Network, entry: V3, lot: PlanLot): V3 | null {
  if (lot.plaza) {
    const plaza = network.plazas.find(p => p.id === lot.plaza)!, c = plaza.centres[0];
    const d = arc(entry, c, R) - (plaza.radius - .12);
    return d <= .02 ? null : walk(entry, heading(entry, c), d, R);
  }
  const candidates = network.pieces.filter(p => p.class !== 'door' && (p.road === lot.road || true));
  let best: { q: V3; d: number; half: number; own: boolean } | null = null;
  for (const piece of candidates) for (let i = 1; i < piece.samples.length; i++) {
    const a = piece.samples[i - 1].p, b = piece.samples[i].p, s = segmentDistance(entry, a, b, R);
    const own = piece.road === lot.road, score = s.distance - (own ? .5 : 0);
    if (!best || score < best.d - (best.own ? .5 : 0)) best = { q: slerp(a, b, s.t), d: s.distance, half: ROAD_PROFILES[piece.class].paved / 2, own };
  }
  if (!best || best.d > 12) return null;
  const inset = Math.max(0, best.d - (best.half - .1));
  return inset < .02 ? null : walk(entry, heading(entry, best.q), inset, R);
}
function placeLot(lot: PlanLot, network: Network, roads: Map<string, Network['roads'][number]>, plazas: Map<string, Network['plazas'][number]>, f: Footprint, seed: number): { position: V3; yaw: number } | null {
  void seed;
  if (lot.road) {
    const road = roads.get(lot.road); if (!road) return null;
    const sample = sampleAt(road.line, lot.at), n = scale(sample.r, lot.side === 'left' ? -1 : 1);
    const d0 = roadHalfWidth(road.class) + ROAD_PROFILES[road.class].setback + (lot.setback ?? 0);
    let p = walk(sample.p, n, d0 + f.base.maxZ, R);
    if (lot.shift) p = walk(p, tangent(p, sample.t), lot.shift, R);
    return { position: p, yaw: yawFacing(p, tangent(p, scale(n, -1))) };
  }
  const plaza = plazas.get(lot.plaza!); if (!plaza) return null;
  // Bearing about a disc's centre, or a capsule's midpoint; the edge is found along that bearing.
  const c = plaza.centres.length === 1 ? plaza.centres[0] : slerp(plaza.centres[0], plaza.centres[1], .5);
  const fr = frameAt(c), b = lot.at * Math.PI / 180, u = unit(madd(scale(fr.east, Math.sin(b)), fr.north, Math.cos(b)));
  let lo = 0, hi = plaza.radius + arc(plaza.centres[0], plaza.centres[plaza.centres.length - 1], R) + 1;
  for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (plazaDistance(plaza, walk(c, u, mid, R), R) < 0) lo = mid; else hi = mid; }
  const p = walk(c, u, hi + PLAZA.border + .6 + (lot.setback ?? 0) + f.base.maxZ, R);
  return { position: p, yaw: yawFacing(p, heading(p, walk(c, u, hi, R))) };
}
/** Street graph over the full centrelines; shared points (junction nodes, plaza centres) join roads. */
function streetGraph(network: Network) {
  const points: V3[] = [], edges = new Map<number, { to: number; w: number }[]>();
  const key = (p: V3) => latLonOf(p).map(v => Math.round(v * 200)).join(',');
  const index = new Map<string, number>();
  const id = (p: V3) => { const k = key(p); let i = index.get(k); if (i === undefined) { i = points.length; points.push(p); index.set(k, i); edges.set(i, []); } return i; };
  const link = (a: number, b: number) => { if (a === b) return; const w = arc(points[a], points[b], R); edges.get(a)!.push({ to: b, w }); edges.get(b)!.push({ to: a, w }); };
  for (const road of network.roads) { let prev = -1; for (const s of road.line) { const i = id(s.p); if (prev >= 0) link(prev, i); prev = i; } }
  return {
    route(from: V3, to: V3): V3[] | null {
      const nearest = (p: V3) => points.reduce((best, q, i) => arc(p, q, R) < arc(p, points[best], R) ? i : best, 0);
      const start = nearest(from), goal = nearest(to), dist = new Map<number, number>([[start, 0]]), prev = new Map<number, number>(), open = new Set([start]);
      while (open.size) {
        let u = -1; for (const i of open) if (u < 0 || dist.get(i)! < dist.get(u)!) u = i;
        open.delete(u); if (u === goal) break;
        for (const e of edges.get(u)!) { const d = dist.get(u)! + e.w; if (d < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, d); prev.set(e.to, u); open.add(e.to); } }
      }
      if (!dist.has(goal)) return null;
      const path: V3[] = []; for (let i: number | undefined = goal; i !== undefined; i = prev.get(i)) path.unshift(points[i]);
      return path;
    },
  };
}
export { latLonOf, dot };
