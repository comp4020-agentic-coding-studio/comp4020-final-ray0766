import {Vector3} from 'three';
import {GroundWorld} from '../src/shared/physics/world.ts';
import type {GroundPose} from '../src/shared/physics/world.ts';
import {BODY_HEIGHT,BODY_RADIUS,STEP_HEIGHT} from '../src/shared/physics/body.ts';
import {SPEED,distance} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import type {PublicTown} from '../src/shared/public-town-layout.ts';
import type {HomeSurfaceRoute} from '../src/shared/home-layout.ts';
import {townSupportEvidence,townSupportPermitted,validateTownOutdoorPolicy} from './town-outdoor-policy.ts';
import type {TownOutdoorPolicy,TownSupportEvidence} from './town-outdoor-policy.ts';

export interface TownRouteAnchor {id:string;point:Vec3;buildingId?:string}
/** Diagnose an existing capsule with the same public blocked() method,
 * isolating bodies/colliders in a read-only view. Original geometry and
 * collision tolerances are unchanged. IDs describe the actual obstruction. */
export function townGroundBlockers(world:GroundWorld,pose:GroundPose){
 const blockers:{objectId:string;colliderIndex:number|null;tag:string;center:Vec3|null}[]=[];
 for(const body of world.bodies){
  const isolated=Object.create(world) as GroundWorld;Object.defineProperty(isolated,'bodies',{value:[body],configurable:true});
  if(!isolated.blocked(pose))continue;
  if(body.round){blockers.push({objectId:body.objectId,colliderIndex:null,tag:'legacy solid prop',center:null});continue;}
  for(const [colliderIndex,collider]of body.colliders.entries()){
   Object.defineProperty(isolated,'bodies',{value:[{...body,colliders:[collider]}],configurable:true});
   if(isolated.blocked(pose))blockers.push({objectId:body.objectId,colliderIndex,tag:collider.tag,center:collider.center.toArray() as Vec3});
  }
 }
 return blockers;
}
export interface TownGroundRouteInput {
 town:Pick<PublicTown,'radius'|'environment'|'objects'|'blueprints'>;
 /** First entry is the primary origin. Other roots must also connect to it. */
 starts:TownRouteAnchor[];
 targets:TownRouteAnchor[];
 /** Authoring grid resolution. Failure at a resolution is not proof that no
  * physical path exists. Finer grids can resolve a narrow opening. */
 spacing?:number;
 maxExpandedPerTarget?:number;
 /** A route is ordinary ground circulation, not a roof/interior finder.
  * This only bounds initial support candidates; all edges still use the
  * exact controller step/collision rules. No support is ever raised. */
 maxGroundSupportHeight?:number;
 /** Optional public-street policy. Default door authoring is unchanged.
  * Terrain is allowed; every other supporting collider must be explicitly
  * permitted as paving, an open public porch, or another designed passage. */
 outdoorOnly?:TownOutdoorPolicy;
 /** Local detour bound around the minor great-circle arc joining one start
  * and each target. Never use unrestricted globe A* as a street designer. */
 localCorridorMetres?:number;
 onProgress?:(progress:{completed:number;total:number;expanded:number;edgeChecks:number})=>void;
 /** Optional authoring progress sink. It receives complete results, including
  * failures, without changing or moving any supplied anchor. */
 onResult?:(result:TownGroundRouteResult,kind:'root'|'target')=>void;
}
export interface TownBlockedPoint {
 point:Vec3;radius:number;reason:'body-overlap'|'below-water'|'unreachable-support'|'edge-obstructed'|'unsupported-fall'|'unclassified-support'|'outside-local-corridor';
 target?:Vec3;remainingMetres?:number;
 support?:TownSupportEvidence;
}
export interface TownGroundRouteResult {
 id:string;buildingId?:string;startId:string|null;route:HomeSurfaceRoute|null;
 status:'connected'|'blocked-anchor'|'search-limit'|'no-route-at-resolution'|'replay-failed';
 expanded:number;lengthMetres:number|null;blockedPoints:TownBlockedPoint[];
 /** Real occupied support under this route, not a claim of new paving. */
 supports:{terrainSamples:number;structureSamples:number};
 supportLog?:Array<TownSupportEvidence&{samples:number}>;
 supportSegments?:Array<{direction:'forward'|'reverse';from:Vec3;to:Vec3;supports:Array<TownSupportEvidence&{samples:number}>}>;
}
export interface TownGroundRoutesReport {
 routes:TownGroundRouteResult[];rootConnections:TownGroundRouteResult[];rootsConnected:boolean;
 spacing:number;stats:{nodes:number;edgeChecks:number;cachedEdges:number;expanded:number};
 notes:string[];
}

