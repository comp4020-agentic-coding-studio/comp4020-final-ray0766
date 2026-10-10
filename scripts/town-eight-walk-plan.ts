import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from 'three';
import {GroundWorld} from '../src/shared/physics/world.ts';
import type {GroundPose} from '../src/shared/physics/world.ts';
import type {PublicTown} from '../src/shared/public-town-layout.ts';
import type {Vec3} from '../src/shared/world.ts';
import {distance} from '../src/shared/world.ts';
import {townSupportEvidence,townSupportPermitted,validateTownOutdoorPolicy} from './town-outdoor-policy.ts';
import type {TownOutdoorPolicy} from './town-outdoor-policy.ts';

/** Pure final-plan assembly: no browser, network, identity or save access.
 * --town=.data/frozen.json --selection=.data/designed-eight.json
 * --out=.data/final-eight.json
 * Selection names eight routes and ordered, explicitly designed street legs.
 * {townFingerprint,runtimeIndexSha256,designedRouteIds:string[],
 * localDoorRouteIds?:string[],outdoorOnly:{publicSupports:[{objectId,
 * colliderIndices:number[],tag,reason}]},routes:[{id,fixture,purpose,legs:[{routeId,
 * reverse?:boolean,fromIndex?:number,toIndex?:number}],captureIndices?:number[]}]}
 * Every leg is read verbatim from the frozen town. No A*, inferred connector,
 * nearest-door substitution or automatic street redesign happens here.
 */
