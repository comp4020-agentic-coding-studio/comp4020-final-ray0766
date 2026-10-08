import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {Vector3} from 'three';
import type {Page} from '@playwright/test';
import type {Vec3} from '../src/shared/world.ts';
import {samplePublicVillage} from '../src/shared/sample-public-village.ts';
import {activate,begin,flyTo,groundWalk,integrationUrl,menu,rendererContext,universe} from './integration-browser-helpers.ts';

/** Turn by the same canvas drag a visitor uses, then walk forward down the lane. */
async function lookAlong(page:Page,target:Vec3,touch:boolean){
 const data=await page.locator('#world canvas').evaluate(el=>({position:JSON.parse(el.dataset.groundPosition!) as Vec3,north:JSON.parse(el.dataset.cameraHeading!) as Vec3}));
 const up=new Vector3(...data.position),north=new Vector3(...data.north),toward=new Vector3(...target).projectOnPlane(up).normalize();
 if(toward.lengthSq()<.1)return;
 let pixels=-Math.atan2(up.dot(north.clone().cross(toward)),north.dot(toward))/.004;
 const size=page.viewportSize()!,cdp=touch?await page.context().newCDPSession(page):null;
 // A movement of <=7 px is deliberately a world tap in the real controls.
 // Never finish a camera gesture with a tiny extra tap that starts walking.
 try{while(Math.abs(pixels)>10){
  const delta=Math.max(-size.width*.30,Math.min(size.width*.30,pixels)),x=size.width*.5,y=size.height*.56;
  if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x+delta,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+delta,y,{steps:5});await page.mouse.up();}
  pixels-=delta;await page.waitForTimeout(150);
 }}finally{await cdp?.detach();}
 await page.waitForTimeout(400);
}

