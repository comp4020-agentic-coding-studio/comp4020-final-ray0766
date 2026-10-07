import { Vector3 } from 'three';
import { localToDir } from '../assets/claude-geometry/core/anchor.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { partTransform, pivotOf } from '../assets/claude-geometry/blueprint/model.ts';
import { decodeEnvironment } from '../assets/claude-geometry/terrain/env.ts';
import { structureFit, structureSize } from './blueprints.ts';
import type { BlueprintContents } from './blueprints.ts';
import { HOME_DOOR_PART, HOME_ENVIRONMENT, HOME_INFRASTRUCTURE, samplePoint, starterHome } from './home-layout.ts';
import type { HomeManifest, HomeManifestSite, HomeSurfaceRoute } from './home-layout.ts';
import { objectRadius, placementProblem } from './planets.ts';
import type { BuildKind, PlacedObject } from './planets.ts';
import { FIXED_STEP, GroundWorld } from './physics/world.ts';
import type { GroundPose } from './physics/world.ts';
import { fieldOf, objectSeat } from './terrain.ts';
import { planRoutePaths } from './path-layout.ts';
import { distance, SPAWN } from './world.ts';
import type { Vec3 } from './world.ts';

/** Includes the home and all props; these are deliberately below player caps. */
export const HOME_GENERATION_BUDGET = Object.freeze({ maxObjects: 40, maxStructures: 4, reservedObjects: 24, reservedStructures: 4, minSceneryObjects: 8 });
export const HOME_GENERATOR_VERSION = 3;
export const HOME_GENERATION_VERSION = HOME_GENERATOR_VERSION;
export const HOME_GENERATION_ATTEMPTS = 8;
export type HomeGenerationFallback = 'invalid-environment' | 'unsafe-environment' | 'bounded-layout-fallback';
export interface GeneratedHomeManifest extends HomeManifest {
  environment: string;
  generator: 'home-neighbourhood';
  version: 3;
  seed: number;
  catalogueVersion: 'home-kit-v1';
  fallback: boolean;
  fallbackReason?: HomeGenerationFallback;
}

