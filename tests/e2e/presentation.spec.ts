import {test,expect} from '@playwright/test';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {menuAction,readUniverse,closeVisit,launch,mark,pilotToBearing} from './flight-helper.ts';
import {readFeet,frame,walk} from './physics-helper.ts';
import {SPAWN} from '../../src/shared/world.ts';

// Opt-in bounded comparison against the existing local physics fixture; never runs on hosted release CI.
const phase=process.env.PRESENTATION_PHASE;
const dir='docs/evidence/presentation-adapter';
test('presentation defaults and bounded door/build/flight smoke',async({browser})=>{
 test.skip(!['before','after','continue'].includes(phase??'')||!existsSync('.data/physics-browser-owner.json'),'Requires explicit before/after and the local fixture');
 test.setTimeout(180_000);mkdirSync(dir,{recursive:true});const contexts=[],errors:string[]=[],checks:string[]=[];
 const report:Record<string,unknown>={phase,browser:browser.version(),checks,pageErrors:errors};
 let current:import('@playwright/test').Page|undefined;
 const observe=async(page:import('@playwright/test').Page,name:string)=>{
  await page.waitForTimeout(1600);
  const value=await page.evaluate(()=>({
   feet:document.querySelector<HTMLElement>('#world canvas')?.dataset.groundPosition,
   radius:document.querySelector<HTMLElement>('#world canvas')?.dataset.feetRadius,
   heading:document.querySelector<HTMLElement>('#world canvas')?.dataset.cameraHeading,
   width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
   styles:['body','#world','#menu-dialog','#workshop','#shipyard','#history','#terrain-workshop'].map(selector=>{
    const element=document.querySelector(selector);if(!element)return {selector,missing:true};const s=getComputedStyle(element);return {selector,background:s.backgroundColor,color:s.color,border:s.borderColor};
   }),
  }));
  report[name]=value;await page.screenshot({path:`${dir}/${phase}-${name}.png`});
  if(phase==='after'){const previous=JSON.parse(readFileSync(`${dir}/before.json`,'utf8'))[name];const {feet,radius,heading,...stable}=value;const {feet:oldFeet,radius:oldRadius,heading:oldHeading,...oldStable}=previous;expect(stable).toEqual(oldStable);expect(Number(radius)).toBeCloseTo(Number(oldRadius),10);for(const [a,b] of [[feet,oldFeet],[heading,oldHeading]])JSON.parse(a!).forEach((v:number,i:number)=>expect(v).toBeCloseTo(JSON.parse(b)[i],10));}
  expect(value.overflow).toBe(false);
 };
 try{
  const context=await browser.newContext({storageState:'.data/physics-browser-owner.json',viewport:{width:1920,height:1080},reducedMotion:'reduce'});contexts.push(context);const page=await context.newPage();current=page;page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#scene-sync')).toContainText('Live');const original=(await readUniverse(page)).currentPlanet;expect(original.mine).toBe(true);
  if(phase!=='continue'){
  await menuAction(page,'resume');await observe(page,'desktop');
  for(const [button,status,close,name] of [['open-workshop','#ws-status','#ws-close','workshop'],['open-shipyard','#sy-status','#sy-close','shipyard'],['open-history','#hy-status','#hy-close','history'],['open-terrain','#tw-status','#tw-close','terrain']]){
   await menuAction(page,button);await expect(page.locator(status)).not.toHaveText(/Loading|Opening/);await page.waitForTimeout(800);await observe(page,name);await page.locator(close).click();
  }
  expect((await readUniverse(page)).currentPlanet).toEqual(original);}
  const storage=await context.storageState();await closeVisit(context);
  if(phase!=='continue'){
  const mobile=await browser.newContext({storageState:storage,viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});contexts.push(mobile);const phone=await mobile.newPage();current=phone;phone.on('pageerror',e=>errors.push(e.message));await phone.goto('/');await expect(phone.locator('#scene-sync')).toContainText('Live');await observe(phone,'phone');await closeVisit(mobile);
  const guest=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce'});contexts.push(guest);const hub=await guest.newPage();current=hub;hub.on('pageerror',e=>errors.push(e.message));await hub.goto('/');await hub.locator('#begin').click();await observe(hub,'harbour');await closeVisit(guest);
  checks.push('Same saved pose, desktop/phone layout and computed UI colours; four preview panels open/close without world edits');
  }
  if(phase==='after'||phase==='continue'){
   const c=await browser.newContext({storageState:storage,viewport:{width:1920,height:1080},reducedMotion:'reduce'});contexts.push(c);const p=await c.newPage();current=p;p.on('pageerror',e=>errors.push(e.message));await p.goto('/');await expect(p.locator('#scene-sync')).toContainText('Live');
   const cabin=original.objects.find(o=>original.blueprints?.[o.blueprintHash!]?.some(a=>a.part==='wall.door.open'))!,stairs=original.objects.find(o=>original.blueprints?.[o.blueprintHash!]?.some(a=>a.part==='stair.straight'))!;
   const cf=frame(cabin,original.blueprints![cabin.blueprintHash!]),sf=frame(stairs,original.blueprints![stairs.blueprintHash!]);
   if(phase==='after'){
   const feet=sf.local(await readFeet(p));if(feet.y>.1&&Math.abs(feet.x)<.5&&feet.z<1.6&&feet.z>-1.7)await walk(p,f=>sf.at(0,1.9,sf.local(f).y));
   await walk(p,()=>sf.at(1.1,2));await walk(p,()=>cf.at(-1.9,-1.9));await walk(p,()=>cf.at(-1.9,1.9));await walk(p,()=>cf.at(-.52,1.9));await walk(p,f=>cf.at(-.52,.45,cf.local(f).y));await walk(p,f=>cf.at(-.52,0,cf.local(f).y));expect(cf.local(await readFeet(p)).z).toBeLessThan(.25);await p.screenshot({path:`${dir}/after-door.png`});await walk(p,f=>cf.at(-.52,1.9,cf.local(f).y));await walk(p,()=>cf.at(-1.9,1.9));checks.push('Real keyboard walks down existing stairs and through the open door');
   }else{await walk(p,()=>cf.at(-1.9,1.9));}
   // Follow the previously verified route around the cabin; the direct bearing to SPAWN crosses its wall.
   await walk(p,()=>cf.at(-1.9,-1.9));await walk(p,()=>sf.at(1.8,2.1));await walk(p,()=>SPAWN);
   await menuAction(p,'build-mode');await expect(p.locator('#builder')).toBeVisible();await p.locator('#built-list').selectOption(cabin.id);await expect(p.locator('#rotate-object')).toBeVisible();await p.locator('#cancel-object').click();await p.locator('#finish-building').click();expect((await readUniverse(p)).currentPlanet.objects).toEqual(original.objects);checks.push('Existing building can be selected and cancelled; saved objects unchanged');
   await launch(p);await p.keyboard.down('w');await p.waitForTimeout(400);await p.keyboard.up('w');await p.keyboard.down('s');await p.waitForTimeout(500);await p.keyboard.up('s');await mark(p,original.id);await pilotToBearing(p);await p.screenshot({path:`${dir}/after-flight.png`});await p.locator('#land-ship').click();await p.getByRole('button',{name:'Land and explore'}).click();await expect(p.locator('#flight-hud')).not.toBeVisible();await p.reload();await expect(p.locator('#scene-sync')).toContainText('Live');expect((await readUniverse(p)).currentPlanet.objects).toEqual(original.objects);checks.push('Actual launch, thrust/brake, return landing and refresh preserve existing buildings');
  }
  expect(errors).toEqual([]);report.status='passed';writeFileSync(`${dir}/${phase}.json`,JSON.stringify(report,null,2)+'\n');
 }catch(e){report.status='failed';report.error=String(e);await current?.screenshot({path:`${dir}/${phase}-failure.png`}).catch(()=>{});writeFileSync(`${dir}/${phase}-failure.json`,JSON.stringify(report,null,2)+'\n');throw e;}finally{for(const context of contexts)try{await closeVisit(context);}catch{/* already closed */}}
});
