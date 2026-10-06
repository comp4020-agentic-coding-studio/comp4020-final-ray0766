import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {menuAction,closeVisit,launch,visit,readUniverse} from './flight-helper.ts';
const evidence='docs/evidence/ships';
test('saved ship stays identical through refresh, real flight, landing, reconnect and touch editing',async({browser})=>{
 test.setTimeout(210_000);mkdirSync(evidence,{recursive:true});const errors:string[]=[],checks:string[]=[];
 const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();page.setDefaultTimeout(15_000);page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.goto('/');await expect(page.locator('#begin')).toBeVisible();await page.locator('#begin').click();await expect(page.locator('#scene-sync')).toContainText('Live');
 await menuAction(page,'open-shipyard');await expect(page.locator('#sy-save')).toBeEnabled();await page.locator('#sy-starter').selectOption('1');await page.locator('#sy-name').fill('Survey Hauler');await page.locator('#sy-registration').fill('sv-218');await page.locator('#sy-save').click();await expect(page.locator('#sy-status')).toContainText('Saved ·');
 const document=(await page.locator('#sy-stage canvas').getAttribute('data-ship-design'))!;const saved=(await readUniverse(page)).player.ship!;expect(saved.design.name).toBe('Survey Hauler');expect(saved.design.registration).toBe('SV-218');
 await expect(page.locator('#world canvas')).toHaveAttribute('data-ship-design',document);await expect(page.locator('#flight-hud')).toHaveAttribute('data-ship-design',document);await page.screenshot({path:`${evidence}/desktop-workshop.png`});
 // A dropped save response leaves the draft in the editor and the acknowledged craft unchanged.
 await page.route('**/api/ship/save',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Intentional save failure check.'})}));
 await page.locator('#sy-name').fill('Unsaved draft');await page.locator('#sy-save').click();await expect(page.locator('#sy-status')).toContainText('Your changes remain here');await expect(page.locator('#sy-name')).toHaveValue('Unsaved draft');await expect(page.locator('#world canvas')).toHaveAttribute('data-ship-design',document);
 await page.unroute('**/api/ship/save');page.once('dialog',d=>d.accept());await page.locator('#sy-reload').click();await expect(page.locator('#sy-name')).toHaveValue('Survey Hauler');
 const handle=await page.locator('#sy-stage canvas').elementHandle();await page.locator('#sy-close').click();await expect.poll(async()=>handle!.evaluate(c=>(c as HTMLCanvasElement).getContext('webgl2')!.isContextLost())).toBe(true);
 await page.reload();await expect(page.locator('#world canvas')).toHaveAttribute('data-ship-design',document);checks.push('server save, normalized registration, failed-save recovery, released preview context, refresh');
 await launch(page);await expect(page.locator('body')).not.toHaveClass(/departing/);await expect(page.locator('#flight-hud')).toHaveAttribute('data-ship-design',document);await page.screenshot({path:`${evidence}/flight.png`});
 await page.reload();await expect(page.locator('#flight-hud')).toBeVisible();await expect(page.locator('#flight-hud')).toHaveAttribute('data-ship-design',document);
 const target=await visit(page);await expect(page.locator('#world canvas')).toHaveAttribute('data-ship-design',document);await page.screenshot({path:`${evidence}/landed.png`});expect((await readUniverse(page)).player.ship).toEqual(saved);
 await context.storageState({path:'.data/ship-browser-owner.json'});checks.push('real controls: board, launch, refresh in flight, fly to bearing, land with same design');
 writeFileSync(`${evidence}/desktop-result.json`,JSON.stringify({status:'passed',checks,landedPlanet:target,shipVersion:saved.version,pageErrors:errors},null,2)+'\n');
 }finally{await closeVisit(context);}
 const mobile=await browser.newContext({storageState:'.data/ship-browser-owner.json',viewport:{width:390,height:844},isMobile:true,hasTouch:true});const phone=await mobile.newPage();phone.setDefaultTimeout(15_000);phone.on('pageerror',e=>errors.push(e.message));
 try{
 await phone.goto('/');await expect(phone.locator('#scene-sync')).toContainText('Live');await menuAction(phone,'open-shipyard');await expect(phone.locator('#sy-name')).toHaveValue('Survey Hauler');const canvas=phone.locator('#sy-stage canvas');const before=await canvas.getAttribute('data-ship-design');
 const b=(await canvas.boundingBox())!;const cdp=await mobile.newCDPSession(phone);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width*.4,y:b.y+b.height*.5}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width*.6,y:b.y+b.height*.6}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 expect(await phone.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await expect(canvas).toHaveAttribute('data-ship-design',before!);await phone.locator('#sy-frame').click();await phone.screenshot({path:`${evidence}/phone-workshop.png`});
 await phone.locator('#sy-name').fill('Touch Survey Hauler');await phone.locator('#sy-save').click();await expect(phone.locator('#sy-status')).toContainText('Saved ·');await phone.locator('#sy-close').click();await phone.reload();expect((await readUniverse(phone)).player.ship!.design.name).toBe('Touch Survey Hauler');
 await menuAction(phone,'open-shipyard');await expect(phone.locator('#sy-stage canvas')).toHaveCount(1);await phone.locator('#sy-close').click();checks.push('new context reconnect, 390×844 touch orbit, save, reload and preview reopen');expect(errors).toEqual([]);
 writeFileSync(`${evidence}/browser-result.json`,JSON.stringify({status:'passed',checks,pageErrors:errors},null,2)+'\n');
 }finally{await closeVisit(mobile);}
});
test('two tabs cannot overwrite a newer ship; the losing draft survives until reload',async({browser})=>{
 const context=await browser.newContext({storageState:'.data/ship-browser-owner.json',viewport:{width:1280,height:800}});const pages=[await context.newPage(),await context.newPage()];const errors:string[]=[];
 try{
 for(const p of pages){p.setDefaultTimeout(15_000);p.on('pageerror',e=>errors.push(e.message));await p.goto('/');await expect(p.locator('#scene-sync')).toContainText('Live');await menuAction(p,'open-shipyard');await expect(p.locator('#sy-save')).toBeEnabled();}
 const before=(await readUniverse(pages[0])).player.ship!;const names=[before.design.name+' A',before.design.name+' B'];
 await pages[0].locator('#sy-name').fill(names[0]);await pages[0].locator('#sy-save').click();await expect(pages[0].locator('#sy-status')).toContainText('Saved ·');
 await pages[1].locator('#sy-name').fill(names[1]);await pages[1].locator('#sy-save').click();await expect(pages[1].locator('#sy-status')).toContainText('another tab');await expect(pages[1].locator('#sy-name')).toHaveValue(names[1]);
 expect((await readUniverse(pages[1])).player.ship!.design.name).toBe(names[0]);pages[1].once('dialog',d=>d.accept());await pages[1].locator('#sy-reload').click();await expect(pages[1].locator('#sy-name')).toHaveValue(names[0]);
 for(const p of pages)await p.locator('#sy-close').click();expect(errors).toEqual([]);writeFileSync(`${evidence}/conflict-result.json`,JSON.stringify({status:'passed',versionBefore:before.version,versionAfter:(await readUniverse(pages[0])).player.ship!.version,pageErrors:errors},null,2)+'\n');
 }finally{await closeVisit(context);}
});
