import { test,expect } from '@playwright/test';
import { menuAction,readUniverse,launch,mark,pilotToBearing } from './flight-helper.ts';
import { regionFor,ORBIT_DETAIL_BUDGET,ORBIT_VISIBLE_BUDGET } from '../../src/shared/regions.ts';
import { spaceDistance } from '../../src/shared/flight.ts';
test.setTimeout(180000);
test('the finite Atlas filters three regions and a real flight reaches the outer survey within render budgets',async({page})=>{
  await page.setViewportSize({width:1600,height:1000});await page.goto('/');await page.getByRole('button',{name:'Let’s wander'}).click();await menuAction(page,'open-map');
  const u=await readUniverse(page);expect(u.planets.length).toBeGreaterThanOrEqual(33);
  for(const band of ['harbour','reach','frontier']){await page.locator('#region-select').selectOption(band);const ids=await page.locator('.planet-option').evaluateAll(es=>es.map(e=>(e as HTMLElement).dataset.planetId));expect(ids.length).toBeGreaterThan(0);expect(ids.every(id=>regionFor(u.planets.find(p=>p.id===id)!.slot).id===band)).toBe(true);}
  await page.screenshot({path:'docs/evidence/round-5/outer-region-atlas.png'});await page.locator('#close-map').click();await launch(page);
  const outer=u.planets.filter(p=>regionFor(p.slot).id==='frontier').sort((a,b)=>spaceDistance(a.center,u.currentPlanet.center)-spaceDistance(b.center,u.currentPlanet.center))[0];await mark(page,outer.id);
  await page.waitForTimeout(350);expect(Number(await page.locator('canvas').getAttribute('data-orbit-detailed'))).toBeLessThanOrEqual(ORBIT_DETAIL_BUDGET);expect(Number(await page.locator('canvas').getAttribute('data-orbit-visible'))).toBeLessThanOrEqual(ORBIT_VISIBLE_BUDGET);
  await pilotToBearing(page);await page.screenshot({path:'docs/evidence/round-5/outer-world-approach.png'});await page.locator('#land-ship').click();await page.getByRole('button',{name:'Land and explore'}).click();await expect(page.locator('#board-ship')).toBeVisible();expect((await readUniverse(page)).currentPlanet.id).toBe(outer.id);
});
