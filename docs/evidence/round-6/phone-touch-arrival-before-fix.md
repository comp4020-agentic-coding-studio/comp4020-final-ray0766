# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journey.spec.ts >> phone touch completes and restores the delivery
- Location: tests/e2e/journey.spec.ts:31:34

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#interact')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" locator('#interact') with timeout 5000ms
  - waiting for locator('#interact')
    14 × locator resolved to <button hidden="" id="interact" class="primary">…</button>
       - unexpected value "hidden"

```

```yaml
- banner:
  - text: SUNSEED HARBOUR
  - button "Pause menu": ☰
- main:
  - text: ↗ Mica
  - status: •Progress saved
  - group "Drag to walk": MOVE
```

# Test source

```ts
  1  | import { menuAction,closeVisit } from './flight-helper.ts';
  2  | import { test, expect } from '@playwright/test';
  3  | import type { Page } from '@playwright/test';
  4  | test.setTimeout(180000);
  5  | 
  6  | async function walkToDestination(page:Page, touch=false) {
  7  |   const cdp=touch?await page.context().newCDPSession(page):null;
  8  |   for(let step=0;step<90;step++) {
  9  |     if((await page.locator('#distance').textContent())?.includes('You’re here')) break;
  10 |     const angle=await page.locator('#compass').evaluate(el=>Number(/rotate\(([-\d.]+)/.exec((el as HTMLElement).style.transform)?.[1]??0));
  11 |     const x=Math.sin(angle*Math.PI/180),y=Math.cos(angle*Math.PI/180);
  12 |     if(cdp) {
  13 |       const box=(await page.locator('#joystick').boundingBox())!;
  14 |       const cx=box.x+box.width/2,cy=box.y+box.height/2;
  15 |       await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});
  16 |       await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+x*32,y:cy-y*32}]});
  17 |       await page.waitForTimeout(220);
  18 |       await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  19 |     } else {
  20 |       const keys=[...(Math.abs(x)>.35?[x>0?'d':'a']:[]),...(Math.abs(y)>.35?[y>0?'w':'s']:[])];
  21 |       for(const key of keys)await page.keyboard.down(key);
  22 |       await page.waitForTimeout(220);
  23 |       for(const key of keys)await page.keyboard.up(key);
  24 |     }
  25 |     await page.waitForTimeout(110);
  26 |   }
  27 |   await cdp?.detach();
  28 |   await expect(page.locator('#distance')).toContainText('You’re here');
> 29 |   await expect(page.locator('#interact')).toBeVisible();
     |                                           ^ Error: expect(locator).toBeVisible() failed
  30 | }
  31 | for(const mobile of [false,true])test(`${mobile?'phone touch':'desktop keyboard'} completes and restores the delivery`,async({browser})=>{
  32 |   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1920,height:1080},hasTouch:mobile,isMobile:mobile});
  33 |   const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  34 |   await page.goto('/');await page.getByRole('button',{name:'Fern A little leafy'}).click();
  35 |   await expect(page.getByRole('button',{name:'Fern A little leafy'})).toHaveAttribute('aria-pressed','true');
  36 |   await page.getByRole('button',{name:'Let’s wander'}).click();
  37 |   await expect(page.locator('canvas')).toBeVisible();
  38 |   await walkToDestination(page,mobile);
  39 |   await page.getByRole('button',{name:'Collect the parcel'}).click();
  40 |   await expect(page.locator('#mission-title')).toHaveText('A little care, on its way.');
  41 |   await expect(page.locator('#conversation')).toBeVisible();
  42 |   await expect(page.locator('#speaker')).toContainText('Mica');
  43 |   await page.locator('#close-conversation').click();
  44 |   await expect(page.locator('#conversation')).not.toBeVisible();
  45 |   await page.reload();await expect(page.locator('#mission-title')).toHaveText('A little care, on its way.');
  46 |   await walkToDestination(page,mobile);
  47 |   if(mobile)await page.getByRole('button',{name:'Deliver to Sol'}).click();else { await page.locator('#interact').focus(); await page.keyboard.press('e'); }
  48 |   await expect(page.locator('#mission-title')).toHaveText('Something good is growing.');
  49 |   await expect(page.locator('#interact')).toContainText('Talk to Sol');
  50 |   await expect(page.locator('#conversation')).toBeVisible();
  51 |   await expect(page.locator('#speaker')).toContainText('Sol');
  52 |   await page.screenshot({path:`docs/evidence/round-6/${mobile?'mobile':'desktop'}-completed.png`});
  53 |   const saved=await context.storageState();await closeVisit(context);
  54 |   const returned=await browser.newContext({storageState:saved,viewport:mobile?{width:390,height:844}:{width:1920,height:1080}});
  55 |   const again=await returned.newPage();await again.goto('/');await expect(again.locator('#mission-title')).toHaveText('Something good is growing.');
  56 |   await menuAction(again,'wardrobe');await expect(again.getByRole('button',{name:'Fern A little leafy'})).toHaveAttribute('aria-pressed','true');
  57 |   expect(errors).toEqual([]);await closeVisit(returned);
  58 | });
  59 | test('offline does not falsely finish a save and reconnects; resize and reduced motion keep controls usable',async({page,context})=>{
  60 |   await page.setViewportSize({width:1920,height:1080});await page.emulateMedia({reducedMotion:'reduce'});
  61 |   await page.goto('/');await page.getByRole('button',{name:'Let’s wander'}).click();
  62 |   await context.setOffline(true);await page.keyboard.down('w');await page.waitForTimeout(650);await page.keyboard.up('w');
  63 |   await expect(page.locator('#save-status')).toContainText('Offline');
  64 |   await context.setOffline(false);await expect(page.locator('#save-status')).toHaveText('Progress saved',{timeout:10_000});
  65 |   await page.setViewportSize({width:390,height:844});await expect(page.locator('#joystick')).toBeVisible();
  66 |   await expect(page.locator('canvas')).toBeVisible();
  67 |   await menuAction(page,'help');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  68 |   await expect(page.getByRole('dialog')).not.toBeVisible();
  69 | });
  70 | test('keyboard crosses the north pole, reverses, and click-to-walk changes saved position',async({page,request})=>{
  71 |   await page.setViewportSize({width:1920,height:1080});await page.goto('/');
  72 |   await page.getByRole('button',{name:'Let’s wander'}).click();
  73 |   await page.keyboard.down('w');await page.waitForTimeout(4500);await page.keyboard.up('w');await page.waitForTimeout(550);
  74 |   const read=async()=>{
  75 |     const cookie=(await page.context().cookies()).find(c=>c.name==='little_post')!;
  76 |     return (await request.get('/api/state',{headers:{Cookie:`little_post=${cookie.value}`}})).json();
  77 |   };
  78 |   const crossed=await read();expect(crossed.position[2]).toBeLessThan(0);expect(crossed.position[1]).toBeGreaterThan(.96);
  79 |   await expect(page.locator('canvas')).toBeVisible();
  80 |   await page.screenshot({path:'docs/evidence/round-6/north-pole.png'});
  81 |   await page.keyboard.down('s');await page.waitForTimeout(4500);await page.keyboard.up('s');await page.waitForTimeout(550);
  82 |   const reversed=await read();expect(reversed.position[2]).toBeGreaterThan(crossed.position[2]+.1);
  83 |   await page.mouse.click(1050,620);await page.waitForTimeout(1300);
  84 |   const clicked=await read();expect(Math.hypot(...clicked.position.map((v:number,i:number)=>v-reversed.position[i]))).toBeGreaterThan(.02);
  85 | });
  86 | 
```