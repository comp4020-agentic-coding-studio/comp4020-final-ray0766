import { test, expect } from '@playwright/test';
import { walkToPort, launch, mark, pilotToBearing, readUniverse, visit } from './flight-helper.ts';
test.setTimeout(180000);
test('a real flight survives refresh, cancels transitions and lands with server checks',async({page,browser})=>{
  await page.setViewportSize({width:1440,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'Let’s wander'}).click();
  await walkToPort(page);await page.getByRole('button',{name:'Board your ship'}).click();await page.getByRole('button',{name:'Stay here'}).click();expect((await readUniverse(page)).player.flight.mode).toBe('ground');
  await launch(page);const target=(await readUniverse(page)).player.flight.targetId!;await mark(page,target);
  await page.keyboard.down('w');await page.waitForTimeout(1000);await page.keyboard.up('w');await page.keyboard.down('s');await page.waitForTimeout(500);await page.keyboard.up('s');await page.waitForTimeout(550);
  const saved=(await readUniverse(page)).player.flight;expect(saved.speed).toBe(0);await page.reload();await expect(page.locator('#flight-hud')).toBeVisible();expect((await readUniverse(page)).player.flight).toEqual(saved);
  const bad=await page.request.post('/api/flight/land',{data:{planetId:target,journey:saved.journey}});expect(bad.status()).toBe(409);
  expect((await page.request.post('/api/planets/visit',{data:{planetId:target}})).status()).toBe(410);
  await page.screenshot({path:'docs/evidence/round-5/desktop-flight.png'});
  await pilotToBearing(page);await page.locator('#land-ship').click();await page.getByRole('button',{name:'Stay here'}).click();expect((await readUniverse(page)).player.flight.mode).toBe('space');
  await page.locator('#land-ship').click();await page.getByRole('button',{name:'Land and explore'}).click();await expect(page.locator('#flight-hud')).not.toBeVisible();expect((await readUniverse(page)).currentPlanet.id).toBe(target);
  await page.screenshot({path:'docs/evidence/round-5/desktop-landed.png'});
  const persisted=await page.context().storageState();const restored=await browser.newContext({storageState:persisted});const again=await restored.newPage();await again.goto('/');await expect(again.locator('#planet-name')).toHaveText((await readUniverse(page)).currentPlanet.name);expect((await readUniverse(again)).player.flight.mode).toBe('ground');await restored.close();expect(errors).toEqual([]);
});
test('phone flight uses touch thrust and steering, freezes offline and reconnects before landing',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();await page.goto('/');await page.getByRole('button',{name:'Let’s wander'}).click();await launch(page);
  await expect(page.locator('#flight-stick')).toBeVisible();await expect(page.locator('#ship-thrust')).toBeVisible();
  const client=await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:324,y:723,id:1}]});await page.waitForTimeout(650);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>Number(await page.locator('#ship-speed').textContent())).toBeGreaterThan(2);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:77,y:715,id:1}]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:104,y:695,id:1}]});await page.waitForTimeout(300);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.screenshot({path:'docs/evidence/round-5/phone-flight.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await context.setOffline(true);await expect(page.locator('#save-status')).toContainText('Offline',{timeout:7000});await page.waitForTimeout(160);const stopped=await page.locator('#flight-hud').getAttribute('data-position');await page.waitForTimeout(500);expect(await page.locator('#flight-hud').getAttribute('data-position')).toBe(stopped);
  await context.setOffline(false);await expect(page.locator('#save-status')).toContainText('saved',{timeout:7000});const u=await readUniverse(page);await visit(page,u.player.flight.targetId!);await page.screenshot({path:'docs/evidence/round-5/phone-landed.png'});await context.close();
});
