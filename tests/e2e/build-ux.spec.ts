import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {visit,menuAction,readUniverse,closeVisit} from './flight-helper.ts';

test('building UX: preview reasons, unsaved cancellation and modal input on desktop and phone',async({browser})=>{
  test.setTimeout(240_000);
  const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();
  const evidence=process.env.BUILD_UX_EVIDENCE??'test-results/build-ux';mkdirSync(evidence,{recursive:true});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto('/');
    if(await page.locator('#courier-dialog').isVisible()){await page.getByRole('button',{name:'Fern A little leafy'}).click();await page.getByRole('button',{name:'Let’s wander'}).click();}
    await expect(page.locator('#scene-sync')).toContainText('Live');
    await visit(page);await menuAction(page,'claim-planet');await menuAction(page,'open-workshop');
    await expect(page.locator('#ws-save')).toBeEnabled();await page.locator('#ws-save').click();
    await expect(page.locator('#ws-status')).toContainText('Saved to your server library');
    await page.locator('#ws-new').click();await expect(page.locator('#ws-save-state')).toContainText('Add at least one part');
    await page.locator('#ws-tool').selectOption('floor.deck');await expect(page.locator('#ws-hint')).toContainText('Ready to add');
    await page.locator('#ws-add').click();await expect(page.locator('#ws-hint')).toContainText('Cannot place');
    await page.locator('#ws-undo').click();await expect(page.locator('#ws-hint')).toContainText('Ready to add');
    await page.locator('#ws-level').selectOption('1');await expect(page.locator('#ws-hint')).toContainText('Cannot place');
    await page.screenshot({path:`${evidence}/desktop-invalid-preview.png`});
    await page.locator('#ws-level').selectOption('0');await page.locator('#ws-add').click();
    const before=(await readUniverse(page)).player.position;
    await page.locator('#ws-name').fill('UX draft ');await page.locator('#ws-name').pressSequentially('wasderm');
    await expect(page.locator('#star-map')).not.toBeVisible();await expect(page.locator('#menu-dialog')).not.toBeVisible();
    expect((await readUniverse(page)).player.position).toEqual(before);
    await expect(page.locator('#ws-place')).toBeDisabled();
    for(const id of ['ws-close','ws-cabin','ws-load']){
      page.once('dialog',dialog=>dialog.dismiss());await page.locator('#'+id).click();await expect(page.locator('#ws-name')).toHaveValue('UX draft wasderm');
    }
    page.once('dialog',dialog=>dialog.dismiss());await page.keyboard.press('Escape');await expect(page.locator('#workshop')).toBeVisible();
    await page.locator('#ws-save').click();await expect(page.locator('#ws-place')).toBeEnabled();await page.locator('#ws-place').click();
    await expect(page.locator('#builder')).toBeVisible();
    for(const [x,y] of [[820,740],[1120,725],[700,620],[1230,650]]){await page.mouse.click(x,y);if(await page.locator('#save-object').isEnabled())break;}
    await expect(page.locator('#save-object')).toBeEnabled();
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#cancel-object').click();await expect(page.locator('#object-tools')).toBeVisible();
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-kind="tree"]').click();await expect(page.locator('#build-selection')).toHaveText('Custom structure');
    const turn=await page.locator('#placement-status').textContent();await page.locator('#built-list').focus();await page.keyboard.press('r');await expect(page.locator('#placement-status')).toHaveText(turn!);
    await page.screenshot({path:`${evidence}/desktop-placement.png`});
    page.once('dialog',dialog=>dialog.accept());await page.locator('#cancel-object').click();await expect(page.locator('#object-tools')).not.toBeVisible();
    expect((await readUniverse(page)).currentPlanet.objects).toHaveLength(0);
    await menuAction(page,'open-workshop');await expect(page.locator('#ws-save')).toBeEnabled();
    await page.setViewportSize({width:390,height:844});await page.locator('#ws-tool').selectOption('floor.deck');
    await page.locator('#ws-level').selectOption('2');await expect(page.locator('#ws-hint')).toContainText('Cannot place');
    await page.screenshot({path:`${evidence}/phone-invalid-preview.png`});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    const stage=await page.locator('#ws-stage').boundingBox();expect(stage!.height).toBeGreaterThan(180);
    await page.locator('#ws-name').fill('');await expect(page.locator('#ws-save-state')).toContainText('Give the blueprint a name');
    await page.screenshot({path:`${evidence}/phone-unsaved-name.png`});
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#ws-close').click();await expect(page.locator('#workshop')).toBeVisible();
    page.once('dialog',dialog=>dialog.accept());await page.locator('#ws-close').click();await expect(page.locator('#workshop')).not.toBeVisible();
    expect(errors).toEqual([]);
  }finally{await closeVisit(context);}
});
