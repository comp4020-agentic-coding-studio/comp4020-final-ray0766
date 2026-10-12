import { Quaternion, Vector3 } from 'three';
import { localToDir } from '../assets/claude-geometry/core/anchor.ts';
import { structureFit, structureSize } from '../shared/blueprints.ts';
import { heading, segmentDistance, yawFacing } from '../shared/planet-plan/sphere.ts';
import type { V3 } from '../shared/planet-plan/sphere.ts';
import { PathPlacementCache } from '../shared/path-structure-placement.ts';
import { StructurePlacementCache } from '../shared/structure-placement.ts';
import { TELEPORT_STATION } from '../shared/planet-plan/compositions.ts';
import { placementProblem } from '../shared/planets.ts';
import type { PlanetView } from '../shared/planets.ts';
import { fieldOf, objectSeat } from '../shared/terrain.ts';
import { distance, SPAWN } from '../shared/world.ts';
import type { Vec3 } from '../shared/world.ts';
import { STATION_HASH } from './station-blueprint.ts';

// The station site search is pure: it reads only the planet view and the saved
// bodies standing on it, so a worker thread can run it against a snapshot.

/** Ground point under the parked craft that hovers beside a garden's landing pad (client scene.ts). */
function craftGround(radius: number): Vec3 {
  const up = new Vector3(...SPAWN), q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), up);
  return up.multiplyScalar(radius).add(new Vector3(radius > 20 ? 3.1 : 0, 0, radius > 20 ? 3.2 : -2.2).applyQuaternion(q)).normalize().toArray() as Vec3;
}
/** Deterministic candidates: rings round the landing pad first, then the whole sphere. */
function* candidates(radius: number): Generator<Vec3> {
  for (const reach of [4.5, 6, 7.5, 9, 11, 13.5]) for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    yield localToDir({ dir: SPAWN, yaw: 0 }, radius, [Math.sin(angle) * reach, 0, Math.cos(angle) * reach]);
  }
  const count = 96, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + .5) / count, ring = Math.sqrt(1 - y * y), angle = i * golden;
    yield [Math.cos(angle) * ring, y, Math.sin(angle) * ring];
  }
}
const turn = (yaw: number) => ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
const STATION_SIZE = structureSize(TELEPORT_STATION.blueprint.parts);
/** The station never stands on a saved body. */
export const clearOfOccupants = (position: Vec3, occupants: readonly Vec3[], radius: number) =>
  !occupants.some(point => distance(point, position, radius) < STATION_SIZE.radius + .4);

/** Up to `limit` free sites on a home, never over saved objects, saved bodies (`occupants`), the pad or the craft above it. */
export function searchStationSites(planet: PlanetView, occupants: readonly Vec3[], limit: number) {
  const radius = planet.radius!, parts = TELEPORT_STATION.blueprint.parts, size = structureSize(parts), field = fieldOf(planet.environment, radius), craft = craftGround(radius);
  const contents = { ...planet.blueprints, [STATION_HASH]: parts }, found: { position: Vec3; rotation: number }[] = [];
  // One search shares prepared neighbours, instead of re-fitting every saved building per candidate.
  const structureCache = new StructurePlacementCache(), cache = new PathPlacementCache();
  // A home's planned routes (path tiles may not be laid yet) stay clear of the station.
  const routes = (planet.homeManifest?.routes ?? []).map(route => route.points as V3[]);
  const onRoute = (position: Vec3) => routes.some(points => points.some((point, i) => i > 0 && segmentDistance(position as V3, points[i - 1], point, radius).distance < size.radius + .8));
  for (const position of candidates(radius)) {
    if (found.some(f => distance(f.position, position, radius) < 4)) continue;
    if (!clearOfOccupants(position, occupants, radius)) continue;
    // The parked craft hovers about 3.4 m up; keep its hull (≈2.9 m half-length for the default design) off the gate.
    if (distance(position, craft, radius) < size.radius + 3.6) continue;
    if (field.waterLevel !== null && field.heightAt(position) < field.waterLevel) continue;
    if (onRoute(position)) continue;
    // Face the forecourt toward the landing pad first, then the other quarter turns.
    const facing = turn(yawFacing(position as never, heading(position as never, SPAWN as never)));
    for (const rotation of [0, 1, 2, 3].map(k => turn(facing + k * Math.PI / 2))) {
      if (placementProblem('structure', position, planet.objects, undefined, size.radius, radius, 2, { rotation, blueprintHash: STATION_HASH, blueprints: contents, field, terrainSeating: !!planet.environment, structureCache, cache })) continue;
      if (planet.environment && objectSeat(field, { id: 'station-preview', kind: 'structure', position, rotation, version: 1, assetVersion: 2, blueprintHash: STATION_HASH, ...size }, { [STATION_HASH]: parts }).problem) continue;
      if (structureFit(parts, position, rotation, field).problem) continue;
      found.push({ position, rotation }); break;
    }
    if (found.length >= limit) break;
  }
  return found;
}
