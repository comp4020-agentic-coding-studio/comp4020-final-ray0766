import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {openStore} from '../../src/server/store.ts';
import type {Universe} from '../../src/shared/planets.ts';

test('legacy owner previews ordinary path tiles, cancels without writes, adds and edits them in Build',async({browser})=>{
 test.setTimeout(90_000);
 const baseURL=process.env.APP_URL??'http://127.0.0.1:8128';expect(new URL(baseURL).port).toBe('8128');
 const token=readFileSync('.data/public-browser-desktop.token','utf8').trim(),id=createHash('sha256').update(token).digest('hex');
 const store=openStore(resolve('.data/home-random.sqlite'),{homeSample:true});
 try{const planet=store.db.prepare('SELECT id FROM planets WHERE owner_id=?').get(id)!;store.visit(id,String(planet.id));}finally{store.close();}
 const context=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'little_home_sample_p8128',value:token,url:baseURL,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const universe=async():Promise<Universe>=>(await page.request.get('/api/universe')).json();
 try{
  await page.goto('/?measure');if(await page.locator('#begin').isVisible())await page.locator('#begin').click();
  const before=await universe();expect(before.currentPlanet.homeManifest!.version).toBeLessThanOrEqual(2);
  await page.locator('#home-remodel summary').click();await page.locator('#home-path-preview').click();
  await expect(page.locator('#home-path-apply')).toBeEnabled();
  expect((await universe()).currentPlanet.objects).toEqual(before.currentPlanet.objects);
  await page.locator('#home-path-cancel').click();expect((await universe()).currentPlanet.objects).toEqual(before.currentPlanet.objects);
  await page.locator('#home-path-preview').click();await expect(page.locator('#home-path-apply')).toBeEnabled();
  await page.waitForTimeout(800);await page.screenshot({path:'docs/evidence/home-random/path-preview.png'});
  const previewText=await page.locator('#home-path-count').innerText();await page.locator('#home-path-apply').click();
  await expect(page.locator('#home-path-apply')).toBeHidden();
  const after=await universe(),oldIds=new Set(before.currentPlanet.objects.map(o=>o.id)),added=after.currentPlanet.objects.filter(o=>!oldIds.has(o.id));
  expect(added.length).toBeGreaterThan(0);expect(added.every(o=>o.kind==='path')).toBe(true);expect(after.currentPlanet.objects.length).toBeLessThanOrEqual(64);
  expect(after.currentPlanet.objects.filter(o=>oldIds.has(o.id))).toEqual(before.currentPlanet.objects);
  expect(after.currentPlanet.homeManifest).toEqual(before.currentPlanet.homeManifest);expect(after.player.home!.interior).toEqual(before.player.home!.interior);
  await page.reload();await expect(page.locator('#home-controls')).toBeVisible();
  expect((await universe()).currentPlanet.objects).toEqual(after.currentPlanet.objects);
  await page.locator('#open-menu').click();await page.locator('#build-mode').click();
  await page.locator('#built-list').selectOption(added[0].id);await expect(page.locator('#move-object')).toBeEnabled();
  await page.locator('#rotate-object').click();await page.locator('#save-object').click();
  await expect.poll(async()=>(await universe()).currentPlanet.objects.find(o=>o.id===added[0].id)?.version).toBe(2);
  await page.locator('#built-list').selectOption(added[0].id);await page.locator('#remove-object').click();
  await expect.poll(async()=>(await universe()).currentPlanet.objects.some(o=>o.id===added[0].id)).toBe(false);
  await page.screenshot({path:'docs/evidence/home-random/path-edited-in-build.png'});expect(errors).toEqual([]);
  writeFileSync('docs/evidence/home-random/path-browser-result.json',JSON.stringify({status:'passed',browser:await browser.version(),previewText,added:added.length,beforeObjects:before.currentPlanet.objects.length,afterObjects:after.currentPlanet.objects.length,checks:['Existing dedicated v2 test owner; original objects and manifest preserved','Preview and cancel do not write objects','Confirm creates normal Paths within 64-object budget','Reload preserves paths','Normal Build UI selects, rotates, saves and removes a new Path'],pageErrors:errors},null,2));
 }finally{await page.goto('about:blank');await context.close();}
});
