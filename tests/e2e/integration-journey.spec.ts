import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Quaternion,Vector3} from 'three';
import {activate,begin,flyTo,groundWalk,hostContext,integrationUrl,measureAction,menu,rendererContext,roomDoor,roomWalk,universe,visibleControl} from '../../scripts/integration-browser-helpers.ts';
import type {Universe,PlacedObject} from '../../src/shared/planets.ts';
import {placementProblem} from '../../src/shared/planets.ts';
import {structureFit,structureSize} from '../../src/shared/blueprints.ts';
import type {LibraryEntry} from '../../src/shared/blueprints.ts';
import {layoutErrors,placementProblem as partProblem} from '../../src/assets/claude-geometry/blueprint/model.ts';
import type {PartPlacement,Rot} from '../../src/assets/claude-geometry/blueprint/model.ts';
import {fieldOf} from '../../src/shared/terrain.ts';
import {NPCS,SPAWN} from '../../src/shared/world.ts';
import {HUB_DOCK} from '../../src/shared/ports.ts';
import type {Vec3} from '../../src/shared/world.ts';
import {spaceDistance} from '../../src/shared/flight.ts';
import {samplePublicVillage,isSamplePublicRadius} from '../../src/shared/sample-public-village.ts';

const evidence=process.env.INTEGRATION_EVIDENCE??'docs/evidence/integration';
const library=async(page:Page):Promise<LibraryEntry[]>=>{const r=await page.request.get('/api/blueprints');expect(r.status()).toBe(200);return r.json();};
function editCandidate(u:Universe):{object:PlacedObject;part:PartPlacement;parts:PartPlacement[]}{
 const field=fieldOf(u.currentPlanet.environment,u.currentPlanet.radius);
 for(const object of u.currentPlanet.objects.filter(o=>o.kind==='structure'&&o.id!==u.player.home?.buildingId)){
  const parts=u.currentPlanet.blueprints![object.blueprintHash!]!;
  for(let z=0;z<5;z++)for(let x=0;x<5;x++)for(const rot of [0,1,2,3] as Rot[]){
   const part:PartPlacement={n:Math.max(...parts.map(p=>p.n))+1,part:'garden.pot',level:0,x,z,rot},changed=[...parts,part];
   if(partProblem(parts,part)||layoutErrors(changed).length||structureFit(changed,object.position,object.rotation,field).problem||placementProblem('structure',object.position,u.currentPlanet.objects,object.id,structureSize(changed).radius,u.currentPlanet.radius,2,{rotation:object.rotation,blueprintHash:'preview',blueprints:{...u.currentPlanet.blueprints,preview:changed},field}))continue;
   return {object,part,parts};
  }
 }
 throw Error('The existing ordinary structures have no legal garden-pot cell.');
}
async function editStructure(page:Page,touch:boolean){
 const before=await universe(page),candidate=editCandidate(before),entries=await library(page),entry=entries.find(e=>e.hash===candidate.object.blueprintHash)!;
 expect(entry).toBeTruthy();await menu(page,'#build-mode',touch);await page.locator('#built-list').selectOption(candidate.object.id);await activate(page,'#edit-structure',touch);
 await expect(page.locator('#workshop')).toBeVisible();await expect(page.locator('#ws-name')).toHaveValue(entry.blueprint.name);
 await page.locator('#ws-tool').selectOption({value:'garden.pot'});
 // Numeric labels are one-based; Playwright string options also match labels.
 for(const [field,value] of [['level',candidate.part.level],['x',candidate.part.x],['z',candidate.part.z],['rot',candidate.part.rot]] as const){
  await page.locator(`#ws-${field}`).selectOption({value:String(value)});await expect(page.locator(`#ws-${field}`)).toHaveValue(String(value));
 }
 await expect(page.locator('#ws-hint')).toContainText('Ready to add');
 await activate(page,'#ws-add',touch);await expect(page.locator('#ws-count')).toContainText(`${candidate.parts.length+1} / 120`);
 await activate(page,'#ws-apply',touch);await expect(page.locator('#workshop')).not.toBeVisible();
 await expect.poll(async()=>(await universe(page)).currentPlanet.objects.find(o=>o.id===candidate.object.id)?.version).toBe(candidate.object.version+1);
 const after=await universe(page),changed=after.currentPlanet.objects.find(o=>o.id===candidate.object.id)!;
 expect(after.currentPlanet.objects.map(o=>o.id)).toEqual(before.currentPlanet.objects.map(o=>o.id));expect(changed.position).toEqual(candidate.object.position);expect(changed.rotation).toBe(candidate.object.rotation);
 expect(after.currentPlanet.blueprints![changed.blueprintHash!]).toHaveLength(candidate.parts.length+1);
 const savedEntry=(await library(page)).find(e=>e.blueprint.id===entry.blueprint.id)!;expect(savedEntry.blueprint.name).toBe(entry.blueprint.name);expect(savedEntry.blueprint.groups).toEqual(entry.blueprint.groups);
 expect(after.player.home).toEqual(before.player.home);expect(after.currentPlanet.homeManifest).toEqual(before.currentPlanet.homeManifest);
 return {partCountBefore:candidate.parts.length,partCountAfter:candidate.parts.length+1,sameObject:true,sameNameAndGroups:true};
}
async function ordinaryPaths(page:Page,touch:boolean){
 const before=await universe(page),existing=before.currentPlanet.objects.find(o=>o.kind==='path')!;expect(existing).toBeTruthy();
 await menu(page,'#build-mode',touch);await page.locator('#built-list').selectOption(existing.id);await activate(page,'#rotate-object',touch);await activate(page,'#save-object',touch);
 await expect.poll(async()=>(await universe(page)).currentPlanet.objects.find(o=>o.id===existing.id)?.version).toBe(existing.version+1);
 const rotated=(await universe(page)).currentPlanet.objects.find(o=>o.id===existing.id)!;rotated.position.forEach((value,index)=>expect(value).toBeCloseTo(existing.position[index],12));expect(rotated.rotation).not.toBe(existing.rotation);
 await activate(page,'.catalogue-item[data-kind="path"]',touch);
 // Pick only visible canvas points; placement and saving still use normal UI.
 const size=page.viewportSize()!;let selected=false;
 for(const [rx,ry] of [[.75,.40],[.60,.40],[.35,.40],[.50,.32],[.72,.29],[.30,.31],[.58,.48],[.27,.47],[.45,.23],[.65,.57]]){
  const point={x:Math.round(size.width*rx),y:Math.round(size.height*ry)};
  if(!await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.matches('#world canvas')??false,point))continue;
  if(touch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
  await page.waitForTimeout(100);if(await page.locator('#save-object').isEnabled()){selected=true;break;}
 }
 expect(selected,'A visible legal canvas location for an ordinary Path is required.').toBe(true);
 await activate(page,'#save-object',touch);await expect.poll(async()=>(await universe(page)).currentPlanet.objectCount).toBe(before.currentPlanet.objectCount+1);
 const after=await universe(page),oldIds=new Set(before.currentPlanet.objects.map(o=>o.id)),added=after.currentPlanet.objects.find(o=>!oldIds.has(o.id))!;
 expect(added.kind).toBe('path');expect(after.currentPlanet.objectCount).toBeLessThanOrEqual(64);
 await page.locator('#built-list').selectOption(added.id);await activate(page,'#remove-object',touch);await expect.poll(async()=>(await universe(page)).currentPlanet.objects.some(o=>o.id===added.id)).toBe(false);
 await activate(page,'#finish-building',touch);return {existingRotatedWithOrdinaryUI:true,newPathPlacedAndRemovedWithOrdinaryUI:true,preservedOtherObjectIds:true};
}
async function closeAndBlock(page:Page,touch:boolean){
 let u=await universe(page);const h=u.player.home!;await expect(page.locator('#home-door-toggle')).toBeEnabled();
 if(h.interior.doorOpen)await activate(page,'#home-door-toggle',touch);
 await expect.poll(async()=>(await universe(page)).player.home?.interior.doorOpen).toBe(false);await expect(page.locator('#home-enter')).toBeDisabled();
 const frame=h.door.frame!;expect(frame).toBeTruthy();
 const worldPoint=new Vector3(0,.03,-.38).applyQuaternion(new Quaternion().fromArray(frame.quaternion)).add(new Vector3(...frame.position)).normalize().toArray() as Vec3;
 // Attempt normal walking through the closed leaf; timeout is expected here.
 await expect(groundWalk(page,worldPoint,touch,.12,1300)).rejects.toThrow('could not reach');
 u=await universe(page);const pose=u.player.ground!,local=new Vector3(...u.player.position).multiplyScalar(pose.radius).sub(new Vector3(...frame.position)).applyQuaternion(new Quaternion().fromArray(frame.quaternion).invert());
 expect(local.z).toBeGreaterThan(.20);expect(u.player.location?.kind).toBe('exterior');
 await groundWalk(page,h.door.position,touch,.15);await activate(page,'#home-door-toggle',touch);await expect(page.locator('#home-enter')).toBeEnabled();
 return {closedLeafBlockedActualMovement:true,doorLocalZ:local.z};
}

