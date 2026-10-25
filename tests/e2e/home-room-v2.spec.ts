import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { PlayerState } from '../../src/shared/world.ts';

const evidence='docs/evidence/home-random';
const state=async(page:Page):Promise<PlayerState>=>(await page.request.get('/api/state')).json();
for(const phone of [false,true])test(`large independent room and explicit door: ${phone?'touch':'desktop'}`,async({browser})=>{
  test.setTimeout(100_000);mkdirSync(evidence,{recursive:true});
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1440,height:1000},isMobile:phone,hasTouch:phone,locale:phone?'zh-CN':'en'});
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const click=async(selector:string)=>phone?page.locator(selector).tap():page.locator(selector).click();
  const id=phone?'room-phone':'room-desktop',checks:string[]=[];
  try{
    await page.goto('/?measure');expect(new URL(page.url()).port).toBe('8128');
    if(await page.locator('#begin').isVisible())await click('#begin');
    await expect(page.locator('#home-enter')).toBeEnabled();
    const original=await state(page),home=original.home!;
    expect(home.interior.room.width*home.interior.room.depth).toBeCloseTo(60.2);
    await click('#home-door-toggle');await expect.poll(async()=>(await state(page)).home!.interior.doorOpen).toBe(false);
    await expect(page.locator('#home-enter')).toBeDisabled();await page.waitForTimeout(250);
    await page.screenshot({path:`${evidence}/${id}-door-closed.png`});
    await page.reload();await expect(page.locator('#home-enter')).toBeDisabled();
    expect((await state(page)).home!.interior.doorOpen).toBe(false);
    await click('#home-door-toggle');await expect(page.locator('#home-enter')).toBeEnabled();await click('#home-enter');
    await expect(page.locator('.home-interior-ui')).toBeVisible();await expect.poll(async()=>Number(await page.locator('#world canvas').getAttribute('data-home-area'))).toBeCloseTo(60.2);
    const entered=await state(page);expect(entered.location?.kind).toBe('interior');
    const position=entered.location?.kind==='interior'?entered.location.position:null;
    await click('#home-toggle-door');await expect(page.locator('#home-exit')).toBeDisabled();
    await expect.poll(async()=>(await state(page)).home!.interior.doorOpen).toBe(false);
    const closed=await state(page);expect(closed.location?.kind).toBe('interior');
    if(closed.location?.kind==='interior')expect(closed.location.position).toEqual(position);
    await page.reload();await expect(page.locator('.home-interior-ui')).toBeVisible();await expect(page.locator('#home-exit')).toBeDisabled();
    expect((await state(page)).home!.interior.items).toEqual(home.interior.items);
    await page.waitForTimeout(300);await page.screenshot({path:`${evidence}/${id}-follow.png`});
    await expect(page.locator('#home-camera-view')).toHaveCount(0);await page.waitForTimeout(300);await page.screenshot({path:`${evidence}/${id}-overview.png`});
    if(phone){
      await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);
      await page.screenshot({path:`${evidence}/${id}-landscape.png`});
      for(const selector of ['#home-toggle-door','#home-photo','#home-arrange','#home-joystick']){
        const box=await page.locator(selector).boundingBox();expect(box).toBeTruthy();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(844);expect(box!.y+box!.height).toBeLessThanOrEqual(390);
      }
      await page.setViewportSize({width:390,height:844});checks.push('Landscape 844×390 retains reachable door, photo, arrange and movement controls');
    }
    checks.push('60.2 square metres, unchanged furniture dimensions/coordinates and persistent interior identity','Exterior and interior close/open actions survive reload without moving the player','Closed portal refuses entry/exit; fixed 2.5D room camera remains unchanged');
    await click('#home-arrange');await click('#home-material-sage');await click('#home-item-left');await click('#home-save');
    await expect(page.locator('#home-room-editor')).not.toBeVisible();
    const saved=await state(page);expect(saved.home!.interior.items[0].position[0]).toBe(home.interior.items[0].position[0]-.25);
    expect(saved.home!.interior.doorOpen).toBe(false);
    await click('#home-toggle-door');await expect(page.locator('#home-exit')).toBeEnabled();
    // Waiting with an open doorway must never automatically leave or bounce.
    await page.waitForTimeout(550);expect((await state(page)).location?.kind).toBe('interior');
    if(!phone){
      await page.keyboard.down('d');await expect.poll(async()=>{const p=await state(page);return p.location?.kind==='interior'?p.location.position[0]:-1;},{timeout:7000,intervals:[150]}).toBeGreaterThan(2.6);await page.keyboard.up('d');
      const walked=await state(page);expect(walked.location?.kind).toBe('interior');
      await page.keyboard.down('a');await expect.poll(async()=>{const p=await state(page);return p.location?.kind==='interior'?Math.abs(p.location.position[0]):99;},{timeout:7000,intervals:[100]}).toBeLessThan(.45);await page.keyboard.up('a');await page.waitForTimeout(300);
      await expect(page.locator('#home-exit')).toBeEnabled();checks.push('Real keyboard walking in the larger room remains indoors and returns to the doorway');
    }
    await click('#home-exit');await expect(page.locator('.home-interior-ui')).not.toBeVisible();
    await click('#home-enter');await expect(page.locator('.home-interior-ui')).toBeVisible();
    expect((await state(page)).home!.interiorId).toBe(home.interiorId);expect((await state(page)).home!.interior.items).toEqual(saved.home!.interior.items);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(phone?390:1440);
    expect(errors).toEqual([]);checks.push('Explicit exit and re-entry preserve the same room and saved furniture','No horizontal overflow or page errors');
    const canvas=await page.locator('#world canvas').evaluate(el=>({...el.dataset}));
    writeFileSync(`${evidence}/${id}-result.json`,JSON.stringify({status:'passed',browser:await browser.version(),realPhone:false,viewport:phone?'390×844':'1440×1000',checks,canvas,pageErrors:errors},null,2));
  }finally{await page.keyboard.up('a');await page.keyboard.up('d');await page.goto('about:blank');await context.close();}
});
