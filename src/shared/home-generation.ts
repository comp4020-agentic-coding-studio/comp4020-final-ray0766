import { Vector3 } from 'three';
import { localToDir } from '../assets/claude-geometry/core/anchor.ts';
import type { HeightField } from '../assets/claude-geometry/core/ground.ts';
import { partTransform, pivotOf } from './blueprint-model.ts';
import { isOpenDoorPartId } from './blueprint-parts.ts';
import { homeDoorCenterOffset } from './home-door.ts';
import { WIDE_ENTRY_ID, WIDE_ENTRY } from './wide-entry.ts';
import { decodeEnvironment } from '../assets/claude-geometry/terrain/env.ts';
import { structureFit, structureSize } from './blueprints.ts';
import type { BlueprintContents } from './blueprints.ts';
import { HOME_DOOR_PART, samplePoint } from './home-layout.ts';
import type { HomeManifest, HomeManifestSite, HomeSurfaceRoute } from './home-layout.ts';
import { SHORT_STREET_ENVIRONMENT, districtPlan } from './district-layout.ts';
import { objectRadius, placementProblem } from './planets.ts';
import type { PlacedObject } from './planets.ts';
import { FIXED_STEP, GroundWorld } from './physics/world.ts';
import { PART_COLLIDERS } from './physics/parts.ts';
import type { GroundPose } from './physics/world.ts';
import { fieldOf, objectSeat } from './terrain.ts';
import { planRoutePaths } from './path-layout.ts';
import { distance, SPAWN } from './world.ts';
import type { Vec3 } from './world.ts';

/** Includes the home and all props; these are deliberately below player caps. */
export const HOME_GENERATION_BUDGET = Object.freeze({ maxObjects: 40, maxStructures: 4, reservedObjects: 24, reservedStructures: 4, minSceneryObjects: 8 });
export const HOME_GENERATOR_VERSION = 6;
export const HOME_GENERATION_VERSION = HOME_GENERATOR_VERSION;
export const HOME_GENERATION_ATTEMPTS = 8;
export type HomeGenerationFallback = 'invalid-environment' | 'unsafe-environment' | 'bounded-layout-fallback';
export interface GeneratedHomeManifest extends HomeManifest {
  environment: string;
  generator: 'home-neighbourhood';
  version: typeof HOME_GENERATOR_VERSION;
  seed: number;
  catalogueVersion: 'village-kit-v1';
  fallback: boolean;
  fallbackReason?: HomeGenerationFallback;
}

// No Date, UUID, session state or Math.random enters a district plan. Durable
// IDs are allocated only when its actual selected composition is stored.
const lerpDirection = (from: Vec3, to: Vec3, t: number): Vec3 => new Vector3(...from).lerp(new Vector3(...to), t).normalize().toArray() as Vec3;

/** The same flat kit origins and terrain fit used by rendering and collision. */
function siteRoute(site: HomeManifestSite, field: HeightField, id: string): HomeSurfaceRoute {
  const parts = site.blueprint.parts, pivot = pivotOf(parts);
  const anchor = { dir: site.position, yaw: site.rotation };
  const base = structureFit(parts, site.position, site.rotation, field).baseRadius;
  const at = (x: number, z: number) => localToDir(anchor, base, [x, 0, z]);
  const step = parts.find(part => part.part === 'step.entry' || part.part === WIDE_ENTRY_ID);
  let approach: Vec3, destination: Vec3;
  if (step) {
    const t = partTransform(step, pivot), dx = Math.sin(t.yaw), dz = Math.cos(t.yaw),center=step.part===WIDE_ENTRY_ID?WIDE_ENTRY.centerX:0;
    const x=t.position[0]+dz*center,z=t.position[2]-dx*center;
    approach = at(x + dx * .92, z + dz * .92);
    const door = id === 'home' ? parts.find(part => part.n === HOME_DOOR_PART && isOpenDoorPartId(part.part)) : undefined;
    if (door) {
      const d = partTransform(door, pivot),offset=homeDoorCenterOffset(door.part as import('./home-door.ts').HomeDoorPartId);
      destination = at(d.position[0] + Math.cos(d.yaw)*offset + Math.sin(d.yaw) * .9, d.position[2] - Math.sin(d.yaw)*offset + Math.cos(d.yaw) * .9);
    } else destination = at(x - dx * .65, z - dz * .65);
  } else {
    // The ordinary three-cell square has an open front and clear centre.
    approach = at(0, 1.95);
    destination = at(0, .15);
  }
  return { id, width: id === 'home' ? .96 : .86, points: [[...SPAWN], approach, destination] };
}