// Explicitly restricted to the authorised disposable 8130 service. Browser
// cookies remain in .data and never become visual evidence or source control.
const baseURL=integrationUrl(),phase=process.argv[2]??'baseline',fixture=process.argv[3]??phase;
if(![phase,fixture].every(value=>/^[a-z0-9-]+$/.test(value)))throw Error('Use simple evidence and fixture names.');
const evidence=join('docs/evidence/integration/quality',phase),state=join('.data/quality-browser',fixture+'.json');
mkdirSync(evidence,{recursive:true});mkdirSync('.data/quality-browser',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results:unknown[]=[],captures:unknown[]=[],errors:string[]=[],badResponses:unknown[]=[];let failure:string|undefined;
try{
 for(const touch of [false,true]){
  const context=await browser.newContext({baseURL,viewport:touch?{width:390,height:844}:{width:1440,height:1000},hasTouch:touch,isMobile:touch,locale:'en-US',...(existsSync(state)?{storageState:state}:{})}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',async response=>{if(response.status()>=400&&new URL(response.url()).pathname.startsWith('/api/'))badResponses.push({route:new URL(response.url()).pathname,status:response.status(),body:await response.json().catch(()=>null)});});
  const size=touch?'390':'1440',shot=async(name:string)=>{await page.waitForTimeout(500);await page.screenshot({path:join(evidence,size+'-'+name+'.png')});
   captures.push({viewport:size,name,...await page.locator('#world canvas').evaluate(el=>({drawingBuffer:[(el as HTMLCanvasElement).width,(el as HTMLCanvasElement).height],drawCalls:Number(document.body.classList.contains('home-interior-active')?el.dataset.homeDrawCalls:el.dataset.drawCalls),triangles:document.body.classList.contains('home-interior-active')?null:Number(el.dataset.triangles)}))});
  };
  await begin(page,touch);let initial=await universe(page);
  await context.storageState({path:state});
  if(process.env.PUBLIC_PREVIEW==='1'){
   if(initial.currentPlanet.id!=='hub'){await flyTo(page,initial.planets.find(p=>p.id==='hub')!,touch);initial=await universe(page);}
   await shot('public-arrival');await menu(page,'#view-mode',touch);await shot('public-planet');await menu(page,'#view-mode',touch);
   const village=samplePublicVillage(initial.currentPlanet.radius);
   for(const route of village.routes.filter(route=>['public-harbour','public-post','public-orchard'].includes(route.id))){
    // The dock is the real landing point; the lane's origin is reached through
    // the harbour route first, and each later route returns over its own track.
    if(route.id==='public-harbour')continue;
    const harbour=village.routes.find(r=>r.id==='public-harbour')!;
    const u=await universe(page);
    if(u.player.position&&route.id==='public-post')for(const point of [...harbour.points].reverse().slice(1)){await lookAlong(page,point,touch);await groundWalk(page,point,touch,.35);}
    for(const [index,point]of route.points.slice(1).entries()){await lookAlong(page,point,touch);await groundWalk(page,point,touch,.3);await shot(`${route.id}-${index}`);}
    for(const point of [...route.points].reverse().slice(1)){await lookAlong(page,point,touch);await groundWalk(page,point,touch,.35);}
   }
   results.push({viewport:size,renderer:await rendererContext(page),publicVersion:village.version,objects:village.objects.length,structures:village.objects.filter(o=>o.kind==='structure').length});
   // Return to the dock so the next viewport starts at an actual arrival point.
   for(const point of village.routes.find(r=>r.id==='public-harbour')!.points.slice(1)){await lookAlong(page,point,touch);await groundWalk(page,point,touch,.35);}
   await context.storageState({path:state});await context.close();continue;
  }
  await shot('arrival');
  const renderer=await rendererContext(page),pose=await page.locator('#world canvas').evaluate(el=>({feet:el.dataset.groundPosition,camera:el.dataset.cameraPosition,heading:el.dataset.cameraHeading}));
  await menu(page,'#view-mode',touch);await shot('planet');await menu(page,'#view-mode',touch);
  const homeRoute=initial.currentPlanet.homeManifest?.routes.find(r=>r.id==='home');
  if(homeRoute){
   for(const point of [...homeRoute.points].reverse().slice(1)){await lookAlong(page,point,touch);await groundWalk(page,point,touch,.25);}
   await lookAlong(page,homeRoute.points[1],touch);
   await shot('arrival-street');
   for(const [index,point]of homeRoute.points.slice(1).entries()){await lookAlong(page,point,touch);await groundWalk(page,point,touch,.23);if(index===1)await shot('street-turn');}
   if(initial.player.home?.door.frame)await lookAlong(page,new Vector3(...initial.player.home.door.frame.position).normalize().toArray() as Vec3,touch);
   await shot('home-street');
  }
  const atHome=await universe(page);
  if(atHome.player.home){
   if(!atHome.player.home.interior.doorOpen)await activate(page,'#home-door-toggle',touch);
   await activate(page,'#home-enter',touch);await shot('room-follow');await activate(page,'#home-camera-view',touch);await shot('room-overview');
   // Leave this fixture at the original exterior doorway for another viewport.
   await activate(page,'#home-exit',touch);
  }
  results.push({viewport:size,renderer,pose,generatedVersion:initial.currentPlanet.homeManifest?.version,seed:initial.currentPlanet.homeManifest?.seed,objects:initial.currentPlanet.objects.length,structures:initial.currentPlanet.objects.filter(o=>o.kind==='structure').length});
  await context.storageState({path:state});await context.close();
 }
}catch(error){failure=String(error);throw error;}
finally{writeFileSync(join(evidence,'result.json'),JSON.stringify({phase,status:failure||errors.length?'failed':'passed',failure,browser:'Installed Google Chrome via Playwright',browserVersion:browser.version(),results,captures,counterMeaning:'Renderer counters at each settled screenshot, not frame timing or a sustained mobile performance claim.',errors,badResponses,physicalPhone:false},null,2));await browser.close();}
if(errors.length)throw Error('Browser errors: '+errors.join('\n'));
