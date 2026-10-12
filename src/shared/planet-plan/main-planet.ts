import planJson from './main-planet.plan.json' with { type: 'json' };
import ledgerJson from './main-planet.ledger.json' with { type: 'json' };
import type { PlanetPlan } from './schema.ts';
import type { MainPlanetLedger } from './ledger.ts';
import { buildNetwork, doorPieces } from './network.ts';
import type { Network } from './network.ts';

/** The authored plan and its frozen ledger, shared by server, client and tests. */
export const MAIN_PLANET_PLAN = planJson as unknown as PlanetPlan;
export const MAIN_PLANET_LEDGER = ledgerJson as unknown as MainPlanetLedger;
let network: Network | null = null;
/** Streets, junctions, plazas and the ledger's door paths; deterministic, built once. */
export function mainPlanetNetwork(): Network {
  if (!network) { const n = buildNetwork(MAIN_PLANET_PLAN); n.pieces.push(...doorPieces(MAIN_PLANET_LEDGER.doorPaths)); network = n; }
  return network;
}
