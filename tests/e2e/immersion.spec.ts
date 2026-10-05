import { test,expect } from '@playwright/test';
import { walkToPort,readUniverse,visit,openMenu } from './flight-helper.ts';
import { HUB_DOCK } from '../../src/shared/ports.ts';
import { distance } from '../../src/shared/world.ts';
test.setTimeout(240000);
for(const phone of [false,true])test(`${phone?'phone touch':'desktop'} walks to a physical gate, cancels, explores and returns to its beacon`,async({browser})=>{
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1600,height:1000},hasTouch:phone,isMobile:phone}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'Let’s wander'}).click();await expect(page.locator('#board-ship')).not.toBeVisible();await expect(page.locator('#planet-card')).not.toBeVisible();
  expect((await page.request.post('/api/flight/takeoff',{data:{planetId:'hub',journey:0}})).status()).toBe(409);
  await page.keyboard.press('e');await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.screenshot({path:`docs/evidence/round-6/${phone?'phone':'desktop'}-street.png`});
  await walkToPort(page,phone);await page.screenshot({path:`docs/evidence/round-6/${phone?'phone':'desktop'}-boarding-gate.png`});
  if(phone)await page.locator('#board-ship').tap();else await page.keyboard.press('e');await expect(page.locator('#flight-dialog')).toBeVisible();
  await page.waitForTimeout(500); // Let the last pre-dialog movement checkpoint finish.
  const before=(await readUniverse(page)).player.position;await page.keyboard.down('w');await page.waitForTimeout(350);await page.keyboard.up('w');expect(distance(before,(await readUniverse(page)).player.position)).toBeLessThan(.02);
  await page.keyboard.press('Escape');await expect(page.locator('#flight-dialog')).not.toBeVisible();expect((await readUniverse(page)).player.flight.mode).toBe('ground');
  await page.reload();await expect(page.locator('#board-ship')).toBeVisible();const target=await visit(page);const landed=await readUniverse(page);expect(landed.currentPlanet.objects).toEqual([]);
  await expect(page.locator('#board-ship')).toBeVisible();await expect(page.locator('#planet-card')).not.toBeVisible();
  await page.screenshot({path:`docs/evidence/round-6/${phone?'phone':'desktop'}-return-beacon.png`});
  await page.keyboard.down('s');await page.waitForTimeout(850);await page.keyboard.up('s');await expect(page.locator('#board-ship')).not.toBeVisible();await walkToPort(page,phone);
  await openMenu(page);await page.waitForTimeout(500);const paused=(await readUniverse(page)).player.position;await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');expect(distance(paused,(await readUniverse(page)).player.position)).toBeLessThan(.05);await page.locator('#resume').click();
  await visit(page,'hub');expect((await readUniverse(page)).currentPlanet.id).toBe('hub');expect(distance((await readUniverse(page)).player.position,HUB_DOCK)).toBeLessThan(.05);await expect(page.locator('#board-ship')).toBeVisible();
  expect((await readUniverse(page)).planets.find(p=>p.id===target)?.objectCount).toBe(0);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(phone?390:1600);await context.close();
});
