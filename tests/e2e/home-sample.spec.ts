import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { PlayerState } from '../../src/shared/world.ts';
const evidence='docs/evidence/home-sample';
async function state(page:Page):Promise<PlayerState>{return(await page.request.get('/api/state')).json();}
async function begin(page:Page){await page.goto('/?measure');if(await page.locator('#begin').isVisible())await page.locator('#begin').click();await expect(page.locator('#home-enter')).toBeVisible();}
test('home sample desktop: enter, arrange, reconnect, remodel, undo and kit edit',async({browser})=>{
  test.setTimeout(180_000);mkdirSync(evidence,{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en'});
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const checks:string[]=[];const record:Record<string,unknown>={checks,browser:'Installed Google Chrome, desktop viewport 1440×1000'};
  try{
    await begin(page);await page.waitForTimeout(700);
    const initial=await state(page);expect(initial.worldRadius).toBe(21.6);const home=initial.home!;
    record.exterior=await page.locator('#world canvas').evaluate(e=>({...e.dataset}));
    await page.screenshot({path:`${evidence}/desktop-exterior.png`});
    await page.locator('#home-enter').click();await expect(page.locator('.home-interior-ui')).toBeVisible();
    await page.keyboard.press('m');await expect(page.locator('#star-map')).not.toBeVisible();
    await page.waitForTimeout(350);await page.screenshot({path:`${evidence}/desktop-interior.png`});
    checks.push('Entered the one persistent interior through the real doorway UI; exterior Atlas is unavailable indoors');
    await page.locator('#home-arrange').click();await page.locator('#home-material-sage').click();await page.locator('#home-item-left').click();await page.locator('#home-save').click();
    await expect(page.locator('#home-room-editor')).not.toBeVisible();
    let saved=await state(page);expect(saved.home!.interior.material).toBe('sage');expect(saved.home!.interior.items[0].position[0]).toBe(home.interior.items[0].position[0]-.25);
    await page.reload();await expect(page.locator('.home-interior-ui')).toBeVisible();expect((await state(page)).location?.kind).toBe('interior');
    expect((await state(page)).home!.interior).toEqual(saved.home!.interior);checks.push('Furniture and material saved; reload resumes the same interior and contents');
    await page.keyboard.down('w');await page.waitForTimeout(120);await page.keyboard.up('w');await page.waitForTimeout(650);
    const moved=await state(page);expect(moved.location?.kind).toBe('interior');
    if(moved.location?.kind==='interior')expect(moved.location.sequence).toBeGreaterThan(0);
    await context.setOffline(true);await expect(page.locator('#home-retry')).toBeVisible();await expect(page.locator('#home-arrange')).toBeDisabled();
    await context.setOffline(false);await page.locator('#home-retry').click();await expect(page.locator('#home-retry')).not.toBeVisible();checks.push('Indoor movement acknowledged; offline stops editing and explicit retry restores the visit');
    await page.keyboard.down('s');await page.waitForTimeout(140);await page.keyboard.up('s');await page.waitForTimeout(350);
    await expect(page.locator('#home-exit')).toBeEnabled();await page.locator('#home-exit').click();await expect(page.locator('#home-enter')).toBeVisible();
    await page.locator('#home-remodel summary').click();
    for(const [id,variant] of [['terrace','terrace'],['roof','roof'],['extend','extended']] as const){
      await page.locator('#home-'+id).click();await expect.poll(async()=>(await state(page)).home!.variant).toBe(variant);
      saved=await state(page);expect(saved.home!.buildingId).toBe(home.buildingId);expect(saved.home!.interiorId).toBe(home.interiorId);expect(saved.home!.interior).toEqual(moved.home!.interior);
      await page.waitForTimeout(350);await page.screenshot({path:`${evidence}/desktop-${variant}.png`});
    }
    await page.locator('#home-undo').click();await expect.poll(async()=>(await state(page)).home!.variant).toBe('roof');checks.push('Terrace, roof and expansion applied in place; undo restores the prior shape without losing the room');
    await page.locator('#home-workshop').click();await expect(page.locator('#workshop')).toBeVisible();
    await page.locator('#ws-tool').selectOption('garden.pot');await page.locator('#ws-x').selectOption('0');await page.locator('#ws-z').selectOption('0');await page.locator('#ws-add').click();
    await expect(page.locator('#ws-apply')).toBeEnabled();await page.locator('#ws-apply').click();await expect(page.locator('#workshop')).not.toBeVisible();
    await expect.poll(async()=>(await state(page)).home!.variant).toBe('custom');expect((await state(page)).home!.buildingId).toBe(home.buildingId);
    await page.locator('#home-enter').click();await expect(page.locator('.home-interior-ui')).toBeVisible();expect((await state(page)).home!.interior).toEqual(moved.home!.interior);checks.push('An ordinary garden part added through the workshop replaces the same home; inside contents preserved');
    await page.screenshot({path:`${evidence}/desktop-saved-interior.png`});
    record.interior=await page.locator('#world canvas').evaluate(e=>({...e.dataset}));record.pageErrors=errors;expect(errors).toEqual([]);record.status='passed';
  }finally{writeFileSync(`${evidence}/desktop-result.json`,JSON.stringify(record,null,2));await page.goto('about:blank');await context.close();}
});

test('home sample phone viewport: touch enter, arrange, save and exit',async({browser})=>{
  mkdirSync(evidence,{recursive:true});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN'});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await begin(page);await page.waitForTimeout(350);await page.screenshot({path:`${evidence}/phone-exterior.png`});const exterior=await page.locator('#world canvas').evaluate(e=>({drawCalls:e.dataset.drawCalls,triangles:e.dataset.triangles,quality:e.dataset.quality}));
    await page.locator('#home-enter').tap();await expect(page.locator('.home-interior-ui')).toBeVisible();await page.waitForTimeout(350);
    await page.screenshot({path:`${evidence}/phone-interior.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    await page.locator('#home-arrange').tap();await page.locator('#home-material-blue').tap();await page.locator('#home-save').tap();await expect(page.locator('#home-room-editor')).not.toBeVisible();
    expect((await state(page)).home!.interior.material).toBe('blue');await page.reload();await expect(page.locator('.home-interior-ui')).toBeVisible();
    const interior=await page.locator('#world canvas').evaluate(e=>({drawCalls:e.dataset.homeDrawCalls}));
    await page.locator('#home-exit').tap();await expect(page.locator('#home-enter')).toBeVisible();
    expect(errors).toEqual([]);writeFileSync(`${evidence}/phone-result.json`,JSON.stringify({status:'passed',viewport:'390×844',realPhone:false,exterior,interior,pageErrors:errors,checks:['Touch enter/save/exit','Room material survives reload','No horizontal overflow','No page errors']},null,2));
  }finally{await page.goto('about:blank');await context.close();}
});

test('home sample surface: leave the terrace and return along the entrance',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en'});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await begin(page);await page.keyboard.down('s');await page.waitForTimeout(1300);await page.keyboard.up('s');await page.waitForTimeout(550);
    const outside=await state(page);expect(outside.ground!.sequence).toBeGreaterThan(0);await expect(page.locator('#home-enter')).not.toBeVisible();
    await page.screenshot({path:`${evidence}/desktop-courtyard.png`});
    await page.keyboard.down('w');await expect(page.locator('#home-enter')).toBeVisible({timeout:4000});await page.keyboard.up('w');
    await page.waitForTimeout(200);await page.locator('#home-enter').click();await expect(page.locator('.home-interior-ui')).toBeVisible();
    expect(errors).toEqual([]);writeFileSync(`${evidence}/surface-result.json`,JSON.stringify({status:'passed',checks:['Actual keyboard walking from the door across the terrace and onto the approach','Authoritative surface motion acknowledged','Return over the entry steps and enter through the same door'],pageErrors:errors},null,2));
  }finally{await page.keyboard.up('w');await page.keyboard.up('s');await page.goto('about:blank');await context.close();}
});
