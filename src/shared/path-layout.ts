import {Vector3} from 'three';
import {anchorFrame} from '../assets/claude-geometry/core/anchor.ts';
import type {HeightField} from '../assets/claude-geometry/core/ground.ts';
import type {BlueprintContents} from './blueprints.ts';
import {facePoint} from './harbour-layout.ts';
import type {HomeSurfaceRoute} from './home-layout.ts';
import {CATALOGUE,MAX_OBJECTS,placementProblem} from './planets.ts';
import type {PlacedObject} from './planets.ts';
import {fieldOf,objectSeat} from './terrain.ts';
import {distance,SPAWN,validPosition} from './world.ts';
import {PathPlacementCache} from './path-structure-placement.ts';
import type {Vec3} from './world.ts';

export interface RoutePathOptions {
 routes:readonly HomeSurfaceRoute[];
 /** Optional paving centre-lines, ending at a desired last tile centre.
  * Navigation routes may continue onto real steps/floors beyond that point. */
 pavingRoutes?:readonly HomeSurfaceRoute[];
 radius:number;
 environment:string|null;
 objects:readonly PlacedObject[];
 blueprints?:BlueprintContents;
 /** Total world-object ceiling, including existing structures and props. */
 maxObjects?:number;
 spacing?:number;
 idPrefix?:string;
}
export interface RoutePathGap {from:Vec3;to:Vec3;length:number}
export interface RoutePathCoverage {
 id:string;candidates:number;added:number;covered:number;blocked:number;budgetOmitted:number;
 /** Measured on actual output and existing tiles, never on omitted proposals. */
 gaps:RoutePathGap[];maxGap:number;endDistance:number;isolated:number;connected:boolean;
}
export interface RoutePathPlan {
 objects:PlacedObject[];requested:number;added:number;capacity:number;blocked:number;budgetLimited:boolean;coverage:RoutePathCoverage[];
}
export const PATH_MAX_VISUAL_GAP=.24,PATH_END_TOLERANCE=.25;
const MIN_DISTINCT_CENTRES=.48;
const vec=(point:Vec3)=>new Vector3(...point);

function polyline(points:readonly Vec3[],radius:number){
 let total=0;
 const segments=points.slice(1).map((point,index)=>{
  const a=vec(points[index]),b=vec(point),angle=a.angleTo(b),length=angle*radius,start=total;total+=length;
  return {a,b,angle,length,start};
 }).filter(segment=>segment.length>.00001);
 const at=(value:number):Vec3=>{
  const s=Math.max(0,Math.min(total,value)),segment=segments.find(part=>s<=part.start+part.length)??segments.at(-1);
  if(!segment)return [...(points[0]??SPAWN)];
  const t=Math.max(0,Math.min(1,(s-segment.start)/segment.length)),sin=Math.sin(segment.angle);
  return (sin>1e-8?segment.a.clone().multiplyScalar(Math.sin((1-t)*segment.angle)/sin).addScaledVector(segment.b,Math.sin(t*segment.angle)/sin):segment.a.clone().lerp(segment.b,t)).normalize().toArray() as Vec3;
 };
 const project=(point:Vec3)=>{
  const p=vec(point);let best={s:0,d:Infinity};
  for(const segment of segments){
   const normal=new Vector3().crossVectors(segment.a,segment.b).normalize(),q=p.clone().projectOnPlane(normal).normalize();
   const first=segment.a.angleTo(q),last=q.angleTo(segment.b);
   const candidate=first+last<=segment.angle+1e-7?q:p.angleTo(segment.a)<p.angleTo(segment.b)?segment.a:segment.b;
   const d=p.angleTo(candidate)*radius;
   if(d<best.d)best={s:segment.start+segment.a.angleTo(candidate)*radius,d};
  }
  return best;
 };
 return {total,at,project};
}

/** Cluster bounds of the four existing ordinary stones, not an invisible
 * rendered strip. Internal joints remain part of a single visual tile. */
function visualCoverage(route:ReturnType<typeof polyline>,paths:readonly PlacedObject[],radius:number,field:HeightField,terrainSeating:boolean,cache:PathPlacementCache,spacing:number){
 const nearby=paths.filter(path=>route.project(path.position).d<.7);
 const tiles=nearby.map(path=>{
  const frame=anchorFrame({dir:path.position,yaw:path.rotation});
  const base=terrainSeating?cache.prepare(field,path,undefined,CATALOGUE.path.radius).fit.baseRadius:10+field.heightAt(path.position);
  return {up:vec(frame.up),right:vec(frame.right),front:vec(frame.front),base};
 });
 const covered=(point:Vec3)=>{
  const dir=vec(point);
  return tiles.some(tile=>{
   const dot=dir.dot(tile.up);if(dot<=0)return false;
   const scale=tile.base/dot,x=dir.dot(tile.right)*scale,z=dir.dot(tile.front)*scale;
   return x>=-.39&&x<=.385&&z>=-.345&&z<=.355;
  });
 };
 const gaps:RoutePathGap[]=[];let gap:RoutePathGap|undefined;
 const steps=Math.max(1,Math.ceil(route.total/.04));
 for(let i=0;i<steps;i++){
  const start=route.total*i/steps,end=route.total*(i+1)/steps,mid=route.at((start+end)/2);
  const protectedLanding=distance(mid,SPAWN,radius)<CATALOGUE.path.radius+1;
  if(!protectedLanding&&!covered(mid)){
   if(!gap){gap={from:route.at(start),to:route.at(end),length:0};gaps.push(gap);}
   gap.to=route.at(end);gap.length+=end-start;
  }else gap=undefined;
 }
 // Midpoint classification can miss half an interval at each gap edge.
 const maxGap=Math.max(0,...gaps.map(item=>item.length+route.total/steps));
 const endDistance=nearby.length?Math.min(...nearby.map(path=>distance(path.position,route.at(route.total),radius))):Infinity;
 const isolated=nearby.filter(path=>!nearby.some(other=>other!==path&&distance(path.position,other.position,radius)<=spacing+.15)).length;
 return {gaps,maxGap,endDistance,isolated,connected:route.total>0&&maxGap<=PATH_MAX_VISUAL_GAP&&endDistance<=PATH_END_TOLERANCE&&isolated===0};
}

