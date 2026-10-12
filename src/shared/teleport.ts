import { localToDir } from '../assets/claude-geometry/core/anchor.ts';
import { partTransform, pivotOf } from './blueprint-model.ts';
import type { PartPlacement } from './blueprint-model.ts';
import { structureFit } from './blueprints.ts';
import type { BlueprintContents } from './blueprints.ts';
import type { PlacedObject, PlanetView } from './planets.ts';
import { isSamplePublicRadius, samplePublicVillage } from './sample-public-village.ts';
import { fieldOf } from './terrain.ts';
import { STATION_POINTS } from './village-kit/parts.ts';
import type { Vec3 } from './world.ts';

/** The workshop part that makes any structure a teleport station. */
export const TELEPORT_PART = 'station.teleport';
/** Server reach from a saved position to a gate's interaction point (metres on the surface). */
export const STATION_REACH = 1.65;

export interface StationSite {
  objectId: string; partNumber: number;
  /** Unit directions on the planet. */
  interact: Vec3; arrival: Vec3;
  /** Planet yaw of the gate's approach (+Z of the part), for facing a traveller away from the ring. */
  yaw: number;
}
/** One saved teleport mark, as the server reports it to its own player. */
export interface TeleportMark { planetId: string; source: 'landing' | 'history'; markedAt: number }
export interface TeleportStationPreview {
  planetId: string; expectedRevision: number; hash: string;
  /** Up to three candidate sites, nearest to the landing pad first. */
  sites: { position: Vec3; rotation: number }[];
  blueprintHash: string; blueprint: PartPlacement[];
  reason?: string;
}

export const hasStationPart = (parts: readonly PartPlacement[] | undefined) => !!parts?.some(p => p.part === TELEPORT_PART);

const cache = new Map<string, StationSite[]>();
/** Every gate on a planet, for the hub's frozen ledger and a home's saved objects alike. */
export function stationSites(planet: Pick<PlanetView, 'id' | 'radius' | 'environment' | 'objects' | 'blueprints'>): StationSite[] {
  const radius = planet.radius ?? 10;
  const sample = planet.id === 'hub' && isSamplePublicRadius(radius) ? samplePublicVillage(radius) : null;
  const objects: PlacedObject[] = sample ? [...sample.objects, ...planet.objects] : planet.objects;
  const contents: BlueprintContents = sample ? { ...sample.blueprints, ...planet.blueprints } : planet.blueprints ?? {};
  const environment = sample?.environment ?? planet.environment ?? null;
  const gates = objects.filter(o => o.kind === 'structure' && hasStationPart(contents[o.blueprintHash!]));
  const key = JSON.stringify([planet.id, radius, environment, gates.map(o => [o.id, o.blueprintHash, o.position, o.rotation])]);
  const hit = cache.get(key); if (hit) return hit;
  const field = fieldOf(environment, radius), sites: StationSite[] = [];
  for (const o of gates) {
    const parts = contents[o.blueprintHash!], pivot = pivotOf(parts), anchor = { dir: o.position, yaw: o.rotation };
    const base = structureFit(parts, o.position, o.rotation, field).baseRadius;
    for (const part of parts.filter(p => p.part === TELEPORT_PART && p.level === 0)) {
      const t = partTransform(part, pivot);
      const local = ([x, , z]: Vec3): Vec3 => [t.position[0] + Math.cos(t.yaw) * x + Math.sin(t.yaw) * z, t.position[1], t.position[2] - Math.sin(t.yaw) * x + Math.cos(t.yaw) * z];
      sites.push({ objectId: o.id, partNumber: part.n, interact: localToDir(anchor, base, local(STATION_POINTS.interact)), arrival: localToDir(anchor, base, local(STATION_POINTS.arrival)), yaw: (o.rotation + t.yaw) % (Math.PI * 2) });
    }
  }
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  cache.set(key, sites);
  return sites;
}
