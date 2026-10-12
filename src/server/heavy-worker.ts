import { parentPort } from 'node:worker_threads';
import { recordFits } from '../shared/ground-fit-cache.ts';
import { generateHomeManifest } from '../shared/home-generation.ts';
import { GroundWorld } from '../shared/physics/world.ts';
import type { PlanetView } from '../shared/planets.ts';
import { stationSites } from '../shared/teleport.ts';
import { fieldIdentity } from '../shared/terrain.ts';
import type { Vec3 } from '../shared/world.ts';
import type { HeavyJob, HeavyReply } from './heavy-work.ts';
import { searchStationSites } from './station-site.ts';

// Runs the terrain, collision and siting work that would otherwise hold every
// player's request on the main thread. Each job is a pure function of its
// input; the main thread re-checks the saved state before it writes anything.
const jobs = {
  home: (input: { radius: number; seed: number; environment: string | null }) => generateHomeManifest(input.radius, input.seed, input.environment ?? undefined),
  station: (input: { planet: PlanetView; occupants: Vec3[] }) => searchStationSites(input.planet, input.occupants, 1),
  // Build the planet's ground the same way the server will, so its fits can be reused there.
  world: (input: { planet: PlanetView }) => { new GroundWorld(input.planet); stationSites(input.planet); return null; },
};

parentPort!.on('message', ({ id, kind, input }: HeavyJob) => {
  let reply: HeavyReply;
  try {
    const { value, fits } = recordFits(() => (jobs[kind] as (input: unknown) => unknown)(input));
    reply = { id, value, fits: fits.flatMap(({ field, entries }) => { const identity = fieldIdentity(field); return identity && entries.length ? [{ ...identity, entries }] : []; }) };
  } catch (error) {
    reply = { id, error: error instanceof Error ? error.message : String(error) };
  }
  parentPort!.postMessage(reply);
});
