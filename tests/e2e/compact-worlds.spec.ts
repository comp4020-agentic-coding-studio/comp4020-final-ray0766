import {test,expect} from '@playwright/test';
import type {Page,BrowserContext} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {industrialCabin} from '../../src/assets/claude-geometry/blueprint/samples.ts';
import {encodeBlueprint} from '../../src/shared/blueprint-codec.ts';
import type {Blueprint} from '../../src/shared/blueprint-model.ts';
import {NPCS,SPAWN,normalize,distance} from '../../src/shared/world.ts';
import {HUB_DOCK} from '../../src/shared/ports.ts';
import {menuAction,openMenu,readUniverse,visit,closeVisit,launch} from './flight-helper.ts';
import {frame,readFeet,walk} from './physics-helper.ts';
import {sampleMainScene} from './r7-perf-helper.ts';

const evidence='docs/evidence/compact-worlds';
test.use({trace:'off'});
async function ready(page:Page){
 await expect(page.locator('#scene-sync')).toContainText('Live');
 if(await page.locator('#begin').isVisible())await page.locator('#begin').click();
 await openMenu(page);const skip=page.getByRole('button',{name:'Skip tips',exact:true});if(await skip.isVisible())await skip.click();await page.locator('#resume').click();
 await expect.poll(async()=>Number(await page.locator('#world canvas').getAttribute('data-triangles'))).toBeGreaterThan(100);
 await page.waitForTimeout(650);
}
test('compact public village, persisted upgrade, and metre-sized building/walking on two planet radii',async({browser})=>{
 if(!String(test.info().project.use.baseURL).endsWith(':8110'))throw Error('Only use the isolated compact test server on 8110.');
 test.setTimeout(600_000);mkdirSync(evidence,{recursive:true});
 const contexts=new Set<BrowserContext>(),checks:string[]=[],errors:string[]=[],movementFailures:string[]=[],samples:unknown[]=[];
 let upgraded:ReturnType<typeof spawn>|undefined,last:Page|undefined;
 const report=(status:string,error?:unknown)=>writeFileSync(`${evidence}/result.json`,JSON.stringify({status,browser:browser.version(),checks,errors,movementFailures,samples,error:error?String(error):undefined,
  routesMetres:{spawnMica:distance(SPAWN,NPCS.mica.position,14),micaSol:distance(NPCS.mica.position,NPCS.sol.position,14),solDock:distance(NPCS.sol.position,HUB_DOCK,14),spawnDock:distance(SPAWN,HUB_DOCK,14)},
  fixtures:'Isolated SQLite copies and new anonymous sessions. Normal owner APIs create buildings; real keyboard/touch performs travel and walking. Cookies remain in memory. 390px is desktop Chrome touch emulation. Capacity benchmark not rerun.'},null,2)+'\n');
 const check=(s:string)=>{checks.push(s);console.log('Verified:',s);report('incomplete');};
 const context=async(touch=false)=>{const c=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1440,height:900},hasTouch:touch,isMobile:touch});contexts.add(c);return c;};
 const page=async(c:BrowserContext)=>{last=await c.newPage();last.on('pageerror',e=>errors.push(e.message));last.on('response',r=>{if(r.url().endsWith('/api/move')&&r.status()>=400)movementFailures.push(String(r.status()));});return last;};
 const close=async(c:BrowserContext)=>{await closeVisit(c);contexts.delete(c);};
 const shot=async(p:Page,name:string)=>{await p.waitForTimeout(800);await p.screenshot({path:`${evidence}/${name}.png`});};
 try{
  // An old session made through the unchanged f2a350a UI returns through v11.
  const oldContext=await context(),old=await page(oldContext);await old.goto('http://127.0.0.1:8111/?measure=1');await ready(old);
  await menuAction(old,'open-shipyard');await old.locator('#sy-name').fill('Before compact worlds');await old.locator('#sy-registration').fill('OLD-014');await old.locator('#sy-save').click();await expect(old.locator('#sy-status')).toContainText('Saved ·');await old.locator('#sy-close').click();
  const before=await(await old.request.get('http://127.0.0.1:8111/api/state')).json();
  await shot(old,'before-hub-close');await menuAction(old,'view-mode');await shot(old,'before-hub-overview');
  execFileSync('python3',['-c',"import sqlite3;s=sqlite3.connect('file:.data/compact-upgrade-v10.sqlite?mode=ro',uri=True);d=sqlite3.connect('.data/compact-upgraded.sqlite');s.backup(d);d.close();s.close()"]);
  upgraded=spawn(process.execPath,['src/server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:'8112',HOST:'127.0.0.1',DATABASE_PATH:'.data/compact-upgraded.sqlite'},stdio:['ignore','pipe','pipe']});let logs='';upgraded.stdout?.on('data',v=>logs+=v);upgraded.stderr?.on('data',v=>logs+=v);
  await expect.poll(async()=>{try{return(await fetch('http://127.0.0.1:8112/healthz')).status;}catch{return 0;}}).toBe(200);
  await old.goto('http://127.0.0.1:8112/?measure=1');await ready(old);const after=await(await old.request.get('http://127.0.0.1:8112/api/state')).json();
  for(const key of ['character','quest','position','ship','deliveries'])expect(after[key]).toEqual(before[key]);expect(after.worldRadius).toBe(14);expect(logs).toContain('consistent backup');
  await shot(old,'after-hub-close');await menuAction(old,'view-mode');await shot(old,'after-hub-overview');
  await old.setViewportSize({width:390,height:844});await shot(old,'after-hub-phone-overview');await menuAction(old,'view-mode');await shot(old,'after-hub-phone-close');expect(await old.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  check('Schema10 browser identity keeps coat, parcel, deliveries, position and custom ship; comparable spawn close/overview views render at 1440px and 390px');await close(oldContext);upgraded.kill('SIGTERM');upgraded=undefined;
  for(const radius of [11,12]){
   const c=await context(),p=await page(c);await p.goto('/?measure=1');await ready(p);
   if(radius===11){
    samples.push(await sampleMainScene(p,'compact hub walking view'));
    await walk(p,()=>NPCS.mica.position);await expect(p.locator('#interact')).toBeVisible();await p.locator('#interact').click();await expect.poll(async()=>(await readUniverse(p)).player.quest).toBe('carrying');
    await walk(p,()=>SPAWN);await walk(p,()=>NPCS.sol.position);await p.locator('#interact').click();await expect.poll(async()=>(await readUniverse(p)).player.quest).toBe('delivered');await shot(p,'hub-delivery');
    await walk(p,()=>HUB_DOCK);check('Actual keys walk the short public pickup → delivery → boarding route without movement rejections');
   }
   const target=(await readUniverse(p)).planets.find(w=>w.kind==='garden'&&w.radius===radius&&!w.claimed)!;expect(target).toBeTruthy();
   await launch(p);await shot(p,`radius-${radius}-flight`);await visit(p,target.id);expect((await readUniverse(p)).currentPlanet.radius).toBe(radius);await shot(p,`radius-${radius}-landing`);
   await menuAction(p,'claim-planet');await p.locator('#resume').click();
   const bp=industrialCabin();bp.id=randomUUID() as Blueprint['id'];bp.name=`Compact ${radius} m cabin`;
   const saved=await p.request.post('/api/blueprints/save',{data:{document:JSON.parse(encodeBlueprint(bp)),expectedVersion:0}});expect(saved.ok(),await saved.text()).toBe(true);const entry=await saved.json(),objectId=randomUUID();
   const placed=await p.request.post('/api/objects/create',{data:{planetId:target.id,objectId,kind:'structure',blueprintHash:entry.hash,position:normalize([.55,1,.4]),rotation:Math.PI/2}});expect(placed.ok(),await placed.text()).toBe(true);
   await p.reload();await ready(p);const u=await readUniverse(p),object=u.currentPlanet.objects.find(o=>o.id===objectId)!,cf=frame(object,u.currentPlanet.blueprints![object.blueprintHash!],radius);
   await menuAction(p,'build-mode');await p.locator('#built-list').selectOption(objectId);await expect(p.locator('#save-object')).toBeEnabled();await shot(p,`radius-${radius}-build-overview`);await p.locator('#cancel-object').click();await p.locator('#finish-building').click();
   await walk(p,()=>cf.at(-1.9,-1.9));await walk(p,()=>cf.at(-1.9,1.9));await walk(p,()=>cf.at(-.45,1.9));await walk(p,f=>cf.at(-.45,0,cf.local(f).y));expect(cf.local(await readFeet(p)).z).toBeLessThan(.25);
   await shot(p,`radius-${radius}-cabin-inside`);await walk(p,f=>cf.at(-.45,1.9,cf.local(f).y));
   const oldFeet=await readFeet(p);await expect.poll(async()=>(await readUniverse(p)).player.ground!.radius).toBeCloseTo(oldFeet.radius,2);await p.reload();await ready(p);expect((await readUniverse(p)).currentPlanet.radius).toBe(radius);expect((await readUniverse(p)).currentPlanet.objects.find(o=>o.id===objectId)).toEqual(object);
   samples.push(await sampleMainScene(p,`radius ${radius} cabin walking view`));await shot(p,`radius-${radius}-close`);await menuAction(p,'view-mode');await shot(p,`radius-${radius}-overview`);await menuAction(p,'view-mode');
   const phoneContext=await context(true);await phoneContext.addCookies(await c.cookies());await p.goto('about:blank');const phone=await page(phoneContext);await phone.goto('/?measure=1');await ready(phone);
   await walk(phone,()=>cf.at(-1.9,1.9),true);expect(await phone.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await shot(phone,`radius-${radius}-phone`);samples.push(await sampleMainScene(phone,`radius ${radius} phone walking view`));
   await close(phoneContext);await close(c);check(`${radius} m actual flight/landing, owner building, door/interior walking, refresh and 390px joystick retain metre-sized geometry`);
  }
  expect(errors).toEqual([]);expect(movementFailures).toEqual([]);report('passed');
 }catch(e){await last?.screenshot({path:`${evidence}/failure.png`}).catch(()=>{});report('failed',e);throw e;}
 finally{for(const c of contexts)await closeVisit(c);upgraded?.kill('SIGTERM');}
});
