import {Vector3,Mesh,BufferAttribute,InterleavedBufferAttribute} from 'three';
import type {Object3D} from 'three';
import type {PlanetSummary} from '../shared/planets.ts';
import {spaceDistance,forward} from '../shared/flight.ts';
import type {FlightState} from '../shared/flight.ts';
import {ORBIT_DETAIL_BUDGET} from '../shared/regions.ts';
import type {QualityTier} from './quality.ts';
export const orbitCacheLimit=(quality:QualityTier)=>quality==='smooth'?12:16;
/** Near detail wins; the remaining bounded slots look 120 m ahead of the ship. */
export function orbitPlan(planets:PlanetSummary[],flight:FlightState,limit:number){
 const sorted=[...planets].sort((a,b)=>spaceDistance(flight.position,a.center)-spaceDistance(flight.position,b.center));
 const detailed=sorted.filter(p=>spaceDistance(flight.position,p.center)<170).slice(0,ORBIT_DETAIL_BUDGET);
 const ahead=new Vector3(...flight.position).addScaledVector(new Vector3(...forward(flight.yaw,flight.pitch)),120).toArray() as [number,number,number];
 const cost=(p:PlanetSummary)=>Math.min(spaceDistance(flight.position,p.center),spaceDistance(ahead,p.center)+35);
 const candidates=sorted.filter(p=>cost(p)<320&&!detailed.includes(p)).sort((a,b)=>cost(a)-cost(b));
 return {sorted,detailed,wanted:[...detailed,...candidates].slice(0,Math.max(0,limit))};
}
/** Buffer bytes only, not an assertion about total CPU/GPU memory. */
export function orbitBufferBytes(root:Object3D){
 const arrays=new Set<ArrayBufferLike>();
 root.traverse(o=>{if(!(o instanceof Mesh))return;for(const attribute of [...Object.values(o.geometry.attributes),o.geometry.index]){
  if(attribute instanceof InterleavedBufferAttribute)arrays.add(attribute.data.array.buffer);
  else if(attribute instanceof BufferAttribute)arrays.add(attribute.array.buffer);
 }});
 return [...arrays].reduce((sum,a)=>sum+a.byteLength,0);
}
