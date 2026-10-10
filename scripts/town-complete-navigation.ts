import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from 'three';
import {planTownGroundRoutes,townGroundBlockers} from './town-ground-routes.ts';
import type {TownRouteAnchor,TownGroundRouteResult} from './town-ground-routes.ts';
import {GroundWorld} from '../src/shared/physics/world.ts';
import {SPAWN,NPCS,distance} from '../src/shared/world.ts';
import {HUB_DOCK} from '../src/shared/ports.ts';
import type {Vec3} from '../src/shared/world.ts';
import type {PublicTown} from '../src/shared/public-town-layout.ts';
import {townEntrancePoints} from '../src/shared/public-town-layout.ts';

/** Pure snapshot authoring, with no service, browser, player identity or DB.
 * node scripts/town-complete-navigation.ts --town=.data/frozen.json
 *   --doors=.data/frozen-doors.json --out=.data/frozen-navigation.json
 *   --spacing=.75 --max-expanded=6000
 * JSON preserves every failed original target. Suggested free side points
 * are advisory only and never replace targets, routes or paving coverage. */
const args=process.argv.slice(2),allowed=/^--(town|doors|out|spacing|max-expanded)=/;
if(args.some(a=>!allowed.test(a)))throw Error('Unknown authoring option.');
const option=(name:string)=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const file=(name:string)=>{const path=option(name);if(!path||!path.startsWith('.data/')||path.split('/').includes('..'))throw Error(`--${name} must name a local .data file.`);return path;};
const townFile=file('town'),doorsFile=file('doors'),output=file('out'),spacing=Number(option('spacing')??'.75'),maxExpanded=Number(option('max-expanded')??'6000');
if(existsSync(output))throw Error('Keep previous navigation evidence; choose a new output.');
const raw=readFileSync(townFile,'utf8'),town=JSON.parse(raw) as PublicTown,doors=JSON.parse(readFileSync(doorsFile,'utf8')) as TownRouteAnchor[];
const actualDoors=townEntrancePoints(town);
if(doors.length!==actualDoors.length||doors.some(d=>{const actual=actualDoors.find(a=>a.id===d.id);return !actual||actual.buildingId!==d.buildingId||distance(actual.point,d.point,town.radius)>.00001;}))throw Error('Door list does not match the supplied frozen geometry.');
const fingerprint=createHash('sha256').update(JSON.stringify({version:town.version,radius:town.radius,environment:town.environment,objects:town.objects,blueprints:town.blueprints,routes:town.routes})).digest('hex');
const world=new GroundWorld({id:'complete-town-authoring',revision:0,...town}),reference=new GroundWorld({id:'hub',radius:town.radius,revision:0,objects:[]}),craft=reference.bodies.find(b=>b.objectId==='hub-ship');
if(craft)world.bodies.push({...craft,round:craft.round?{...craft.round,base:world.radius(craft.dir.toArray() as Vec3)}:undefined});
const bends=(town.places??[]).flatMap(place=>place.walk.map((point,i)=>({id:`place-bend-${place.id}-${i}`,point,placeId:place.id,bendIndex:i})));
const targets:TownRouteAnchor[]=[...doors,...bends];
const poseAt=(point:Vec3)=>({position:point,radius:world.support(point,world.radius(point)+1).radius,verticalSpeed:0,grounded:true,jumpHeld:false});
const free=(point:Vec3)=>!(world.field.waterLevel!==null&&world.field.heightAt(point)<world.field.waterLevel+.015)&&!world.blocked(poseAt(point));
function alternatives(anchor:TownRouteAnchor){
 const up=new Vector3(...anchor.point),north=new Vector3(0,0,1).projectOnPlane(up);if(north.lengthSq()<.01)north.set(1,0,0).projectOnPlane(up);north.normalize();const right=new Vector3().crossVectors(north,up).normalize(),points:{point:Vec3;offsetMetres:number;radius:number}[]=[];
 for(const offset of [.3,.6,.9,1.2,1.5,1.8,2.1]){
  for(let angle=0;angle<16;angle++){const a=angle*Math.PI/8,tangent=north.clone().multiplyScalar(Math.cos(a)).addScaledVector(right,Math.sin(a)),point=up.clone().multiplyScalar(Math.cos(offset/town.radius)).addScaledVector(tangent,Math.sin(offset/town.radius)).normalize().toArray() as Vec3;if(free(point))points.push({point,offsetMetres:offset,radius:poseAt(point).radius});}
  if(points.length>=4)break;
 }
 return points.slice(0,4);
}
const blockedAnchors=targets.filter(a=>!free(a.point)).map(a=>{
 const blockers=townGroundBlockers(world,poseAt(a.point)),own=blockers.some(b=>b.objectId===a.buildingId),other=blockers.some(b=>b.objectId!==a.buildingId);
 return {...a,status:'blocked-original-anchor',blockers,classification:!a.buildingId?'authored-place-bend-overlap':own&&other?'own-and-neighbour-overlap':own?'own-structure-overlap-at-derived-entrance':'neighbour-overlap-at-derived-entrance',advisoryFreeSidePoints:alternatives(a)};
});
const results:TownGroundRouteResult[]=[],taskResults:TownGroundRouteResult[]=[];
const report:Record<string,unknown>={status:'running',snapshot:townFile,snapshotSha256:createHash('sha256').update(raw).digest('hex'),doors:doorsFile,townFingerprint:fingerprint,root:{id:'spawn',point:SPAWN,free:free(SPAWN)},settings:{spacing,maxExpanded},totals:{doors:doors.length,placeBends:bends.length,blockedOriginalAnchors:blockedAnchors.length},blockedAnchors,taskResults,results,navigationRoutes:[],limitations:['Snapshot authoring only. No service, browser, player identity, saved position or product geometry was changed.','All successful original targets are connected to the single actual SPAWN origin by precise ordinary ground motion. All three public task route contracts independently start at SPAWN and end at Mica, Sol or the dock.','Every completed path is replayed continuously in both directions with the full collision world. Search failures remain resolution-specific, not proofs of physical impossibility.','Advisory side points only fit a capsule at rest. They are not substitute doors and do not prove route connectivity.','Returned navigation is not paving, entranceCoverage or visual acceptance. The 0.36 m route width is a capsule diameter, not comfortable lane width.','Final browser walking, street continuity, camera and touch evidence remain separate.']};
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');save();
console.log(JSON.stringify({phase:'original-anchor-check',...report.totals as object,rootFree:free(SPAWN),output}));
for(const task of [{id:'public-post',from:SPAWN,to:NPCS.mica.position},{id:'public-orchard',from:SPAWN,to:NPCS.sol.position},{id:'public-harbour',from:SPAWN,to:HUB_DOCK}]){
 const result=planTownGroundRoutes({town,starts:[{id:task.id+'-origin',point:task.from}],targets:[{id:task.id,point:task.to}],spacing,maxExpandedPerTarget:maxExpanded}).routes[0];
 if(result.route)result.route.id=task.id;taskResults.push(result);save();console.log(JSON.stringify({phase:'task-route',id:task.id,status:result.status,lengthMetres:result.lengthMetres}));
}
let completed=0;
const routes=planTownGroundRoutes({town,starts:[{id:'spawn',point:SPAWN}],targets,spacing,maxExpandedPerTarget:maxExpanded,onResult(result){results.push(result);completed++;if(completed%5===0||result.status!=='connected'){save();console.log(JSON.stringify({phase:'ground-target',completed,total:targets.length,id:result.id,status:result.status,expanded:result.expanded}));}},onProgress(progress){report.progress=progress;}});
report.stats=routes.stats;report.rootsConnected=routes.rootsConnected;report.navigationRoutes=[...taskResults,...results].flatMap(r=>r.route?[r.route]:[]);
report.status=routes.rootsConnected&&[...taskResults,...results].every(r=>r.status==='connected')?'all-original-targets-connected-authoring-only':'failed-targets-retained';
report.summary={connected:results.filter(r=>r.status==='connected').length,failed:results.filter(r=>r.status!=='connected').length,tasksConnected:taskResults.filter(r=>r.status==='connected').length};save();console.log(JSON.stringify({phase:'complete',status:report.status,summary:report.summary,output}));