/** Authoring-only, read-only path search over the actual town draft. The
 * non-hub world ID deliberately prevents GroundWorld from adding a second
 * cached public town. No objects, terrain, poses, storage or capacity change.
 *
 * Every candidate edge is traversed in both directions through GroundWorld
 * move with ordinary 3 m/s intent, 1/30 s steps and no jump/sprint/recovery.
 * This is authoring evidence. Final routes still need real-browser walking.
 */
export function planTownGroundRoutes(input:TownGroundRouteInput):TownGroundRoutesReport {
 const {town,starts,targets}=input,radius=town.radius,spacing=input.spacing??.75,maxExpanded=input.maxExpandedPerTarget??18000,maxSupport=input.maxGroundSupportHeight??1;
 if(!starts.length)throw Error('At least one real ground origin is required.');
 if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(spacing)||spacing<.25||spacing>2||!Number.isInteger(maxExpanded)||maxExpanded<1||!Number.isFinite(maxSupport)||maxSupport<STEP_HEIGHT)throw Error('Invalid ground navigation authoring bounds.');
 if(input.localCorridorMetres!==undefined&&(!Number.isFinite(input.localCorridorMetres)||input.localCorridorMetres<=0||starts.length!==1))throw Error('Local corridor authoring requires one real start and a positive corridor radius.');
 const allAnchors=[...starts,...targets];
 if(new Set(allAnchors.map(a=>a.id)).size!==allAnchors.length)throw Error('Navigation anchor IDs must be unique.');
 for(const a of allAnchors)if(!a.id||a.point.length!==3||a.point.some(n=>!Number.isFinite(n))||Math.abs(new Vector3(...a.point).length()-1)>1e-5)throw Error(`Invalid unit anchor: ${a.id}`);
 const world=new GroundWorld({id:'town-ground-route-authoring',revision:0,...town});
 // Read the travel-system obstacle from the actual shared hub physics, then
 // seat it against this draft's ground. No old-town bodies enter the search.
 // This avoids copying the craft's collision dimensions into authoring code.
 const hubReference=new GroundWorld({id:'hub',radius,revision:0,objects:[]}),craft=hubReference.bodies.find(body=>body.objectId==='hub-ship');
 if(craft)world.bodies.push({...craft,round:craft.round?{...craft.round,base:world.radius(craft.dir.toArray() as Vec3)}:undefined});
 if(input.outdoorOnly)validateTownOutdoorPolicy(world,input.outdoorOnly);
 type Node={point:Vec3;neighbours:Set<number>;pose?:GroundPose|null;problem?:TownBlockedPoint};
 const nodes:Node[]=[],bands:number[][]=[],rows=Math.ceil(Math.PI*radius/spacing),add=(point:Vec3)=>{nodes.push({point,neighbours:new Set()});return nodes.length-1;};
 const link=(a:number,b:number)=>{if(a!==b){nodes[a].neighbours.add(b);nodes[b].neighbours.add(a);}};
 for(let row=0;row<=rows;row++){
  const lat=-Math.PI/2+row*Math.PI/rows,count=row===0||row===rows?1:Math.max(3,Math.round(2*Math.PI*radius*Math.cos(lat)/spacing));
  const ids=Array.from({length:count},(_,i)=>{const lon=i/count*2*Math.PI;return add([Math.cos(lat)*Math.sin(lon),Math.sin(lat),Math.cos(lat)*Math.cos(lon)]);});bands.push(ids);
  for(let i=0;i<count;i++)link(ids[i],ids[(i+1)%count]);
  if(row){const previous=bands[row-1];for(let i=0;i<count;i++){const at=Math.round(i/count*previous.length);for(const offset of [-1,0,1])link(ids[i],previous[(at+offset+previous.length)%previous.length]);}}
 }
 const anchorNodes=new Map<string,number>();
 for(const anchor of allAnchors){
  const index=add([...anchor.point]),lat=Math.asin(anchor.point[1]),row=Math.round((lat+Math.PI/2)/Math.PI*rows),lon=(Math.atan2(anchor.point[0],anchor.point[2])+2*Math.PI)%(2*Math.PI);
  const candidates=new Set<number>();
  for(let offset=-2;offset<=2;offset++){
   const band=bands[row+offset];if(!band)continue;const center=Math.round(lon/(2*Math.PI)*band.length);
   for(let column=-3;column<=3;column++)candidates.add(band[(center+column+band.length)%band.length]);
  }
  for(const other of [...candidates].sort((a,b)=>distance(anchor.point,nodes[a].point,radius)-distance(anchor.point,nodes[b].point,radius)).slice(0,16))if(distance(anchor.point,nodes[other].point,radius)<=spacing*2.5)link(index,other);
  anchorNodes.set(anchor.id,index);
 }
 // Exact close anchors may share an entrance landing, still subject to the
 // same bidirectional movement check as every lattice connection.
 for(let i=0;i<allAnchors.length;i++)for(let j=i+1;j<allAnchors.length;j++)if(distance(allAnchors[i].point,allAnchors[j].point,radius)<=spacing*2.5)link(anchorNodes.get(allAnchors[i].id)!,anchorNodes.get(allAnchors[j].id)!);
 const stats={nodes:nodes.length,edgeChecks:0,cachedEdges:0,expanded:0};
 const poseAt=(index:number)=>{
  const node=nodes[index];if(node.pose!==undefined)return node.pose;
  const ground=world.radius(node.point),support=world.support(node.point,ground+maxSupport),pose:GroundPose={position:[...node.point],radius:support.radius,grounded:true,verticalSpeed:0,jumpHeld:false};
  if(world.field.waterLevel!==null&&world.field.heightAt(node.point)<world.field.waterLevel+.015){node.problem={point:node.point,radius:pose.radius,reason:'below-water'};return node.pose=null;}
  if(world.blocked(pose)){node.problem={point:node.point,radius:pose.radius,reason:'body-overlap'};return node.pose=null;}
  if(input.outdoorOnly){const support=townSupportEvidence(world,pose);if(!townSupportPermitted(support,input.outdoorOnly)){node.problem={point:node.point,radius:pose.radius,reason:'unclassified-support',support};return node.pose=null;}}
  node.pose=pose;return pose;
 };
 type Edge={ok:boolean;problem?:TownBlockedPoint;end?:GroundPose};
 const edgeCache=new Map<string,Edge>();
 let withinCorridor:((point:Vec3)=>boolean)|null=null,corridorKey='';
 function simulate(from:GroundPose,to:GroundPose,fullWorld=false,supportLog?:Map<string,TownSupportEvidence&{samples:number}>):Edge {
  let pose:GroundPose={...from,position:[...from.position]},elapsed=0,stalled=0,lastGap=Infinity;
  const direct=distance(from.position,to.position,radius),timeout=Math.max(.7,direct/SPEED+1.1),dt=1/30;
  // Conservative local broad phase only. Ground/terrain and every precise
  // collider operation are inherited unchanged. Its radius includes all
  // possible input travel for this edge plus the body/fall margin.
  const local=fullWorld?world:Object.create(world) as GroundWorld,fromVector=new Vector3(...from.position),reach=SPEED*timeout+BODY_HEIGHT+.5;
  if(!fullWorld)Object.defineProperty(local,'bodies',{value:world.bodies.filter(b=>b.dir.angleTo(fromVector)*radius<=b.broad+reach)});
  while(elapsed<timeout){
   if(withinCorridor&&!withinCorridor(pose.position))return {ok:false,problem:{point:pose.position,radius:pose.radius,reason:'outside-local-corridor',target:to.position}};
   if(input.outdoorOnly){
    const support=townSupportEvidence(local,pose);
    if(!townSupportPermitted(support,input.outdoorOnly))return {ok:false,problem:{point:pose.position,radius:pose.radius,reason:'unclassified-support',target:to.position,support}};
    if(supportLog){const key=JSON.stringify([support.objectId,support.tag,support.colliderIndices]),old=supportLog.get(key);if(old)old.samples++;else supportLog.set(key,{...support,samples:1});}
   }
   const gap=distance(pose.position,to.position,radius);
   if(gap<.045&&Math.abs(pose.radius-to.radius)<.08&&pose.grounded)return {ok:true,end:pose};
   if(local.blocked(pose))return {ok:false,problem:{point:pose.position,radius:pose.radius,reason:'body-overlap',target:to.position,remainingMetres:gap}};
   if(pose.radius<Math.min(from.radius,to.radius)-.45)return {ok:false,problem:{point:pose.position,radius:pose.radius,reason:'unsupported-fall',target:to.position,remainingMetres:gap}};
   stalled=gap>=lastGap-.003?stalled+1:0;lastGap=gap;
   if(stalled>14)break;
   const up=new Vector3(...pose.position),tangent=new Vector3(...to.position).projectOnPlane(up);
   let desired:Vec3=to.position;
   if(gap>.045){tangent.normalize();const amount=Math.min(SPEED*dt,gap)/pose.radius;desired=up.multiplyScalar(Math.cos(amount)).addScaledVector(tangent,Math.sin(amount)).normalize().toArray() as Vec3;}
   pose=local.move(pose,desired,dt,0);elapsed+=dt;
  }
  return {ok:false,problem:{point:pose.position,radius:pose.radius,reason:Math.abs(pose.radius-to.radius)>.08?'unreachable-support':'edge-obstructed',target:to.position,remainingMetres:distance(pose.position,to.position,radius)}};
 }
 const edge=(a:number,b:number):Edge=>{
  const key=corridorKey+(a<b?`${a}:${b}`:`${b}:${a}`),cached=edgeCache.get(key);if(cached){stats.cachedEdges++;return cached;}stats.edgeChecks++;
  const from=poseAt(a),to=poseAt(b);
  let result:Edge;
  if(!from||!to)result={ok:false,problem:nodes[!from?a:b].problem};
  else{result=simulate(from,to);if(result.ok)result=simulate(to,from);}
  edgeCache.set(key,result);return result;
 };
 const roots=starts.map(anchor=>({anchor,node:anchorNodes.get(anchor.id)!}));
 function search(target:TownRouteAnchor,allowedRoots:typeof roots):TownGroundRouteResult {
  const start=anchorNodes.get(target.id)!,base={id:target.id,buildingId:target.buildingId,startId:null,route:null,lengthMetres:null,expanded:0,blockedPoints:[] as TownBlockedPoint[],supports:{terrainSamples:0,structureSamples:0}};
  if(!poseAt(start))return {...base,status:'blocked-anchor',blockedPoints:nodes[start].problem?[nodes[start].problem!]:[]};
  const validRoots=allowedRoots.filter(r=>poseAt(r.node));
  if(!validRoots.length)return {...base,status:'blocked-anchor',blockedPoints:allowedRoots.flatMap(r=>nodes[r.node].problem?[nodes[r.node].problem!]:[])};
  withinCorridor=null;corridorKey='';
  if(input.localCorridorMetres!==undefined){
   const a=new Vector3(...starts[0].point),b=new Vector3(...target.point),normal=new Vector3().crossVectors(a,b),arc=a.angleTo(b),bound=input.localCorridorMetres;
   if(arc>Math.PI-.01)throw Error('Antipodal anchors cannot define a local street corridor.');
   normal.normalize();corridorKey=target.id+':';
   withinCorridor=point=>{const p=new Vector3(...point),projection=p.clone().projectOnPlane(normal);let away=Math.min(a.angleTo(p),b.angleTo(p));if(projection.lengthSq()>1e-10){projection.normalize();if(a.angleTo(projection)+projection.angleTo(b)<=arc+1e-6)away=Math.min(away,p.angleTo(projection));}return away*radius<=bound+1e-6;};
  }
  const rootSet=new Set(validRoots.map(r=>r.node)),heuristic=(id:number)=>Math.min(...validRoots.map(r=>distance(nodes[id].point,nodes[r.node].point,radius)));
  const scores=new Map([[start,0]]),parents=new Map<number,number>(),closed=new Set<number>(),heap=new MinHeap();heap.push(start,heuristic(start));
  let goal:number|undefined,expanded=0;
  while(heap.size&&expanded<maxExpanded){
   const current=heap.pop()!;if(closed.has(current))continue;if(rootSet.has(current)){goal=current;break;}closed.add(current);expanded++;
   for(const next of nodes[current].neighbours){
    if(closed.has(next)||withinCorridor&&!withinCorridor(nodes[next].point))continue;const candidate=scores.get(current)!+distance(nodes[current].point,nodes[next].point,radius);if(candidate>=(scores.get(next)??Infinity))continue;
    const pass=edge(current,next);if(!pass.ok){if(pass.problem&&base.blockedPoints.length<32)base.blockedPoints.push(pass.problem);continue;}
    scores.set(next,candidate);parents.set(next,current);heap.push(next,candidate+heuristic(next));
   }
  }
  stats.expanded+=expanded;base.expanded=expanded;
  if(goal===undefined)return {...base,status:expanded>=maxExpanded?'search-limit':'no-route-at-resolution'};
  const path:number[]=[];for(let at:number|undefined=goal;at!==undefined;at=parents.get(at))path.push(at);
  // Path starts at a real root and ends at the exact supplied door/step
  // approach. Do not smooth away validated bends or replace them with chords.
  const points=path.map(i=>[...nodes[i].point] as Vec3);
  // Do not join individually validated edges by resetting their feet. Replay
  // the complete result in each direction, carrying the actual returned pose
  // continuously and using the unfiltered full physics world for this proof.
  const supportLog=new Map<string,TownSupportEvidence&{samples:number}>();
  const supportSegments:NonNullable<TownGroundRouteResult['supportSegments']>=[];
  for(const [directionIndex,direction]of [path,[...path].reverse()].entries()){
   let pose=poseAt(direction[0])!;
   for(const node of direction.slice(1)){
    const segmentLog=new Map<string,TownSupportEvidence&{samples:number}>(),result=simulate(pose,poseAt(node)!,true,segmentLog);
    if(input.outdoorOnly){
     supportSegments.push({direction:directionIndex===0?'forward':'reverse',from:pose.position,to:nodes[node].point,supports:[...segmentLog.values()]});
     for(const [key,value]of segmentLog){const old=supportLog.get(key);if(old)old.samples+=value.samples;else supportLog.set(key,{...value});}
    }
    if(!result.ok)return {...base,status:'replay-failed',blockedPoints:result.problem?[...base.blockedPoints,result.problem]:base.blockedPoints,...(input.outdoorOnly?{supportLog:[...supportLog.values()],supportSegments}:{})};
    pose=result.end!;
   }
  }
  for(const id of path){const p=poseAt(id)!,support=world.support(p.position,p.radius+.01);if(support.objectId===null)base.supports.terrainSamples++;else base.supports.structureSamples++;}
  const startId=validRoots.find(r=>r.node===goal)!.anchor.id;
  return {...base,status:'connected',startId,lengthMetres:points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p,radius),0),route:{id:`ground-${target.id}`,width:BODY_RADIUS*2,points},...(input.outdoorOnly?{supportLog:[...supportLog.values()],supportSegments}:{})};
 }
 const rootConnections:TownGroundRouteResult[]=[],routes:TownGroundRouteResult[]=[];let completed=0;
 const progress=()=>input.onProgress?.({completed:++completed,total:starts.length-1+targets.length,expanded:stats.expanded,edgeChecks:stats.edgeChecks});
 for(const anchor of starts.slice(1)){const result=search(anchor,[roots[0]]);rootConnections.push(result);input.onResult?.(result,'root');progress();}
 for(const target of targets){const result=search(target,roots);routes.push(result);input.onResult?.(result,'target');progress();}
 return {routes,rootConnections,rootsConnected:!!poseAt(roots[0].node)&&rootConnections.every(r=>r.status==='connected'),spacing,stats,notes:[
  'This module does not modify the supplied draft, player poses, files or databases.',
  'All route edges passed ordinary 3 m/s GroundWorld movement in both directions, with no jump, sprint, recovery, collider inflation changes or placement exceptions.',
  'Every completed route was also replayed end-to-end in both directions against the full unfiltered world, carrying the actual returned feet pose across every edge.',
  'Route width is only the validated body diameter. A centreline search does not establish a comfortable street or passing clearance; do not present this as an authored paved width.',
  'Terrain is a valid traversed surface. Returned routes are not pavingRoutes and do not establish entranceCoverage.',
  'Initial support candidates are bounded to ordinary ground circulation. Upper storeys and roof circulation are outside this search.',
  'A search limit or no-route-at-resolution result is an authoring failure to resolve, not proof of physical impossibility. Keep it visible and inspect/refine the location.',
  'Root connectivity is reported independently; door connections to different isolated roots do not prove one connected town.',
  'Independent browser walking, collision sampling, camera review and visual street continuity remain required.',
  ...(input.outdoorOnly?['Outdoor policy was explicitly enabled: only terrain and listed public support collider indices/tags were allowed at every movement step. Unknown floors were rejected, not labelled outdoors.']:[]),
  ...(input.outdoorOnly?['Support eligibility is not semantic room/enclosure detection. Designed outdoor gates and visual street review remain necessary even when the support is terrain.']:[]),
  ...(input.localCorridorMetres!==undefined?[`Local authoring was restricted to ${input.localCorridorMetres} m from the minor great-circle arc between the supplied adjacent anchors.`]:[]),
 ]};
}

/** Small deterministic binary heap avoids O(n²) open-set sorting for a
 * whole sphere. Equal scores retain node order rather than random choices. */
class MinHeap {
 private items:{node:number;score:number}[]=[];
 get size(){return this.items.length;}
 private less(a:{node:number;score:number},b:{node:number;score:number}){return a.score<b.score||a.score===b.score&&a.node<b.node;}
 push(node:number,score:number){const entry={node,score};this.items.push(entry);let at=this.items.length-1;while(at){const parent=(at-1)>>1;if(!this.less(entry,this.items[parent]))break;this.items[at]=this.items[parent];at=parent;}this.items[at]=entry;}
 pop(){
  if(!this.items.length)return undefined;const first=this.items[0],last=this.items.pop()!;if(!this.items.length)return first.node;
  let at=0;while(at*2+1<this.items.length){let child=at*2+1;if(child+1<this.items.length&&this.less(this.items[child+1],this.items[child]))child++;if(!this.less(this.items[child],last))break;this.items[at]=this.items[child];at=child;}this.items[at]=last;return first.node;
 }
}
