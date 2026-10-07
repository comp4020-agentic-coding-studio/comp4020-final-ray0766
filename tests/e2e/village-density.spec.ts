import type {Page} from '@playwright/test';
import type {Vec3} from '../../src/shared/world.ts';
import {Vector3} from 'three';
import {readFeet,walk} from './physics-helper.ts';
import {PUBLIC_BLUEPRINTS,PUBLIC_HASHES,HUB_LOTS} from '../../src/shared/public-village.ts';
import {SPAWN,NPCS,distance} from '../../src/shared/world.ts';
import {HUB_DOCK} from '../../src/shared/ports.ts';
import {GroundWorld} from '../../src/shared/physics/world.ts';
import {localToDir} from '../../src/assets/claude-geometry/core/anchor.ts';
import {encodeBlueprint} from '../../src/assets/claude-geometry/blueprint/codec.ts';
import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {closeVisit,openMenu,menuAction,readUniverse,visit,walkToPort} from './flight-helper.ts';
import {sampleMainScene} from './r7-perf-helper.ts';
const dir='docs/evidence/village-density';test.use({trace:'off'});
// Pulse real keys near narrow doors, waiting for momentum and the 10 Hz
// telemetry before the next correction. Avoid a test-driver overshoot at plinth edges.
async function creep(p:Page,target:Vec3){for(let i=0;i<180;i++){
 const f=await readFeet(p),up=new Vector3(...f.position),to=new Vector3(...target),d=up.angleTo(to)*14;if(d<.065)return;
 const direction=to.projectOnPlane(up).normalize(),turn=Math.atan2(up.dot(new Vector3().crossVectors(f.north,direction)),f.north.dot(direction));
 if(Math.abs(turn)>.025){const a=Math.max(-.6,Math.min(.6,turn));await p.mouse.move(850,450);await p.mouse.down();await p.mouse.move(850-a/.004,450,{steps:2});await p.mouse.up();}
 if(Math.abs(turn)<.35){await p.keyboard.down('w');await p.waitForTimeout(Math.min(55,Math.max(12,d*45)));await p.keyboard.up('w');}
 await p.waitForTimeout(180);
 }throw Error('Precision keyboard path stalled '+JSON.stringify(await readFeet(p)));}

test('same spawn camera increased density and rendering counters',async({browser})=>{
 if(!String(test.info().project.use.baseURL).endsWith(':8115'))throw Error('Use isolated 8115.');test.setTimeout(90000);mkdirSync(dir,{recursive:true});const c=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900}}),p=await c.newPage(),errors:string[]=[],samples:unknown[]=[];
 p.on('pageerror',e=>errors.push(e.message));try{await p.goto('/?measure=1');await p.locator('#begin').click();await openMenu(p);const skip=p.getByRole('button',{name:'Skip tips',exact:true});if(await skip.isVisible())await skip.click();await p.locator('#resume').click();await p.waitForTimeout(900);if(await skip.isVisible())await skip.click();
 for(const size of [{width:1440,height:900},{width:390,height:844}]){await p.setViewportSize(size);await p.waitForTimeout(1200);samples.push(await sampleMainScene(p,`after ${size.width} close`));await p.screenshot({path:`${dir}/after-${size.width}-close.png`});await menuAction(p,'view-mode');await p.waitForTimeout(1000);samples.push(await sampleMainScene(p,`after ${size.width} overview`));await p.screenshot({path:`${dir}/after-${size.width}-overview.png`});await menuAction(p,'view-mode');}
 expect(errors).toEqual([]);writeFileSync(`${dir}/after.json`,JSON.stringify({baseCommit:'7dc0b017d1df16a9686ddc3a09af49f2f65cecb4',counts:JSON.parse((await p.locator('#world canvas').getAttribute('data-public-counts'))!),browser:browser.version(),samples,errors},null,2)+'\n');}finally{await closeVisit(c);}
});