/** Ordinary paving stops outside the actual support edge. Navigation keeps
 * going over the real steps into the building. The 0.39 m offset fits either
 * facing of the existing four-stone tile, including a small visible joint. */
function pavingEndpoint(site: HomeManifestSite, field: HeightField): Vec3 {
  const parts = site.blueprint.parts, pivot = pivotOf(parts);
  const base = structureFit(parts, site.position, site.rotation, field).baseRadius;
  const at = (x: number, z: number) => localToDir({ dir: site.position, yaw: site.rotation }, base, [x, 0, z]);
  const entry = parts.find(part => part.part === 'step.entry' || part.part === 'ramp.entry' || part.part === WIDE_ENTRY_ID);
  if (entry) {
    const transform = partTransform(entry, pivot);
    const outer = Math.max(...PART_COLLIDERS[entry.part]().filter(box => box.support).map(box =>
      box.center[2] + Math.abs(Math.cos(box.pitch ?? 0)) * box.half[2] + Math.abs(Math.sin(box.pitch ?? 0)) * box.half[1]));
    const center=entry.part===WIDE_ENTRY_ID?WIDE_ENTRY.centerX:0;
    return at(transform.position[0] + Math.cos(transform.yaw)*center + Math.sin(transform.yaw) * (outer + .39),
      transform.position[2] - Math.sin(transform.yaw)*center + Math.cos(transform.yaw) * (outer + .39));
  }
  const front = Math.max(...parts.filter(part => part.level === 0).flatMap(part => {
    const transform = partTransform(part, pivot);
    return PART_COLLIDERS[part.part]().filter(box => box.support).map(box => transform.position[2]
      - Math.sin(transform.yaw) * box.center[0] + Math.cos(transform.yaw) * box.center[2]
      + Math.abs(Math.sin(transform.yaw)) * box.half[0] + Math.abs(Math.cos(transform.yaw)) * box.half[2]);
  }));
  return at(0, front + .39);
}