// A versioned integer PRNG. No Date, UUID, session state or Math.random enters
// the plan. Durable IDs are allocated only when its actual result is stored.
function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let n = Math.imul(value ^ (value >>> 15), value | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
const lerpDirection = (from: Vec3, to: Vec3, t: number): Vec3 => new Vector3(...from).lerp(new Vector3(...to), t).normalize().toArray() as Vec3;

/** The same flat kit origins and terrain fit used by rendering and collision. */
function siteRoute(site: HomeManifestSite, field: HeightField, id: string): HomeSurfaceRoute {
  const parts = site.blueprint.parts, pivot = pivotOf(parts);
  const anchor = { dir: site.position, yaw: site.rotation };
  const base = structureFit(parts, site.position, site.rotation, field).baseRadius;
  const at = (x: number, z: number) => localToDir(anchor, base, [x, 0, z]);
  const step = parts.find(part => part.part === 'step.entry');
  let approach: Vec3, destination: Vec3;
  if (step) {
    const t = partTransform(step, pivot), dx = Math.sin(t.yaw), dz = Math.cos(t.yaw);
    approach = at(t.position[0] + dx * .92, t.position[2] + dz * .92);
    const door = id === 'home' ? parts.find(part => part.n === HOME_DOOR_PART && part.part === 'wall.door.open') : undefined;
    if (door) {
      const d = partTransform(door, pivot);
      destination = at(d.position[0] + Math.sin(d.yaw) * .9, d.position[2] + Math.cos(d.yaw) * .9);
    } else destination = at(t.position[0] - dx * .65, t.position[2] - dz * .65);
  } else {
    // The ordinary three-cell square has an open front and clear centre.
    approach = at(0, 1.95);
    destination = at(0, .15);
  }
  return { id, width: id === 'home' ? .96 : .86, points: [[...SPAWN], approach, destination] };
}

/** Stable transient IDs for checking a plan; persisted IDs remain server-owned. */
export function homeManifestScene(manifest: HomeManifest) {
  const blueprints: BlueprintContents = {};
  const objects: PlacedObject[] = [manifest.home, ...manifest.infrastructure].map((site, i) => {
    const id = `generated-structure-${i}`;
    blueprints[id] = site.blueprint.parts;
    return { id, kind: 'structure', blueprintHash: id, position: site.position, rotation: site.rotation, version: 1, ...structureSize(site.blueprint.parts) };
  });
  objects.push(...manifest.objects.map((item, i) => ({ ...item, id: `generated-prop-${i}`, assetVersion: 2 as const, version: 1 })));
  return { objects, blueprints };
}

/** Sample at <= .25 m so vegetation/prop clearance also covers long segments. */
export function homeRouteClearings(routes: readonly HomeSurfaceRoute[], radius: number) {
  const clearings: { dir: Vec3; radius: number }[] = [];
  for (const route of routes) for (let segment = 1; segment < route.points.length; segment++) {
    const from = route.points[segment - 1], to = route.points[segment];
    const steps = Math.max(1, Math.ceil(distance(from, to, radius) / .25));
    for (let n = 0; n <= steps; n++) clearings.push({ dir: lerpDirection(from, to, n / steps), radius: route.width / 2 + .28 });
  }
  return clearings;
}

/** Actual grounded movement, no recover/teleport or collision exception. */
export function walkHomeRoute(world: GroundWorld, route: HomeSurfaceRoute, initial?: GroundPose): GroundPose | null {
  let pose = initial ?? world.pose(route.points[0]);
  if (world.blocked(pose)) return null;
  for (const target of route.points.slice(1)) {
    // Twice nominal walking duration plus a settling allowance; bounded even
    // when collision prevents reaching the waypoint.
    const ticks = Math.ceil((distance(pose.position, target, world.baseRadius) / 2.5 * 2 + 1) / FIXED_STEP);
    for (let tick = 0; tick < ticks && distance(pose.position, target, world.baseRadius) > .035; tick++) {
      const remaining = distance(pose.position, target, pose.radius);
      const next = lerpDirection(pose.position, target, Math.min(1, 2.5 * FIXED_STEP / Math.max(.00001, remaining)));
      pose = world.move(pose, next, FIXED_STEP);
      if (!pose.grounded || world.blocked(pose) || ![...pose.position, pose.radius].every(Number.isFinite)) return null;
    }
    if (distance(pose.position, target, world.baseRadius) > .06) return null;
  }
  return pose;
}

/** Check both directions and a capsule-width margin using real accepted poses. */
export function homeRoutesWalkable(world: GroundWorld, routes: readonly HomeSurfaceRoute[]): boolean {
  for (const route of routes) {
    const end = walkHomeRoute(world, route);
    if (!end || !walkHomeRoute(world, { ...route, points: [...route.points].reverse() }, end)) return false;
    for (const side of [-.14, .14]) {
      const points = route.points.map((point, index) => {
        const up = new Vector3(...point);
        const next = new Vector3(...route.points[Math.min(index + 1, route.points.length - 1)]);
        const previous = new Vector3(...route.points[Math.max(0, index - 1)]);
        const tangent = next.sub(previous).projectOnPlane(up).normalize();
        const right = new Vector3().crossVectors(tangent, up).normalize();
        return up.addScaledVector(right, side / world.baseRadius).normalize().toArray() as Vec3;
      });
      const margin = { ...route, points }, edge = walkHomeRoute(world, margin);
      if (!edge || !walkHomeRoute(world, { ...margin, points: [...points].reverse() }, edge)) return false;
    }
  }
  return true;
}

function plan(radius: number, seed: number, environment: string, attempt: number): HomeManifest | null {
  const rng = random((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0), field = fieldOf(environment, radius);
  const jiggle = (size: number) => (rng() * 2 - 1) * size;
  const at = (x: number, z: number) => samplePoint(radius, x, z);
  const home: HomeManifestSite = { blueprint: starterHome(), position: at(jiggle(.8), -8 + jiggle(.65)), rotation: 0 };
  const manifest: HomeManifest = { home, infrastructure: [], objects: [], routes: [] };
  const scene = homeManifestScene(manifest);
  if (placementProblem('structure', home.position, [], undefined, scene.objects[0].radius, radius) || structureFit(home.blueprint.parts, home.position, 0, field).problem) return null;
  const homeRoute = siteRoute(home, field, 'home');
  manifest.routes.push(homeRoute);
  const infrastructureCount = 1 + (seed % 3);
  // Separate radial sectors keep approach corridors readable and avoid paths
  // crossing another plot. Rotation uses the same continuous world placement
  // rule available to players; individual kit parts remain quarter-turned.
  const candidates = [
    { x: 8.8, z: 1.6, rotation: 3 * Math.PI / 2, kit: 0 },
    { x: -7.7, z: -1.2, rotation: Math.PI / 2, kit: 1 },
    { x: .6, z: 8.5, rotation: Math.PI, kit: 0 },
  ];
  // Permuting sectors changes which destinations exist for one/two-site seeds.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const candidate of candidates) {
    if (manifest.infrastructure.length >= infrastructureCount) break;
    const site: HomeManifestSite = { blueprint: structuredClone(HOME_INFRASTRUCTURE[candidate.kit]), position: at(candidate.x + jiggle(.6), candidate.z + jiggle(.6)), rotation: candidate.rotation };
    const size = structureSize(site.blueprint.parts);
    if (placementProblem('structure', site.position, scene.objects, undefined, size.radius, radius) || structureFit(site.blueprint.parts, site.position, site.rotation, field).problem) continue;
    const index = manifest.infrastructure.length + 1, id = `generated-structure-${index}`;
    scene.blueprints[id] = site.blueprint.parts;
    scene.objects.push({ id, kind: 'structure', blueprintHash: id, position: site.position, rotation: site.rotation, version: 1, ...size });
    manifest.infrastructure.push(site);
    manifest.routes.push(siteRoute(site, field, `infrastructure-${index}`));
  }
  // Optional infrastructure is optional in quantity, but at least one legal
  // secondary destination is required before accepting a generated layout.
  if (!manifest.infrastructure.length) return null;
  // Roads spend the ordinary object budget before scenery. They are the same
  // selectable/removable path objects that an owner places, with no display
  // ribbon and no exemption for the landing or a structure's keep-out circle.
  // Route points remain navigation data and may cross those intentional gaps.
  const roads = planRoutePaths({ routes: manifest.routes, radius, environment, objects: scene.objects, blueprints: scene.blueprints,
    maxObjects: HOME_GENERATION_BUDGET.maxObjects - HOME_GENERATION_BUDGET.minSceneryObjects, idPrefix: 'generated-road' });
  if (roads.budgetLimited || roads.coverage.some(route => route.added + route.covered < 2)) return null;
  for (const path of roads.objects) {
    manifest.objects.push({ kind: 'path', position: path.position, rotation: path.rotation });
    scene.objects.push({ ...path, id: `generated-prop-${manifest.objects.length - 1}` });
  }
  const clearings = homeRouteClearings(manifest.routes, radius);
  const desiredScenery = Math.min(8 + Math.floor(rng() * 9), HOME_GENERATION_BUDGET.maxObjects - scene.objects.length);
  const desiredProps = manifest.objects.length + desiredScenery;
  const kinds: readonly BuildKind[] = ['tree', 'tree', 'flowers', 'flowers', 'bench', 'lamp'];
  // 112 bounded scenery candidates include the foreground and rear planting
  // belt; no decorative prop is put into the reserved navigable corridor.
  for (let index = 0; index < 112 && manifest.objects.length < desiredProps; index++) {
    const angle = rng() * Math.PI * 2, reach = 3.4 + rng() * 11.8;
    const kind = kinds[Math.floor(rng() * kinds.length)], position = at(Math.cos(angle) * reach, Math.sin(angle) * reach);
    const object: PlacedObject = { id: `generated-prop-${manifest.objects.length}`, kind, assetVersion: 2, position, rotation: Math.floor(rng() * 4) * Math.PI / 2, version: 1 };
    if (clearings.some(clearing => distance(position, clearing.dir, radius) < clearing.radius + objectRadius(object) + .15)) continue;
    if (placementProblem(kind, position, scene.objects, undefined, undefined, radius, 2) || objectSeat(field, object).problem) continue;
    manifest.objects.push({ kind, position, rotation: object.rotation });
    scene.objects.push(object);
  }
  if (scene.objects.length > HOME_GENERATION_BUDGET.maxObjects) return null;
  const world = new GroundWorld({ id: 'generated-home-check', revision: 1, radius, environment, ...scene });
  const landing = world.pose(SPAWN);
  if (world.blocked(landing) || (field.waterLevel !== null && field.heightAt(SPAWN) < field.waterLevel + .02)) return null;
  if (!homeRoutesWalkable(world, manifest.routes)) return null;
  return manifest;
}

/**
 * Generate once, persist the actual result, and never call this on normal reads.
 * A maximum of eight legal-plan attempts use a supplied terrain document; a
 * rejected document gets eight attempts on HOME_ENVIRONMENT. A final checked
 * seed-0 meadow layout is the bounded deterministic fallback. No collision,
 * player spacing or 0.6 m foundation limit is weakened to force a placement.
 */
export function generateHomeManifest(radius: number, seed: number, environment?: string | null): GeneratedHomeManifest {
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('A positive planet radius is required.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('A uint32 generation seed is required.');
  let selected = environment ?? HOME_ENVIRONMENT, fallbackReason: HomeGenerationFallback | undefined;
  if (!decodeEnvironment(selected).ok) { selected = HOME_ENVIRONMENT; fallbackReason = 'invalid-environment'; }
  const find = (candidate: string) => {
    for (let attempt = 0; attempt < HOME_GENERATION_ATTEMPTS; attempt++) {
      const result = plan(radius, seed, candidate, attempt);
      if (result) return result;
    }
    return null;
  };
  let result = find(selected);
  if (!result && selected !== HOME_ENVIRONMENT) {
    selected = HOME_ENVIRONMENT; fallbackReason = 'unsafe-environment'; result = find(selected);
  }
  if (!result) {
    // The versioned seed-0 layout is a checked safe meadow plan at the sample's
    // 21.6 radius. It still passes every ordinary placement and route check;
    // unsupported radii fail safely instead of accepting an illegal world.
    selected = HOME_ENVIRONMENT; fallbackReason ??= 'bounded-layout-fallback';
    result = plan(radius, 0, selected, 0);
  }
  if (!result) throw new Error('No legal home neighbourhood fits this radius; nothing has been generated or saved.');
  return { ...result, environment: selected, generator: 'home-neighbourhood', version: HOME_GENERATION_VERSION, seed,
    catalogueVersion: 'home-kit-v1', fallback: !!fallbackReason, ...(fallbackReason ? { fallbackReason } : {}) };
}