type Leg={routeId:string;reverse?:boolean;fromIndex?:number;toIndex?:number};
type Selection={townFingerprint:string;runtimeIndexSha256:string;designedRouteIds:string[];localDoorRouteIds?:string[];routeStartFeetRadius?:Record<string,number>;outdoorOnly:TownOutdoorPolicy;routes:{id:string;fixture:string;purpose:string;legs:Leg[];captureIndices?:number[]}[]};
const args=process.argv.slice(2);
if(args.some(a=>!/^--(town|selection|out)=/.test(a)))throw Error('Unknown final route planning option.');
const file=(key:string)=>{const value=args.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3);if(!value?.startsWith('.data/')||value.split('/').includes('..'))throw Error('--'+key+' must name a local .data file.');return value;};
const townFile=file('town'),selectionFile=file('selection'),out=file('out'),proofFile=out.replace(/\.json$/,'')+'-authoring.json';
if(existsSync(out)||existsSync(proofFile))throw Error('Keep existing route evidence; choose new output names.');
const raw=readFileSync(townFile,'utf8'),town=JSON.parse(raw) as PublicTown,selection=JSON.parse(readFileSync(selectionFile,'utf8')) as Selection;
const snapshotSha256=createHash('sha256').update(raw).digest('hex');
const fingerprint=createHash('sha256').update(JSON.stringify({version:town.version,objects:town.objects,blueprints:town.blueprints,routes:town.routes})).digest('hex');
if(selection.townFingerprint!==fingerprint||!/^[a-f0-9]{64}$/.test(selection.runtimeIndexSha256))throw Error('Selection must match the frozen town and name the actual built HTML SHA256.');
if(selection.routes?.length!==8||new Set(selection.routes.map(r=>r.id)).size!==8||!selection.designedRouteIds?.length)throw Error('Eight distinct, explicitly designed routes are required.');
const designed=new Set(selection.designedRouteIds),localDoors=new Set(selection.localDoorRouteIds??[]),selectedIds=new Set([...designed,...localDoors]);
if([...designed].some(id=>localDoors.has(id)))throw Error('A local door access cannot also be labelled a designed through street.');
const get=(id:string)=>{const route=town.routes.find(r=>r.id===id);if(!route||!selectedIds.has(id))throw Error('No approved frozen design route: '+id);return route;};
const length=(points:Vec3[])=>points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p,town.radius),0);
const network=[...selectedIds].map(get);
if(network.some(r=>r.points.length<2||r.points.some(p=>p.length!==3||p.some(n=>!Number.isFinite(n))||Math.abs(new Vector3(...p).length()-1)>1e-5)))throw Error('Designed source routes need at least two finite unit points.');
for(const route of network)if(localDoors.has(route.id)&&length(route.points)>3)throw Error('Local door access exceeds 3 m: '+route.id);
const world=new GroundWorld({id:'eight-designed-route-authoring',revision:0,...town});
const craft=new GroundWorld({id:'hub',radius:town.radius,revision:0,objects:[]}).bodies.find(b=>b.objectId==='hub-ship');
if(craft)world.bodies.push({...craft,round:craft.round?{...craft.round,base:world.radius(craft.dir.toArray() as Vec3)}:undefined});
validateTownOutdoorPolicy(world,selection.outdoorOnly??{publicSupports:[]});
const outdoorOnly=selection.outdoorOnly??{publicSupports:[]};
function replay(points:Vec3[],localDoorSegments:boolean|Set<number>,from?:GroundPose){
 let pose:GroundPose=from?{...from,position:[...from.position]}:{position:points[0],radius:world.support(points[0],world.radius(points[0])+1).radius,grounded:true,verticalSpeed:0,jumpHeld:false};
 const initialPose={...pose,position:[...pose.position] as Vec3},waypointPoses:GroundPose[]=[initialPose];
 const supports=new Set<string>(),buildingFloors=new Set<string>();let ticks=0;
 for(const [index,target]of points.slice(1).entries()){
  let reached=false,lastGap=Infinity,stalled=0;const maxSteps=Math.ceil((distance(pose.position,target,town.radius)/3+3)*60),localDoor=typeof localDoorSegments==='boolean'?localDoorSegments:localDoorSegments.has(index);
  for(let step=0;step<maxSteps;step++){
   ticks++;const support=townSupportEvidence(world,pose);supports.add(JSON.stringify([support.objectId??'terrain',support.tag,support.colliderIndices]));
   if(!localDoor&&!townSupportPermitted(support,outdoorOnly))return {connected:false,reason:'unclassified-public-support',support,segment:index,initialPose,waypointPoses,actual:pose,supports:[...supports],buildingFloors:[...buildingFloors],ticks};
   if(support.objectId&&town.buildings.includes(support.objectId)&&support.tag==='floor')buildingFloors.add(support.objectId);
   if(world.blocked(pose))return {connected:false,reason:'body-overlap',segment:index,initialPose,waypointPoses,actual:pose,supports:[...supports],buildingFloors:[...buildingFloors],ticks};
   const gap=distance(pose.position,target,town.radius);if(gap<.045){reached=true;break;}
   stalled=gap>=lastGap-.003?stalled+1:0;lastGap=gap;if(stalled>30)break;
   const up=new Vector3(...pose.position),toward=new Vector3(...target).projectOnPlane(up).normalize();
   pose=world.move(pose,up.addScaledVector(toward,Math.min(.05,gap)/pose.radius).normalize().toArray() as Vec3,1/60,0);
  }
  if(!reached)return {connected:false,reason:'edge-obstructed',segment:index,initialPose,waypointPoses,actual:pose,target,remainingMetres:distance(pose.position,target,town.radius),supports:[...supports],buildingFloors:[...buildingFloors],ticks};
  waypointPoses.push({...pose,position:[...pose.position]});
 }
 return {connected:true,reason:null,initialPose,waypointPoses,actual:pose,supports:[...supports],buildingFloors:[...buildingFloors],ticks};
}
const networkProof=network.map(r=>{
 const height=selection.routeStartFeetRadius?.[r.id];let initial:GroundPose|undefined;
 if(height!==undefined){initial={position:r.points[0],radius:height,grounded:true,verticalSpeed:0,jumpHeld:false};if(!Number.isFinite(height)||Math.abs(world.support(initial.position,height+.025).radius-height)>.025||world.blocked(initial))throw Error('Explicit starting height is not a real standing support: '+r.id);}
 const forward=replay(r.points,localDoors.has(r.id),initial),reverse=forward.connected?replay([...r.points].reverse(),localDoors.has(r.id),forward.actual):{...forward,reason:'not-executed-forward-failed'};
 return {id:r.id,role:localDoors.has(r.id)?'explicit-local-door-access':'explicit-designed-street',lengthMetres:length(r.points),forward,reverse};
});
if(networkProof.some(r=>!r.forward.connected||!r.reverse.connected)){
 writeFileSync(proofFile,JSON.stringify({status:'failed-original-design-retained',snapshot:townFile,snapshotSha256,selection:selectionFile,outdoorOnly,networkProof,gateChecks:[],chainProof:[],meaning:'A named design leg failed exact support or motion checks. No executable plan, inferred connector or substitute route was generated.'},null,2)+'\n');
 throw Error('Design street proof failed; inspect '+proofFile+' . No executable plan written.');
}
const localSegments=new Map<string,Set<number>>();
const chainStarts=new Map<string,GroundPose>(),gateChecks:{routeId:string;before:string;after:string;directionGapMetres:number;heightGapMetres:number;beforePose:GroundPose;afterPose:GroundPose;passed:boolean}[]=[];
const routes=selection.routes.map(definition=>{
 if(!/^[a-z0-9-]+$/.test(definition.id)||!['front','back','left','right','north','south'].includes(definition.fixture)||!definition.purpose||!definition.legs?.length)throw Error('Invalid final route selection.');
 const points:Vec3[]=[],sourceRoutes:string[]=[],local=new Set<number>();localSegments.set(definition.id,local);let lastGate:GroundPose|undefined,lastLegId='';
 for(const leg of definition.legs){
  const original=get(leg.routeId).points,first=leg.fromIndex??0,last=leg.toIndex??original.length-1;
  if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||last>=original.length||last<=first)throw Error('Invalid explicit leg indices: '+leg.routeId);
  const part=original.slice(first,last+1);if(leg.reverse)part.reverse();
  if(points.length&&distance(points.at(-1)!,part[0],town.radius)>.02)throw Error('Unconnected designed legs; supply a real connector: '+definition.id+' / '+leg.routeId);
  const proof=networkProof.find(p=>p.id===leg.routeId)!.forward,startPose=proof.waypointPoses[leg.reverse?last:first],endPose=proof.waypointPoses[leg.reverse?first:last];
  if(!startPose||!endPose)throw Error('Source street did not physically reach its selected gate: '+leg.routeId);
  if(!chainStarts.has(definition.id))chainStarts.set(definition.id,startPose);
  if(lastGate){const heightGapMetres=Math.abs(lastGate.radius-startPose.radius);gateChecks.push({routeId:definition.id,before:lastLegId,after:leg.routeId,directionGapMetres:distance(points.at(-1)!,part[0],town.radius),heightGapMetres,beforePose:lastGate,afterPose:startPose,passed:heightGapMetres<=.08});}
  lastGate=endPose;lastLegId=leg.routeId;
  if(localDoors.has(leg.routeId)){const offset=Math.max(0,points.length-1);for(let i=0;i<part.length-1;i++)local.add(offset+i);}
  points.push(...(points.length?part.slice(1):part));sourceRoutes.push(leg.routeId);
 }
 const captures=new Set(definition.captureIndices??[0,Math.floor((points.length-1)/2),points.length-1]);
 if([...captures].some(i=>!Number.isInteger(i)||i<0||i>=points.length))throw Error('Invalid capture index.');
 return {id:definition.id,fixture:definition.fixture,purpose:definition.purpose,sourceRoutes,stops:points.map((point,i)=>({name:'street-'+i,point,capture:captures.has(i)}))};
});
const chainProof=routes.map(r=>{const points=r.stops.map(s=>s.point),local=localSegments.get(r.id)!,forward=replay(points,local,chainStarts.get(r.id));return {id:r.id,lengthMetres:length(points),forward,reverse:replay([...points].reverse(),new Set([...local].map(i=>points.length-2-i)),forward.actual)};});
const passed=gateChecks.every(g=>g.passed)&&[...networkProof,...chainProof].every(r=>r.forward.connected&&r.reverse.connected);
writeFileSync(proofFile,JSON.stringify({status:passed?'designed-route-authoring-passed-browser-pending':'failed-original-design-retained',snapshot:townFile,snapshotSha256,selection:selectionFile,outdoorOnly,networkProof,gateChecks,chainProof,limits:['Exact GroundWorld replay at ordinary 3 m/s, no jump/sprint/recovery; continuous pose is carried across each chain. Reversals start from the actual forward endpoint, with no height reseeding.','Designed joins require direction gap <= 2 cm and independently reached standing heights within 8 cm; a shared radial direction at different storeys is not one gate.','Through streets require terrain or explicit public supporting-collider permissions, including open porches where designated. Only labelled local door access up to 3 m bypasses that authoring policy, never the actual collision rules.','Passage fit does not establish comfortable clearance, camera behavior, visual continuity or physical-phone performance.','A fixture must actually walk from its current saved position to this graph. No fixture pose, reset or identity is generated.']},null,2)+'\n');
if(!passed)throw Error('Design route proof failed; inspect '+proofFile+' . No executable plan written.');
const executionRoutes=routes.map(route=>({...route,stops:route.stops.map((stop,i)=>({...stop,expectedFeetRadius:chainProof.find(p=>p.id===route.id)!.forward.waypointPoses[i].radius}))}));
writeFileSync(out,JSON.stringify({townFingerprint:fingerprint,frozenSnapshotSha256:snapshotSha256,runtimeIndexSha256:selection.runtimeIndexSha256,scope:'Eight explicitly selected designed street/neighbor routes from the frozen town. Local door accesses are separately identified. Source-plan assembly is not browser or visual acceptance.',navigationRoutes:network,routes:executionRoutes,authoringProof:proofFile},null,2)+'\n');
console.log(JSON.stringify({status:'plan-ready-browser-pending',out,proofFile,routes:routes.length,networkRoutes:network.length}));
