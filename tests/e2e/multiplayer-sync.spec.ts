import { test,expect } from '@playwright/test';
import type { BrowserContext,Page } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Vector3 } from 'three';
import { visit,claimAndBuild,readUniverse,closeVisit,menuAction,openMenu } from './flight-helper.ts';
import { readFeet,frame,walk } from './physics-helper.ts';
import { normalize } from '../../src/shared/world.ts';
import { industrialCabin } from '../../src/assets/claude-geometry/blueprint/samples.ts';
import { encodeBlueprint } from '../../src/assets/claude-geometry/blueprint/codec.ts';
const evidence=process.env.MULTIPLAYER_EVIDENCE??'docs/evidence/multiplayer-sync';
test.use({trace:'off'});
async function begin(page:Page){await page.goto('/');await page.getByRole('button',{name:'Let’s wander'}).click();await expect(page.locator('#scene-sync')).toContainText('Live');}
async function rendered(page:Page){await expect.poll(async()=>Number(await page.locator('#world canvas').getAttribute('data-triangles'))).toBeGreaterThan(100);}
test('two fresh identities sync owner moves, removed support, reconnect, and isolated visits',async({browser})=>{
  test.setTimeout(420_000);mkdirSync(evidence,{recursive:true});
  const contexts:BrowserContext[]=[],errors:string[]=[],checks:string[]=[];
  const record=(status:string,error?:unknown)=>writeFileSync(`${evidence}/result.json`,JSON.stringify({status,checks,pageErrors:errors,error:error?String(error):undefined,browser:browser.version(),viewport:{width:1920,height:1080},fixtures:'Two fresh browser identities; owned fixtures only; normal APIs create the stair blueprint; movement, object move/delete and flight use real controls. No storageState or cookies saved.'},null,2)+'\n');
  const check=(value:string)=>{checks.push(value);console.log('Verified:',value);record('incomplete');};
  let visitor:Page|undefined;
  try{
    const ownerContext=await browser.newContext({viewport:{width:1920,height:1080}}),visitorContext=await browser.newContext({viewport:{width:1920,height:1080}});contexts.push(ownerContext,visitorContext);
    const owner=await ownerContext.newPage();visitor=await visitorContext.newPage();for(const page of [owner,visitor])page.on('pageerror',e=>errors.push(e.message));
    await begin(owner);await begin(visitor);await expect(owner.locator('#world canvas')).toHaveAttribute('data-visitors','1',{timeout:8000});
    await visitorContext.setOffline(true);await expect(owner.locator('#world canvas')).toHaveAttribute('data-visitors','0',{timeout:9000});await visitorContext.setOffline(false);
    await expect(visitor.locator('#scene-sync')).toContainText('Live',{timeout:8000});await expect(owner.locator('#world canvas')).toHaveAttribute('data-visitors','1',{timeout:8000});check('Fresh owner/visitor presence expires offline and reconnects');
    const planet=await visit(owner);await claimAndBuild(owner);await expect(owner.locator('#world canvas')).toHaveAttribute('data-visitors','0');
    await visit(visitor,planet);await expect(owner.locator('#world canvas')).toHaveAttribute('data-visitors','1',{timeout:8000});await rendered(visitor);
    await openMenu(visitor);await expect(visitor.locator('#planet-description')).toContainText('read-only');await expect(visitor.locator('#build-mode')).not.toBeVisible();await visitor.locator('#resume').click();
    await owner.getByRole('button',{name:'Add lamp',exact:true}).click();await owner.mouse.click(820,740);await expect(owner.locator('#save-object')).toBeEnabled();await owner.locator('#save-object').click();await expect(visitor.locator('#planet-count')).toHaveText('1 / 64 objects',{timeout:8000});
    const original=(await readUniverse(owner)).currentPlanet.objects[0];await owner.locator('#built-list').selectOption(original.id);await owner.locator('#move-object').click();await owner.mouse.click(1130,755);await expect(owner.locator('#save-object')).toBeEnabled();await owner.locator('#save-object').click();
    await expect.poll(async()=>(await readUniverse(owner)).currentPlanet.objects[0].version).toBe(2);const moved=(await readUniverse(owner)).currentPlanet;
    expect(new Vector3(...moved.objects[0].position).distanceTo(new Vector3(...original.position))).toBeGreaterThan(.05);await expect(visitor.locator('#planet-card')).toHaveAttribute('data-revision',String(moved.revision),{timeout:8000});await rendered(visitor);
    await menuAction(visitor,'view-mode');await visitor.screenshot({path:`${evidence}/visitor-moved-building.png`});await menuAction(visitor,'view-mode');check('Owner moves a saved lamp with real build controls; visitor scene revision and visible world update');
    await owner.locator('#built-list').selectOption(original.id);await owner.locator('#remove-object').click();await expect(visitor.locator('#planet-count')).toHaveText('0 / 64 objects',{timeout:8000});
    const bp=industrialCabin();bp.id=randomUUID() as typeof bp.id;bp.name='Multiplayer support fixture';bp.parts=[
      {part:'floor.deck',x:1,z:1,level:0,rot:0,n:1},{part:'floor.deck',x:1,z:2,level:0,rot:0,n:2},{part:'floor.deck',x:1,z:3,level:0,rot:0,n:3},
      {part:'stair.straight',x:1,z:3,level:0,rot:0,n:4},{part:'structure.column',x:1,z:1,level:0,rot:2,n:5},{part:'floor.deck',x:1,z:1,level:1,rot:0,n:6},
    ];
    const saved=await owner.request.post('/api/blueprints/save',{data:{document:JSON.parse(encodeBlueprint(bp)),expectedVersion:0}});expect(saved.ok()).toBe(true);const entry=await saved.json(),objectId=randomUUID();
    const placed=await owner.request.post('/api/objects/create',{data:{planetId:planet,objectId,kind:'structure',blueprintHash:entry.hash,position:normalize([-.55,1,.4]),rotation:0}});expect(placed.ok()).toBe(true);
    await expect(visitor.locator('#planet-count')).toHaveText('1 / 64 objects',{timeout:8000});const u=await readUniverse(visitor),stairs=u.currentPlanet.objects[0],f=frame(stairs,u.currentPlanet.blueprints![stairs.blueprintHash!]);
    await walk(visitor,()=>f.at(1.1,2));await walk(visitor,()=>f.at(0,1.9));await walk(visitor,feet=>f.at(0,-1.04,f.local(feet).y));
    const top=await readFeet(visitor);expect(f.local(top).y).toBeCloseTo(2.2,1);await visitor.screenshot({path:`${evidence}/visitor-supported.png`});
    expect((await visitor.request.post('/api/objects/delete',{data:{planetId:planet,objectId,expectedVersion:1}})).status()).toBe(403);
    await owner.locator('#built-list').selectOption(objectId);await owner.locator('#remove-object').click();await expect(visitor.locator('#planet-count')).toHaveText('0 / 64 objects',{timeout:8000});
    await expect.poll(async()=>top.radius-(await readFeet(visitor!)).radius,{timeout:8000}).toBeGreaterThan(1.5);await expect(visitor.locator('#world canvas')).toHaveAttribute('data-grounded','true');await rendered(visitor);await visitor.screenshot({path:`${evidence}/visitor-after-support-removal.png`});
    check('Visitor walks onto upper floor; owner removes it with real controls; visitor falls and lands on terrain; visitor delete remains forbidden');
    await visit(visitor,'hub');await expect(owner.locator('#world canvas')).toHaveAttribute('data-visitors','0',{timeout:8000});await expect(visitor.locator('#world canvas')).toHaveAttribute('data-visitors','0',{timeout:8000});expect((await readUniverse(owner)).currentPlanet.id).toBe(planet);expect((await readUniverse(visitor)).currentPlanet.id).toBe('hub');check('Real return flight leaves both planets with isolated presence');
    expect(errors).toEqual([]);record('passed');
  }catch(error){await visitor?.screenshot({path:`${evidence}/failure.png`}).catch(()=>{});record('failed',error);throw error;}
  finally{for(const context of contexts)await closeVisit(context).catch(()=>{});}
});