export function homePavingRoutes(manifest: HomeManifest, radius: number, environment: string): HomeSurfaceRoute[] {
  const field = fieldOf(environment, radius), sites = [manifest.home, ...manifest.infrastructure];
  return manifest.routes.map((route, index) => ({ ...route,
    points: [...route.points.slice(0, -2), pavingEndpoint(sites[index], field)] }));
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
  const design = districtPlan(seed, attempt), field = fieldOf(environment, radius);
  const at = (x: number, z: number) => samplePoint(radius, x, z);
  const sites = design.sites.map(site => ({ blueprint: site.blueprint, position: at(site.x, site.z), rotation: site.rotation }));
  const manifest: HomeManifest = { home: sites[0], infrastructure: sites.slice(1), objects: [], routes: [] };
  const scene = homeManifestScene(manifest);
  for (const [index, site] of sites.entries()) {
    const object = scene.objects[index];
    if (placementProblem('structure', site.position, scene.objects, object.id, object.radius, radius, 2,
      { rotation: object.rotation, blueprintHash: object.blueprintHash, blueprints: scene.blueprints, field })
      || structureFit(site.blueprint.parts, site.position, site.rotation, field).problem) return null;
    const route = siteRoute(site, field, index === 0 ? 'home' : `infrastructure-${index}`);
    const side = design.reflected ? -1 : 1;
    // A shared turning lane, with a short branch to each real entrance. The
    // orchard is an offset pocket off the landing edge, not the lane's centre.
    const approach = index === 3 ? [[0, 0], [0, -3], [-3.6 * side, -4.3]]
      : design.spine.slice(0, index === 2 ? 5 : 4);
    route.points = [...approach.map(([x, z]) => at(x, z)), ...route.points.slice(1)];
    manifest.routes.push(route);
  }
  // Roads spend the ordinary object budget before scenery. They are the same
  // selectable/removable path objects that an owner places, with no display
  // ribbon and the same shared structure-edge and landing rules as an owner.
  // Route points remain navigation data; paving never changes collision.
  const roads = planRoutePaths({ routes: manifest.routes, pavingRoutes: homePavingRoutes(manifest, radius, environment), radius, environment, objects: scene.objects, blueprints: scene.blueprints,
    spacing: .85, maxObjects: HOME_GENERATION_BUDGET.maxObjects - HOME_GENERATION_BUDGET.minSceneryObjects, idPrefix: 'generated-road' });
  if (roads.budgetLimited || roads.coverage.some(route => !route.connected)) return null;
  for (const path of roads.objects) {
    manifest.objects.push({ kind: 'path', position: path.position, rotation: path.rotation });
    scene.objects.push({ ...path, id: `generated-prop-${manifest.objects.length - 1}` });
  }
  const clearings = homeRouteClearings(manifest.routes, radius);
  for (const candidate of design.scenery) {
    if (scene.objects.length >= HOME_GENERATION_BUDGET.maxObjects) break;
    const { kind, rotation } = candidate, position = at(candidate.x, candidate.z);
    const object: PlacedObject = { id: `generated-prop-${manifest.objects.length}`, kind, assetVersion: 2, position, rotation, version: 1 };
    if (clearings.some(clearing => distance(position, clearing.dir, radius) < clearing.radius + objectRadius(object) + .15)) continue;
    if (placementProblem(kind, position, scene.objects, undefined, undefined, radius, 2) || objectSeat(field, object).problem) continue;
    manifest.objects.push({ kind, position, rotation: object.rotation });
    scene.objects.push(object);
  }
  if (scene.objects.filter(object => object.kind !== 'structure' && object.kind !== 'path').length < HOME_GENERATION_BUDGET.minSceneryObjects) return null;
  const world = new GroundWorld({ id: 'generated-home-check', revision: 1, radius, environment, ...scene });
  const landing = world.pose(SPAWN);
  if (world.blocked(landing) || (field.waterLevel !== null && field.heightAt(SPAWN) < field.waterLevel + .02)) return null;
  if (!homeRoutesWalkable(world, manifest.routes)) return null;
  return manifest;
}

/**
 * Generate once, persist the actual result, and never call this on normal reads.
 * A maximum of eight legal-plan attempts use a supplied terrain document; a
 * rejected document gets eight attempts on SHORT_STREET_ENVIRONMENT. A final checked
 * seed-0 meadow layout is the bounded deterministic fallback. No collision,
 * player spacing or 0.6 m foundation limit is weakened to force a placement.
 */
export function generateHomeManifest(radius: number, seed: number, environment?: string | null): GeneratedHomeManifest {
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('A positive planet radius is required.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('A uint32 generation seed is required.');
  let selected = environment ?? SHORT_STREET_ENVIRONMENT, fallbackReason: HomeGenerationFallback | undefined;
  if (!decodeEnvironment(selected).ok) { selected = SHORT_STREET_ENVIRONMENT; fallbackReason = 'invalid-environment'; }
  const find = (candidate: string) => {
    for (let attempt = 0; attempt < HOME_GENERATION_ATTEMPTS; attempt++) {
      const result = plan(radius, seed, candidate, attempt);
      if (result) return result;
    }
    return null;
  };
  let result = find(selected);
  if (!result && selected !== SHORT_STREET_ENVIRONMENT) {
    selected = SHORT_STREET_ENVIRONMENT; fallbackReason = 'unsafe-environment'; result = find(selected);
  }
  if (!result) {
    // The versioned seed-0 layout is a checked safe meadow plan at the sample's
    // 21.6 radius. It still passes every ordinary placement and route check;
    // unsupported radii fail safely instead of accepting an illegal world.
    selected = SHORT_STREET_ENVIRONMENT; fallbackReason ??= 'bounded-layout-fallback';
    result = plan(radius, 0, selected, 0);
  }
  if (!result) throw new Error('No legal home neighbourhood fits this radius; nothing has been generated or saved.');
  return { ...result, environment: selected, generator: 'home-neighbourhood', version: HOME_GENERATION_VERSION, seed,
    catalogueVersion: 'village-kit-v1', fallback: !!fallbackReason, ...(fallbackReason ? { fallbackReason } : {}) };
}
