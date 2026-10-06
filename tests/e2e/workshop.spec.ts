import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { visit, menuAction, openMenu, readUniverse, closeVisit } from './flight-helper.ts';
import type { LibraryEntry } from '../../src/shared/blueprints.ts';
const evidence='docs/evidence/workshop-v1';
const stateFile='.data/workshop-browser-owner.json';
async function begin(page:Page){await page.goto('/');if(await page.locator('#courier-dialog').isVisible()){await page.getByRole('button',{name:'Fern A little leafy'}).click();await page.getByRole('button',{name:'Let’s wander'}).click();}await expect(page.locator('#scene-sync')).toContainText('Live');}
async function workshop(page:Page){await menuAction(page,'open-workshop');await expect(page.locator('#workshop')).toBeVisible();await expect(page.locator('#ws-save')).toBeEnabled();}
async function place(page:Page,mobile=false){await page.locator('#ws-place').click();await expect(page.locator('#builder')).toBeVisible();await page.waitForTimeout(1100);
  const points=mobile?[[295,350],[90,350],[305,425],[180,420]]:[[820,740],[1120,725],[700,620],[1230,650]];
  for(const [x,y] of points){if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);if(await page.locator('#save-object').isEnabled())break;}
  await expect(page.locator('#save-object')).toBeEnabled();await page.locator('#rotate-object').click();await expect(page.locator('#save-object')).toBeEnabled();await page.locator('#save-object').click();await expect(page.locator('#object-tools')).not.toBeVisible();
}
async function library(page:Page):Promise<LibraryEntry[]>{return(await page.request.get('/api/blueprints')).json();}

