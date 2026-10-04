import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function walkToDestination(page:Page, touch=false) {
  const cdp=touch?await page.context().newCDPSession(page):null;
  for(let step=0;step<90;step++) {
    if((await page.locator('#distance').textContent())?.includes('You’re here')) break;
    const angle=await page.locator('#compass').evaluate(el=>Number(/rotate\(([-\d.]+)/.exec((el as HTMLElement).style.transform)?.[1]??0));
    const x=Math.sin(angle*Math.PI/180),y=Math.cos(angle*Math.PI/180);
    if(cdp) {
      const box=(await page.locator('#joystick').boundingBox())!;
      const cx=box.x+box.width/2,cy=box.y+box.height/2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+x*32,y:cy-y*32}]});
      await page.waitForTimeout(220);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {
      const keys=[...(Math.abs(x)>.35?[x>0?'d':'a']:[]),...(Math.abs(y)>.35?[y>0?'w':'s']:[])];
      for(const key of keys)await page.keyboard.down(key);
      await page.waitForTimeout(220);
      for(const key of keys)await page.keyboard.up(key);
    }
    await page.waitForTimeout(110);
  }
  await cdp?.detach();
  await expect(page.locator('#distance')).toContainText('You’re here');
  await expect(page.locator('#interact')).toBeVisible();
}
for(const mobile of [false,true])test(`${mobile?'phone touch':'desktop keyboard'} completes and restores the delivery`,async({browser})=>{
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1920,height:1080},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'Fern A little leafy'}).click();
  await expect(page.getByRole('button',{name:'Fern A little leafy'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Let’s wander'}).click();
  await expect(page.locator('#npc-mica')).toBeVisible();
  await walkToDestination(page,mobile);
  await page.getByRole('button',{name:'Collect the parcel'}).click();
  await expect(page.locator('#mission-title')).toHaveText('A little care, on its way.');
  await page.reload();await expect(page.locator('#mission-title')).toHaveText('A little care, on its way.');
  await walkToDestination(page,mobile);
  if(mobile)await page.getByRole('button',{name:'Deliver to Sol'}).click();else { await page.locator('#interact').focus(); await page.keyboard.press('e'); }
  await expect(page.locator('#mission-title')).toHaveText('Something good is growing.');
  await expect(page.locator('#interact')).toContainText('Talk to Sol');
  await page.screenshot({path:`docs/evidence/${mobile?'mobile':'desktop'}-completed.png`});
  const saved=await context.storageState();await context.close();
  const returned=await browser.newContext({storageState:saved,viewport:mobile?{width:390,height:844}:{width:1920,height:1080}});
  const again=await returned.newPage();await again.goto('/');await expect(again.locator('#mission-title')).toHaveText('Something good is growing.');
  await again.getByRole('button',{name:'Your courier'}).click();await expect(again.getByRole('button',{name:'Fern A little leafy'})).toHaveAttribute('aria-pressed','true');
  expect(errors).toEqual([]);await returned.close();
});
test('offline does not falsely finish a save and reconnects; resize and reduced motion keep controls usable',async({page,context})=>{
  await page.setViewportSize({width:1920,height:1080});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');await page.getByRole('button',{name:'Let’s wander'}).click();
  await context.setOffline(true);await page.keyboard.down('w');await page.waitForTimeout(650);await page.keyboard.up('w');
  await expect(page.locator('#save-status')).toContainText('Offline');
  await context.setOffline(false);await expect(page.locator('#save-status')).toHaveText('Progress saved',{timeout:10_000});
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#joystick')).toBeVisible();
  await expect(page.locator('#npc-mica')).toBeVisible();
  await page.getByRole('button',{name:'How to play'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('keyboard crosses the north pole, reverses, and click-to-walk changes saved position',async({page,request})=>{
  await page.setViewportSize({width:1920,height:1080});await page.goto('/');
  await page.getByRole('button',{name:'Let’s wander'}).click();
  await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');await page.waitForTimeout(550);
  const read=async()=>{
    const cookie=(await page.context().cookies()).find(c=>c.name==='little_post')!;
    return (await request.get('/api/state',{headers:{Cookie:`little_post=${cookie.value}`}})).json();
  };
  const crossed=await read();expect(crossed.position[2]).toBeLessThan(0);expect(crossed.position[1]).toBeGreaterThan(.96);
  await expect(page.locator('#npc-mica')).toBeVisible();
  await page.screenshot({path:'docs/evidence/north-pole.png'});
  await page.keyboard.down('s');await page.waitForTimeout(1500);await page.keyboard.up('s');await page.waitForTimeout(550);
  const reversed=await read();expect(reversed.position[2]).toBeGreaterThan(crossed.position[2]+.1);
  await page.mouse.click(1050,620);await page.waitForTimeout(1300);
  const clicked=await read();expect(Math.hypot(...clicked.position.map((v:number,i:number)=>v-reversed.position[i]))).toBeGreaterThan(.02);
});
