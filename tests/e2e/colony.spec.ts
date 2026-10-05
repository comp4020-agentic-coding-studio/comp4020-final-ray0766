import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Universe } from '../../src/shared/planets.ts';
import { visit } from './flight-helper.ts';
test.setTimeout(240_000);
async function begin(page:Page){await page.goto('/');await page.getByRole('button',{name:'Fern A little leafy'}).click();await page.getByRole('button',{name:'Let’s wander'}).click();await expect(page.locator('#scene-sync')).toContainText('Live');}
async function read(page:Page):Promise<Universe>{return (await page.request.get('/api/universe')).json();}
async function add(page:Page,kind:string,x:number,y:number,count:number){
  await page.getByRole('button',{name:`Add ${kind}`,exact:true}).click();await page.mouse.click(x,y);
  await expect(page.locator('#save-object')).toBeEnabled();await page.getByRole('button',{name:'Place object',exact:true}).click();
  await expect(page.locator('#planet-count')).toHaveText(`${count} / 64 objects`);
}
test('two independent owners build, save, visit read-only and see live scene revisions',async({browser})=>{
  const a=await browser.newContext({viewport:{width:1920,height:1080}}),b=await browser.newContext({viewport:{width:1920,height:1080}});
  const owner=await a.newPage(),guest=await b.newPage();const errors:string[]=[];for(const page of [owner,guest])page.on('pageerror',e=>errors.push(e.message));
  await begin(owner);await begin(guest);const p1=await visit(owner);
  await expect(owner.locator('#planet-count')).toHaveText('0 / 64 objects');
  await owner.getByRole('button',{name:'Make this my planet'}).click();await expect(owner.locator('#builder')).toBeVisible();
  await owner.screenshot({path:'docs/evidence/round-4/desktop-empty-builder.png'});
  await visit(guest,p1);await expect(guest.locator('#planet-description')).toContainText('read-only');await expect(guest.locator('#build-mode')).not.toBeVisible();await expect(guest.locator('#claim-planet')).not.toBeVisible();
  await add(owner,'cottage',820,740,1);
  await expect(guest.locator('#planet-count')).toHaveText('1 / 64 objects',{timeout:5000});
  let placed=(await read(owner)).currentPlanet.objects[0];
  await owner.getByLabel('Select a saved object').selectOption(placed.id);
  await owner.getByRole('button',{name:'Rotate'}).click();await owner.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(async()=>(await read(owner)).currentPlanet.objects[0].rotation).toBeCloseTo(Math.PI/4);
  await expect(guest.locator('#planet-card')).toHaveAttribute('data-revision',String((await read(owner)).currentPlanet.revision),{timeout:5000});
  await owner.getByLabel('Select a saved object').selectOption(placed.id);await owner.getByRole('button',{name:'Move',exact:true}).click();await owner.mouse.click(1130,755);
  await expect(owner.locator('#save-object')).toBeEnabled();await owner.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(async()=>(await read(owner)).currentPlanet.objects[0].version).toBe(3);
  await add(owner,'tree',740,710,2);await add(owner,'flowers',895,810,3);
  await expect(guest.locator('#planet-count')).toHaveText('3 / 64 objects',{timeout:5000});
  await owner.mouse.click(687,672);await expect(owner.locator('#build-selection')).toHaveText('Tree');await owner.getByRole('button',{name:'Cancel',exact:true}).click();await expect(owner.locator('#built-list')).toHaveValue('');
  await owner.screenshot({path:'docs/evidence/round-4/desktop-built.png'});await guest.screenshot({path:'docs/evidence/round-4/visitor-read-only.png'});
  await owner.getByRole('button',{name:'Done building'}).click();await owner.reload();await expect(owner.locator('#planet-count')).toHaveText('3 / 64 objects');await expect(owner.locator('#build-mode')).toBeVisible();
  const p2=await visit(owner);await expect(owner.locator('#claim-planet')).not.toBeVisible();await expect(owner.locator('#ownership-note')).toBeVisible();
  await visit(guest,p2);await guest.getByRole('button',{name:'Make this my planet'}).click();await expect(guest.locator('#builder')).toBeVisible();
  await guest.getByRole('button',{name:'Done building'}).click();await visit(guest,p1);
  await visit(owner,p1);await owner.getByRole('button',{name:'Build on my planet'}).click();
  placed=(await read(owner)).currentPlanet.objects[0];await owner.getByLabel('Select a saved object').selectOption(placed.id);await owner.getByRole('button',{name:'Remove',exact:true}).click();
  await expect(guest.locator('#planet-count')).toHaveText('2 / 64 objects',{timeout:5000});
  await owner.getByRole('button',{name:'Done building'}).click();await owner.getByRole('button',{name:'Atlas'}).click();await owner.screenshot({path:'docs/evidence/round-4/star-map.png'});
  const saved=await a.storageState();await a.close();const returned=await browser.newContext({storageState:saved,viewport:{width:1920,height:1080}});const again=await returned.newPage();await again.goto('/');await expect(again.locator('#build-mode')).toBeVisible();await expect(again.locator('#planet-count')).toHaveText('2 / 64 objects');
  expect(errors).toEqual([]);await returned.close();await b.close();
});
test('phone touch builds without moving the courier, recovers offline, and edits saved objects',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();
  await begin(page);await visit(page);await page.getByRole('button',{name:'Make this my planet'}).click();await expect(page.locator('#builder')).toBeVisible();
  await page.waitForTimeout(1200); // Let the close-to-overview camera transition finish before choosing a screen point.
  await page.screenshot({path:'docs/evidence/round-4/phone-empty-builder.png'});
  const before=(await read(page)).player.position;
  await page.getByRole('button',{name:'Add tree',exact:true}).click();await page.touchscreen.tap(295,350);await expect(page.locator('#save-object')).toBeEnabled();
  await page.getByRole('button',{name:'Place object',exact:true}).click();await expect(page.locator('#planet-count')).toHaveText('1 / 64 objects');
  await page.keyboard.down('w');await page.waitForTimeout(400);await page.keyboard.up('w');expect((await read(page)).player.position).toEqual(before);
  await expect(page.locator('#joystick')).not.toBeVisible();
  const item=(await read(page)).currentPlanet.objects[0];await page.getByLabel('Select a saved object').selectOption(item.id);await page.getByRole('button',{name:'Rotate'}).click();
  await context.setOffline(true);await expect(page.locator('#scene-sync')).toContainText('Offline',{timeout:5000});await expect(page.locator('#save-object')).toBeDisabled();
  await context.setOffline(false);await expect(page.locator('#scene-sync')).toContainText('Live',{timeout:5000});await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(async()=>(await read(page)).currentPlanet.objects[0].version).toBe(2);
  await expect(page.locator('#object-tools')).not.toBeVisible();
  await expect(page.locator('#built-list')).toHaveValue('');
  await page.screenshot({path:'docs/evidence/round-4/phone-built.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button',{name:'Done building'}).click();await expect(page.locator('#joystick')).toBeVisible();await page.reload();await expect(page.locator('#planet-count')).toHaveText('1 / 64 objects');await context.close();
});
test('a failed initial identity request recovers the star map without reloading',async({page})=>{
  await page.route('**/api/state',route=>route.abort());await page.goto('/');await expect(page.locator('#save-status')).toContainText('Offline');
  await page.unroute('**/api/state');await expect(page.locator('#planet-name')).toHaveText('Sunseed Harbour',{timeout:7000});
  await page.getByRole('button',{name:'Atlas'}).click();await expect(page.locator('#star-map')).toBeVisible();await expect(page.locator('.planet-option').first()).toContainText('Sunseed Harbour');
});
test('a stale owner tab cannot overwrite a newer edit and can select the object again',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1920,height:1080}}),first=await context.newPage();
  await begin(first);await visit(first);await first.getByRole('button',{name:'Make this my planet'}).click();await first.waitForTimeout(1200);await add(first,'cottage',820,740,1);
  const id=(await read(first)).currentPlanet.objects[0].id;
  await first.getByLabel('Select a saved object').selectOption(id);await first.getByRole('button',{name:'Rotate'}).click();
  const second=await context.newPage();await second.goto('/');await second.getByRole('button',{name:'Build on my planet'}).click();await second.getByLabel('Select a saved object').selectOption(id);
  await second.getByRole('button',{name:'Rotate'}).click();await second.getByRole('button',{name:'Rotate'}).click();await second.getByRole('button',{name:'Save changes',exact:true}).click();await expect(second.locator('#object-tools')).not.toBeVisible();
  await first.getByRole('button',{name:'Save changes',exact:true}).click();await expect(first.locator('#notice')).toContainText('another tab');await expect(first.locator('#object-tools')).not.toBeVisible();await expect(first.locator('#built-list')).toHaveValue('');
  const saved=(await read(first)).currentPlanet.objects[0];expect(saved.version).toBe(2);expect(saved.rotation).toBeCloseTo(Math.PI/2);
  await first.getByLabel('Select a saved object').selectOption(id);await expect(first.locator('#build-selection')).toHaveText('Cottage');await context.close();
});
