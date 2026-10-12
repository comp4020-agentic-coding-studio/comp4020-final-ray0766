import { blueprintHash } from '../blueprint-codec.ts';
import { structureSize } from '../blueprints.ts';
import type { PlacedObject } from '../planets.ts';
import { contentHash } from '../../assets/claude-geometry/core/doc.ts';
import type { MainPlanetLedger } from './ledger.ts';
import { MAIN_PLANET_VERSION } from './ledger.ts';
import type { PlannedTown } from './generate.ts';

/** Freeze a planned town into the ledger the game loads: placed objects with
 * content hashes, door paths, routes and residents. Authoring only (async hashes). */
export async function buildLedger(town: PlannedTown, planText: string): Promise<MainPlanetLedger> {
  const blueprints: MainPlanetLedger['blueprints'] = {}, objects: PlacedObject[] = [];
  for (const lot of town.lots) {
    const hash = await blueprintHash({ parts: lot.parts });
    blueprints[hash] = { composition: lot.composition.id, mirror: lot.mirror };
    objects.push({ id: `town-${lot.id}`, kind: 'structure', position: lot.position, rotation: lot.rotation, version: MAIN_PLANET_VERSION, blueprintHash: hash, ...structureSize(lot.parts) });
  }
  for (const prop of town.props) objects.push({ id: `town-${prop.id}`, kind: prop.kind, position: prop.position, rotation: prop.rotation, version: MAIN_PLANET_VERSION, assetVersion: 2 });
  return {
    format: 'little-worlds-main-planet-ledger', version: MAIN_PLANET_VERSION, planHash: await contentHash(planText),
    objects, blueprints,
    lots: town.lots.map(l => ({ id: l.id, objectId: `town-${l.id}`, district: l.district, composition: l.composition.id, entry: l.entry, road: l.frontRoad ?? null, plaza: l.frontPlaza ?? null })),
    doorPaths: town.doorPaths, routes: town.routes, residents: town.residents, npcFacing: town.npcFacing,
    conflicts: town.conflicts.map(c => ({ severity: c.severity, kind: c.kind, id: c.id, message: c.message, at: c.at })),
  };
}
