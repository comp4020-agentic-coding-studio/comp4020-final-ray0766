import {spaceDistance,bearing,firstCollision,flightBounds,withinFlightBoundary} from './flight.ts';
import type {SpaceBody} from './flight.ts';
import {bodyRadius} from './world-size.ts';
import type {Vec3} from './world.ts';
export interface RailNode {id:string;point:Vec3;links:string[]}
export interface RailEdge {a:string;b:string;length:number}
export interface FlightNetwork {nodes:Map<string,RailNode>;edges:RailEdge[];height:number}
/** Cardinal neighbouring slots form a small connected grid. A shortest safe
 * bridge joins any future sparse component, without moving a real world. */
export function flightNetwork(bodies:SpaceBody[]):FlightNetwork{
 const height=Math.max(0,...bodies.map(b=>b.center[1]+bodyRadius(b)+(b.environment?1.75:0)))+20;
 const nodes=new Map(bodies.map(b=>[b.id,{id:b.id,point:[b.center[0],height,b.center[2]] as Vec3,links:[]} as RailNode]));
 const list=[...nodes.values()],edges:RailEdge[]=[],parents=new Map(list.map(n=>[n.id,n.id]));
 const find=(id:string):string=>{const parent=parents.get(id)!;return parent===id?id:find(parent);};
 const candidates:RailEdge[]=[];
 for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)candidates.push({a:list[i].id,b:list[j].id,length:spaceDistance(list[i].point,list[j].point)});
 candidates.sort((a,b)=>a.length-b.length||a.a.localeCompare(b.a)||a.b.localeCompare(b.b));
 const bounds=flightBounds(bodies),add=(edge:RailEdge)=>{const a=nodes.get(edge.a)!,b=nodes.get(edge.b)!;if(firstCollision(a.point,b.point,bodies)!==null||!withinFlightBoundary(a.point,b.point,bounds))return;edges.push(edge);a.links.push(b.id);b.links.push(a.id);parents.set(find(a.id),find(b.id));};
 for(const e of candidates){const a=nodes.get(e.a)!.point,b=nodes.get(e.b)!.point;if(e.length<=90.01&&(Math.abs(a[0]-b[0])<.01||Math.abs(a[2]-b[2])<.01))add(e);}
 for(const e of candidates)if(find(e.a)!==find(e.b))add(e);
 for(const n of list)n.links.sort((a,b)=>bearing(n.point,nodes.get(a)!.point).yaw-bearing(n.point,nodes.get(b)!.point).yaw);
 return {nodes,edges,height};
}
export function railPath(net:FlightNetwork,start:string,goal:string):string[]{
 if(!net.nodes.has(start)||!net.nodes.has(goal))return [];
 const distance=new Map([...net.nodes.keys()].map(id=>[id,id===start?0:Infinity])),previous=new Map<string,string>(),done=new Set<string>();
 while(done.size<net.nodes.size){const id=[...net.nodes.keys()].filter(k=>!done.has(k)).sort((a,b)=>distance.get(a)!-distance.get(b)!)[0];if(!Number.isFinite(distance.get(id)!))break;if(id===goal){const path=[id];while(path[0]!==start)path.unshift(previous.get(path[0])!);return path;}done.add(id);const node=net.nodes.get(id)!;for(const next of node.links){const d=distance.get(id)!+spaceDistance(node.point,net.nodes.get(next)!.point);if(d<distance.get(next)!){distance.set(next,d);previous.set(next,id);}}}
 return [];
}
export function railPathLength(net:FlightNetwork,path:string[]){return path.slice(1).reduce((sum,id,i)=>sum+spaceDistance(net.nodes.get(path[i])!.point,net.nodes.get(id)!.point),0);}
export function nearestRail(net:FlightNetwork,position:Vec3){
 let best:{edge:RailEdge;point:Vec3;distance:number}|null=null;
 for(const edge of net.edges){const a=net.nodes.get(edge.a)!.point,b=net.nodes.get(edge.b)!.point,d=b.map((v,i)=>v-a[i]),t=Math.max(0,Math.min(1,d.reduce((v,x,i)=>v+x*(position[i]-a[i]),0)/(edge.length**2)));const point=a.map((v,i)=>v+d[i]*t) as Vec3,distance=spaceDistance(position,point);if(!best||distance<best.distance)best={edge,point,distance};}
 return best;
}
