import {test,expect} from '@playwright/test';
import type {Page,Browser} from '@playwright/test';
import {createHash,randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Vector3} from 'three';
import {openStore} from '../../src/server/store.ts';
import {samplePublicVillage} from '../../src/shared/sample-public-village.ts';
import {NPCS,SPAWN,distance} from '../../src/shared/world.ts';
import type {PlayerState,Vec3} from '../../src/shared/world.ts';

const baseURL=process.env.APP_URL??'http://127.0.0.1:8128',url=new URL(baseURL);
if(url.hostname!=='127.0.0.1'||url.port!=='8128')throw Error('Public browser checks require the isolated local port 8128.');
const evidence='docs/evidence/home-random';
const read=async(page:Page):Promise<PlayerState>=>(await page.request.get('/api/state')).json();
async function fixture(browser:Browser,mobile=false){
 const tokenFile=resolve(`.data/public-browser-${mobile?'phone':'desktop'}.token`);
 const token=existsSync(tokenFile)?readFileSync(tokenFile,'utf8').trim():randomBytes(32).toString('hex'),id=createHash('sha256').update(token).digest('hex');
 if(!existsSync(tokenFile))writeFileSync(tokenFile,token,{mode:0o600});
 const store=openStore(resolve('.data/home-random.sqlite'),{homeSample:true});
 try{
  if(!store.has(id))store.create(id);store.visit(id,'hub');
  store.db.prepare("UPDATE players SET position=?,quest='available',deliveries=0,revision=revision+1 WHERE id=?").run(JSON.stringify(SPAWN),id);
  store.db.prepare('DELETE FROM ground_states WHERE player_id=?').run(id);
 }finally{store.close();}
 const context=await browser.newContext({baseURL,viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile,locale:'en-US'});
 await context.addCookies([{name:'little_home_sample_p8128',value:token,url:baseURL,httpOnly:true,sameSite:'Lax'}]);
 return {context,page:await context.newPage()};
}
async function begin(page:Page){
 await page.goto('/?measure=1');
 await expect.poll(async()=>Number(await page.locator('#world canvas').getAttribute('data-triangles'))).toBeGreaterThan(1000);
 if(await page.locator('#begin').isVisible())await page.locator('#begin').click();
 await expect.poll(async()=>(await read(page)).planetId).toBe('hub');
 await expect.poll(async()=>JSON.parse(await page.locator('#world canvas').getAttribute('data-public-counts')??'null')?.structures).toBe(3);
 await page.waitForTimeout(450);
}
async function stats(page:Page){return page.locator('#world canvas').evaluate(e=>({drawCalls:Number(e.dataset.drawCalls),triangles:Number(e.dataset.triangles),quality:e.dataset.quality,groundRadius:Number(e.dataset.groundRadius),feetRadius:Number(e.dataset.feetRadius),cameraPosition:JSON.parse(e.dataset.cameraPosition??'null'),cameraHeading:JSON.parse(e.dataset.cameraHeading??'null'),groundPosition:JSON.parse(e.dataset.groundPosition??'null'),counts:JSON.parse(e.dataset.publicCounts??'null')}));}
async function settleCamera(page:Page){
 let previous:Vec3|undefined;
 await expect.poll(async()=>{
  const position=JSON.parse(await page.locator('#world canvas').getAttribute('data-camera-position')??'[0,0,0]') as Vec3;
  const change=previous?new Vector3(...position).distanceTo(new Vector3(...previous)):Infinity;previous=position;return change;
 },{timeout:12000,intervals:[300,500,700]}).toBeLessThan(.035);
}
async function overview(page:Page){await page.locator('#open-menu').click();await page.locator('#view-mode').click();await settleCamera(page);}
async function walk(page:Page,target:Vec3,arrivalDistance=.32){
 let pressed=new Set<string>();
 for(let i=0;i<220;i++){
  const pose=await page.locator('#world canvas').evaluate(e=>({position:JSON.parse(e.dataset.groundPosition!),north:JSON.parse(e.dataset.cameraHeading!)}));
  const up=new Vector3(...pose.position),north=new Vector3(...pose.north),d=distance(pose.position,target,21.6);
  if(d<arrivalDistance){for(const key of pressed)await page.keyboard.up(key);await page.waitForTimeout(400);return;}
  const tangent=new Vector3(...target).projectOnPlane(up).normalize(),right=new Vector3().crossVectors(north,up).normalize(),x=tangent.dot(right),y=tangent.dot(north);
  const next=new Set<string>();
  if(Math.abs(x)>.38)next.add(x>0?'d':'a');if(Math.abs(y)>.38)next.add(y>0?'w':'s');
  for(const key of pressed)if(!next.has(key))await page.keyboard.up(key);
  for(const key of next)if(!pressed.has(key))await page.keyboard.down(key);
  pressed=next;await page.waitForTimeout(d<.7?65:140);
 }
 for(const key of pressed)await page.keyboard.up(key);
 throw Error('Keyboard walking failed to reach the public waypoint.');
}
test('public sample Chrome desktop: original kit scene, keyboard routes, delivery and boarding',async({browser})=>{
 test.setTimeout(300000);mkdirSync(evidence,{recursive:true});
 const {page,context}=await fixture(browser),errors:string[]=[],failedResponses:string[]=[],checks:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().includes('/api/')&&response.status()>=400)failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);});
 const record:Record<string,unknown>={status:'failed',browser:'Installed Google Chrome via Playwright channel chrome (headless)',browserVersion:browser.version(),viewport:'1440×1000',entry:'Dedicated test identity created only in .data/home-random.sqlite; store.visit(id, hub) prepares the entry fixture. This does not verify interplanetary flight.',errors,failedResponses,checks};
 try{
  await begin(page);await page.screenshot({path:`${evidence}/public-desktop-entry.png`});record.entryRender=await stats(page);
  await overview(page);await page.screenshot({path:`${evidence}/public-desktop-overview.png`});record.overviewRender=await stats(page);await overview(page);
  const village=samplePublicVillage();
  const [post,orchard,harbour]=['public-post','public-orchard','public-harbour'].map(id=>{
   const route=village.routes.find(route=>route.id===id);
   expect(route,`Missing preserved task route ${id}`).toBeDefined();return route!;
  });
  for(const p of post.points.slice(1))await walk(page,p,p===post.points.at(-1)?1.05:.32);
  await expect(page.locator('#interact')).toBeVisible();await page.screenshot({path:`${evidence}/public-desktop-post.png`});
  await page.locator('#interact').click();await expect.poll(async()=>(await read(page)).quest).toBe('carrying');
  checks.push('Real keyboard movement follows the saved public landing-to-post route; UI pickup is acknowledged by the server');
  await walk(page,post.points[1]);for(const p of orchard.points.slice(2))await walk(page,p,p===orchard.points.at(-1)?1.05:.32);
  expect(distance((await read(page)).position,NPCS.sol.position,21.6)).toBeLessThan(1.5);
  await expect(page.locator('#interact')).toBeVisible();await page.screenshot({path:`${evidence}/public-desktop-orchard.png`});
  await page.locator('#interact').click();await expect.poll(async()=>(await read(page)).quest).toBe('delivered');
  checks.push('Keyboard route reaches the orchard; UI delivery persists quest=delivered');
  for(const p of [...orchard.points].reverse().slice(1,-1))await walk(page,p);
  await walk(page,harbour.points.at(-1)!);await expect(page.locator('#board-ship')).toBeVisible();
  await page.screenshot({path:`${evidence}/public-desktop-harbour.png`});
  checks.push('Keyboard route reaches the harbour; the normal boarding button appears beside its saved marker');
  record.finalRender=await stats(page);record.finalQuest=(await read(page)).quest;
  expect(errors).toEqual([]);expect(failedResponses).toEqual([]);record.status='passed';
 }finally{writeFileSync(`${evidence}/public-desktop-result.json`,JSON.stringify(record,null,2));await page.goto('about:blank');await context.close();}
});
test('public sample Chrome 390px: readable entry and overview with touch controls',async({browser})=>{
 test.setTimeout(120000);mkdirSync(evidence,{recursive:true});
 const {page,context}=await fixture(browser,true),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const record:Record<string,unknown>={status:'failed',browser:'Installed Google Chrome via Playwright channel chrome (headless), mobile viewport emulation',browserVersion:browser.version(),viewport:'390×844',realPhone:false,entry:'Dedicated isolated public-entry fixture; no flight claim',errors};
 try{
  await begin(page);await page.screenshot({path:`${evidence}/public-phone-entry.png`});record.entryRender=await stats(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.locator('#open-menu').tap();await page.locator('#view-mode').tap();await settleCamera(page);
  await page.screenshot({path:`${evidence}/public-phone-overview.png`});record.overviewRender=await stats(page);
  expect(await page.evaluate(()=>navigator.maxTouchPoints)).toBeGreaterThan(0);expect(errors).toEqual([]);record.status='passed';
 }finally{writeFileSync(`${evidence}/public-phone-result.json`,JSON.stringify(record,null,2));await page.goto('about:blank');await context.close();}
});
