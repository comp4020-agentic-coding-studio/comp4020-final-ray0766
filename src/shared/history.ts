import type { BlueprintContents } from './blueprints.ts';
export interface HistoryPage { planetId:string; planetName:string; baselineAt:string; head:number; after:number; next:number; events:unknown[] }
export interface HistorySnapshot { document:string; hash:string; baselineAt:string; head:number; environment?:string|null; radius?:number; blueprints:BlueprintContents; assetVersions?:Record<string,2> }
export const HISTORY_PAGE=50, HISTORY_PAGE_MAX=100, HISTORY_SNAPSHOT_EVERY=16;