for(const touch of [false,true])test(`integration full journey: ${touch?'390 touch':'desktop keyboard'}`,async({browser})=>{
 test.setTimeout(600000);mkdirSync(evidence,{recursive:true});
 const baseURL=integrationUrl(),name=touch?'touch-390':'desktop',context=await browser.newContext({baseURL,viewport:touch?{width:390,height:844}:{width:1440,height:1000},isMobile:touch,hasTouch:touch,locale:'en-US'}),page=await context.newPage();
 const samples:Record<string,unknown>[]=[],checks:string[]=[],errors:string[]=[],requests:{route:string;status:number}[]=[];
 const report:Record<string,unknown>={status:'failed',browser:'Installed Google Chrome via Playwright channel chrome',browserVersion:browser.version(),baseURL,host:hostContext(),fixture:'New isolated anonymous browser identity. Every movement, edit, quest action and flight transition uses actual UI/keyboard/touch controls. APIs below only read acknowledged state.',checks,samples,pageErrors:errors,apiResponses:requests};
 const shot=(label:string)=>page.screenshot({path:join(evidence,`${name}-${label}.png`)});
 page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{const url=new URL(response.url());if(url.pathname.startsWith('/api/')&&response.request().method()==='POST')requests.push({route:url.pathname,status:response.status()});});
 try{
  await begin(page,touch);report.renderer=await rendererContext(page);
  let initial=await universe(page);
  if(!initial.ownedPlanetId){
   const target=initial.planets.filter(p=>p.kind==='garden'&&!p.claimed).sort((a,b)=>spaceDistance(a.center,initial.currentPlanet.center)-spaceDistance(b.center,initial.currentPlanet.center))[0];
   report.firstClaimFlight=await measureAction(page,'flight-to-claim',samples,()=>flyTo(page,target,touch));await menu(page,'#claim-planet',touch);initial=await universe(page);
  }
  expect(initial.currentPlanet.mine).toBe(true);expect(initial.player.home).toBeTruthy();expect(initial.currentPlanet.objects.some(o=>o.kind==='path')).toBe(true);
  const homeId=initial.ownedPlanetId!,homeInterior=initial.player.home!.interiorId;
  report.initial={radius:initial.currentPlanet.radius,objects:initial.currentPlanet.objectCount,structures:initial.currentPlanet.objects.filter(o=>o.kind==='structure').length,manifestVersion:initial.currentPlanet.homeManifest?.version};
  await measureAction(page,'ground-close-idle',samples,async()=>{await visibleControl(page,'#open-menu');});await shot('arrival');
  await measureAction(page,'ground-overview',samples,async()=>{await menu(page,'#view-mode',touch);await page.waitForTimeout(1800);});await shot('overview');await menu(page,'#view-mode',touch);
  const route=initial.currentPlanet.homeManifest?.routes.find(r=>r.id==='home');
  if(!await page.locator('#home-enter').isVisible()||!await page.locator('#home-enter').isEnabled()){if(route)for(const point of route.points.slice(1))await groundWalk(page,point,touch);else await groundWalk(page,initial.player.home!.door.position,touch);}
  report.closedDoor=await measureAction(page,'closed-door-collision-and-open',samples,()=>closeAndBlock(page,touch));
  await measureAction(page,'enter-room-and-close-door',samples,async()=>{await activate(page,'#home-enter',touch);await expect(page.locator('.home-interior-ui')).toBeVisible();await roomDoor(page,touch);await activate(page,'#home-toggle-door',touch);await expect(page.locator('#home-exit')).toBeDisabled();});
  expect((await universe(page)).player.location?.kind).toBe('interior');await shot('room');
  await measureAction(page,'room-walk-and-return',samples,async()=>{await roomWalk(page,2.2,touch);await roomDoor(page,touch);});
  const beforeRoom=(await universe(page)).player.home!.interior;
  await measureAction(page,'room-arrange-and-save',samples,async()=>{await activate(page,'#home-arrange',touch);await activate(page,'#home-material-sage',touch);await activate(page,'#home-item-left',touch);await activate(page,'#home-save',touch);await expect(page.locator('#home-room-editor')).not.toBeVisible();});
  const savedRoom=(await universe(page)).player.home!.interior;expect(savedRoom.items[0].position[0]).toBe(beforeRoom.items[0].position[0]-.25);expect(savedRoom.doorOpen).toBe(false);await shot('room-arranged');
  await page.reload();await expect(page.locator('.home-interior-ui')).toBeVisible();expect((await universe(page)).player.home!.interior).toEqual(savedRoom);
  await measureAction(page,'open-door-exit-and-reenter',samples,async()=>{await roomDoor(page,touch);await activate(page,'#home-toggle-door',touch);await activate(page,'#home-exit',touch);await expect(page.locator('.home-interior-ui')).not.toBeVisible();await activate(page,'#home-enter',touch);await expect(page.locator('.home-interior-ui')).toBeVisible();});
  expect((await universe(page)).player.home!.interiorId).toBe(homeInterior);await roomDoor(page,touch);await activate(page,'#home-exit',touch);
  checks.push('Real closed-door blocking, explicit entry/exit, saved room rearrangement, room movement and same interior after reload');
  report.structureEdit=await measureAction(page,'ordinary-building-workshop-edit',samples,()=>editStructure(page,touch));await shot('structure-edit');
  report.pathEdit=await measureAction(page,'ordinary-path-rotate-place-remove',samples,()=>ordinaryPaths(page,touch));await shot('paths');
  const beforeTrip=await universe(page),savedObjects=beforeTrip.currentPlanet.objects,savedLibrary=await library(page);
  report.outbound=await measureAction(page,'walk-board-fly-land-public',samples,()=>flyTo(page,beforeTrip.planets.find(p=>p.id==='hub')!,touch));
  const hub=(await universe(page)).currentPlanet,paths=isSamplePublicRadius(hub.radius??14)?samplePublicVillage(hub.radius).routes.map(r=>r.points):[[SPAWN,NPCS.mica.position],[SPAWN,NPCS.sol.position],[SPAWN,HUB_DOCK]];
  await menu(page,'#delivery-toggle',touch);
  await measureAction(page,'public-walk-pickup-deliver',samples,async()=>{
   // Hub landing is at the port, so return by the authored harbour corridor.
   for(const point of [...paths[2]].reverse().slice(1))await groundWalk(page,point,touch);
   for(const point of paths[0].slice(1))await groundWalk(page,point,touch,point===paths[0].at(-1)?1.05:.38);
   await expect(page.locator('#interact')).toBeVisible();await activate(page,'#interact',touch);await expect.poll(async()=>(await universe(page)).player.quest).toBe('carrying');
   if(await page.locator('#conversation').isVisible())await activate(page,'#close-conversation',touch);
   for(const point of [...paths[0]].reverse().slice(1))await groundWalk(page,point,touch);
   for(const point of paths[1].slice(1))await groundWalk(page,point,touch,point===paths[1].at(-1)?1.05:.38);
   await activate(page,'#interact',touch);await expect.poll(async()=>(await universe(page)).player.quest).toBe('delivered');
   if(await page.locator('#conversation').isVisible())await activate(page,'#close-conversation',touch);
  });await shot('public-delivery');
  for(const point of [...paths[1]].reverse().slice(1))await groundWalk(page,point,touch);
  for(const point of paths[2].slice(1))await groundWalk(page,point,touch);
  const returnTarget=(await universe(page)).planets.find(p=>p.id===homeId)!;
  report.returnTrip=await measureAction(page,'board-fly-land-home',samples,()=>flyTo(page,returnTarget,touch));
  const returned=await universe(page);expect(returned.currentPlanet.objects).toEqual(savedObjects);expect(await library(page)).toEqual(savedLibrary);expect(returned.player.quest).toBe('delivered');expect(returned.player.home!.interiorId).toBe(homeInterior);
  const homeRoute=returned.currentPlanet.homeManifest!.routes.find(r=>r.id==='home')!;
  await measureAction(page,'walk-home-and-enter-after-flight',samples,async()=>{for(const point of homeRoute.points.slice(1))await groundWalk(page,point,touch);await activate(page,'#home-enter',touch);await expect(page.locator('.home-interior-ui')).toBeVisible();});
  expect((await universe(page)).player.home!.interior.items).toEqual(savedRoom.items);await page.reload();await expect(page.locator('.home-interior-ui')).toBeVisible();
  expect((await universe(page)).player.quest).toBe('delivered');expect((await universe(page)).player.home!.interiorId).toBe(homeInterior);
  checks.push('Ordinary structure edited in place with private name/groups retained','Ordinary Path rotated, newly placed and removed through Build','Real takeoff, radius-aware piloting, public landing, actual delivery, return flight and room re-entry','Edits and quest survive the complete journey and refresh');
  await shot('returned-home');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(touch?390:1440);expect(errors).toEqual([]);expect(requests.filter(r=>r.status>=400)).toEqual([]);
  expect(samples.every(s=>s.continuouslyForeground===true)).toBe(true);expect(samples.every(s=>!s.samplingFailed)).toBe(true);
  report.status='passed';report.rendererAtEnd=await rendererContext(page);report.final={sameHome:true,sameSavedObjects:true,samePrivateBlueprintMetadata:true,delivered:true};
 }catch(error){report.error=String(error);await shot('failure').catch(()=>undefined);throw error;}
 finally{writeFileSync(join(evidence,`${name}-journey-result.json`),JSON.stringify(report,null,2)+'\n');for(const key of ['w','a','s','d','ArrowUp','ArrowDown'])await page.keyboard.up(key).catch(()=>undefined);await page.goto('about:blank').catch(()=>undefined);await context.close();}
});
