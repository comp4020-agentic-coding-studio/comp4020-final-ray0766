import type { PlanetView } from '../shared/planets.ts';

/** A door state changes physics, but not the terrain or saved building meshes. */
export function worldVisualSignature(planet: PlanetView): string {
  const door = planet.homeDoor;
  return JSON.stringify([planet.id, planet.kind, planet.radius, planet.environment,
    planet.objects, planet.blueprints, planet.homeManifest?.routes,
    door ? [door.buildingId, door.partNumber] : null]);
}
