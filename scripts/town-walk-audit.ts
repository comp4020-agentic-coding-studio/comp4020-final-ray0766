import {chromium,expect} from '@playwright/test';
import {isolatedRuntimeAssets} from './integration-runtime-assets.ts';
import type {Page} from '@playwright/test';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {Box3,Ray,Vector3} from 'three';
import {activate,begin,groundWalk,hostContext,integrationUrl,measureAction,menu,rendererContext,universe} from './integration-browser-helpers.ts';
import {samplePublicVillage} from '../src/shared/sample-public-village.ts';
import {townPoint} from '../src/shared/public-town-layout.ts';
import type {PublicTown} from '../src/shared/public-town-layout.ts';
import {GroundWorld} from '../src/shared/physics/world.ts';
import {distance} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import type {HomeSurfaceRoute} from '../src/shared/home-layout.ts';

/** Opt-in browser evidence, never a fixture/teleport endpoint. Default is a
 * local route preview. APP_URL must be the existing isolated 8134 service.
 * Example: APP_URL=http://127.0.0.1:8134 node scripts/town-walk-audit.ts walk-v9
 * Add --run --mode=desktop|touch|both and optionally --routes=id,id to execute.
 * --plan-file=.data/final-town-walks.json replaces the provisional ring plan:
 * {townFingerprint,navigationRoutes:[{id,width,points}],routes:[{id,fixture,
 * purpose,sourceRoutes,stops:[{name,point,camera?,capture?,lookAt?,interaction?}]}]}.
 * capture takes a named normal-view screenshot; lookAt turns using real drag.
 * An optional scope records preview limitations in the evidence report.
 * The manifest is kept separate from product geometry and cannot move anyone.
 * An evidence name is exclusive: a retry needs a new name, preserving failures.
 */
const baseURL=integrationUrl();
if(new URL(baseURL).port!=='8134')throw Error('Town walking is restricted to the existing isolated 8134 copy.');
const args=process.argv.slice(2),phase=args.find(a=>!a.startsWith('--'))??'walk-v9';
if(!/^[a-z0-9-]+$/.test(phase))throw Error('Use a simple evidence name.');
if(args.some(a=>a.startsWith('--')&&!/^--(run|mode=(desktop|touch|both)|routes=[a-z0-9,-]+|plan-file=[a-zA-Z0-9._/-]+|snapshot-file=[a-zA-Z0-9._/-]+)$/.test(a)))throw Error('Unknown audit option.');
const execute=args.includes('--run'),mode=args.find(a=>a.startsWith('--mode='))?.slice(7)??'both';
const selected=args.find(a=>a.startsWith('--routes='))?.slice(9).split(',');
const snapshotFile=args.find(a=>a.startsWith('--snapshot-file='))?.slice(16);
if(snapshotFile&&(!snapshotFile.startsWith('.data/')||snapshotFile.split('/').includes('..')))throw Error('Frozen town snapshots must be local .data files.');
const town:PublicTown=snapshotFile?JSON.parse(readFileSync(snapshotFile,'utf8')) as PublicTown:samplePublicVillage(),radius=town.radius;
type Fixture={name:string;position:Vec3;road:string;cookie:string};
const fixtures=JSON.parse(readFileSync('.data/village-view-fixtures.json','utf8')) as Fixture[];
type Stop={name:string;point:Vec3;expectedFeetRadius?:number;interaction?:'Mica'|'Sol'|'dock';camera?:boolean;capture?:boolean;lookAt?:Vec3};
type WalkRoute={id:string;fixture:string;purpose:string;sourceRoutes:string[];stops:Stop[]};
type RouteManifest={townFingerprint:string;frozenSnapshotSha256?:string;runtimeIndexSha256?:string;scope?:string;routes:WalkRoute[];navigationRoutes:HomeSurfaceRoute[]};
const planFile=args.find(a=>a.startsWith('--plan-file='))?.slice(12);
if(planFile&&(planFile.startsWith('/')||planFile.split('/').includes('..')))throw Error('The optional route manifest must be a local relative path.');
const manifest=planFile?JSON.parse(readFileSync(planFile,'utf8')) as RouteManifest:undefined;
if(manifest?.frozenSnapshotSha256&&(!snapshotFile||createHash('sha256').update(readFileSync(snapshotFile,'utf8')).digest('hex')!==manifest.frozenSnapshotSha256))throw Error('The complete frozen snapshot differs from the designed route manifest.');
const length=(points:Vec3[])=>points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p,radius),0);
const getRoute=(id:string)=>{const route=town.routes.find(r=>r.id===id);if(!route)throw Error(`Authored route missing: ${id}`);return route;};
const nearest=(points:Vec3[],point:Vec3)=>points.reduce((best,p,i)=>distance(p,point,radius)<distance(points[best],point,radius)?i:best,0);
function slice(id:string,from:Vec3,to:Vec3,forward=true):Vec3[]{
 const original=getRoute(id).points,closed=distance(original[0],original.at(-1)!,radius)<.02,points=closed?original.slice(0,-1):original;
 const first=nearest(points,from),last=nearest(points,to),result:Vec3[]=[];
 const step=closed?(forward?1:-1):Math.sign(last-first)||1;
 for(let i=first;result.length<=points.length;i=(i+step+points.length)%points.length){result.push(points[i]);if(i===last)return result;}
 throw Error(`Cannot slice authored route ${id}.`);
}
const stops=(points:Vec3[],prefix:string):Stop[]=>points.map((point,i)=>({name:`${prefix}-${i}`,point}));
const joinStops=(...groups:Stop[][])=>groups.flat().filter((p,i,all)=>i===0||distance(p.point,all[i-1].point,radius)>.04||p.interaction||p.camera);
const meridian=(longitude:number,from:number,to:number)=>slice(`town-meridian-${longitude}`,townPoint(from,longitude),townPoint(to,longitude));
const ring=(latitude:number,from:number,to:number)=>slice(`town-ring-${latitude}`,townPoint(latitude,from),townPoint(latitude,to));
const laneApproach=town.routes.filter(r=>r.id.startsWith('town-frontdoor-')&&r.width<=1&&length(r.points)>.7)
 .sort((a,b)=>distance(a.points.at(-1)!,townPoint(36,315),radius)-distance(b.points.at(-1)!,townPoint(36,315),radius))[0];
