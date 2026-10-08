import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Vector3} from 'three';
import type {Universe,PlacedObject} from '../../src/shared/planets.ts';
import type {BlueprintContents,LibraryEntry} from '../../src/shared/blueprints.ts';
import type {HomeSetupPreview} from '../../src/shared/home-setup.ts';
import type {Vec3} from '../../src/shared/world.ts';
import {distance} from '../../src/shared/world.ts';
import {structureFit} from '../../src/shared/blueprints.ts';
import {fieldOf} from '../../src/shared/terrain.ts';
import {partTransform,pivotOf} from '../../src/assets/claude-geometry/blueprint/model.ts';
import {localToPlanet} from '../../src/assets/claude-geometry/core/anchor.ts';
import {activate,begin,groundWalk,hostContext,integrationUrl,menu,rendererContext,roomWalk,universe,visibleControl} from '../../scripts/integration-browser-helpers.ts';

const evidence=process.env.INTEGRATION_EVIDENCE??'docs/evidence/integration';
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const contentWrite=/\/api\/(?:objects\/|blueprints\/save|home\/(?:save|remodel|undo|paths\/apply|setup\/confirm)|terrain\/apply)/;
const motionWrite=/\/api\/(?:move|home\/move|flight\/(?:checkpoint|takeoff|land))$/;
async function library(page:Page):Promise<LibraryEntry[]>{const response=await page.request.get('/api/blueprints');expect(response.status()).toBe(200);return response.json();}
async function snapshot(page:Page){
 const u=await universe(page);
 return {objects:u.currentPlanet.objects,blueprints:u.currentPlanet.blueprints,environment:u.currentPlanet.environment,planetRevision:u.currentPlanet.revision,library:await library(page),home:u.player.home,position:u.player.position,location:u.player.location,flight:u.player.flight,character:u.player.character,quest:u.player.quest,deliveries:u.player.deliveries};
}
function pose(u:Universe):Vec3{return u.player.location?.kind==='interior'?u.player.location.position:u.player.position;}

async function dragPhoto(page:Page,touch:boolean){
 const size=page.viewportSize()!,start={x:size.width*.42,y:size.height*.38},end={x:size.width*.61,y:size.height*.43};
 if(touch){
  const cdp=await page.context().newCDPSession(page);
  try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
   for(let step=1;step<=8;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*step/8,y:start.y+(end.y-start.y)*step/8,id:1}]});await page.waitForTimeout(20);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await cdp.detach();}
 }else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();}
 await page.waitForTimeout(120);
}
async function exportPhoto(page:Page,name:string,longEdge:2048|3840,touch:boolean){
 await page.locator('#photo-size').selectOption(String(longEdge));
 const downloadPromise=page.waitForEvent('download',{timeout:45000}),start=Date.now();await activate(page,'#photo-save',touch);
 const download=await downloadPromise,path=join(evidence,`${name}-${longEdge}.png`);await download.saveAs(path);
 await expect(page.locator('#photo-save')).toBeEnabled();
 const buffer=readFileSync(path);expect(buffer.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
 const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20),viewport=page.viewportSize()!,aspect=viewport.width/viewport.height;
 expect(width).toBe(Math.round(aspect>=1?longEdge:longEdge*aspect));expect(height).toBe(Math.round(aspect>=1?longEdge/aspect:longEdge));expect(buffer.length).toBeGreaterThan(20000);
 // Decode the actual downloaded file in Chrome and sample it; a canvas alone
 // or a large all-background PNG does not establish a usable rendered photo.
 const pixels=await page.evaluate(async encoded=>{
  const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const context=canvas.getContext('2d')!;context.drawImage(image,0,0,64,64);const data=context.getImageData(0,0,64,64).data,colors=new Set<number>();let opaque=0,min=255,max=0;
  for(let i=0;i<data.length;i+=4){colors.add((data[i]>>3)*1024+(data[i+1]>>3)*32+(data[i+2]>>3));if(data[i+3]>250)opaque++;const luminance=(data[i]+data[i+1]+data[i+2])/3;min=Math.min(min,luminance);max=Math.max(max,luminance);}
  return {decodedWidth:image.naturalWidth,decodedHeight:image.naturalHeight,quantizedColors:colors.size,opaqueFraction:opaque/4096,luminanceRange:max-min};
 },buffer.toString('base64'));
 expect(pixels.decodedWidth).toBe(width);expect(pixels.decodedHeight).toBe(height);expect(pixels.quantizedColors).toBeGreaterThan(25);expect(pixels.opaqueFraction).toBeGreaterThan(.99);expect(pixels.luminanceRange).toBeGreaterThan(40);
 const metadata=JSON.parse(await page.locator('#photo-mode').getAttribute('data-last-export')??'{}') as {width:number;height:number;bytes:number;supersampling:number;source:string};
 expect(metadata).toMatchObject({width,height,bytes:buffer.length,source:'local geometry'});
 return {path,width,height,bytes:buffer.length,sha256:hash(buffer),elapsedMs:Date.now()-start,pixels,supersampling:metadata.supersampling,source:metadata.source};
}

