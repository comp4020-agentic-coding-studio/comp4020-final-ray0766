import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Universe } from '../../src/shared/planets.ts';
import { spaceDistance } from '../../src/shared/flight.ts';
export async function readUniverse(page:Page):Promise<Universe>{return(await page.request.get('/api/universe')).json();}
export async function launch(page:Page){
  if(await page.locator('#builder').isVisible())await page.getByRole('button',{name:'Done building'}).click();
  await page.getByRole('button',{name:'Board your ship'}).click();await page.getByRole('button',{name:'Launch ship',exact:true}).click();await expect(page.locator('#flight-hud')).toBeVisible();
}
export async function mark(page:Page,id:string){await page.locator('#open-map').click();await page.locator(`.planet-option[data-planet-id="${id}"]`).getByRole('button',{name:'Mark bearing'}).click();await expect(page.locator('#star-map')).not.toBeVisible();await expect(page.locator('#flight-hud')).toHaveAttribute('data-target',id);}
export async function pilotToBearing(page:Page){
  // Read the visible cockpit instruments and operate real keyboard controls.
  // No writes to player state, clock manipulation, or test-only travel endpoint.
  const held=new Set<string>();const set=async(key:string,on:boolean)=>{if(on){await page.keyboard.down(key);held.add(key);}else if(!on&&held.has(key)){await page.keyboard.up(key);held.delete(key);}};
  const until=Date.now()+100000;let stalled=0;
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
      const turning=Math.abs(yaw)>.1||Math.abs(pitch)>.1;
      const brake=turning&&speed>2||distance<18.4+speed*speed/104+speed*.32;
      await set('a',yaw<-.025);await set('d',yaw>.025);await set('ArrowUp',pitch>.025);await set('ArrowDown',pitch<-.025);await set('s',brake);await set('w',!brake&&!turning&&distance>18.3);
      await page.waitForTimeout(65);
    }
    throw new Error('Did not reach marked bearing: '+JSON.stringify(await page.locator('#flight-hud').evaluate(e=>({...e.dataset}))));
  }finally{for(const key of held)await page.keyboard.up(key);}
}
export async function visit(page:Page,id?:string){
  const u=await readUniverse(page);const target=id??u.planets.filter(p=>p.kind==='garden'&&!p.claimed&&p.id!==u.currentPlanet.id).sort((a,b)=>spaceDistance(a.center,u.currentPlanet.center)-spaceDistance(b.center,u.currentPlanet.center))[0].id;
  if(u.player.flight.mode==='ground')await launch(page);await mark(page,target);await pilotToBearing(page);
  await expect(page.locator('#land-ship')).toBeEnabled();await page.locator('#land-ship').click();await page.getByRole('button',{name:'Land and explore'}).click();await expect(page.locator('#flight-hud')).not.toBeVisible();await expect.poll(async()=>(await readUniverse(page)).currentPlanet.id).toBe(target);return target;
}
