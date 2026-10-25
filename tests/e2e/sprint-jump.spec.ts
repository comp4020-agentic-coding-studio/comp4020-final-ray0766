import {test,expect} from '@playwright/test';
import {distance} from '../../src/shared/world.ts';
import {readFeet} from './physics-helper.ts';

test('walking-only controls ignore Space and offer explicit safe-ground recovery',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/?measure=1');
 await page.waitForFunction(()=>!!document.querySelector('#world canvas')&&!document.body.classList.contains('scene-loading'));
 const start=page.getByRole('button',{name:'Start exploring',exact:true});if(await start.isVisible())await start.click();
 if(await page.locator('.tutorial-skip').isVisible())await page.locator('.tutorial-skip').click();
 await expect(page.locator('#world canvas')).toHaveAttribute('data-grounded','true');
 const before=await readFeet(page);await page.keyboard.down('Space');await page.waitForTimeout(600);await page.keyboard.up('Space');
 const after=await readFeet(page);expect(after.radius).toBeCloseTo(before.radius,5);expect(after.grounded).toBe(true);expect(distance(after.position,before.position)).toBeLessThan(.001);
 expect(await page.getByRole('button',{name:/^jump$/i}).count()).toBe(0);
 await page.locator('#open-menu').click();await page.locator('#recover-ground').click();
 await expect(page.locator('#recover-ground-dialog')).toBeVisible();
 await page.locator('#recover-ground-dialog .close').click();expect(distance((await readFeet(page)).position,after.position)).toBeLessThan(.001);
 await page.locator('#open-menu').click();await page.locator('#recover-ground').click();await page.locator('#confirm-ground-recovery').click();
 await expect(page.locator('#recover-ground-dialog')).not.toBeVisible();await expect(page.locator('#world canvas')).toHaveAttribute('data-grounded','true');
 await page.screenshot({path:test.info().outputPath('walking-only.png')});
});
