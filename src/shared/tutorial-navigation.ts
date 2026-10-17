import { MAIN_PLANET_LEDGER } from './planet-plan/main-planet.ts';
import { arc, heading, segmentDistance, slerp, walk, cross, unit } from './planet-plan/sphere.ts';
import { FIXED_STEP } from './physics/world.ts';
import type { GroundWorld, GroundPose } from './physics/world.ts';
import type { HomeSurfaceRoute } from './home-layout.ts';
import type { Vec3 } from './world.ts';
import { stationSites } from './teleport.ts';
import type { StationSite } from './teleport.ts';
import type { PlanetView } from './planets.ts';
import { GATE } from './village-kit/geometry.ts';

export type TutorialDestination = 'mica' | 'sol' | 'gate' | 'home';
export interface TutorialTarget { kind: TutorialDestination; position: Vec3; planetId: string }
export interface TutorialNavigationInput {
  position: Vec3; target: TutorialTarget; planetId: string; radius: number;
  homeRoutes?: readonly HomeSurfaceRoute[];
  /** Actual station-derived outside anchors, still subject to physics proof. */
  stationApproaches?: readonly Vec3[];
  /** Pure ordinary-ground replay, never a movement request or player mutation. */
  canConnect?: (from: Vec3, to: Vec3) => boolean;
  /** Already-proved results for this exact scene revision. A hit performs no
   * physics work and must not consume the next frame's new-proof budget. */
  readProofCache?: (from: Vec3, to: Vec3) => boolean | undefined;
  /** Injectable monotonic clock for deterministic correctness tests. Runtime
   * callers omit this and retain the measured four-millisecond budget. */
  clock?: () => number;
}
export interface TutorialNavigation {
  points: Vec3[]; target: Vec3; sourceRoutes: string[];
  connected: boolean; reason: 'route' | 'arrived' | 'checking' | 'no-safe-approach' | 'different-planet' | 'route-too-complex';
}
export const TUTORIAL_NAVIGATION_BUDGET = { connectorChecks: 6, connectorMilliseconds: 4, connectorMetres: 8, homeSegments: 128, bendCandidates: 18, stationCandidates: 3 } as const;
const PUBLIC_IDS = ['public-post', 'public-orchard', 'public-harbour'];
const publicRoutes = MAIN_PLANET_LEDGER.routes.filter(r => PUBLIC_IDS.includes(r.id));
const copy = (p: Vec3): Vec3 => [...p];
const compact = (points: readonly Vec3[], radius: number) => points.filter((p, i) => !i || arc(points[i - 1], p, radius) > .002).map(copy);
const stationApproachCache = new WeakMap<StationSite[], readonly Vec3[]>();
/** Three outside nodes in the gate's actual outward frame, never an assumed
 * world bearing. The ring radius informs reach; every connector is validated. */
export function tutorialStationApproaches(planet: Pick<PlanetView, 'id' | 'radius' | 'environment' | 'objects' | 'blueprints'>): readonly Vec3[] {
  const sites = stationSites(planet), known = stationApproachCache.get(sites); if (known) return known;
  const radius = planet.radius ?? 10, points: Vec3[] = [];
  for (const site of sites.slice(0, 1)) {
    const forward = heading(site.interact, site.arrival), outside = walk(site.arrival, forward, GATE.outer + 1.25, radius);
    const right = unit(cross(heading(outside, site.arrival).map(n => -n) as Vec3, outside));
    for (const side of [-1.2, 1.2, 0]) points.push(walk(outside, right, side, radius));
  }
  stationApproachCache.set(sites, points); return points;
}

export function projectTutorialRoute(points: readonly Vec3[], position: Vec3, radius: number) {
  let best: { point: Vec3; segment: number; distance: number; along: number } | null = null, along = 0;
  for (let i = 1; i < points.length; i++) {
    const projection = segmentDistance(position, points[i - 1], points[i], radius);
    const point = slerp(points[i - 1], points[i], projection.t), length = arc(points[i - 1], points[i], radius);
    if (!best || projection.distance < best.distance) best = { point, segment: i - 1, distance: projection.distance, along: along + length * projection.t };
    along += length;
  }
  return best;
}

/** Only newly introduced connectors need proving. Authored route segments stay
 * exactly as frozen in the ledger/manifest; no corner cutting or smoothing. */
function connector(from: Vec3, to: Vec3, input: TutorialNavigationInput) {
  return arc(from, to, input.radius) <= .012 || input.canConnect?.(from, to) === true;
}
/** A deliberately small local graph: either a straight edge, one of three
 * real gate outside nodes, or one of 18 lateral bends around that same local
 * corridor. No surface/collider relaxation, no global search, no smoothing.
 * Failed/deferred edges are cached by the host, so the graph continues across
 * frames instead of resetting or performing all physics work in one frame. */
