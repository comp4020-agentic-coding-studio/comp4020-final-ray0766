import { test, expect } from '@playwright/test';
test('desktop first view',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'Let’s wander'}).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#npc-mica')).toBeVisible();
  await page.waitForTimeout(1500);await page.screenshot({path:'docs/evidence/round-4/desktop-initial.png'});
  expect(errors).toEqual([]);
});
test('phone first view',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');await page.getByRole('button',{name:'Let’s wander'}).click();
  await page.waitForTimeout(1500);await page.screenshot({path:'docs/evidence/round-4/mobile-initial.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