for(const touch of [false,true])test(`integration local photos and input restoration: ${touch?'390 touch':'desktop'}`,async({browser})=>{
 test.setTimeout(240000);mkdirSync(evidence,{recursive:true});
 const baseURL=integrationUrl(),name=touch?'photo-touch-390':'photo-desktop',context=await browser.newContext({baseURL,viewport:touch?{width:390,height:844}:{width:1440,height:1000},isMobile:touch,hasTouch:touch,locale:'en-US'}),page=await context.newPage();
 const errors:string[]=[],writes:string[]=[],externalRequests:string[]=[],photos:unknown[]=[],checks:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{const url=new URL(request.url());if(request.method()==='POST'&&url.pathname.startsWith('/api/'))writes.push(url.pathname);if(['http:','https:'].includes(url.protocol)&&url.origin!==baseURL)externalRequests.push(url.origin+url.pathname);});
 const report:Record<string,unknown>={status:'failed',baseURL,browser:'Installed Google Chrome via Playwright channel chrome',browserVersion:browser.version(),host:hostContext(),photos,checks,pageErrors:errors,externalRequests,fixture:'Fresh isolated browser identity. Photo actions use actual controls and local downloads; state APIs are read-only. No physical-phone performance claim.'};
 const shot=(label:string)=>page.screenshot({path:join(evidence,`${name}-${label}.png`)});
 try{
  await begin(page,touch);report.renderer=await rendererContext(page);const initial=await universe(page);expect(initial.player.home).toBeTruthy();expect(initial.currentPlanet.mine).toBe(true);
  const libraryBefore=await library(page),objectsBefore=initial.currentPlanet.objects;
  for(const interior of [false,true]){
   const scene=interior?'interior':'exterior';
   if(interior){
    const u=await universe(page);if(!await page.locator('#home-enter').isVisible())await groundWalk(page,u.player.home!.door.position,touch,.2);
    if(!u.player.home!.interior.doorOpen)await activate(page,'#home-door-toggle',touch);
    await activate(page,'#home-enter',touch);await expect(page.locator('.home-interior-ui')).toBeVisible();
    await activate(page,'#home-photo',touch);
   }else await menu(page,'#open-photo',touch);
   await expect(page.locator('#photo-mode')).toBeVisible();await expect(page.locator('body')).toHaveClass(/photo-mode/);await visibleControl(page,'#photo-close');await visibleControl(page,'#photo-save');
   await page.waitForTimeout(150);const before=await snapshot(page),writeStart=writes.length;
   const imageBefore=hash(await page.locator('#world canvas').screenshot());await dragPhoto(page,touch);expect(hash(await page.locator('#world canvas').screenshot())).not.toBe(imageBefore);
   await activate(page,'#photo-reset',touch);await expect(page.locator('#photo-overview')).toHaveAttribute('aria-pressed','true');
   await activate(page,'#photo-follow',touch);await expect(page.locator('#photo-follow')).toHaveAttribute('aria-pressed','true');
   await activate(page,'#photo-overview',touch);await expect(page.locator('#photo-overview')).toHaveAttribute('aria-pressed','true');
   // Gameplay keys must be swallowed even after pointer orbit or control focus.
   await page.keyboard.down('w');await page.keyboard.down('d');await page.keyboard.press('Space');await page.waitForTimeout(350);await page.keyboard.up('w');await page.keyboard.up('d');
   for(const longEdge of [2048,3840] as const)photos.push(await exportPhoto(page,`${name}-${scene}`,longEdge,touch));
   await shot(`${scene}-controls`);expect(await snapshot(page)).toEqual(before);
   const pausedWrites=writes.slice(writeStart);expect(pausedWrites.filter(route=>contentWrite.test(route)||motionWrite.test(route))).toEqual([]);
   checks.push(`${scene}: orbit changes view, both camera presets work, 2K/4K PNG decodes, geometry/furniture/labels/pose unchanged while paused`);
   if(interior&&!touch)await page.keyboard.press('Escape');else await activate(page,'#photo-close',touch);
   await expect(page.locator('#photo-mode')).not.toBeVisible();await expect(page.locator('body')).not.toHaveClass(/photo-mode/);
   if(interior){
    const previous=pose(await universe(page));await roomWalk(page,previous[0]+.6,touch);const moved=pose(await universe(page));expect(Math.abs(moved[0]-previous[0])).toBeGreaterThan(.35);await roomWalk(page,previous[0],touch);
   }else{
    const u=await universe(page),position=u.player.position,route=u.currentPlanet.homeManifest!.routes.find(r=>r.id==='home')!,previous=route.points.at(-2)!;
    const gap=distance(position,previous,u.currentPlanet.radius),target=new Vector3(...position).lerp(new Vector3(...previous),Math.min(1,.7/gap)).normalize().toArray() as Vec3;
    await groundWalk(page,target,touch,.15);expect(distance((await universe(page)).player.position,position,u.currentPlanet.radius)).toBeGreaterThan(.3);await groundWalk(page,u.player.home!.door.position,touch,.2);
   }
   checks.push(`${scene}: close restores real ${touch?'touch':'keyboard'} walking controls`);
  }
  const final=await universe(page);expect(final.currentPlanet.objects).toEqual(objectsBefore);expect(await library(page)).toEqual(libraryBefore);expect(final.player.home!.interior).toEqual(initial.player.home!.interior);
  expect(writes.filter(route=>contentWrite.test(route))).toEqual([]);expect(externalRequests).toEqual([]);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(touch?390:1440);
  report.status='passed';report.writeRoutes=writes;report.contentDigestBefore=hash(JSON.stringify([objectsBefore,libraryBefore,initial.player.home!.interior]));report.contentDigestAfter=hash(JSON.stringify([final.currentPlanet.objects,await library(page),final.player.home!.interior]));
 }catch(error){report.error=String(error);await shot('failure').catch(()=>undefined);throw error;}
 finally{writeFileSync(join(evidence,`${name}-result.json`),JSON.stringify(report,null,2)+'\n');for(const key of ['w','a','s','d'])await page.keyboard.up(key).catch(()=>undefined);await page.goto('about:blank').catch(()=>undefined);await context.close();}
});