function connectorPath(from: Vec3, to: Vec3, input: TutorialNavigationInput): Vec3[] | null {
  if (connector(from, to, input)) return [copy(from), copy(to)];
  const length = arc(from, to, input.radius);
  if (!(length > .012) || length > TUTORIAL_NAVIGATION_BUDGET.connectorMetres * 1.6) return null;
  const candidates = [...(input.stationApproaches ?? []).slice(0, TUTORIAL_NAVIGATION_BUDGET.stationCandidates)];
  for (const offset of [1.2, .6, 1.8]) for (const fraction of [.75, .5, .25]) for (const side of [-1, 1]) {
    const centre = slerp(from, to, fraction), right = unit(cross(heading(centre, to), centre));
    candidates.push(walk(centre, right, offset * side, input.radius));
  }
  for (const bend of candidates) if (connector(from, bend, input) && connector(bend, to, input)) return [copy(from), copy(bend), copy(to)];
  return null;
}
function targetRoute(input: TutorialNavigationInput): HomeSurfaceRoute | null {
  const { target, radius } = input;
  if (input.planetId === 'hub') {
    if (target.kind === 'mica' || target.kind === 'sol') return publicRoutes.find(r => r.id === (target.kind === 'mica' ? 'public-post' : 'public-orchard')) ?? null;
    if (target.kind !== 'gate') return null;
    const door = MAIN_PLANET_LEDGER.routes.find(r => r.id === 'door-teleport-station');
    const spawn = publicRoutes[0]?.points[0];
    if (!door || !spawn || !connector(spawn, door.points[0], input) || !connector(door.points.at(-1)!, target.position, input)) return null;
    return { id: door.id, width: door.width, points: compact([spawn, ...door.points, target.position], radius) };
  }
  const routes = input.homeRoutes ?? [];
  // Prefer the real home path. For the return gate, reverse that path toward
  // the common arrival point, then prove the final short approach to the pad.
  const home = routes.find(r => r.id === 'home') ?? routes.filter(r => r.points.length > 1)
    .sort((a, b) => arc(a.points.at(-1)!, target.position, radius) - arc(b.points.at(-1)!, target.position, radius))[0];
  if (!home) return null;
  let points = home.points.map(copy);
  if (target.kind === 'gate' && arc(points[0], target.position, radius) < arc(points.at(-1)!, target.position, radius)) points.reverse();
  const finalApproach = connectorPath(points.at(-1)!, target.position, input);
  if (!finalApproach) return null;
  // Generated home routes can later be obstructed by saved construction.
  // Their current surface/obstacles must prove every retained segment too.
  for (let i = 1; i < points.length; i++) if (!connector(points[i - 1], points[i], input)) return null;
  points = compact([...points, ...finalApproach.slice(1)], radius);
  return { id: home.id, width: home.width, points };
}

/** A small rooted route graph: public task paths meet at the actual spawn.
 * Mica→Sol therefore follows the existing paths through their shared root,
 * never a great-circle shortcut through a building. Off-route approaches are
 * accepted only after ordinary physics replay; only 12 nearest candidates are
 * considered. No globe search, gameplay writes, or per-frame graph rebuild. */
