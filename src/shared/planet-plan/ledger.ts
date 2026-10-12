import type { PlacedObject } from '../planets.ts';
import type { PartPlacement } from '../blueprint-model.ts';
import type { V3 } from './sphere.ts';
import { PUBLIC_COMPOSITIONS } from './compositions.ts';
import { mirrorParts } from './footprint.ts';

/** Public main-planet layout version; the hub scene revision is 1000 + this. */
export const MAIN_PLANET_VERSION = 13;
/** The frozen output of `node scripts/planet-plan.ts build`. Loads with no siting work. */
export interface MainPlanetLedger {
  format: 'little-worlds-main-planet-ledger'; version: number;
  /** Content hash of the plan text this ledger was generated from. */
  planHash: string;
  objects: PlacedObject[];
  /** Blueprint content hash → the composition and whether it is mirrored. */
  blueprints: Record<string, { composition: string; mirror: boolean }>;
  lots: { id: string; objectId: string; district: string; composition: string; entry: V3; road: string | null; plaza: string | null }[];
  doorPaths: { lot: string; from: V3; to: V3 }[];
  routes: { id: string; width: number; points: V3[] }[];
  residents: { id: string; place: string; position: V3; facing?: V3; route?: V3[] }[];
  npcFacing: { mica: V3; sol: V3 };
  conflicts: { severity: 'error' | 'warning'; kind: string; id: string; message: string; at: V3 }[];
}
/** Parts for every blueprint hash a ledger places, rebuilt from the shared compositions. */
export function ledgerBlueprints(ledger: Pick<MainPlanetLedger, 'blueprints'>): Record<string, PartPlacement[]> {
  const byId = new Map(PUBLIC_COMPOSITIONS.map(c => [c.id, c]));
  return Object.fromEntries(Object.entries(ledger.blueprints).map(([hash, entry]) => {
    const composition = byId.get(entry.composition);
    if (!composition) throw new Error(`Ledger names an unknown composition ${entry.composition}.`);
    return [hash, entry.mirror ? mirrorParts(composition.blueprint.parts) : composition.blueprint.parts.map(p => ({ ...p }))];
  }));
}