function provisionalRingRoutes():WalkRoute[]{
const northBranch=town.routes.some(r=>r.id==='town-meridian-225-north')?'town-meridian-225-north':'town-meridian-225';
const lCorner=stops(ring(0,290,315),'equatorial-leg');lCorner[lCorner.length-1].camera=true;
const taskStops=joinStops(...(['public-post','public-orchard','public-harbour'] as const).map((id,i)=>{
 const route=getRoute(id),out=stops(route.points,id),last=out.at(-1)!;last.interaction=(['Mica','Sol','dock'] as const)[i];last.camera=true;
 return i===2?out:joinStops(out,stops([...route.points].reverse(),id+'-return'));
}));
return [
 {id:'equator-front-seam',fixture:'front',purpose:'Cross the longitude 0 district seam along the front equatorial street.',sourceRoutes:['town-ring-0'],stops:stops(ring(0,315,45),'front')},
 {id:'equator-back-seam',fixture:'back',purpose:'Walk the rear hemisphere across the longitude 180 district seam.',sourceRoutes:['town-ring-0'],stops:stops(ring(0,135,225),'back')},
 {id:'north-quarter-seam',fixture:'right',purpose:'Inspect the northern ring across the longitude 90 district seam.',sourceRoutes:['town-ring-45'],stops:stops(ring(45,55,125),'north-ring')},
 {id:'south-quarter-seam',fixture:'left',purpose:'Inspect the southern ring across the longitude 270 district seam.',sourceRoutes:['town-ring--45'],stops:stops(ring(-45,235,305),'south-ring')},
 {id:'north-pole-through',fixture:'north',purpose:'Approach the north court on meridian 135, cross the pole, leave on the orchard branch.',sourceRoutes:['town-meridian-135',northBranch],stops:joinStops(stops(meridian(135,60,90),'north-up'),stops(slice(northBranch,townPoint(90,225),townPoint(60,225)),'north-down'))},
 {id:'south-pole-through',fixture:'south',purpose:'Approach and cross the south court between the two physical meridian streets.',sourceRoutes:['town-meridian-135','town-meridian-315'],stops:joinStops(stops(meridian(135,-60,-90),'south-down'),stops(meridian(315,-90,-60),'south-up'))},
 {id:'lane-turn-and-door',fixture:'left',purpose:'Turn from the equator into meridian 315; then use an ordinary narrow doorway approach and turn the follow camera beside its walls.',sourceRoutes:['town-ring-0','town-meridian-315',...(laneApproach?[laneApproach.id]:[])],stops:joinStops(lCorner,stops(meridian(315,0,36),'meridian-leg'))},
 {id:'task-and-harbour',fixture:'north',purpose:'Walk the full post, orchard and harbour corridors. Revisit completed quests only; inspect the actual boarding control without launching.',sourceRoutes:['public-post','public-orchard','public-harbour'],stops:taskStops},
];
}
const allRoutes=manifest?.routes??provisionalRingRoutes();
const validPoint=(point:Vec3)=>Array.isArray(point)&&point.length===3&&point.every(Number.isFinite)&&Math.abs(new Vector3(...point).length()-1)<1e-5;
for(const route of allRoutes)if(!/^[a-z0-9-]+$/.test(route.id)||!route.fixture||!route.purpose||!Array.isArray(route.sourceRoutes)||!route.stops?.length||route.stops.some(s=>!s.name||!validPoint(s.point)||s.lookAt&&!validPoint(s.lookAt)||s.expectedFeetRadius!==undefined&&(!Number.isFinite(s.expectedFeetRadius)||s.expectedFeetRadius<=0)))throw Error('Invalid route manifest.');
if(new Set(allRoutes.map(r=>r.id)).size!==allRoutes.length)throw Error('Duplicate route IDs.');
if(selected?.some(id=>!allRoutes.some(r=>r.id===id)))throw Error('Unknown route selection.');
const routes=allRoutes.filter(r=>!selected||selected.includes(r.id));
const fingerprint=createHash('sha256').update(JSON.stringify({version:town.version,objects:town.objects,blueprints:town.blueprints,routes:town.routes})).digest('hex');
if(manifest&&manifest.townFingerprint!==fingerprint)throw Error('Route manifest belongs to a different town draft; regenerate it after the final layout.');
if(manifest&&(!manifest.navigationRoutes?.length||manifest.navigationRoutes.some(r=>!r.points?.length||r.points.some(p=>!validPoint(p)))))throw Error('The route manifest needs valid physically authored navigation routes.');
const navigationRoutes=manifest?.navigationRoutes??town.routes;
const preview=routes.map(r=>({id:r.id,fixture:r.fixture,purpose:r.purpose,authoredRouteIds:r.sourceRoutes,waypoints:r.stops.length,lengthMetres:length(r.stops.map(s=>s.point)),minimumAuthoredWidth:r.sourceRoutes.length&&r.sourceRoutes.every(id=>navigationRoutes.some(route=>route.id===id))?Math.min(...r.sourceRoutes.map(id=>navigationRoutes.find(route=>route.id===id)!.width)):null,start:r.stops[0].point,end:r.stops.at(-1)!.point}));
if(!execute){console.log(JSON.stringify({mode:'plan-only-no-browser-no-network-no-save-write',baseURL,townVersion:town.version,townFingerprint:fingerprint,routes:preview,notes:['Lengths exclude the real-control approach from each identity’s current saved position.','The lane route also connects to and returns from the selected doorway after its main leg.','Authored widths are design metadata, not measured collision clearance.','Route completion never establishes continuous town coverage or visual quality.']},null,2));}