export function routeToTutorialTarget(input: TutorialNavigationInput): TutorialNavigation {
  const rawConnect = input.canConnect, now = input.clock ?? (() => performance.now()), started = now(), checked = new Map<string, boolean>(); let checks = 0, deferred = false;
  input = { ...input, canConnect(from, to) {
    const key = `${from.join(',')}|${to.join(',')}`;
    const known = checked.get(key); if (known !== undefined) return known;
    const cached = input.readProofCache?.(from, to);
    if (cached !== undefined) { checked.set(key, cached); return cached; }
    if (!rawConnect || arc(from, to, input.radius) > TUTORIAL_NAVIGATION_BUDGET.connectorMetres) return false;
    if (checks >= TUTORIAL_NAVIGATION_BUDGET.connectorChecks || (checks > 0 && now() - started > TUTORIAL_NAVIGATION_BUDGET.connectorMilliseconds)) { deferred = true; return false; }
    checks++; const connected = rawConnect(from, to); checked.set(key, connected); return connected;
  } };
  const result: TutorialNavigation = { points: [], target: copy(input.target.position), sourceRoutes: [], connected: false, reason: 'no-safe-approach' };
  if (input.target.planetId !== input.planetId) return { ...result, reason: 'different-planet' };
  // Real generated manifests use a handful of bends. An unexpectedly huge
  // custom document gets an explicit safe stop instead of cycling a finite
  // proof cache forever, guessing a shortcut or growing memory without bound.
  if (input.planetId !== 'hub' && (input.homeRoutes ?? []).reduce((sum, route) => sum + Math.max(0, route.points.length - 1), 0) > TUTORIAL_NAVIGATION_BUDGET.homeSegments)
    return { ...result, reason: 'route-too-complex' };
  if (arc(input.position, input.target.position, input.radius) <= .22) return { ...result, connected: true, reason: 'arrived' };
  const destination = targetRoute(input);
  if (!destination) {
    // A legacy/custom home can have no generated path. A short direct route
    // is still allowed when the exact current world proves it, never guessed.
    if (input.planetId !== 'hub' && !(input.homeRoutes?.length)) {
      const direct = connectorPath(input.position, input.target.position, input);
      if (direct) return { ...result, points: compact(direct, input.radius), connected: true, reason: 'route' };
    }
    return deferred ? { ...result, reason: 'checking' } : result;
  }
  const sources = input.planetId === 'hub' ? publicRoutes : input.homeRoutes ?? [];
  const candidates: { point: Vec3; distance: number; points: Vec3[]; ids: string[] }[] = [];
  const appendCandidates = (route: HomeSurfaceRoute, pathAfter: Vec3[], ids: string[]) => {
    // Consider every segment, not merely the nearest one behind a wall.
    for (let i = 1; i < route.points.length; i++) {
      const projection = projectTutorialRoute([route.points[i - 1], route.points[i]], input.position, input.radius)!;
      candidates.push({ point: projection.point, distance: projection.distance, points: [projection.point, ...route.points.slice(i), ...pathAfter], ids });
    }
  };
  appendCandidates(destination, [], [destination.id]);
  for (const source of sources) {
    if (source.id === destination.id || arc(source.points[0], destination.points[0], input.radius) > .025) continue;
    appendCandidates({ ...source, points: [...source.points].reverse() }, destination.points.slice(1), [source.id, destination.id]);
  }
  const nearby = candidates.sort((a, b) => a.distance - b.distance).filter(candidate => candidate.distance <= 8).slice(0, 12);
  // The nearest proven candidate is enough; do not replay every candidate
  // simply to shave metres from an already safe instructional walk.
  for (const candidate of nearby) {
    if (!connector(input.position, candidate.point, input)) continue;
    const points = compact([input.position, ...candidate.points], input.radius);
    return { ...result, points, sourceRoutes: candidate.ids, connected: true, reason: 'route' };
  }
  // The public/manifest path root is a known supported corridor anchor. If
  // straight approaches are blocked by a gate, pot or planting, use a proved
  // local bend to reach that root, then retain the exact authored path.
  const approach = connectorPath(input.position, destination.points[0], input);
  if (approach) return { ...result, points: compact([...approach, ...destination.points.slice(1)], input.radius), sourceRoutes: [destination.id], connected: true, reason: 'route' };
  return deferred ? { ...result, reason: 'checking' } : result;
}

/** Read-only local connector proof, bounded to 8 m and .06 m steps. It carries
 * each returned pose, uses no jump/sprint/recovery and rejects sideways slides
 * away from the intended strip. It never touches the real player's pose. */
export function canWalkTutorialConnector(world: GroundWorld, from: Vec3, to: Vec3): boolean {
  const length = arc(from, to, world.baseRadius);
  if (!Number.isFinite(length) || length > 8) return false;
  const support = world.support(from, world.radius(from) + .45);
  let pose: GroundPose = { position: copy(from), radius: support.radius, grounded: true, verticalSpeed: 0, jumpHeld: false };
  if (world.blocked(pose)) return false;
  const steps = Math.max(1, Math.ceil(length / .06));
  for (let i = 1; i <= steps; i++) {
    const point = slerp(from, to, i / steps);
    pose = world.move(pose, point, FIXED_STEP);
    if (world.blocked(pose) || !pose.grounded || arc(pose.position, point, world.baseRadius) > .035) return false;
  }
  return arc(pose.position, to, world.baseRadius) < .035;
}

export interface TutorialRouteSample { position: Vec3; forward: Vec3; distance: number }
/** Even metre spacing, bounded draw count; tangent directions stay finite at
 * both poles. A curved route remains curved between its original vertices. */
export function sampleTutorialRoute(points: readonly Vec3[], radius: number, spacing = .8, maxCount = 40, maxMetres = 30): TutorialRouteSample[] {
  const samples: TutorialRouteSample[] = [];
  if (points.length < 2 || !(radius > 0) || !(spacing > 0)) return samples;
  let distance = 0, next = .35;
  for (let i = 1; i < points.length && samples.length < Math.min(40, maxCount); i++) {
    const length = arc(points[i - 1], points[i], radius);
    if (length < 1e-6) continue;
    while (next <= distance + length && next <= maxMetres && samples.length < Math.min(40, maxCount)) {
      const position = slerp(points[i - 1], points[i], (next - distance) / length);
      const fraction = (next - distance) / length;
      const forward = fraction < .999 ? heading(position, slerp(points[i - 1], points[i], Math.min(1, fraction + .001)))
        : heading(position, points[i - 1]).map(v => -v) as Vec3;
      samples.push({ position, forward, distance: next }); next += spacing;
    }
    distance += length;
  }
  return samples;
}
