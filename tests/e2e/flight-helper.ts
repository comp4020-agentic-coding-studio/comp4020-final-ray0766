import { expect } from '@playwright/test';
import type { Page,BrowserContext } from '@playwright/test';
import type { Universe } from '../../src/shared/planets.ts';
import { spaceDistance } from '../../src/shared/flight.ts';
export async function readUniverse(page:Page):Promise<Universe>{return(await page.request.get('/api/universe')).json();}
// Stop WebGL animation before releasing an isolated Mac Chrome context.
export async function closeVisit(context:BrowserContext){for(const page of context.pages())if(!page.isClosed())await page.goto('about:blank');await context.close();}
export async function openMenu(page:Page){if(!await page.locator('#menu-dialog').isVisible())await page.getByRole('button',{name:'Pause menu'}).click();}
export async function menuAction(page:Page,id:string){await openMenu(page);await page.locator('#'+id).click();}
export async function claimAndBuild(page:Page){await menuAction(page,'claim-planet');await expect(page.locator('#build-mode')).toBeVisible();await page.locator('#build-mode').click();await expect(page.locator('#builder')).toBeVisible();}
export async function walkToPort(page:Page,touch=false){
  if(await page.locator('#menu-dialog').isVisible())await page.locator('#resume').click();
  if(await page.locator('#board-ship').isVisible())return;
  await menuAction(page,'guide-port');
  const cdp=touch?await page.context().newCDPSession(page):null;
  try{for(let step=0;step<90;step++){
    if(await page.locator('#board-ship').isVisible())return;
    const a=await page.locator('#dock-arrow').evaluate(e=>Number(/rotate\(([-\d.]+)/.exec((e as HTMLElement).style.transform)?.[1]??0)*Math.PI/180);
    const x=Math.sin(a),y=Math.cos(a);
    if(cdp){const box=(await page.locator('#joystick').boundingBox())!,cx=box.x+box.width/2,cy=box.y+box.height/2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+x*34,y:cy-y*34}]});await page.waitForTimeout(220);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{const keys=[...(Math.abs(x)>.35?[x>0?'d':'a']:[]),...(Math.abs(y)>.35?[y>0?'w':'s']:[])];for(const k of keys)await page.keyboard.down(k);await page.waitForTimeout(220);for(const k of keys)await page.keyboard.up(k);}
    await page.waitForTimeout(110);
  }}finally{await cdp?.detach();}
  await expect(page.locator('#board-ship')).toBeVisible();
}
export async function launch(page:Page){
  if(await page.locator('#builder').isVisible())await page.getByRole('button',{name:'Done building'}).click();
  await walkToPort(page);await page.getByRole('button',{name:'Board your ship'}).click();await page.getByRole('button',{name:'Launch ship',exact:true}).click();await expect(page.locator('#flight-hud')).toBeVisible({timeout:15000});
}
export async function mark(page:Page,id:string){await page.keyboard.press('m');await page.locator('#region-select').selectOption('all');await page.locator(`.planet-option[data-planet-id="${id}"]`).getByRole('button',{name:'Mark bearing'}).click();await expect(page.locator('#star-map')).not.toBeVisible();await expect(page.locator('#flight-hud')).toHaveAttribute('data-target',id);}
export async function pilotToBearing(page:Page){
  // Read the visible cockpit instruments and operate real keyboard controls.
  // No writes to player state, clock manipulation, or test-only travel endpoint.
  const held=new Set<string>();const set=async(key:string,on:boolean)=>{if(on){await page.keyboard.down(key);held.add(key);}else if(!on&&held.has(key)){await page.keyboard.up(key);held.delete(key);}};
  const until=Date.now()+130000;let stalled=0;
  try{
    while(Date.now()<until){
      const d=await page.locator('#flight-hud').evaluate(e=>({...e.dataset})),yaw=Number(d.yawError),pitch=Number(d.pitchError),distance=Number(d.distance),speed=Number(d.speed);
      if(distance<=19.4&&speed<.3)return;
      stalled=distance>25&&speed<.1&&Math.abs(yaw)<.1&&Math.abs(pitch)<.1?stalled+1:0;
      if(stalled>12){
        // A planet can obstruct a straight bearing. Fly a visible detour above it.
        for(const key of held)await page.keyboard.up(key);held.clear();
        await page.keyboard.down('d');await page.waitForTimeout(2350);await page.keyboard.up('d');
        await page.keyboard.down('w');await page.waitForTimeout(1700);await page.keyboard.up('w');
        await page.keyboard.down('s');await page.waitForTimeout(600);await page.keyboard.up('s');
        await page.keyboard.down('ArrowUp');await page.waitForTimeout(1300);await page.keyboard.up('ArrowUp');
        await page.keyboard.down('w');await page.waitForTimeout(2200);await page.keyboard.up('w');
        await page.keyboard.down('s');await page.waitForTimeout(600);await page.keyboard.up('s');stalled=0;continue;
      }
      const turning=Math.abs(yaw)>.24||Math.abs(pitch)>.24;
      const brake=turning&&speed>2||distance<18.4+speed*speed/104+speed*.32;
      await Promise.all([set('a',yaw<-.12),set('d',yaw>.12),set('ArrowUp',pitch>.12),set('ArrowDown',pitch<-.12),set('s',brake),set('w',!brake&&!turning&&distance>18.3)]);
      await page.waitForTimeout(65);
    }
    throw new Error('Did not reach marked bearing: '+JSON.stringify(await page.locator('#flight-hud').evaluate(e=>({...e.dataset}))));
  }finally{for(const key of held)await page.keyboard.up(key);}
}
export async function visit(page:Page,id?:string){
  const u=await readUniverse(page);const target=id??u.planets.filter(p=>p.kind==='garden'&&!p.claimed&&p.id!==u.currentPlanet.id).sort((a,b)=>spaceDistance(a.center,u.currentPlanet.center)-spaceDistance(b.center,u.currentPlanet.center))[0].id;
  if(u.player.flight.mode==='ground')await launch(page);await mark(page,target);await pilotToBearing(page);
  await expect(page.locator('#land-ship')).toBeEnabled();await page.locator('#land-ship').click();await page.getByRole('button',{name:'Land and explore'}).click();await expect(page.locator('#flight-hud')).not.toBeVisible({timeout:15000});await expect.poll(async()=>(await readUniverse(page)).currentPlanet.id).toBe(target);return target;
}