/** Navigation follows the authored street graph, including every intermediate
 * point. Only sub-metre intersections are connected. A blocked edge fails;
 * there is no alternative that jumps over, clips through or resets a player. */
function streetNetwork(){
 const nodes:Vec3[]=[],edges=new Map<number,Map<number,number>>();
 const link=(a:number,b:number)=>{if(a===b)return;const d=distance(nodes[a],nodes[b],radius);edges.get(a)!.set(b,d);edges.get(b)!.set(a,d);};
 const node=(p:Vec3)=>{const found=nodes.findIndex(n=>distance(n,p,radius)<.05);if(found>=0)return found;nodes.push(p);edges.set(nodes.length-1,new Map());return nodes.length-1;};
 for(const route of navigationRoutes.filter(r=>manifest||!r.id.startsWith('town-frontdoor-'))){
  let previous=node(route.points[0]);
  for(let i=1;i<route.points.length;i++){
   const a=new Vector3(...route.points[i-1]),b=new Vector3(...route.points[i]),count=Math.max(1,Math.ceil(distance(route.points[i-1],route.points[i],radius)/.75));
   for(let j=1;j<=count;j++){const next=node(a.clone().lerp(b,j/count).normalize().toArray() as Vec3);link(previous,next);previous=next;}
  }
 }
 // Explicit new-layout navigation preserves its validated shared nodes;
 // proximity alone must not connect two alleys across a thin wall.
 if(!manifest)for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(distance(nodes[i],nodes[j],radius)<.6)link(i,j);
 return (from:Vec3,to:Vec3):Vec3[]=>{
  const first=nearest(nodes,from),last=nearest(nodes,to);
  if(distance(nodes[first],from,radius)>3||distance(nodes[last],to,radius)>3)throw Error('Saved position or target is over 3 m from an authored street; no direct shortcut is permitted.');
  const costs=new Map([[first,0]]),previous=new Map<number,number>(),pending=new Set([first]),visited=new Set<number>();
  while(pending.size){
   const at=[...pending].sort((a,b)=>costs.get(a)!-costs.get(b)!)[0];pending.delete(at);if(at===last)break;visited.add(at);
   for(const [next,d]of edges.get(at)!){if(visited.has(next))continue;const cost=costs.get(at)!+d;if(cost<(costs.get(next)??Infinity)){costs.set(next,cost);previous.set(next,at);pending.add(next);}}
  }
  if(!costs.has(last))throw Error('The authored street graph is disconnected at this route.');
  const path:number[]=[];for(let at:number|undefined=last;at!==undefined;at=previous.get(at))path.unshift(at);
  const points=path.map(i=>nodes[i]);
  // Keep bends; reduce only near-collinear short subdivisions. The final
  // segments remain <= 2.4 m and are driven by normal controls.
  const result=[points[0]];let lastKept=0;
  for(let i=1;i<points.length-1;i++){
   const up=new Vector3(...points[i]),incoming=new Vector3(...points[i-1]).projectOnPlane(up).normalize(),outgoing=new Vector3(...points[i+1]).projectOnPlane(up).normalize();
   if(distance(points[lastKept],points[i+1],radius)>2.4||incoming.dot(outgoing)>-.985){result.push(points[i]);lastKept=i;}
  }
  if(points.length>1)result.push(points.at(-1)!);result.push(to);return result;
 };
}
type Pose={position:Vec3;radius:number;grounded:boolean;verticalSpeed:number;head:Vec3;eye:Vec3;north:Vec3;support:string;scene:string;playerVisible:boolean|null;cameraMode:string|null};
const pose=(page:Page):Promise<Pose>=>page.locator('#world canvas').evaluate(el=>({position:JSON.parse(el.dataset.groundPosition!),radius:Number(el.dataset.feetRadius),grounded:el.dataset.grounded==='true',verticalSpeed:Number(el.dataset.verticalSpeed),head:JSON.parse(el.dataset.cameraHead!),eye:JSON.parse(el.dataset.cameraPosition!),north:JSON.parse(el.dataset.cameraHeading!),support:el.dataset.groundSupport??'',scene:el.dataset.terrainId??'',playerVisible:el.dataset.playerVisible==='true'?true:el.dataset.playerVisible==='false'?false:null,cameraMode:el.dataset.cameraMode??null}));
function collisionSample(world:GroundWorld,feet:Pose,direction:Vec3){
 const head=new Vector3(...feet.head),eye=new Vector3(...feet.eye),cameraLength=head.distanceTo(eye),allowedCameraLength=world.cameraDistance(head,eye);
 const up=new Vector3(...feet.position),forward=new Vector3(...direction).projectOnPlane(up);
 if(forward.lengthSq()<1e-8)forward.set(...feet.north).projectOnPlane(up);
 forward.normalize();const side=new Vector3().crossVectors(forward,up).normalize(),origin=up.clone().multiplyScalar(feet.radius+1.15);
 const frontage=(sign:number)=>{
  let best:{distanceMetres:number;buildingId:string;partTag:string}|null=null;
  for(const body of world.bodies){
   if(!town.buildings.includes(body.objectId)||body.dir.angleTo(up)*radius>body.broad+10)continue;
   for(const c of body.colliders){
    if(c.support||c.tag==='foundation')continue;
    const local=origin.clone().sub(c.center).applyQuaternion(c.inverse),ray=new Ray(local,side.clone().multiplyScalar(sign).applyQuaternion(c.inverse)),box=new Box3(c.half.clone().negate(),c.half),hit=ray.intersectBox(box,new Vector3());
    if(!hit)continue;const d=hit.distanceTo(local);if(d<=10&&(!best||d<best.distanceMetres))best={distanceMetres:d,buildingId:body.objectId,partTag:c.tag};
   }
  }
  return best;
 };
 return {...feet,bodyBlocked:world.blocked(feet),cameraLength,allowedCameraLength,cameraCrossesSolid:cameraLength>allowedCameraLength+.12,left:frontage(-1),right:frontage(1)};
}
async function cameraSweep(page:Page,touch:boolean,sample:()=>Promise<void>){
 const viewport=page.viewportSize()!,x=touch?viewport.width*.70:viewport.width*.55,y=viewport.height*.44,cdp=touch?await page.context().newCDPSession(page):null;
 try{for(let i=0;i<8;i++){
  if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:2}]});for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-step*24.5437,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-Math.PI/4/.004,y,{steps:8});await page.mouse.up();}
  for(let j=0;j<3;j++){await page.waitForTimeout(100);await sample();}
 }}finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});await cdp.detach();}else await page.mouse.up();}
}
/** Turn the ordinary follow camera with real drag controls. No lens, distance,
 * pitch, player pose or model scale is assigned through page evaluation. */
