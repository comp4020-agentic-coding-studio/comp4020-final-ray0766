import type {RoutePathPlan} from './path-layout.ts';
export interface HomePathPreview extends RoutePathPlan {
  planetId:string;expectedRevision:number;hash:string;currentObjects:number;totalObjects:number;maxObjects:number;manifestVersion:number;
}
