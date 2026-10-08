import {test,expect} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {PlacedObject} from '../../src/shared/planets.ts';
import type {BlueprintContents,LibraryEntry} from '../../src/shared/blueprints.ts';
import {activate,begin,hostContext,integrationUrl,measureAction,menu,rendererContext,universe} from '../../scripts/integration-browser-helpers.ts';

/** A synthetic or authorised copied identity supplied by the data audit owner.
 * No DB handles, source database paths, fixture mutation or secret evidence. */
interface LegacyBrowserFixture {
 baseURL:string;
 provenance:{sourceCommit:string;synthetic:boolean;databaseIsIsolatedCopy:boolean};
 cookie:{name:string;value:string};
 expected:{currentPlanetId:string;ownedPlanetId:string|null;character:string;quest:string;deliveries:number;radius:number;environment:string|null;objects:PlacedObject[];blueprints?:BlueprintContents;library:LibraryEntry[]};
}
for(const touch of [false,true])test(`integration legacy read preservation: ${touch?'390 touch':'desktop'}`,async({browser})=>{
 test.setTimeout(90000);
 const baseURL=integrationUrl(),fixturePath=process.env.INTEGRATION_LEGACY_FIXTURE;
 expect(fixturePath,'Supply an independently prepared 8130 legacy cookie + expected-state fixture.').toBeTruthy();
 const fixture=JSON.parse(readFileSync(fixturePath!,'utf8')) as LegacyBrowserFixture;
 expect(new URL(fixture.baseURL).origin).toBe(baseURL);expect(fixture.provenance.databaseIsIsolatedCopy).toBe(true);expect(fixture.provenance.sourceCommit).toBeTruthy();
 expect(fixture.cookie.value).toMatch(/^[a-f0-9]{64}$/);expect(fixture.expected.objects.length).toBeGreaterThan(0);expect(fixture.expected.library.length).toBeGreaterThan(0);
 const evidence=process.env.INTEGRATION_EVIDENCE??'docs/evidence/integration';mkdirSync(evidence,{recursive:true});
 const name=touch?'legacy-touch-390':'legacy-desktop',context=await browser.newContext({baseURL,viewport:touch?{width:390,height:844}:{width:1440,height:1000},isMobile:touch,hasTouch:touch,locale:'en-US'});
 await context.addCookies([{...fixture.cookie,url:baseURL,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage(),errors:string[]=[],writes:string[]=[],samples:Record<string,unknown>[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{const url=new URL(request.url());if(request.method()==='POST'&&url.pathname.startsWith('/api/'))writes.push(url.pathname);});
 const report:Record<string,unknown>={status:'failed',baseURL,browser:'Installed Google Chrome via Playwright channel chrome',browserVersion:browser.version(),host:hostContext(),provenance:fixture.provenance,expectedObjectCount:fixture.expected.objects.length,expectedBlueprintCount:fixture.expected.library.length,samples,pageErrors:errors,writeRoutes:writes,fixtureMeaning:'Authorised isolated legacy fixture only. Identity token and private labels are never written to evidence. UI only opens/closes editor and changes the camera; no content is edited.'};
 async function assertPreserved(){
  const u=await universe(page),expected=fixture.expected;
  expect(u.currentPlanet.id).toBe(expected.currentPlanetId);expect(u.ownedPlanetId).toBe(expected.ownedPlanetId);expect(u.player.character).toBe(expected.character);expect(u.player.quest).toBe(expected.quest);expect(u.player.deliveries).toBe(expected.deliveries);
  expect(u.currentPlanet.radius).toBe(expected.radius);expect(u.currentPlanet.environment??null).toBe(expected.environment);expect(u.currentPlanet.objects).toEqual(expected.objects);
  if(expected.blueprints)expect(u.currentPlanet.blueprints).toEqual(expected.blueprints);
  const response=await page.request.get('/api/blueprints');expect(response.status()).toBe(200);expect(await response.json()).toEqual(expected.library);
 }
 try{
  await begin(page,touch);await assertPreserved();report.renderer=await rendererContext(page);
  await measureAction(page,'legacy-loaded-close-view',samples,async()=>{await page.waitForTimeout(800);});await page.screenshot({path:join(evidence,`${name}-close.png`)});
  await measureAction(page,'legacy-overview-and-ordinary-editor-open',samples,async()=>{
   await menu(page,'#view-mode',touch);await page.waitForTimeout(900);await page.screenshot({path:join(evidence,`${name}-overview.png`)});await menu(page,'#view-mode',touch);
   await menu(page,'#build-mode',touch);
   const oldStructure=fixture.expected.objects.find(o=>o.kind==='structure'&&fixture.expected.library.some(e=>e.hash===o.blueprintHash));expect(oldStructure).toBeTruthy();
   await page.locator('#built-list').selectOption(oldStructure!.id);await activate(page,'#edit-structure',touch);await expect(page.locator('#workshop')).toBeVisible();
   const entry=fixture.expected.library.find(e=>e.hash===oldStructure!.blueprintHash)!;await expect(page.locator('#ws-name')).toHaveValue(entry.blueprint.name);await expect(page.locator('#ws-count')).toContainText(`${entry.blueprint.parts.length} / 120`);
   await page.screenshot({path:join(evidence,`${name}-workshop.png`)});await activate(page,'#ws-close',touch);await expect(page.locator('#workshop')).not.toBeVisible();
  });
  await assertPreserved();await page.reload();await expect.poll(async()=>Number(await page.locator('#world canvas').getAttribute('data-triangles'))).toBeGreaterThan(100);await assertPreserved();
  const forbidden=writes.filter(route=>/objects\/|blueprints\/save|home\/(save|remodel|undo|paths\/apply|setup\/confirm)|terrain\/apply/.test(route));expect(forbidden).toEqual([]);expect(errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(touch?390:1440);report.status='passed';report.preserved=['coat','quest and deliveries','existing planet radius and terrain','object IDs, transforms and versions','blueprint content hashes','private blueprint names/groups'];
 }catch(error){report.error=String(error);await page.screenshot({path:join(evidence,`${name}-failure.png`)}).catch(()=>undefined);throw error;}
 finally{writeFileSync(join(evidence,`${name}-result.json`),JSON.stringify(report,null,2)+'\n');await page.goto('about:blank').catch(()=>undefined);await context.close();}
});