async function facePoint(page:Page,target:Vec3,touch:boolean){
 const viewport=page.viewportSize()!,x=touch?viewport.width*.70:viewport.width*.55,y=viewport.height*.44,cdp=touch?await page.context().newCDPSession(page):null;
 try{for(let attempt=0;attempt<10;attempt++){
  const feet=await pose(page);if(distance(feet.position,target,radius)<.3)return;
  const up=new Vector3(...feet.position),north=new Vector3(...feet.north),toward=new Vector3(...target).projectOnPlane(up).normalize(),turn=Math.atan2(up.dot(new Vector3().crossVectors(north,toward)),north.dot(toward));
  if(Math.abs(turn)<.025)return;const amount=Math.max(-.65,Math.min(.65,turn)),end=x-amount/.004;
  if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:2}]});for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(end-x)*step/8,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(end,y,{steps:8});await page.mouse.up();}
  await page.waitForTimeout(150);
 }}finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});await cdp.detach();}else await page.mouse.up();}
}
async function run(){
 const output=join('docs/evidence/village-world',phase);
 if(existsSync(output))throw Error('Evidence folder already exists. Keep the prior attempt and choose a new evidence name.');
 for(const route of routes)if(!fixtures.some(f=>f.name===route.fixture&&typeof f.cookie==='string'&&f.cookie.length>0))throw Error(`Existing isolated fixture unavailable: ${route.fixture}`);
 mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),navigate=streetNetwork(),results:Record<string,unknown>[]=[];
 const report:Record<string,unknown>={status:'running',browser:'Installed Google Chrome through Playwright channel chrome',browserVersion:browser.version(),baseURL,host:hostContext(),townVersion:town.version,townFingerprint:fingerprint,routePlan:preview,results,visualVerdict:'pending-independent-screenshot-review',limitations:['This records actual keyboard/touch movement on 8134 using existing isolated identities only. No identity is created, reset or teleported.','Street-graph routing provides an approach to the named route, not evidence of building coverage.','Left/right rays report solid building frontage within 10 m at 1.15 m above the feet; they do not measure roof or surface coverage.','Collision checks sample read-only app telemetry approximately every 250 ms and at stops. This is not exhaustive frame-level collision proof.','Frame samples include this observer and browser automation; phone viewport emulation is not physical-phone performance.']};
 if(manifest?.scope)report.scope=manifest.scope;if(snapshotFile)report.frozenSnapshot=snapshotFile;
 const save=()=>writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');save();
 try{for(const touch of mode==='desktop'?[false]:mode==='touch'?[true]:[false,true])for(const route of routes){
  const fixture=fixtures.find(f=>f.name===route.fixture)!,name=`${touch?'touch-390':'desktop'}-${route.id}`,context=await browser.newContext({baseURL,viewport:touch?{width:390,height:844}:{width:1440,height:1000},hasTouch:touch,isMobile:touch,locale:'en-US'});
  await context.addCookies([{name:'little_post',value:fixture.cookie,url:baseURL,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage(),errors:string[]=[],api:{path:string;method:string;status:number}[]=[],denied:string[]=[],observations:Record<string,unknown>[]=[],samples:Record<string,unknown>[]=[],waypoints:Record<string,unknown>[]=[],screenshots:string[]=[];
  const row:Record<string,unknown>={name,routeId:route.id,fixture:fixture.name,status:'running',errors,api,denied,observations,samples,waypoints,screenshots,questRevisits:[],visualVerdict:'pending-independent-screenshot-review'};results.push(row);save();
  let delivered=false,monitoring=false,monitor:Promise<void>|undefined,activeTarget=route.stops[0].point,leg='startup';
  const shot=async(label:string)=>{await page.waitForTimeout(350);const file=`${name}-${label}.png`;await page.screenshot({path:join(output,file)});screenshots.push(file);};
  // The browser is forbidden to reach production or execute build/flight/
  // quest-mutating actions. Node-side API access below is GET universe only.
  await context.route('**/*',async request=>{
   const req=request.request(),url=new URL(req.url()),allowed=url.origin===baseURL&&(!url.pathname.startsWith('/api/')||req.method()==='GET'||req.method()==='POST'&&(['/api/move','/api/presence'].includes(url.pathname)||url.pathname==='/api/interact'&&delivered));
   if(!allowed){denied.push(`${req.method()} ${url.origin}${url.pathname}`);await request.abort('blockedbyclient');}else await request.continue();
  });
  page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{const url=new URL(response.url());if(response.status()>=400)api.push({path:url.pathname,method:response.request().method(),status:response.status()});});
  try{
   // A missing/expired identity is a failure before GET /api/state can create
   // a replacement. Never recover by silently issuing a fresh identity.
   const auth=await context.request.get('/api/universe');if(auth.status()!==200)throw Error('Existing isolated identity did not authenticate; no page was opened.');
   const initial=await auth.json() as Awaited<ReturnType<typeof universe>>;
   const assets=await isolatedRuntimeAssets(context.request,baseURL);
   if(manifest?.runtimeIndexSha256)expect(assets.index.sha256,'Runtime HTML must match the frozen authoring manifest').toBe(manifest.runtimeIndexSha256);
   if(report.runtimeAssets)expect(assets,'Served assets must remain frozen across route rows').toEqual(report.runtimeAssets);
   else{report.runtimeAssets=assets;writeFileSync(join(output,'runtime-assets.json'),JSON.stringify(assets,null,2)+'\n');}row.runtimeIndexSha256=assets.index.sha256;save();
   if(initial.currentPlanet.id!=='hub'||initial.player.flight.mode!=='ground'||initial.player.location?.kind==='interior')throw Error('Existing fixture is not on public exterior ground. Preserve it and choose an eligible fixture.');
   if(Math.abs((initial.currentPlanet.radius??0)-radius)>1e-6)throw Error('Runtime public radius differs from the audited source.');
   delivered=initial.player.quest==='delivered';row.initialQuest={quest:initial.player.quest,deliveries:initial.player.deliveries};
   await begin(page,touch);await page.waitForTimeout(1400);row.renderer=await rendererContext(page);
   const actualCounts=JSON.parse(await page.locator('#world canvas').getAttribute('data-public-counts')??'null') as {objects:number;structures:number}|null;
   expect(actualCounts?.objects,'Runtime public objects must match the authored source').toBe(town.objects.length);
   expect(actualCounts?.structures,'Runtime public structures must match the authored source').toBe(town.objects.filter(o=>o.kind==='structure').length);row.runtimePublicCounts=actualCounts;
   const first=await pose(page),world=new GroundWorld(snapshotFile?{id:'frozen-walk-evidence',revision:initial.currentPlanet.revision,...town}:initial.currentPlanet);row.savedStart=first.position;
   if(snapshotFile){const craft=new GroundWorld({id:'hub',radius,revision:0,objects:[]}).bodies.find(b=>b.objectId==='hub-ship');if(craft)world.bodies.push({...craft,round:craft.round?{...craft.round,base:world.radius(craft.dir.toArray() as Vec3)}:undefined});}
   const sample=async()=>{
    const feet=await pose(page),value=collisionSample(world,feet,activeTarget);
    observations.push({atMs:Date.now(),leg,...value});
   };
   monitoring=true;monitor=(async()=>{while(monitoring){await sample();await page.waitForTimeout(250);}})().catch(error=>{errors.push('Observation failed: '+String(error));});
   let routeDistance=0,lastShotDistance=0,last=first.position;
   const walk=async(point:Vec3,label:string,expectedFeetRadius?:number)=>{
    activeTarget=point;const start=await pose(page),started=Date.now();
    let end:Awaited<ReturnType<typeof pose>>;
    try{await groundWalk(page,point,touch,manifest ? .15 : .30,Math.max(10000,distance(start.position,point,radius)/3*4000));end=await pose(page);if(expectedFeetRadius!==undefined){expect(end.grounded,'A gate must be reached standing on its actual support').toBe(true);expect(Math.abs(end.radius-expectedFeetRadius),'A shared direction on another floor is not this gate').toBeLessThan(.08);}}
    catch(error){const actual=await pose(page);waypoints.push({leg,label,target:point,expectedFeetRadius,status:'failed',durationMs:Date.now()-started,position:actual.position,feetRadius:actual.radius,actualTelemetry:actual,error:String(error)});throw error;}
    routeDistance+=distance(last,end.position,radius);last=end.position;
    waypoints.push({leg,label,target:point,expectedFeetRadius,status:'reached',durationMs:Date.now()-started,position:end.position,feetRadius:end.radius,errorMetres:distance(end.position,point,radius)});
    if(leg==='named-route'&&routeDistance-lastShotDistance>=9){await shot(`street-${waypoints.length}`);lastShotDistance=routeDistance;}
   };
   await shot('saved-start');
   const approach=navigate(first.position,route.stops[0].point),firstTurn=approach.find(p=>distance(first.position,p,radius)>.5);
   if(firstTurn){await facePoint(page,firstTurn,touch);await shot('saved-start-turned');}
   leg='approach';await measureAction(page,name+'-approach',samples,async()=>{for(const [i,point]of approach.entries())await walk(point,`approach-${i}`);},0);await shot('route-start');
   leg='named-route';await measureAction(page,name+'-named-route',samples,async()=>{
    for(const stop of route.stops){
     await walk(stop.point,stop.name,stop.expectedFeetRadius);
     if(stop.capture){if(stop.lookAt)await facePoint(page,stop.lookAt,touch);await shot(stop.name);}
     if(stop.camera){await cameraSweep(page,touch,sample);await shot(stop.name+'-camera');}
     if(stop.interaction==='dock'){await expect(page.locator('#board-ship')).toBeVisible();row.harbourBoardingControlVisible=true;await shot('harbour');}
     else if(stop.interaction){
      const revisits=row.questRevisits as Record<string,unknown>[];
      if(!delivered){revisits.push({npc:stop.interaction,status:'not-executed',reason:'Existing identity is not already delivered; quest progress is preserved.'});continue;}
      if(!await page.locator('body').evaluate(node=>node.classList.contains('delivery-open')))await menu(page,'#delivery-toggle',touch);
      await activate(page,'#interact',touch);await expect(page.locator('#speaker')).toContainText(stop.interaction);await shot('revisit-'+stop.interaction.toLowerCase());
      const u=await universe(page);expect(u.player.quest).toBe(initial.player.quest);expect(u.player.deliveries).toBe(initial.player.deliveries);revisits.push({npc:stop.interaction,status:'completed-delivery-revisited',deliveries:u.player.deliveries});await activate(page,'#close-conversation',touch);
     }
    }
   },0);
   if(!manifest&&route.id==='lane-turn-and-door'){
    if(!laneApproach)throw Error('No ordinary narrow doorway approach exists in the authored layout.');
    leg='narrow-lane-approach';await measureAction(page,name+'-narrow-lane',samples,async()=>{
     const current=await pose(page),street=laneApproach.points.at(-1)!;
     for(const [i,point]of navigate(current.position,street).entries())await walk(point,`door-street-approach-${i}`);
     leg='narrow-lane';for(const [i,point]of [...laneApproach.points].reverse().entries())await walk(point,`narrow-in-${i}`);
     await cameraSweep(page,touch,sample);await shot('narrow-door-camera');
     for(const [i,point]of laneApproach.points.entries())await walk(point,`narrow-out-${i}`);
    },0);row.narrowLane={id:laneApproach.id,authoredWidth:laneApproach.width,lengthMetres:length(laneApproach.points),physicalClearanceMeaning:'Actual body movement and side-ray samples are reported separately from authored width.'};
   }
   await shot('route-finish');await page.waitForTimeout(700);monitoring=false;await monitor;
   await expect.poll(async()=>distance((await universe(page)).player.position,(await pose(page)).position,radius),{timeout:5000}).toBeLessThan(.4);
   const final=await universe(page);expect(final.player.quest).toBe(initial.player.quest);expect(final.player.deliveries).toBe(initial.player.deliveries);expect(final.currentPlanet.objects).toEqual(initial.currentPlanet.objects);expect(final.currentPlanet.blueprints).toEqual(initial.currentPlanet.blueprints);
   expect(final.currentPlanet.id).toBe('hub');expect(final.player.flight.mode).toBe('ground');
   row.finalPosition=final.player.position;row.walkedMetresApprox=routeDistance;row.savedPositionErrorMetres=distance(final.player.position,(await pose(page)).position,radius);
   expect(row.savedPositionErrorMetres).toBeLessThan(.4);expect(denied).toEqual([]);expect(errors).toEqual([]);expect(api).toEqual([]);
   const bodyFailures=observations.filter(o=>o.bodyBlocked),cameraFailures=observations.filter(o=>o.cameraCrossesSolid);
   row.collisionSummary={samples:observations.length,bodyPenetrationSamples:bodyFailures.length,cameraCrossingSamples:cameraFailures.length};
   expect(bodyFailures,'Sampled body penetration').toEqual([]);expect(cameraFailures,'Sampled camera clipping').toEqual([]);row.status='passed-route-and-sampled-collision';
  }catch(error){row.status='failed';row.failure=String(error);await shot('failure').catch(()=>{});}
  finally{
   monitoring=false;await monitor;await page.goto('about:blank').catch(()=>{});await context.close();save();
   console.log(JSON.stringify({name,status:row.status,failure:row.failure,waypoints:waypoints.length,screenshots:screenshots.length}));
  }
 }}finally{report.status=results.length===routes.length*(mode==='both'?2:1)&&results.every(r=>r.status==='passed-route-and-sampled-collision')?'routes-passed-visual-review-pending':'failed-or-incomplete';save();await browser.close();}
 if(report.status!=='routes-passed-visual-review-pending')process.exitCode=1;
}
if(execute)await run();
