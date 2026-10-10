import {HOME_SAMPLE_RADIUS} from './home.ts';
import {PUBLIC_TOWN_BLUEPRINTS} from './public-town-layout.ts';
/** Stable host entry point. The old radius-14 public layout remains in
 * public-village.ts; this projection is the complete ordinary-kit town. */
export {
 PUBLIC_TOWN_VERSION as SAMPLE_PUBLIC_VERSION,
 PUBLIC_TOWN_ENVIRONMENT as SAMPLE_PUBLIC_ENVIRONMENT,
 PUBLIC_TOWN_BLUEPRINTS as SAMPLE_PUBLIC_BLUEPRINTS,
 PUBLIC_TOWN_HASHES as SAMPLE_PUBLIC_HASHES,
 publicTown as samplePublicVillage,
} from './public-town-layout.ts';
export type {PublicTown as SamplePublicVillage} from './public-town-layout.ts';
// Keep the existing workshop catalogue stable. Site-specific doorway and
// furniture variants remain ordinary registered parts in the public town;
// adding them to the ledger must not append near-duplicate example choices.
// Defer reading the live registry until the UI opens: shared world modules
// already import this entry point while the public registry is initializing.
export function samplePublicWorkshopPlans(){return PUBLIC_TOWN_BLUEPRINTS.slice(0,43);}
export const isSamplePublicRadius=(radius:number)=>Math.abs(radius-HOME_SAMPLE_RADIUS)<1e-6;