interface DoorFixture {
 baseURL:string;provenance:{sourceCommit:string;synthetic:boolean;databaseIsIsolatedCopy:boolean};cookie:{name:string;value:string};
 expected:{currentPlanetId:string;ownedPlanetId:string;objects:PlacedObject[];blueprints:BlueprintContents;library:LibraryEntry[]};binding:{buildingId:string;doorParts:number[]};
}
test('integration existing owner previews without writes and binds original door part 5',async({browser})=>{
 test.setTimeout(120000);mkdirSync(evidence,{recursive:true});const baseURL=integrationUrl(),fixturePath=process.env.INTEGRATION_DOOR_FIXTURE;
 expect(fixturePath,'Supply the separate, unbound legacy door fixture; do not use the preservation fixture.').toBeTruthy();
 const fixture=JSON.parse(readFileSync(fixturePath!,'utf8')) as DoorFixture;expect(fixture.provenance.databaseIsIsolatedCopy).toBe(true);expect(new URL(fixture.baseURL).origin).toBe(baseURL);expect(fixture.binding.doorParts).toContain(5);
 const context=await browser.newContext({baseURL,viewport:{width:1440,height:1000},locale:'en-US'});await context.addCookies([{...fixture.cookie,url:baseURL,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage(),errors:string[]=[],writes:string[]=[],checks:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{const url=new URL(request.url());if(request.method()==='POST'&&url.pathname.startsWith('/api/'))writes.push(url.pathname);});
 const report:Record<string,unknown>={status:'failed',baseURL,browser:'Installed Google Chrome via Playwright channel chrome',browserVersion:browser.version(),host:hostContext(),provenance:fixture.provenance,checks,pageErrors:errors,writeRoutes:writes,fixtureMeaning:'Separate synthetic alias of an actual old 29-part building with original door n=5, names/groups replaced only in the isolated browser copy. No identity token or private labels included.'};
 async function unchangedContent(){const u=await universe(page);expect(u.currentPlanet.objects).toEqual(fixture.expected.objects);expect(u.currentPlanet.blueprints).toEqual(fixture.expected.blueprints);expect(await library(page)).toEqual(fixture.expected.library);return u;}
 async function openPreview(){const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/home/setup/preview'&&r.request().method()==='POST');await menu(page,'#home-setup');const preview=await response;expect(preview.status()).toBe(200);await expect(page.locator('#home-setup-dialog')).toBeVisible();return preview.json() as Promise<HomeSetupPreview>;}
 try{
  await begin(page);const initial=await unchangedContent();expect(initial.player.home).toBeNull();expect(initial.currentPlanet.mine).toBe(true);report.renderer=await rendererContext(page);
  const plan=await openPreview();expect(plan.existingHome).toBe(false);expect(plan.addition).toBeTruthy();expect(plan.candidates.some(c=>c.buildingId===fixture.binding.buildingId&&c.partNumber===5)).toBe(true);
  await page.screenshot({path:join(evidence,'legacy-home-setup-options.png')});await activate(page,'#home-setup-preview');await expect(page.locator('#home-setup-preview-bar')).toBeVisible();await expect(page.locator('#home-setup-dialog')).not.toBeVisible();
  await page.waitForTimeout(600);await page.screenshot({path:join(evidence,'legacy-home-cottage-ghost.png')});expect((await unchangedContent()).player.home).toBeNull();
  await activate(page,'#home-setup-dismiss');await expect(page.locator('#home-setup-preview-bar')).not.toBeVisible();expect((await unchangedContent()).player.home).toBeNull();expect(writes.filter(route=>contentWrite.test(route))).toEqual([]);
  checks.push('New-cottage preview displays a real geometry ghost; cancel creates no object, blueprint, interior or content write');
  const second=await openPreview();expect(second.hash).toBe(plan.hash);expect(second.expectedRevision).toBe(plan.expectedRevision);
  const index=second.candidates.findIndex(c=>c.buildingId===fixture.binding.buildingId&&c.partNumber===5);expect(index).toBeGreaterThanOrEqual(0);await page.locator('#home-setup-choice').selectOption(String(index));
  const confirmResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/home/setup/confirm');await activate(page,'#home-setup-bind');const confirmed=await confirmResponse;expect(confirmed.status()).toBe(200);
  const body=confirmed.request().postDataJSON() as {mode:string;buildingId:string;partNumber:number;hash:string};expect(body).toMatchObject({mode:'bind',buildingId:fixture.binding.buildingId,partNumber:5,hash:second.hash});
  await expect(page.locator('#home-setup-dialog')).not.toBeVisible();await expect.poll(async()=>(await universe(page)).player.home?.buildingId).toBe(fixture.binding.buildingId);
  const bound=await unchangedContent(),home=bound.player.home!;expect(home.variant).toBe('custom');expect(home.buildingVersion).toBe(initial.currentPlanet.objects.find(o=>o.id===fixture.binding.buildingId)!.version);
  const object=bound.currentPlanet.objects.find(o=>o.id===home.buildingId)!,parts=bound.currentPlanet.blueprints![object.blueprintHash!]!,door=parts.find(p=>p.n===5)!,transform=partTransform(door,pivotOf(parts)),fit=structureFit(parts,object.position,object.rotation,fieldOf(bound.currentPlanet.environment,bound.currentPlanet.radius));
  const expectedFrame=localToPlanet({dir:object.position,yaw:object.rotation},fit.baseRadius,transform.position);expect(home.door.frame).toBeTruthy();home.door.frame!.position.forEach((value,i)=>expect(value).toBeCloseTo(expectedFrame[i],9));
  await menu(page,'#resume');await page.screenshot({path:join(evidence,'legacy-home-original-door-bound.png')});await page.reload();await expect.poll(async()=>(await universe(page)).player.home?.interiorId).toBe(home.interiorId);await unchangedContent();
  expect(writes.filter(route=>contentWrite.test(route))).toEqual(['/api/home/setup/confirm']);expect(errors).toEqual([]);
  checks.push('Explicit UI confirmation binds the original door part n=5 and correct world frame','Both old building IDs, placements, versions, full 29-part blueprint hash, names/groups and library versions remain unchanged after reload');
  report.status='passed';report.binding={partNumber:5,buildingVersion:home.buildingVersion,objectCount:bound.currentPlanet.objects.length,blueprintPartCount:parts.length,oneExplicitConfirm:true,sameInteriorAfterReload:true};report.preservedContentDigest=hash(JSON.stringify([bound.currentPlanet.objects,bound.currentPlanet.blueprints,await library(page)]));
 }catch(error){report.error=String(error);await page.screenshot({path:join(evidence,'legacy-home-setup-failure.png')}).catch(()=>undefined);throw error;}
 finally{writeFileSync(join(evidence,'legacy-home-setup-result.json'),JSON.stringify(report,null,2)+'\n');await page.goto('about:blank').catch(()=>undefined);await context.close();}
});