/** Pure ordinary-Path preview. The quality result is advisory for existing
 * player roads; new district generators can require connected paving routes.
 * Saved objects, seats and IDs are never reordered or modified. */
export function planRoutePaths({routes,pavingRoutes,radius,environment,objects,blueprints={},maxObjects=MAX_OBJECTS,spacing=.7,idPrefix='route-path'}:RoutePathOptions):RoutePathPlan {
 if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(spacing)||spacing<.4||spacing>2||!Number.isInteger(maxObjects)||maxObjects<0)throw Error('Invalid path planning budget or dimensions.');
 if([...routes,...(pavingRoutes??[])].some(route=>route.points.some(point=>!validPosition(point))))throw Error('Invalid path route directions.');
 const capacity=Math.max(0,Math.min(MAX_OBJECTS,maxObjects)-objects.length),field=fieldOf(environment,radius),cache=new PathPlacementCache();
 const coverage:RoutePathCoverage[]=routes.map(route=>({id:route.id,candidates:0,added:0,covered:0,blocked:0,budgetOmitted:0,gaps:[],maxGap:0,endDistance:Infinity,isolated:0,connected:false}));
 const paving=routes.map(route=>pavingRoutes?.find(paved=>paved.id===route.id)??route),lines=paving.map(route=>polyline(route.points,radius));
 const occupied=[...objects],existingIds=new Set(objects.map(object=>object.id)),existingPaths=objects.filter(o=>o.kind==='path'),accepted:PlacedObject[]=[],pending:{object:PlacedObject;routeIndex:number}[]=[];
 const legal=(object:PlacedObject,scene:PlacedObject[],ignoreId?:string)=>!placementProblem('path',object.position,scene,ignoreId,undefined,radius,2,{rotation:object.rotation,blueprints,field,terrainSeating:!!environment,cache})&&!objectSeat(field,object,blueprints).problem;
 const candidate=(line:ReturnType<typeof polyline>,s:number,routeIndex:number,index:number):PlacedObject=>{
  const position=line.at(s),toward=line.at(s>.0001?Math.max(0,s-.1):Math.min(line.total,.1));
  const baseId=`${idPrefix}-${routeIndex}-${index===0?'end-0':index}`;let id=baseId;
  for(let suffix=1;existingIds.has(id);suffix++)id=`${baseId}-addition-${suffix}`;
  return {id,kind:'path',assetVersion:2,position,rotation:(facePoint(position,toward)+Math.PI*2)%(Math.PI*2),version:1};
 };
 // Pin real shared street vertices before individual branches establish their
 // sampling phase. One central junction can serve two nearby door approaches;
 // an off-axis branch tile must not become the street's accidental junction.
 const vertices=new Map<string,{point:Vec3;routes:Set<number>;s:number;routeIndex:number}>();
 for(const [routeIndex,route]of paving.entries())for(const point of route.points.slice(1,-1)){
  const key=point.map(value=>value.toFixed(8)).join(','),old=vertices.get(key);
  if(old)old.routes.add(routeIndex);else vertices.set(key,{point,routes:new Set([routeIndex]),s:lines[routeIndex].project(point).s,routeIndex});
 }
 const junctions:PlacedObject[]=[];
 for(const vertex of vertices.values())if(vertex.routes.size>1){
  const existing=[...existingPaths,...accepted].find(path=>distance(path.position,vertex.point,radius)<.12);
  if(existing){junctions.push(existing);continue;}
  const object=candidate(lines[vertex.routeIndex],vertex.s,vertex.routeIndex,-2-junctions.length);
  if([...existingPaths,...accepted].some(path=>distance(path.position,object.position,radius)<MIN_DISTINCT_CENTRES)||!legal(object,occupied))continue;
  coverage[vertex.routeIndex].candidates++;junctions.push(object);accepted.push(object);pending.push({object,routeIndex:vertex.routeIndex});if(pending.length<=capacity)occupied.push(object);
 }
 const anchors=lines.map(line=>junctions.map(path=>line.project(path.position)).filter(point=>point.d<.12).map(point=>point.s));
 const advance=(routeIndex:number,s:number)=>{
  const previous=Math.max(0,...anchors[routeIndex].filter(anchor=>anchor<s-.001)),length=s-previous;
  return length>.001?s-length/Math.max(1,Math.ceil(length/spacing)):-1;
 };
 // A fine search chooses ONE endpoint anchor. The rest follows one continuous
 // arc-length sequence, carrying its spacing across every polyline corner.
 const states=lines.map((line,routeIndex)=>{
  let s=line.total;
  for(let offset=0;offset<=Math.min(1.5,line.total)+.00001;offset+=.05){
   s=Math.max(0,line.total-offset);
   if(legal(candidate(line,s,routeIndex,0),occupied))break;
   coverage[routeIndex].candidates++;coverage[routeIndex].blocked++;
  }
  return {s,index:0,previous:null as PlacedObject|null,done:line.total<.00001};
 });
 const projections=lines.map(()=>new WeakMap<PlacedObject,ReturnType<ReturnType<typeof polyline>['project']>>());
 while(states.some(state=>!state.done))for(const [routeIndex,state]of states.entries()){
  if(state.done)continue;
  const line=lines[routeIndex],stats=coverage[routeIndex],object=candidate(line,state.s,routeIndex,state.index++);stats.candidates++;
  const nearby=[...existingPaths,...accepted].flatMap(path=>{
   let projected=projections[routeIndex].get(path);
   if(!projected){projected=line.project(path.position);projections[routeIndex].set(path,projected);}
   // A neighbouring branch cannot erase this route's tile. Reuse only a tile
   // on this centre-line, and only if the preceding accepted tile still joins.
   if(projected.d>.18||Math.abs(projected.s-state.s)>spacing*.65||state.previous===path)return [];
   if(state.index===1&&distance(path.position,object.position,radius)>PATH_END_TOLERANCE)return [];
   if(state.previous&&distance(state.previous.position,path.position,radius)>spacing+.10)return [];
   return [{path,s:projected.s,delta:Math.abs(projected.s-state.s)}];
  }).sort((a,b)=>a.delta-b.delta);
  const reuse=nearby[0];
  if(reuse){stats.covered++;state.previous=reuse.path;state.s=advance(routeIndex,reuse.s);}
  else{
   // Avoid visibly stacking clusters at a crossing. This is only a duplicate
   // suppression; the independent coverage pass must still prove the branch.
   if([...existingPaths,...accepted].some(path=>distance(path.position,object.position,radius)<MIN_DISTINCT_CENTRES))stats.covered++;
   else if(legal(object,occupied)){
    accepted.push(object);pending.push({object,routeIndex});state.previous=object;
    if(pending.length<=capacity)occupied.push(object);
   }else stats.blocked++;
   state.s=advance(routeIndex,state.s);
  }
  if(state.s<0)state.done=true;
 }
 // The last regular step can leave a partial interval at the route's start.
 // Anchor the first legal centre beyond the landing boundary as well, without
 // disturbing an existing tile that already covers that short interval.
 for(const [routeIndex,line]of lines.entries()){
  const stats=coverage[routeIndex];
  for(let s=0;s<=Math.min(line.total,2.5)+.00001;s+=.05){
   const object=candidate(line,s,routeIndex,-1);if(!legal(object,occupied))continue;
   if([...existingPaths,...accepted].some(path=>line.project(path.position).d<=.18&&distance(path.position,object.position,radius)<=PATH_MAX_VISUAL_GAP+.33))break;
   if([...existingPaths,...accepted].some(path=>distance(path.position,object.position,radius)<MIN_DISTINCT_CENTRES))break;
   stats.candidates++;accepted.push(object);pending.push({object,routeIndex});if(pending.length<=capacity)occupied.push(object);break;
  }
 }
 // Neighbouring seats can lower one another's ground. Verify exactly the
 // capacity-limited scene in saved order; omitted candidates never grade it.
 const excluded=new Set<PlacedObject>();let proposal=pending,result=proposal.slice(0,capacity);
 for(;;){
  const scene=[...objects,...result.map(item=>item.object)],rejected=result.filter(({object})=>!legal(object,scene,object.id));
  if(!rejected.length)break;
  for(const item of rejected){excluded.add(item.object);coverage[item.routeIndex].blocked++;}
  proposal=pending.filter(item=>!excluded.has(item.object));result=proposal.slice(0,capacity);
 }
 for(const [index,item]of proposal.entries())if(index<capacity)coverage[item.routeIndex].added++;else coverage[item.routeIndex].budgetOmitted++;
 const actualPaths=[...existingPaths,...result.map(item=>item.object)];
 for(const [index,line]of lines.entries())Object.assign(coverage[index],visualCoverage(line,actualPaths,radius,field,!!environment,cache,spacing));
 return {objects:result.map(item=>item.object),requested:proposal.length,added:result.length,capacity,blocked:coverage.reduce((sum,route)=>sum+route.blocked,0),budgetLimited:proposal.length>capacity,coverage};
}
