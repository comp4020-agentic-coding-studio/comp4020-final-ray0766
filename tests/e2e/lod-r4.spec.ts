import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {readUniverse,menuAction,closeVisit} from './flight-helper.ts';
import {readFeet,frame,walk} from './physics-helper.ts';
const dir='docs/evidence/lod-r4',phase=process.env.LOD_PHASE==='before'?'before':'after';
async function sample(page:Page,label:string){
 await page.waitForTimeout(900);const frames=[];
 for(let i=0;i<12;i++){frames.push(await page.locator('#world canvas').evaluate(e=>{const d=(e as HTMLElement).dataset;return{triangles:Number(d.triangles),drawCalls:Number(d.drawCalls),practical:JSON.parse(d.practical!),position:JSON.parse(d.groundPosition!),radius:Number(d.feetRadius),heading:JSON.parse(d.cameraHeading!),pitch:Number(d.cameraPitch)};}));await page.waitForTimeout(100);}
 await page.screenshot({path:`${dir}/${phase}-${label}.png`});
 const context=await page.evaluate(()=>{const gl=document.querySelector<HTMLCanvasElement>('#world canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');return{viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',overflow:document.documentElement.scrollWidth>innerWidth};});
 return{context,frames};
}
test('R4 bounded same-save views, close building and ship, door/stair and refresh',async({browser})=>{
 test.setTimeout(150_000);mkdirSync(dir,{recursive:true});const contexts=[],errors:string[]=[],checks:string[]=[],report:Record<string,unknown>={phase,browser:browser.version(),checks,errors};
 const c=await browser.newContext({storageState:'.data/physics-browser-owner.json',viewport:{width:1920,height:1080},reducedMotion:'reduce'});contexts.push(c);const page=await c.newPage();let current=page;page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.goto('/');await expect(page.locator('#scene-sync')).toContainText('Live');const u=await readUniverse(page),original=u.currentPlanet;expect(original.mine).toBe(true);
 const cabin=original.objects.find(o=>original.blueprints?.[o.blueprintHash!]?.some(p=>p.part==='wall.door.open'))!,stairs=original.objects.find(o=>original.blueprints?.[o.blueprintHash!]?.some(p=>p.part==='stair.straight'))!,cf=frame(cabin,original.blueprints![cabin.blueprintHash!]),sf=frame(stairs,original.blueprints![stairs.blueprintHash!]);
 if(phase==='before'){
  const start=cf.local(await readFeet(page));if(Math.abs(start.x)<.85&&start.z> -1&&start.z<1){await walk(page,f=>cf.at(-.52,start.z,cf.local(f).y));await walk(page,f=>cf.at(-.52,1.95,cf.local(f).y));}else if(start.z<1.9){const side=start.x<0?-1.95:1.95;await walk(page,()=>cf.at(side,start.z));await walk(page,()=>cf.at(side,1.95));}
  await walk(page,()=>cf.at(-.52,1.95));await menuAction(page,'resume');await page.reload();await expect(page.locator('#scene-sync')).toContainText('Live');
 }
 report.desktop=await sample(page,'building');
 if(phase==='after'){
  const before=JSON.parse(readFileSync(`${dir}/before-browser.json`,'utf8'));const d=report.desktop as Awaited<ReturnType<typeof sample>>;expect(d.frames[0].position).toEqual(before.desktop.frames[0].position);expect(d.frames[0].heading).toEqual(before.desktop.frames[0].heading);expect(d.frames[0].pitch).toBe(before.desktop.frames[0].pitch);expect(d.frames[0].radius).toBeCloseTo(before.desktop.frames[0].radius,6);checks.push('Desktop baseline uses the exact same saved feet and camera heading/pitch');
 }
 await menuAction(page,'open-shipyard');await expect(page.locator('#sy-save')).toBeEnabled();await page.waitForTimeout(800);await page.screenshot({path:`${dir}/${phase}-ship.png`});report.shipDesign=await page.locator('#sy-stage canvas').getAttribute('data-ship-design');await page.locator('#sy-close').click();
 const storage=await c.storageState();await closeVisit(c);
 const phoneContext=await browser.newContext({storageState:storage,viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});contexts.push(phoneContext);const phone=await phoneContext.newPage();current=phone;phone.on('pageerror',e=>errors.push(e.message));await phone.goto('/');await expect(phone.locator('#scene-sync')).toContainText('Live');report.phone=await sample(phone,'phone');expect((report.phone as Awaited<ReturnType<typeof sample>>).context.overflow).toBe(false);await closeVisit(phoneContext);
 if(phase==='after'){
  const next=await browser.newContext({storageState:storage,viewport:{width:1920,height:1080},reducedMotion:'reduce'});contexts.push(next);const p=await next.newPage();current=p;p.on('pageerror',e=>errors.push(e.message));await p.goto('/');await expect(p.locator('#scene-sync')).toContainText('Live');
  await walk(p,f=>cf.at(-.52,1.28,cf.local(f).y));await walk(p,f=>cf.at(-.52,.45,cf.local(f).y));await walk(p,f=>cf.at(-.52,0,cf.local(f).y));expect(cf.local(await readFeet(p)).z).toBeLessThan(.25);await p.screenshot({path:`${dir}/after-door-inside.png`});
  await walk(p,f=>cf.at(-.45,1.9,cf.local(f).y));await walk(p,()=>cf.at(-1.9,1.9));await walk(p,()=>cf.at(-1.9,-1.9));await walk(p,()=>sf.at(1.1,2));await walk(p,()=>sf.at(0,1.9));await walk(p,f=>sf.at(0,-1.04,sf.local(f).y));expect(sf.local(await readFeet(p)).y).toBeCloseTo(2.2,1);await menuAction(p,'resume');const saved=(await readUniverse(p)).player;await p.reload();await expect(p.locator('#scene-sync')).toContainText('Live');expect((await readUniverse(p)).player.position).toEqual(saved.position);expect(sf.local(await readFeet(p)).y).toBeCloseTo(2.2,1);await p.screenshot({path:`${dir}/after-stair-refresh.png`});checks.push('Actual keyboard door traversal and stairs; upper-floor position survives refresh');
  await menuAction(p,'open-workshop');await expect(p.locator('#ws-status')).toContainText('Library loaded');await p.locator('#ws-close').click();await menuAction(p,'open-workshop');await expect(p.locator('#ws-status')).toContainText('Library loaded');await p.locator('#ws-close').click();expect((await readUniverse(p)).currentPlanet).toEqual(original);checks.push('Workshop close/reopen works and saved building records remain unchanged');
 }
 expect(errors).toEqual([]);report.status='passed';writeFileSync(`${dir}/${phase}-browser.json`,JSON.stringify(report,null,2)+'\n');
 }catch(e){report.status='failed';report.error=String(e);await current.screenshot({path:`${dir}/${phase}-failure.png`}).catch(()=>{});writeFileSync(`${dir}/${phase}-failure.json`,JSON.stringify(report,null,2)+'\n');throw e;}finally{for(const ctx of contexts)try{await closeVisit(ctx);}catch{/* already closed */}}
});
