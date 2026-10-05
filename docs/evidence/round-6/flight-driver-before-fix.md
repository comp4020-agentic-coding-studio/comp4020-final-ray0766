# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: colony.spec.ts >> phone touch builds without moving the courier, recovers offline, and edits saved objects
- Location: tests/e2e/colony.spec.ts:47:1

# Error details

```
Error: Did not reach marked bearing: {"speed":"0.000","position":"[-0.1294782056854659,9.071930818607463,81.84603775747375]","yawError":"0.08040604594038124","pitchError":"0.10946933300833939","distance":"98.24269823514393","target":"p-a059de8c-7953-4542-8716-3d2884c30b16"}
```

# Page snapshot

```yaml
- generic [active]:
  - generic "Interactive small planet" [ref=e1]:
    - generic "Little Worlds planet. Use WASD or arrow keys to walk; board your ship to fly between worlds." [ref=e2]
  - banner:
    - generic: HARBOUR BELT / FLIGHT
    - button "Pause menu" [ref=e3] [cursor=pointer]: ☰
  - main:
    - text: ↖ ↖
    - generic:
      - button "Little world 05" [ref=e4] [cursor=pointer]
      - button "Little world 18" [ref=e5] [cursor=pointer]
    - region "Flight instruments":
      - complementary [ref=e6]:
        - heading "Little world 18" [level=2] [ref=e7]
        - paragraph [ref=e8]: Lantern Reach · 98 m · Unclaimed
        - status [ref=e9]: World ahead · turn away, then fly around it
      - generic: HDG 175° / PITCH -9°
      - generic [aria-hidden]: ◇
      - generic:
        - generic: MAIN DRIVE
        - strong: "00"
        - text: m / s
        - paragraph: 3 m above Little world 05
      - button "Land · Little world 05" [ref=e10] [cursor=pointer]
      - generic:
        - group "Drag to steer the ship" [ref=e11]:
          - generic [ref=e13]: STEER
        - generic:
          - button "BRAKE" [ref=e14] [cursor=pointer]
          - button "THRUST ↑" [ref=e15] [cursor=pointer]
    - generic:
      - status: •Progress saved
  - text: • ✉ ✉ ✉
```

# Test source