test('workshop milestone: real flight, editor, server library, placement, refresh, visitor and phone',async({browser})=>{
  test.setTimeout(480_000);mkdirSync(evidence,{recursive:true});const errors:string[]=[];const contexts:BrowserContext[]=[];const record:Record<string,unknown>={browser:'Installed Google Chrome; headed desktop and emulated phone',checks:[]};
  const check=(name:string)=>{(record.checks as string[]).push(name);console.log('Verified:',name);};
  try{
    const reuse=process.env.WORKSHOP_RESUME==='1'&&existsSync(stateFile);
    const ownerContext=await browser.newContext({viewport:{width:1920,height:1080},...(reuse?{storageState:stateFile}:{})});contexts.push(ownerContext);const owner=await ownerContext.newPage();owner.on('pageerror',e=>errors.push(e.message));await begin(owner);
    let u=await readUniverse(owner);
    if(!u.currentPlanet.mine){await visit(owner);await menuAction(owner,'claim-planet');await expect(owner.locator('#build-mode')).toBeVisible();}
    await ownerContext.storageState({path:stateFile});u=await readUniverse(owner);const planetId=u.currentPlanet.id;check('Owner landed and claimed via real controls');
    await workshop(owner);await owner.locator('#ws-name').fill('Field cabin');
    await owner.locator('#ws-parts-title').click();await owner.locator('#ws-all').click();await owner.locator('#ws-group-name').fill('Cabin shell');
    if(!await owner.locator('#ws-groups').textContent())await owner.locator('#ws-group').click();
    await expect(owner.locator('#ws-groups')).toContainText('Cabin shell');
    // Exercise Claude's actual add/support/undo/redo model through UI controls.
    await owner.locator('#ws-tool').selectOption('floor.deck');await owner.locator('#ws-x').selectOption('0');await owner.locator('#ws-z').selectOption('0');await owner.locator('#ws-add').click();
    await expect(owner.locator('#ws-status')).toContainText('Add Floor deck');await owner.locator('#ws-undo').click();await owner.locator('#ws-redo').click();await owner.locator('#ws-undo').click();
    await owner.locator('#ws-save').click();await expect(owner.locator('#ws-status')).toContainText('Saved to your server library');
    const saved=(await library(owner)).find(e=>e.blueprint.name==='Field cabin')!;expect(saved.blueprint.groups[0].name).toBe('Cabin shell');check('Named and grouped blueprint saved; add/undo/redo exercised');
    await owner.locator('#ws-clear').click();await owner.locator('#ws-tool').selectOption('select');await owner.locator('#ws-level').selectOption('1');await owner.screenshot({path:`${evidence}/desktop-workshop-l2.png`});
    await owner.locator('#ws-inside').click();await owner.waitForTimeout(500);await owner.screenshot({path:`${evidence}/desktop-cabin-interior.png`});
    // Offline save retains the dirty editor; recovery only acknowledges server data.
    await owner.locator('#ws-name').fill('Field cabin offline');await ownerContext.setOffline(true);await owner.locator('#ws-save').click();await expect(owner.locator('#ws-count')).toContainText('Unsaved');await expect(owner.locator('#ws-name')).toHaveValue('Field cabin offline');await ownerContext.setOffline(false);await owner.locator('#ws-name').fill('Field cabin');await owner.locator('#ws-save').click();await expect(owner.locator('#ws-count')).toContainText('Saved');check('Failed save retains draft; reconnect save succeeds');
    // Concurrent tab writer produces a real version conflict without throwing away the editor.
    const latest=(await library(owner))[0];const doc={format:'planet-modules/blueprint',version:1,...latest.blueprint,name:'Other tab'};
    expect((await owner.request.post('/api/blueprints/save',{data:{document:doc,expectedVersion:latest.version}})).ok()).toBe(true);
    await owner.locator('#ws-name').fill('My unsaved revision');await owner.locator('#ws-save').click();await expect(owner.locator('#ws-status')).toContainText('another tab');await expect(owner.locator('#ws-name')).toHaveValue('My unsaved revision');await expect(owner.locator('#ws-count')).toContainText('Unsaved');
    await owner.locator('#ws-copy').click();await expect(owner.locator('#ws-status')).toContainText('Saved to your server library');check('Conflict keeps draft; Save as copy recovers');
    await place(owner);const placed=(await readUniverse(owner)).currentPlanet.objects.filter(o=>o.kind==='structure');expect(placed.length).toBeGreaterThan(0);const object=placed.at(-1)!;
    await owner.screenshot({path:`${evidence}/desktop-placed.png`});await owner.locator('#finish-building').click();await owner.reload();await expect.poll(async()=>(await readUniverse(owner)).currentPlanet.objects.find(o=>o.id===object.id)).toEqual(object);
    await workshop(owner);expect((await library(owner)).some(e=>e.blueprint.groups[0]?.name==='Cabin shell')).toBe(true);await owner.locator('#ws-close').click();check('Placed object and private groups survive refresh');
    const ownerState=await ownerContext.storageState();await ownerContext.storageState({path:stateFile});await closeVisit(ownerContext);
    const visitorContext=await browser.newContext({viewport:{width:1920,height:1080}});contexts.push(visitorContext);const guest=await visitorContext.newPage();guest.on('pageerror',e=>errors.push(e.message));await begin(guest);await visit(guest,planetId);await openMenu(guest);
    await expect(guest.locator('#planet-description')).toContainText('read-only');await expect(guest.locator('#open-workshop')).not.toBeVisible();await expect(guest.locator('#build-mode')).not.toBeVisible();
    const seen=(await readUniverse(guest)).currentPlanet;expect(seen.objects.find(o=>o.id===object.id)).toEqual(object);expect(seen.blueprints?.[object.blueprintHash!].length).toBeGreaterThan(0);expect(await library(guest)).toEqual([]);
    for(const [route,body] of [['objects/create',{planetId,objectId:crypto.randomUUID(),kind:'structure',blueprintHash:object.blueprintHash,position:object.position,rotation:0}],['objects/update',{planetId,objectId:object.id,position:object.position,rotation:2,expectedVersion:object.version}],['objects/delete',{planetId,objectId:object.id,expectedVersion:object.version}]] as const)expect((await guest.request.post('/api/'+route,{data:body})).status()).toBe(403);
    await guest.screenshot({path:`${evidence}/visitor-read-only.png`});check('Independent visitor sees structure; all three edit routes reject');await closeVisit(visitorContext);
    const phoneContext=await browser.newContext({storageState:ownerState,viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(phoneContext);const phone=await phoneContext.newPage();phone.on('pageerror',e=>errors.push(e.message));await begin(phone);await workshop(phone);
    await phone.locator('#ws-level').selectOption('1');await phone.waitForTimeout(800);await phone.screenshot({path:`${evidence}/phone-workshop-l2.png`});
    const rect=await phone.locator('#ws-stage').boundingBox();expect(rect!.height).toBeGreaterThan(230);expect(await phone.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    await phone.locator('#ws-inside').tap();await phone.screenshot({path:`${evidence}/phone-cabin-interior.png`});
    await phone.locator('#ws-name').fill('Phone cabin');await phone.locator('#ws-save').tap();await expect(phone.locator('#ws-status')).toContainText('Saved to your server library');await place(phone,true);
    await phone.screenshot({path:`${evidence}/phone-placed.png`});await phone.locator('#finish-building').tap();const phoneObjects=(await readUniverse(phone)).currentPlanet.objects;await phone.reload();expect((await readUniverse(phone)).currentPlanet.objects).toEqual(phoneObjects);check('Phone L2 visible, touch save/place/refresh passed');
    expect(errors).toEqual([]);record.pageErrors=errors;record.status='passed';
  }finally{for(const c of contexts)try{await closeVisit(c);}catch{/* already closed */}writeFileSync(`${evidence}/browser-result.json`,JSON.stringify(record,null,2)+'\n');}
});

test('focused framing and lifecycle replay after server restart',async({browser})=>{
  test.skip(!existsSync(stateFile),'Run the milestone journey first to create the isolated local owner fixture.');
  const errors:string[]=[];
  for(const mobile of [false,true]){
    const context=await browser.newContext({storageState:stateFile,viewport:mobile?{width:390,height:844}:{width:1920,height:1080},isMobile:mobile,hasTouch:mobile});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    try{
      await begin(page);expect((await readUniverse(page)).currentPlanet.objects.filter(o=>o.kind==='structure').length).toBeGreaterThanOrEqual(2);expect((await library(page)).some(e=>e.blueprint.groups[0]?.name==='Cabin shell')).toBe(true);
      await workshop(page);await page.locator('#ws-level').selectOption('1');await page.waitForTimeout(350);await page.screenshot({path:`${evidence}/${mobile?'phone':'desktop'}-workshop-l2.png`});
      await page.locator('#ws-inside').click();await page.waitForTimeout(350);await page.screenshot({path:`${evidence}/${mobile?'phone':'desktop'}-cabin-interior.png`});
      const canvas=await page.locator('#ws-stage canvas').elementHandle();await page.locator('#ws-close').click();await expect(page.locator('#ws-stage canvas')).toHaveCount(0);
      expect(await canvas!.evaluate(c=>(c as HTMLCanvasElement).getContext('webgl2')!.isContextLost())).toBe(true);
      await workshop(page);await expect(page.locator('#ws-stage canvas')).toHaveCount(1);await page.locator('#ws-close').click();await expect(page.locator('#ws-stage canvas')).toHaveCount(0);
    }finally{await closeVisit(context);}
  }
  expect(errors).toEqual([]);writeFileSync(`${evidence}/focused-result.json`,JSON.stringify({status:'passed',checks:['Server restart retains both structures and grouped library','Desktop and 390×844 L2/interior camera screenshots','Close releases WebGL context; reopen creates one canvas','No page errors'],pageErrors:errors},null,2)+'\n');
});
