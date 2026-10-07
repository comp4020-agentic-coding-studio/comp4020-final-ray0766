import { test,expect } from '@playwright/test';
import type { BrowserContext,Page } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Vector3 } from 'three';
import { industrialCabin } from '../../src/assets/claude-geometry/blueprint/samples.ts';
import { encodeBlueprint } from '../../src/assets/claude-geometry/blueprint/codec.ts';
import type { Blueprint,PartPlacement } from '../../src/assets/claude-geometry/blueprint/model.ts';
import type { LibraryEntry } from '../../src/shared/blueprints.ts';
import { normalize } from '../../src/shared/world.ts';
import { PHYSICS_VERSION } from '../../src/shared/physics/world.ts';
import { closeVisit,launch,menuAction,openMenu,readUniverse,visit } from './flight-helper.ts';
import { frame,readFeet,walk } from './physics-helper.ts';
import { populateCapacity,sampleMainScene } from './r7-perf-helper.ts';

const evidence=process.env.R7_EVIDENCE??'docs/evidence/r7-village';
// Traces can include authenticated request headers; screenshots and the
// explicit report below are the evidence for this isolated visit instead.
test.use({trace:'off'});

async function begin(page:Page){
  await page.bringToFront();await page.goto('/?measure=1');
  await expect(page.locator('#begin')).toBeVisible();await page.locator('#begin').click();
  await ready(page);
  // Show the card in Pause immediately, without waiting for a notice to fade.
  await openMenu(page);const skip=page.getByRole('button',{name:'Skip tips',exact:true});
  await expect(skip).toBeVisible({timeout:5000});await skip.click();await page.locator('#resume').click();
}
async function ready(page:Page){
  await expect(page.locator('#scene-sync')).toContainText('Live');
  await expect.poll(async()=>Number(await page.locator('#world canvas').getAttribute('data-triangles'))).toBeGreaterThan(100);
}
async function library(page:Page):Promise<LibraryEntry[]>{return(await page.request.get('/api/blueprints')).json();}
async function workshop(page:Page){await menuAction(page,'open-workshop');await expect(page.locator('#ws-save')).toBeEnabled();}
async function builder(page:Page){if(!await page.locator('#builder').isVisible())await menuAction(page,'build-mode');await expect(page.locator('#builder')).toBeVisible();}
async function reachable(page:Page,id:string){
  const control=page.locator('#'+id);await control.scrollIntoViewIfNeeded();await expect(control).toBeVisible();
  expect(await control.evaluate(node=>{const b=node.getBoundingClientRect();return node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
}
function stairs():Blueprint{
  const parts:Omit<PartPlacement,'n'>[]=[...[1,2,3].map(z=>({part:'floor.deck' as const,x:1,z,level:0,rot:0 as const})),
    {part:'stair.straight',x:1,z:3,level:0,rot:0},{part:'structure.column',x:1,z:1,level:0,rot:2},
    {part:'roof.deck',x:1,z:1,level:1,rot:0}];
  return {id:randomUUID() as Blueprint['id'],name:'R7 stair and flat terrace',parts:parts.map((p,i)=>({...p,n:i+1})),groups:[]};
}

test('R7 village: saved ship, real travel and walking, safe previews, two visitors and phone touch',async({browser})=>{
  const target=new URL(String(test.info().project.use.baseURL));
  if(!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='8106')throw Error('Run this fixture against the temporary R7 server on port 8106, never the saved 8098 preview.');
  test.setTimeout(480_000);mkdirSync(evidence,{recursive:true});
  const contexts=new Set<BrowserContext>(),errors:string[]=[],checks:string[]=[],movementFailures:string[]=[];
  const performance:Awaited<ReturnType<typeof sampleMainScene>>[]=[],capacity:unknown[]=[];
  let lastPage:Page|undefined;
  let removalWindow:{page:Page;planetId:string;revision:number}|null=null;
  const responses:Promise<void>[]=[],sceneConflicts:{before:number;after:number;physicsVersion:number;recovered:boolean}[]=[];
  const record=(status:string,error?:unknown)=>writeFileSync(`${evidence}/integration-result.json`,JSON.stringify({
    status,checks,pageErrors:errors,movementFailures,sceneConflicts,browser:browser.version(),viewports:[{width:1920,height:1080},{width:390,height:844}],
    physicsVersion:PHYSICS_VERSION,performance,capacity,
    fixtures:'Fresh anonymous identities on the temporary server. Normal owner APIs create buildings only. Keyboard/touch controls perform every walk, takeoff, flight and landing. Identity handoff uses memory only; no cookies/storage files or traces are written.',
    capacityNote:process.env.R7_CAPACITY==='1'?'Requested at end of journey.':'Not run; set R7_CAPACITY=1 to fill the test planet to 8 custom structures / 64 objects.',
    error:error?String(error):undefined,
  },null,2)+'\n');
  const check=(message:string)=>{checks.push(message);console.log('Verified:',message);record('incomplete');};
  const observe=(page:Page)=>{
    page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().endsWith('/api/move')&&r.status()>=400){
      const stage=checks.at(-1)??'begin',window=removalWindow;
      responses.push((async()=>{
        const body=await r.json();
        if(r.status()===409&&body.error==='A newer ground position exists. Reconnect to your saved position.'&&window?.page===page){
          const current=await readUniverse(page);
          if(current.currentPlanet.id===window.planetId&&current.currentPlanet.revision>window.revision&&current.player.ground?.physicsVersion===PHYSICS_VERSION){
            sceneConflicts.push({before:window.revision,after:current.currentPlanet.revision,physicsVersion:current.player.ground.physicsVersion,recovered:false});return;
          }
        }
        movementFailures.push(`${r.status()} move after [${stage}]: ${JSON.stringify(body)}`);console.log('Movement response:',movementFailures.at(-1));
      })());
    }});
    return page;
  };
  async function close(context:BrowserContext){await closeVisit(context);contexts.delete(context);}
  async function pair(page:Page,label:string,objectId:string){
    await builder(page);await page.waitForTimeout(1600);
    const base=await sampleMainScene(page,label+' baseline');performance.push(base);
    await page.locator('#built-list').selectOption({value:objectId});await expect(page.locator('#save-object')).toBeEnabled();
    // Move the selected object's unsaved copy into the central ground view so
    // phone sampling does not accidentally measure an off-screen preview.
    await page.locator('#move-object').click();
    const viewport=page.viewportSize()!;await page.mouse.click(viewport.width*.5,viewport.height*.48);
    const ghost=await sampleMainScene(page,label+' moved-object ghost');performance.push(ghost);
    expect(new Vector3().fromArray(base.cameraPosition).distanceTo(new Vector3().fromArray(ghost.cameraPosition))).toBeLessThan(.025);
    await page.screenshot({path:`${evidence}/${label}-ghost.png`});
    page.once('dialog',dialog=>dialog.accept());await page.locator('#cancel-object').click();await expect(page.locator('#object-tools')).not.toBeVisible();
    await page.locator('#finish-building').click();
  }
  try{
    const context=await browser.newContext({viewport:{width:1920,height:1080}});contexts.add(context);
    const owner=observe(await context.newPage());lastPage=owner;await begin(owner);
    await owner.screenshot({path:`${evidence}/desktop-harbour.png`});
    await menuAction(owner,'open-shipyard');await expect(owner.locator('#sy-save')).toBeEnabled();
    const starterShapes:string[]=[];
    for(const index of [0,1,2]){
      await owner.locator('#sy-starter').selectOption({value:String(index)});await owner.waitForTimeout(450);
      const design=JSON.parse((await owner.locator('#sy-stage canvas').getAttribute('data-ship-design'))!);starterShapes.push(JSON.stringify(design.parts));
      await owner.screenshot({path:`${evidence}/desktop-ship-${index}.png`});
    }
    expect(new Set(starterShapes).size).toBe(3);
    await owner.locator('#sy-name').fill('R7 survey craft');await owner.locator('#sy-registration').fill('r7-082');
    await owner.locator('#sy-save').click();await expect(owner.locator('#sy-status')).toContainText('Saved ·');
    const ship=(await readUniverse(owner)).player.ship!,shipDocument=(await owner.locator('#sy-stage canvas').getAttribute('data-ship-design'))!;
    expect(ship.design.registration).toBe('R7-082');await owner.locator('#sy-close').click();
    await owner.reload();await ready(owner);await expect(owner.locator('#world canvas')).toHaveAttribute('data-ship-design',shipDocument);
    check('Three starter shapes render; selected private ship and registration survive refresh');

    await launch(owner);await expect(owner.locator('body')).not.toHaveClass(/departing/);
    await expect(owner.locator('#flight-hud')).toHaveAttribute('data-ship-design',shipDocument);await owner.screenshot({path:`${evidence}/desktop-flight.png`});
    const planet=await visit(owner);await expect(owner.locator('#world canvas')).toHaveAttribute('data-ship-design',shipDocument);
    expect((await readUniverse(owner)).player.ship).toEqual(ship);
    await owner.screenshot({path:`${evidence}/desktop-landing.png`});
    await menuAction(owner,'claim-planet');await expect(owner.locator('#build-mode')).toBeVisible();await owner.locator('#resume').click();
    check('Actual hub walk, boarding, keyboard flight, landing and claim retain the same craft');
    const cabinBp=industrialCabin();cabinBp.id=randomUUID() as Blueprint['id'];cabinBp.name='R7 field cabin';
    const stairBp=stairs(),fixtureIds:string[]=[];
    for(const [bp,position,rotation] of [[cabinBp,normalize([.55,1,.4]),Math.PI/2],[stairBp,normalize([-.55,1,.4]),0]] as const){
      const saved=await owner.request.post('/api/blueprints/save',{data:{document:JSON.parse(encodeBlueprint(bp)),expectedVersion:0}});
      expect(saved.ok(),await saved.text()).toBe(true);const entry:LibraryEntry=await saved.json(),objectId=randomUUID();fixtureIds.push(objectId);
      const placed=await owner.request.post('/api/objects/create',{data:{planetId:planet,objectId,kind:'structure',blueprintHash:entry.hash,position,rotation}});
      expect(placed.ok(),await placed.text()).toBe(true);
    }
    await owner.reload();await ready(owner);const u=await readUniverse(owner);
    const cabin=u.currentPlanet.objects.find(o=>o.id===fixtureIds[0])!,stair=u.currentPlanet.objects.find(o=>o.id===fixtureIds[1])!;
    const cf=frame(cabin,u.currentPlanet.blueprints![cabin.blueprintHash!]),sf=frame(stair,u.currentPlanet.blueprints![stair.blueprintHash!]);
    await walk(owner,()=>cf.at(-1.9,-1.9));await walk(owner,()=>cf.at(-1.9,1.9));await walk(owner,()=>cf.at(-.45,1.9));
    await walk(owner,f=>cf.at(-.45,0,cf.local(f).y));expect(cf.local(await readFeet(owner)).z).toBeLessThan(.25);
    await owner.screenshot({path:`${evidence}/desktop-door-inside.png`});
    await walk(owner,f=>cf.at(-.45,1.9,cf.local(f).y));await walk(owner,()=>cf.at(-1.9,1.9));await walk(owner,()=>cf.at(-1.9,-1.9));
    await walk(owner,()=>sf.at(1.1,2));await walk(owner,()=>sf.at(0,1.9));await walk(owner,f=>sf.at(0,-1.04,sf.local(f).y));
    let feet=await readFeet(owner);expect(sf.local(feet).y).toBeCloseTo(2.2,1);expect(feet.grounded).toBe(true);
    await expect.poll(async()=>(await readUniverse(owner)).player.ground!.radius).toBeCloseTo(feet.radius,2);
    await owner.screenshot({path:`${evidence}/desktop-flat-terrace.png`});await owner.reload();await ready(owner);
    feet=await readFeet(owner);expect(sf.local(feet).y).toBeCloseTo(2.2,1);expect((await readUniverse(owner)).player.ground!.physicsVersion).toBe(PHYSICS_VERSION);
    check('Village cabin uses the saved industrial blueprint: open doorway, stair climb and flat terrace height persist after refresh');

    await workshop(owner);await owner.locator('#ws-library').selectOption({value:cabinBp.id});await owner.locator('#ws-load').click();
    await owner.locator('#ws-tool').selectOption({value:'floor.deck'});await owner.locator('#ws-x').selectOption({value:'0'});await owner.locator('#ws-z').selectOption({value:'0'});
    await owner.locator('#ws-add').click();await expect(owner.locator('#ws-count')).toContainText(`${cabinBp.parts.length+1} /`);
    await owner.locator('#ws-undo').click();await expect(owner.locator('#ws-count')).toContainText(`${cabinBp.parts.length} /`);
    await owner.locator('#ws-redo').click();await owner.locator('#ws-name').fill('R7 field cabin revised');await owner.locator('#ws-save').click();
    await expect(owner.locator('#ws-status')).toContainText('Saved to your server library');await owner.screenshot({path:`${evidence}/desktop-workshop.png`});
    const revised=(await library(owner)).find(e=>e.blueprint.id===cabinBp.id)!;expect(revised.version).toBe(2);expect(revised.hash).not.toBe(cabin.blueprintHash);
    await owner.locator('#ws-close').click();await owner.reload();await ready(owner);
    expect((await library(owner)).find(e=>e.blueprint.id===cabinBp.id)).toEqual(revised);
    expect((await readUniverse(owner)).currentPlanet.objects.find(o=>o.id===cabin.id)!.blueprintHash).toBe(cabin.blueprintHash);
    await builder(owner);await owner.locator('#built-list').selectOption({value:cabin.id});await owner.locator('#rotate-object').click();
    owner.once('dialog',dialog=>dialog.accept());await owner.locator('#cancel-object').click();
    expect((await readUniverse(owner)).currentPlanet.objects.find(o=>o.id===cabin.id)).toEqual(cabin);
    await owner.locator('#built-list').selectOption({value:cabin.id});await owner.locator('#rotate-object').click();await expect(owner.locator('#save-object')).toBeEnabled();
    await owner.locator('#save-object').click();await expect(owner.locator('#object-tools')).not.toBeVisible();
    const rotated=(await readUniverse(owner)).currentPlanet.objects.find(o=>o.id===cabin.id)!;expect(rotated.version).toBe(2);
    await owner.locator('#finish-building').click();await owner.reload();await ready(owner);
    expect((await readUniverse(owner)).currentPlanet.objects.find(o=>o.id===cabin.id)).toEqual(rotated);
    check('Blueprint add/undo/redo/save/reload preserves old placed content; colony ghost cancellation and rotated save/reload both work');

    const guestContext=await browser.newContext({viewport:{width:1920,height:1080}});contexts.add(guestContext);
    const guest=observe(await guestContext.newPage());lastPage=guest;await begin(guest);await visit(guest,planet);
    await openMenu(guest);await expect(guest.locator('#planet-description')).toContainText('read-only');await expect(guest.locator('#build-mode')).not.toBeVisible();await expect(guest.locator('#open-workshop')).not.toBeVisible();
    await guest.locator('#resume').click();expect(await library(guest)).toEqual([]);
    for(const [route,data] of [
      ['objects/create',{planetId:planet,objectId:randomUUID(),kind:'lamp',position:normalize([0,1,-.6]),rotation:0}],
      ['objects/update',{planetId:planet,objectId:cabin.id,position:rotated.position,rotation:0,expectedVersion:rotated.version}],
      ['objects/delete',{planetId:planet,objectId:stair.id,expectedVersion:stair.version}],
    ] as const)expect((await guest.request.post('/api/'+route,{data})).status()).toBe(403);
    await expect(owner.locator('#world canvas')).toHaveAttribute('data-visitors','1',{timeout:10000});
    await expect(guest.locator('#world canvas')).toHaveAttribute('data-visitors','1',{timeout:10000});
    await guest.screenshot({path:`${evidence}/desktop-visitor.png`});
    await owner.bringToFront();lastPage=owner;await pair(owner,'desktop',cabin.id);
    check('Independent identity really flies here; create/update/delete are 403; both scenes show presence; desktop baseline and ghost share one stationary camera');
    await guest.bringToFront();lastPage=guest;
    await walk(guest,()=>sf.at(1.1,2));await walk(guest,()=>sf.at(0,1.9));await walk(guest,f=>sf.at(0,-1.04,sf.local(f).y));
    const guestTop=await readFeet(guest);expect(sf.local(guestTop).y).toBeCloseTo(2.2,1);
    await expect.poll(async()=>(await readUniverse(guest)).player.ground!.radius).toBeCloseTo(guestTop.radius,2);
    await guest.screenshot({path:`${evidence}/visitor-on-flat-terrace.png`});
    await owner.bringToFront();await builder(owner);await owner.locator('#built-list').selectOption({value:stair.id});
    const beforeRemoval=await readUniverse(guest);removalWindow={page:guest,planetId:planet,revision:beforeRemoval.currentPlanet.revision};
    await owner.locator('#remove-object').click();
    await expect(owner.locator('#planet-count')).toHaveText('1 / 64 objects');await owner.locator('#finish-building').click();
    await guest.bringToFront();await expect(guest.locator('#planet-count')).toHaveText('1 / 64 objects',{timeout:10000});
    await expect.poll(async()=>guestTop.radius-(await readFeet(guest)).radius,{timeout:10000}).toBeGreaterThan(1.5);
    await expect(guest.locator('#world canvas')).toHaveAttribute('data-grounded','true');
    await expect.poll(async()=>(await readUniverse(guest)).player.ground!.grounded).toBe(true);
    await Promise.all(responses);for(const conflict of sceneConflicts)conflict.recovered=true;removalWindow=null;
    await guest.screenshot({path:`${evidence}/visitor-after-support-removal.png`});
    await owner.bringToFront();await expect(owner.locator('#world canvas')).toHaveAttribute('data-grounded','true');
    await expect.poll(async()=>(await readUniverse(owner)).player.ground!.grounded).toBe(true);
    check('Owner removes occupied support through UI; visitor scene synchronises and recovers to terrain with no restored upper-floor height');
    const storage=await context.storageState();await close(guestContext);await close(context);

    const phoneContext=await browser.newContext({storageState:storage,viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.add(phoneContext);
    const phone=observe(await phoneContext.newPage());lastPage=phone;await phone.goto('/?measure=1');await ready(phone);
    await walk(phone,()=>sf.at(0,1.9),true);await expect(phone.locator('#world canvas')).toHaveAttribute('data-grounded','true');
    expect(await phone.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    await phone.screenshot({path:`${evidence}/phone-walking.png`});
    await workshop(phone);await phone.locator('#ws-library').selectOption({value:cabinBp.id});await phone.locator('#ws-load').tap();
    await phone.locator('#ws-level').selectOption({value:'1'});await reachable(phone,'ws-save');await reachable(phone,'ws-close');
    expect((await phone.locator('#ws-stage canvas').boundingBox())!.height).toBeGreaterThan(200);
    await phone.screenshot({path:`${evidence}/phone-workshop.png`});await phone.locator('#ws-close').tap();
    await menuAction(phone,'open-shipyard');await expect(phone.locator('#sy-name')).toHaveValue('R7 survey craft');
    const canvas=phone.locator('#sy-stage canvas'),bounds=(await canvas.boundingBox())!,cdp=await phoneContext.newCDPSession(phone);
    try{
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width*.35,y:bounds.y+bounds.height*.5}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bounds.x+bounds.width*.65,y:bounds.y+bounds.height*.6}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }finally{await cdp.detach();}
    await reachable(phone,'sy-save');await phone.locator('#sy-name').fill('R7 pocket surveyor');await phone.locator('#sy-save').tap();await expect(phone.locator('#sy-status')).toContainText('Saved ·');
    await phone.screenshot({path:`${evidence}/phone-shipyard.png`});await phone.locator('#sy-close').tap();await phone.reload();await ready(phone);
    expect((await readUniverse(phone)).player.ship!.design.name).toBe('R7 pocket surveyor');
    await pair(phone,'phone',cabin.id);expect(await phone.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    check('390×844 Mac touch emulation: joystick walk, reachable workshop controls, ship touch orbit/save/reload, and stationary baseline/ghost capture');

    if(process.env.R7_CAPACITY==='1'){
      await builder(phone);capacity.push(await populateCapacity(phone,revised));await phone.locator('#finish-building').click();
      await pair(phone,'phone-capacity',cabin.id);
      const capacityStorage=await phoneContext.storageState();await close(phoneContext);
      const full=await browser.newContext({storageState:capacityStorage,viewport:{width:1920,height:1080}});contexts.add(full);
      const desktop=observe(await full.newPage());lastPage=desktop;await desktop.goto('/?measure=1');await ready(desktop);await pair(desktop,'desktop-capacity',cabin.id);
      check('Normal APIs fill the unchanged 8-structure / 64-object limits; main-scene desktop and phone performance sampled with and without a selected-object ghost');
    }
    await Promise.all(responses);expect(errors).toEqual([]);expect(movementFailures).toEqual([]);expect(sceneConflicts.every(c=>c.recovered)).toBe(true);
    check('No page errors or rejected ordinary walking; any support-removal conflict requires an advanced scene revision and persisted recovery');record('passed');
  }catch(error){await lastPage?.screenshot({path:`${evidence}/integration-failure.png`}).catch(()=>{});record('failed',error);throw error;}
  finally{for(const context of contexts)await closeVisit(context).catch(()=>{});}
});