```ts
  1  | import { expect } from '@playwright/test';
  2  | import type { Page,BrowserContext } from '@playwright/test';
  3  | import type { Universe } from '../../src/shared/planets.ts';
  4  | import { spaceDistance } from '../../src/shared/flight.ts';
  5  | export async function readUniverse(page:Page):Promise<Universe>{return(await page.request.get('/api/universe')).json();}
  6  | // Stop WebGL animation before releasing an isolated Mac Chrome context.
  7  | export async function closeVisit(context:BrowserContext){for(const page of context.pages())if(!page.isClosed())await page.goto('about:blank');await context.close();}
  8  | export async function openMenu(page:Page){if(!await page.locator('#menu-dialog').isVisible())await page.getByRole('button',{name:'Pause menu'}).click();}
  9  | export async function menuAction(page:Page,id:string){await openMenu(page);await page.locator('#'+id).click();}
  10 | export async function claimAndBuild(page:Page){await menuAction(page,'claim-planet');await expect(page.locator('#build-mode')).toBeVisible();await page.locator('#build-mode').click();await expect(page.locator('#builder')).toBeVisible();}
  11 | export async function walkToPort(page:Page,touch=false){
  12 |   if(await page.locator('#menu-dialog').isVisible())await page.locator('#resume').click();
  13 |   if(await page.locator('#board-ship').isVisible())return;
  14 |   await menuAction(page,'guide-port');
  15 |   const cdp=touch?await page.context().newCDPSession(page):null;
  16 |   try{for(let step=0;step<90;step++){
  17 |     if(await page.locator('#board-ship').isVisible())return;
  18 |     const a=await page.locator('#dock-arrow').evaluate(e=>Number(/rotate\(([-\d.]+)/.exec((e as HTMLElement).style.transform)?.[1]??0)*Math.PI/180);
  19 |     const x=Math.sin(a),y=Math.cos(a);
  20 |     if(cdp){const box=(await page.locator('#joystick').boundingBox())!,cx=box.x+box.width/2,cy=box.y+box.height/2;
  21 |       await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+x*34,y:cy-y*34}]});await page.waitForTimeout(220);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  22 |     }else{const keys=[...(Math.abs(x)>.35?[x>0?'d':'a']:[]),...(Math.abs(y)>.35?[y>0?'w':'s']:[])];for(const k of keys)await page.keyboard.down(k);await page.waitForTimeout(220);for(const k of keys)await page.keyboard.up(k);}
  23 |     await page.waitForTimeout(110);
  24 |   }}finally{await cdp?.detach();}
  25 |   await expect(page.locator('#board-ship')).toBeVisible();
  26 | }
  27 | export async function launch(page:Page){
  28 |   if(await page.locator('#builder').isVisible())await page.getByRole('button',{name:'Done building'}).click();
  29 |   await walkToPort(page);await page.getByRole('button',{name:'Board your ship'}).click();await page.getByRole('button',{name:'Launch ship',exact:true}).click();await expect(page.locator('#flight-hud')).toBeVisible({timeout:15000});
  30 | }
  31 | export async function mark(page:Page,id:string){await page.keyboard.press('m');await page.locator('#region-select').selectOption('all');await page.locator(`.planet-option[data-planet-id="${id}"]`).getByRole('button',{name:'Mark bearing'}).click();await expect(page.locator('#star-map')).not.toBeVisible();await expect(page.locator('#flight-hud')).toHaveAttribute('data-target',id);}
  32 | export async function pilotToBearing(page:Page){
  33 |   // Read the visible cockpit instruments and operate real keyboard controls.
  34 |   // No writes to player state, clock manipulation, or test-only travel endpoint.
  35 |   const held=new Set<string>();const set=async(key:string,on:boolean)=>{if(on){await page.keyboard.down(key);held.add(key);}else if(!on&&held.has(key)){await page.keyboard.up(key);held.delete(key);}};
  36 |   const until=Date.now()+130000;let stalled=0;
  37 |   try{
  38 |     while(Date.now()<until){
  39 |       const d=await page.locator('#flight-hud').evaluate(e=>({...e.dataset})),yaw=Number(d.yawError),pitch=Number(d.pitchError),distance=Number(d.distance),speed=Number(d.speed);
  40 |       if(distance<=19.4&&speed<.3)return;
  41 |       stalled=distance>25&&speed<.1&&Math.abs(yaw)<.1&&Math.abs(pitch)<.1?stalled+1:0;
  42 |       if(stalled>12){
  43 |         // A planet can obstruct a straight bearing. Fly a visible detour above it.
  44 |         for(const key of held)await page.keyboard.up(key);held.clear();
  45 |         await page.keyboard.down('d');await page.waitForTimeout(2350);await page.keyboard.up('d');
  46 |         await page.keyboard.down('w');await page.waitForTimeout(1700);await page.keyboard.up('w');
  47 |         await page.keyboard.down('s');await page.waitForTimeout(600);await page.keyboard.up('s');
  48 |         await page.keyboard.down('ArrowUp');await page.waitForTimeout(1300);await page.keyboard.up('ArrowUp');
  49 |         await page.keyboard.down('w');await page.waitForTimeout(2200);await page.keyboard.up('w');
  50 |         await page.keyboard.down('s');await page.waitForTimeout(600);await page.keyboard.up('s');stalled=0;continue;
  51 |       }
  52 |       const turning=Math.abs(yaw)>.24||Math.abs(pitch)>.24;
  53 |       const brake=turning&&speed>2||distance<18.4+speed*speed/104+speed*.32;
  54 |       await Promise.all([set('a',yaw<-.12),set('d',yaw>.12),set('ArrowUp',pitch>.12),set('ArrowDown',pitch<-.12),set('s',brake),set('w',!brake&&!turning&&distance>18.3)]);
  55 |       await page.waitForTimeout(65);
  56 |     }
> 57 |     throw new Error('Did not reach marked bearing: '+JSON.stringify(await page.locator('#flight-hud').evaluate(e=>({...e.dataset}))));
     |           ^ Error: Did not reach marked bearing: {"speed":"0.000","position":"[-0.1294782056854659,9.071930818607463,81.84603775747375]","yawError":"0.08040604594038124","pitchError":"0.10946933300833939","distance":"98.24269823514393","target":"p-a059de8c-7953-4542-8716-3d2884c30b16"}
  58 |   }finally{for(const key of held)await page.keyboard.up(key);}
  59 | }
  60 | export async function visit(page:Page,id?:string){
  61 |   const u=await readUniverse(page);const target=id??u.planets.filter(p=>p.kind==='garden'&&!p.claimed&&p.id!==u.currentPlanet.id).sort((a,b)=>spaceDistance(a.center,u.currentPlanet.center)-spaceDistance(b.center,u.currentPlanet.center))[0].id;
  62 |   if(u.player.flight.mode==='ground')await launch(page);await mark(page,target);await pilotToBearing(page);
  63 |   await expect(page.locator('#land-ship')).toBeEnabled();await page.locator('#land-ship').click();await page.getByRole('button',{name:'Land and explore'}).click();await expect(page.locator('#flight-hud')).not.toBeVisible({timeout:15000});await expect.poll(async()=>(await readUniverse(page)).currentPlanet.id).toBe(target);return target;
  64 | }
  65 | 
```