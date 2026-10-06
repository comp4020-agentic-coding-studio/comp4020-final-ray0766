import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {menuAction,closeVisit} from './flight-helper.ts';
import {CLAUDE_ASSET_ROOT} from '../../src/shared/asset-release.ts';
const evidence='docs/evidence/r3';
test('R3 desktop and touch workshop: fixed light pools, framing, editing, disposal and compressed fallback',async({browser})=>{
 test.setTimeout(150_000);mkdirSync(evidence,{recursive:true});const errors:string[]=[],checks:string[]=[],requests:string[]=[];
 for(const mobile of [false,true]){
 const context=await browser.newContext({storageState:'.data/physics-browser-owner.json',viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/assets/claude/'))requests.push(new URL(r.url()).pathname);});
 try{
 // Exercise a single failed KTX map and its normal WebP fallback in this app.
 if(mobile)await page.route('**/scans/metal_plate/512/albedo.ktx2',route=>route.fulfill({status:404,body:'intentional fallback check'}));
 await page.goto(mobile?'/?textures=ktx2':'/');await expect(page.locator('#scene-sync')).toContainText('Live');
 const world=page.locator('#world canvas');await expect.poll(async()=>world.getAttribute('data-practical')).not.toBeNull();const pool=JSON.parse((await world.getAttribute('data-practical'))!);expect(pool.slots).toEqual({spots:2,points:2,shadows:0});
 await expect.poll(async()=>JSON.parse((await world.getAttribute('data-scan-formats'))??'[]').length).toBeGreaterThan(0);
 if(mobile){await expect(world).toHaveAttribute('data-texture-format','ktx2');await expect.poll(async()=>JSON.parse((await world.getAttribute('data-scan-formats'))??'[]')).toContain('ktx2');await expect.poll(async()=>JSON.parse((await world.getAttribute('data-scan-formats'))??'[]')).toContain('webp');}else await expect(world).toHaveAttribute('data-texture-format','webp');
 await menuAction(page,'open-workshop');await expect(page.locator('#ws-save')).toBeEnabled();
 const entries=await(await page.request.get('/api/blueprints')).json();const cabin=entries.find((e:{blueprint:{parts:{part:string}[]}})=>e.blueprint.parts.some(p=>p.part==='wall.door.open'));await page.locator('#ws-library').selectOption(cabin.blueprint.id);await page.locator('#ws-load').click();
 await page.locator('#ws-level').selectOption('1');await page.waitForTimeout(700);await page.screenshot({path:`${evidence}/${mobile?'phone':'desktop'}-workshop.png`});
 const canvas=page.locator('#ws-stage canvas');expect(JSON.parse((await canvas.getAttribute('data-practical'))!).slots).toEqual({spots:2,points:2,shadows:0});
 await page.locator('#ws-inside').click();await expect.poll(async()=>JSON.parse((await canvas.getAttribute('data-practical'))!).lit).toBeGreaterThan(0);await page.screenshot({path:`${evidence}/${mobile?'phone':'desktop'}-inside.png`});
 // Real touch on the actual canvas must select once and never activate adjacent UI.
 await page.locator('#ws-frame').click();const b=(await canvas.boundingBox())!;if(mobile){await page.touchscreen.tap(b.x+b.width*.5,b.y+b.height*.5);await expect(page.locator('#workshop')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);}
 await page.locator('#ws-level').selectOption('0');await page.locator('#ws-tool').selectOption('floor.deck');await page.locator('#ws-x').selectOption('0');await page.locator('#ws-z').selectOption('0');await page.locator('#ws-add').click();await expect(page.locator('#ws-status')).toContainText('Add Floor deck');await page.locator('#ws-undo').click();
 const handle=await canvas.elementHandle();page.once('dialog',d=>d.accept());await page.locator('#ws-close').click();await expect(page.locator('#workshop')).not.toBeVisible();await expect.poll(async()=>handle!.evaluate(c=>(c as HTMLCanvasElement).getContext('webgl2')!.isContextLost())).toBe(true);
 await menuAction(page,'open-workshop');await expect(page.locator('#ws-stage canvas')).toHaveCount(1);await page.locator('#ws-close').click();checks.push(`${mobile?'phone touch + KTX2 per-map fallback':'desktop WebP'}: medium pools, framing, edit/undo, close/reopen resource release`);
 }finally{await closeVisit(context);}
 }
 expect(errors).toEqual([]);expect(requests.some(p=>p.includes('/basis/basis_transcoder.wasm'))).toBe(true);expect(requests.every(p=>p.startsWith('/'+CLAUDE_ASSET_ROOT))).toBe(true);
 writeFileSync(`${evidence}/browser-result.json`,JSON.stringify({status:'passed',checks,pageErrors:errors,resourceNamespace:CLAUDE_ASSET_ROOT,uniqueResourceRequests:new Set(requests).size},null,2)+'\n');
});
test('colony placement ghost adds no practical-light fittings and cancel preserves the placed cabin',async({browser})=>{
 const context=await browser.newContext({storageState:'.data/physics-browser-owner.json',viewport:{width:1440,height:900}});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{await page.goto('/');await expect(page.locator('#scene-sync')).toContainText('Live');const universe=await(await page.request.get('/api/universe')).json();await menuAction(page,'build-mode');await page.waitForTimeout(900);
 const pool=async()=>JSON.parse((await page.locator('#world canvas').getAttribute('data-practical'))!);const before=await pool();await page.locator('#built-list').selectOption(universe.currentPlanet.objects[0].id);await expect(page.locator('#object-tools')).toBeVisible();await page.waitForTimeout(650);const preview=await pool();expect(preview.slots).toEqual(before.slots);expect(preview.fittingsInReach).toBe(before.fittingsInReach);
 await page.locator('#cancel-object').click();await page.locator('#finish-building').click();await page.waitForTimeout(500);expect((await(await page.request.get('/api/universe')).json()).currentPlanet.objects).toEqual(universe.currentPlanet.objects);await page.screenshot({path:`${evidence}/ghost-cleared.png`});expect(errors).toEqual([]);writeFileSync(`${evidence}/ghost-result.json`,JSON.stringify({status:'passed',before,preview,pageErrors:errors},null,2)+'\n');
 }finally{await closeVisit(context);}
});
