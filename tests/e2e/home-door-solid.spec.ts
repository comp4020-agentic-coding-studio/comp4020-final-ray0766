import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Quaternion,Vector3} from 'three';
import type {Page} from '@playwright/test';
import type {PlayerState} from '../../src/shared/world.ts';

const evidence='docs/evidence/home-random';
const state=async(page:Page):Promise<PlayerState>=>(await page.request.get('/api/state')).json();
function localFeet(player:PlayerState){
  const frame=player.home!.door.frame!;
  return new Vector3(...player.position).multiplyScalar(player.ground!.radius)
    .sub(new Vector3(...frame.position)).applyQuaternion(new Quaternion().fromArray(frame.quaternion).invert());
}
test('authoritative closed exterior door blocks real keyboard walking and opens without a doorway trap',async({browser})=>{
  test.setTimeout(75_000);mkdirSync(evidence,{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('/?measure');if(await page.locator('#begin').isVisible())await page.locator('#begin').click();
    await expect(page.locator('#home-enter')).toBeEnabled();
    const before=await state(page),homeId=before.home!.interiorId;
    await page.locator('#home-door-toggle').click();await expect.poll(async()=>(await state(page)).home!.interior.doorOpen).toBe(false);
    await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');await page.waitForTimeout(300);
    const blocked=await state(page),blockedFeet=localFeet(blocked);
    expect(blockedFeet.z).toBeGreaterThan(.3);expect(blockedFeet.z).toBeLessThan(.7);
    expect(blocked.location?.kind).toBe('exterior');expect(blocked.home!.interiorId).toBe(homeId);
    await page.screenshot({path:`${evidence}/solid-door-closed-blocks.png`});
    // Step out of the safety sweep; the server never pushes a person for a door.
    await page.keyboard.down('s');await expect.poll(async()=>localFeet(await state(page)).z,{intervals:[150]}).toBeGreaterThan(.95);await page.keyboard.up('s');await page.waitForTimeout(300);
    await page.locator('#home-door-toggle').click();await expect.poll(async()=>(await state(page)).home!.interior.doorOpen).toBe(true);
    await page.keyboard.down('w');await expect.poll(async()=>localFeet(await state(page)).z,{intervals:[120],timeout:7000}).toBeLessThan(-.3);await page.keyboard.up('w');await page.waitForTimeout(300);
    const passed=await state(page);expect(localFeet(passed).z).toBeLessThan(-.3);expect(passed.location?.kind).toBe('exterior');
    await page.screenshot({path:`${evidence}/solid-door-open-passes.png`});
    await page.reload();await expect(page.locator('#home-enter')).toBeEnabled();
    expect((await state(page)).home!.interior.doorOpen).toBe(true);expect((await state(page)).home!.interiorId).toBe(homeId);
    expect(errors).toEqual([]);
    writeFileSync(`${evidence}/solid-door-browser-result.json`,JSON.stringify({status:'passed',browser:await browser.version(),viewport:'1440x1000',blockedDoorLocalFeet:blockedFeet.toArray(),openDoorLocalFeet:localFeet(passed).toArray(),checks:['Real keyboard walking stops outside the closed leaf','Stepping back permits opening; the same route crosses the open doorway','Opening does not automatically enter the independent room','Door state, player position and interior identity survive reload'],pageErrors:errors},null,2));
  }finally{await page.keyboard.up('w');await page.keyboard.up('s');await page.goto('about:blank');await context.close();}
});