test('real walking, room jumps, delivery, boarding and player-workshop reproduction',async({browser})=>{
 test.setTimeout(420000);if(!String(test.info().project.use.baseURL).endsWith(':8115'))throw Error('Use isolated 8115.');
 const c=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900}}),p=await c.newPage(),errors:string[]=[],rejectedMoves:{status:number;error:string;stage:string}[]=[],pending:Promise<void>[]=[],checks:string[]=[],measurements:Record<string,unknown>={};
 p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().endsWith('/api/move')&&r.status()>=400)pending.push((async()=>{rejectedMoves.push({status:r.status(),error:(await r.json()).error,stage:checks.at(-1)??'central rooms'});})());});
 const report=(status:string,error?:unknown)=>writeFileSync(`${dir}/journey.json`,JSON.stringify({status,browser:browser.version(),checks,errors,rejectedMoves,measurements,error:error?String(error):undefined,fixture:'Fresh identity on isolated 8115 SQLite. Real keyboard/mouse walking and flight. Normal blueprint save API followed by actual Workshop UI loading; no test teleport. 390px touch is Mac emulation.'},null,2)+'\n');
 const check=(text:string)=>{checks.push(text);console.log('Verified:',text);report('incomplete');};
 try{
  await p.goto('/?measure=1');await p.locator('[data-character="fern"]').click();await p.locator('#begin').click();await openMenu(p);const skip=p.getByRole('button',{name:'Skip tips',exact:true});if(await skip.isVisible())await skip.click();await p.locator('#resume').click();await p.waitForTimeout(800);
  const start=await readFeet(p);await p.keyboard.down('Shift');await p.keyboard.down('w');await p.waitForTimeout(550);await p.keyboard.up('w');await p.keyboard.up('Shift');await p.waitForTimeout(500);measurements.sprintMetres=distance(start.position,(await readFeet(p)).position,14);expect(measurements.sprintMetres as number).toBeGreaterThan(1.4);await walk(p,()=>SPAWN);
  const lot=HUB_LOTS[2]; // flat public field has baseRadius 14
  const at=(x:number,z:number)=>localToDir({dir:lot.object.position,yaw:lot.object.rotation},14,[x,0,z]);
  await creep(p,at(0,2.6));await creep(p,at(0,1));await creep(p,at(-2,1));await creep(p,at(-2,-1));
  const floor=(await readFeet(p)).radius;await p.keyboard.down('Space');await p.waitForTimeout(230);await p.keyboard.up('Space');await p.waitForTimeout(1200);expect((await readFeet(p)).grounded).toBe(true);expect((await readFeet(p)).radius).toBeCloseTo(floor,2);await p.screenshot({path:`${dir}/central-room.png`});
  const camera=await p.locator('#world canvas').evaluate(e=>({...((e as HTMLElement).dataset)}));const w=new GroundWorld({id:'hub',radius:14,revision:0,objects:[]}),head=new Vector3(...JSON.parse(camera.cameraHead!)),eye=new Vector3(...JSON.parse(camera.cameraPosition!));expect(w.cameraDistance(head,eye)).toBeGreaterThanOrEqual(head.distanceTo(eye)-.12);measurements.room={feet:await readFeet(p),cameraClippedDistance:head.distanceTo(eye)};
  await creep(p,at(-2,1));await creep(p,at(0,1));await creep(p,at(1,1));await creep(p,at(1,-1));await creep(p,at(1,1));await creep(p,at(0,1));await creep(p,at(0,2.6));await walk(p,()=>SPAWN);check('Central paired rooms are entered/exited through real open doors; wall-adjacent jump lands and camera boom stays clear');
  await walk(p,()=>NPCS.mica.position);await p.locator('#interact').click();await expect.poll(async()=>(await readUniverse(p)).player.quest).toBe('carrying');let replay=await p.request.post('/api/interact',{data:{action:'pickup'}});expect(replay.ok()).toBe(true);expect((await replay.json()).quest).toBe('carrying');await p.screenshot({path:`${dir}/post-lane.png`});await walk(p,()=>SPAWN);await walk(p,()=>NPCS.sol.position);await p.locator('#interact').click();await expect.poll(async()=>(await readUniverse(p)).player.quest).toBe('delivered');replay=await p.request.post('/api/interact',{data:{action:'deliver'}});expect(replay.ok()).toBe(true);expect((await replay.json()).deliveries).toBe(1);await p.screenshot({path:`${dir}/orchard.png`});
  await p.reload();await expect.poll(async()=>(await readUniverse(p)).player.quest).toBe('delivered');expect((await readUniverse(p)).player.character).toBe('fern');await p.waitForTimeout(700);await walk(p,()=>HUB_DOCK);await expect(p.locator('#board-ship')).toBeVisible();check('Both NPC routes and port reachable; pickup/delivery replay is idempotent; reload preserves character and delivery');
  await p.locator('.minimal-bar .language-select').selectOption('zh');await expect(p.locator('html')).toHaveAttribute('lang','zh-CN');await p.screenshot({path:`${dir}/port-zh.png`});await p.locator('.minimal-bar .language-select').selectOption('en');
  await visit(p);await menuAction(p,'claim-planet');await p.locator('#resume').click();const hashes:string[]=[];
  for(const bp of PUBLIC_BLUEPRINTS){const r=await p.request.post('/api/blueprints/save',{data:{document:JSON.parse(encodeBlueprint(bp)),expectedVersion:0}});expect(r.ok(),await r.text()).toBe(true);hashes.push((await r.json()).hash);}
  expect(hashes).toEqual(PUBLIC_HASHES);await menuAction(p,'open-workshop');await expect(p.locator('#ws-save')).toBeEnabled();
  for(const [i,bp]of PUBLIC_BLUEPRINTS.entries()){await p.locator('#ws-library').selectOption(bp.id);await p.locator('#ws-load').click();await expect(p.locator('#ws-name')).toHaveValue(bp.name);await expect(p.locator('#ws-parts option')).toHaveCount(bp.parts.length);await expect(p.locator('#ws-status')).not.toContainText('Cannot');await p.waitForTimeout(700);await p.screenshot({path:`${dir}/workshop-${['garden','loft','port'][i]}.png`});}
  check('All three public combinations pass ordinary server blueprint validation, retain identical hashes and load visibly in the player Workshop');await p.locator('#ws-close').click();
  await p.setViewportSize({width:390,height:844});await p.locator('.minimal-bar .language-select').selectOption('zh');await p.waitForTimeout(800);expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await p.reload();await expect(p.locator('html')).toHaveAttribute('lang','zh-CN');await p.waitForTimeout(800);expect((await readUniverse(p)).player.quest).toBe('delivered');check('390px Chinese layout and persisted character/quest still work after private-world flight');
  await Promise.all(pending);expect(errors).toEqual([]);expect(rejectedMoves).toEqual([]);report('passed');
 }catch(e){await p.screenshot({path:`${dir}/journey-failure.png`}).catch(()=>{});report('failed',e);throw e;}finally{await closeVisit(c);}
 const phone=await browser.newContext({locale:'en-US',viewport:{width:390,height:844},hasTouch:true,isMobile:true}),q=await phone.newPage();try{await q.goto('/');await q.locator('#begin').click();await openMenu(q);const skip=q.getByRole('button',{name:'Skip tips',exact:true});if(await skip.isVisible())await skip.click();await q.locator('#resume').click();await walkToPort(q,true);await expect(q.locator('#board-ship')).toBeVisible();await q.screenshot({path:`${dir}/phone-port-touch.png`});check('390px actual touch joystick crosses the new public village to the boarding point');report('passed');}finally{await closeVisit(phone);}
});
