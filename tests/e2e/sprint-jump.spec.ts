import {test,expect} from '@playwright/test';
import type {BrowserContext,Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {distance,normalize} from '../../src/shared/world.ts';
import {PHYSICS_VERSION} from '../../src/shared/physics/world.ts';
import {industrialCabin} from '../../src/assets/claude-geometry/blueprint/samples.ts';
import type {Blueprint,PartPlacement} from '../../src/shared/blueprint-model.ts';
import {encodeBlueprint} from '../../src/shared/blueprint-codec.ts';
import {closeVisit,launch,menuAction,openMenu,readUniverse,visit} from './flight-helper.ts';
import {frame,readFeet,walk} from './physics-helper.ts';

const evidence='docs/evidence/sprint-jump';
test.use({trace:'off'});
async function ready(p:Page){
 await expect(p.locator('#scene-sync')).toContainText('Live');
 if(await p.locator('#begin').isVisible())await p.locator('#begin').click();
 await openMenu(p);const skip=p.getByRole('button',{name:'Skip tips',exact:true});if(await skip.isVisible())await skip.click();await p.locator('#resume').click();
 await expect.poll(async()=>Number(await p.locator('#world canvas').getAttribute('data-triangles'))).toBeGreaterThan(100);
 await p.waitForTimeout(650);
}
async function sample(p:Page,remote=false,ms=1500){return p.locator('#world canvas').evaluate(async(node,args)=>{
 const rows:{radius:number;grounded:boolean}[]=[],start=performance.now(),c=node as HTMLElement;
 await new Promise<void>(resolve=>{const tick=()=>{const radii=JSON.parse(c.dataset.visitorRadii??'[]') as number[];rows.push({radius:args.remote?Math.max(0,...radii):Number(c.dataset.feetRadius),grounded:c.dataset.grounded==='true'});if(performance.now()-start<args.ms)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
 return {peak:Math.max(...rows.map(r=>r.radius)),last:rows.at(-1)!,takeoffs:rows.reduce((n,r,i)=>n+Number(!r.grounded&&(i===0||rows[i-1].grounded)),0),frames:rows.length};
 },{remote,ms});}

test('real controls sprint and jump on public/private spheres, collide safely and persist across refresh',async({browser})=>{
 if(!String(test.info().project.use.baseURL).endsWith(':8113'))throw Error('Use the isolated 8113 test server.');
 test.setTimeout(420000);mkdirSync(evidence,{recursive:true});const contexts=new Set<BrowserContext>(),errors:string[]=[],rejectedMoves:unknown[]=[],checks:string[]=[],measurements:Record<string,unknown>={};let last:Page|undefined;
 const pending:Promise<void>[]=[];
 const report=(status:string,error?:unknown)=>writeFileSync(`${evidence}/browser-result.json`,JSON.stringify({status,browser:browser.version(),checks,errors,rejectedMoves,measurements,physicsVersion:PHYSICS_VERSION,error:error?String(error):undefined,
  fixtures:'Fresh anonymous test sessions on isolated SQLite. Ordinary owner APIs create two fixture buildings. All travel, walking, sprint and jump use actual Chrome keyboard/touch. Blur handler is explicitly dispatched; no storage state, cookie or trace files are saved. 390px is desktop touch emulation.'},null,2)+'\n');
 const check=(s:string)=>{checks.push(s);console.log('Verified:',s);report('incomplete');};
 const context=async(phone=false)=>{const c=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1440,height:900},hasTouch:phone,isMobile:phone});contexts.add(c);return c;};
 const page=async(c:BrowserContext)=>{last=await c.newPage();last.setDefaultTimeout(15000);last.on('pageerror',e=>errors.push(e.message));last.on('response',r=>{if(r.url().endsWith('/api/move')&&r.status()>=400)pending.push((async()=>{rejectedMoves.push({stage:checks.at(-1),status:r.status(),error:(await r.json()).error});})());});return last;};
 const close=async(c:BrowserContext)=>{await closeVisit(c);contexts.delete(c);};
 try{
  const c=await context(),p=await page(c);await p.goto('/?measure=1');await ready(p);
  const vc=await context(),v=await page(vc);await v.goto('/?measure=1');await ready(v);await expect.poll(async()=>Number(await v.locator('#world canvas').getAttribute('data-visible-visitors'))).toBeGreaterThan(0);
  await p.bringToFront();const remote=sample(v,true),local=sample(p);await p.keyboard.down('Space');await p.waitForTimeout(320);await p.keyboard.down('Space');await p.screenshot({path:`${evidence}/public-jump.png`});await p.waitForTimeout(1100);await p.keyboard.up('Space');
  const jump=await local,seen=await remote;measurements.publicJump=jump;measurements.visitorPeak=seen.peak;expect(jump.peak-14).toBeGreaterThan(1);expect(jump.peak-14).toBeLessThan(1.15);expect(jump.takeoffs).toBe(1);expect(jump.last.grounded).toBe(true);expect(seen.peak).toBeGreaterThan(14.45);await close(vc);
  check('Space rises and lands once while held/repeated; a second identity visibly receives authoritative jump height');

  const start=await readFeet(p);await p.keyboard.down('w');await p.waitForTimeout(1200);const walking=await readFeet(p);await p.keyboard.down('Shift');await p.waitForTimeout(1200);const running=await readFeet(p);await p.keyboard.up('w');await p.keyboard.up('Shift');await p.waitForTimeout(500);
  const walked=distance(start.position,walking.position,14),ran=distance(walking.position,running.position,14);measurements.speed={walked,ran,intervalMs:1200};expect(ran).toBeGreaterThan(walked*1.3);expect(ran).toBeLessThan(walked*1.9);
  await p.keyboard.down('Shift');await p.keyboard.down('w');await p.waitForTimeout(150);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await p.keyboard.up('w');await p.keyboard.up('Shift');await p.waitForTimeout(500);const stopped=await readFeet(p);await p.waitForTimeout(450);expect(distance(stopped.position,(await readFeet(p)).position,14)).toBeLessThan(.02);await expect(p.locator('#world canvas')).toHaveAttribute('data-sprinting','false');
  await menuAction(p,'open-shipyard');const beforeInput=await readFeet(p);await p.locator('#sy-name').fill('Input');await p.locator('#sy-name').press('Space');await p.locator('#sy-name').press('Shift+A');await expect(p.locator('#sy-name')).toHaveValue('Input A');await p.waitForTimeout(300);expect((await readFeet(p)).radius).toBeCloseTo(beforeInput.radius,5);p.once('dialog',d=>d.accept());await p.locator('#sy-close').click();await expect(p.locator('#sy-close')).not.toBeVisible();
  check('Shift increases measured travel, release/blur stop sprint, and Space/Shift type normally in a modal input');

  const target=(await readUniverse(p)).planets.find(w=>w.kind==='garden'&&w.radius===12&&!w.claimed)!;
  await launch(p);await expect(p.locator('body')).not.toHaveClass(/departing/);const flying=(await readUniverse(p)).player.flight;await p.keyboard.press('Shift+Space');await p.waitForTimeout(450);const untouched=(await readUniverse(p)).player.flight;expect(untouched.mode).toBe('space');expect(untouched.position).toEqual(flying.position);expect(untouched.speed).toBe(0);
  await visit(p,target.id);const runJump=sample(p);await p.keyboard.down('Shift');await p.keyboard.down('w');await p.keyboard.press('Space');await p.waitForTimeout(1050);await p.keyboard.up('w');await p.keyboard.up('Shift');const movingJump=await runJump;measurements.movingJump=movingJump;expect(movingJump.peak).toBeGreaterThan(13);expect(movingJump.last.grounded).toBe(true);await menuAction(p,'claim-planet');await p.locator('#resume').click();
  const cabin=industrialCabin();cabin.id=randomUUID() as Blueprint['id'];cabin.name='Jump ceiling cabin';
  const parts:PartPlacement[]=[...[1,2,3].map((z,i)=>({part:'floor.deck' as const,x:1,z,level:0,rot:0 as const,n:i+1})),{part:'stair.straight',x:1,z:3,level:0,rot:0,n:4},{part:'structure.column',x:1,z:1,level:0,rot:2,n:5},{part:'roof.deck',x:1,z:1,level:1,rot:0,n:6}];
  const stair:Blueprint={...cabin,id:randomUUID() as Blueprint['id'],name:'Jump terrace',parts};const ids:string[]=[];
  for(const [bp,position,yaw] of [[cabin,normalize([.55,1,.4]),Math.PI/2],[stair,normalize([-.55,1,.4]),0]] as const){
   const saved=await p.request.post('/api/blueprints/save',{data:{document:JSON.parse(encodeBlueprint(bp)),expectedVersion:0}});expect(saved.ok(),await saved.text()).toBe(true);const entry=await saved.json(),id=randomUUID();ids.push(id);
   const placed=await p.request.post('/api/objects/create',{data:{planetId:target.id,objectId:id,kind:'structure',blueprintHash:entry.hash,position,rotation:yaw}});expect(placed.ok(),await placed.text()).toBe(true);
  }
  await p.reload();await ready(p);const u=await readUniverse(p),a=u.currentPlanet.objects.find(o=>o.id===ids[0])!,b=u.currentPlanet.objects.find(o=>o.id===ids[1])!,cf=frame(a,u.currentPlanet.blueprints![a.blueprintHash!],12),sf=frame(b,u.currentPlanet.blueprints![b.blueprintHash!],12);
  await walk(p,()=>cf.at(-1.9,-1.9));await walk(p,()=>cf.at(-1.9,1.9));await walk(p,()=>cf.at(-.45,1.9));await walk(p,f=>cf.at(-.45,0,cf.local(f).y));
  const floor=(await readFeet(p)).radius,ceiling=sample(p);await p.keyboard.press('Space');const bumped=await ceiling;measurements.ceiling={floor,...bumped};expect(bumped.peak-floor).toBeGreaterThan(.1);expect(bumped.peak-floor).toBeLessThan(.7);expect(bumped.last.grounded).toBe(true);await p.screenshot({path:`${evidence}/private-ceiling.png`});
  await walk(p,f=>cf.at(-.45,1.9,cf.local(f).y));await walk(p,()=>cf.at(-1.9,1.9));await walk(p,()=>cf.at(-1.9,-1.9));await walk(p,()=>sf.at(1.1,2));await walk(p,()=>sf.at(0,1.9));await walk(p,f=>sf.at(0,-1.04,sf.local(f).y));
  expect(sf.local(await readFeet(p)).y).toBeCloseTo(2.2,1);const roof=(await readFeet(p)).radius,rooftop=sample(p);await p.keyboard.down('Space');await p.waitForTimeout(340);await p.screenshot({path:`${evidence}/roof-jump.png`});await p.keyboard.up('Space');const roofJump=await rooftop;measurements.roof={roof,...roofJump};expect(roofJump.peak-roof).toBeGreaterThan(1);expect(roofJump.last.radius).toBeCloseTo(roof,3);expect(roofJump.last.grounded).toBe(true);
  check('Actual flight ignores ground shortcuts; 12 m cabin ceiling stops ascent and the existing stairs/flat roof support jumping and landing');

  await p.keyboard.down('Space');await expect.poll(async()=>(await readUniverse(p)).player.ground!.radius,{intervals:[50]}).toBeGreaterThan(roof+.6);await p.keyboard.up('Space');
  const restored=p.waitForResponse(r=>r.url().endsWith('/api/state')&&r.request().method()==='GET');await p.reload();const recovered=await(await restored).json();expect(recovered.ground.grounded).toBe(false);expect(recovered.ground.radius).toBeGreaterThan(roof+.6);expect(recovered.ground.physicsVersion).toBe(PHYSICS_VERSION);await ready(p);await expect.poll(async()=>(await readFeet(p)).grounded).toBe(true);expect(sf.local(await readFeet(p)).y).toBeCloseTo(2.2,1);
  const pc=await context(true);await pc.addCookies(await c.cookies());await p.goto('about:blank');const phone=await page(pc);await phone.goto('/?measure=1');await ready(phone);await walk(phone,()=>sf.at(0,1.9),true);expect(await phone.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);expect((await readFeet(phone)).grounded).toBe(true);await phone.screenshot({path:`${evidence}/phone-stair-return.png`});
  check('Reload resumes the saved airborne state and lands on the same roof; 390px joystick still descends the staircase');
  await Promise.all(pending);expect(errors).toEqual([]);expect(rejectedMoves).toEqual([]);report('passed');
 }catch(e){await last?.screenshot({path:`${evidence}/failure.png`}).catch(()=>{});await Promise.all(pending);report('failed',e);throw e;}
 finally{for(const c of contexts)await closeVisit(c);}
});
