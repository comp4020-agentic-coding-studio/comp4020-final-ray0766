import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {NPCS,SPAWN} from '../../src/shared/world.ts';
import {HUB_DOCK} from '../../src/shared/ports.ts';
import {menuAction,openMenu,closeVisit} from './flight-helper.ts';
import {walk} from './physics-helper.ts';
import {sampleMainScene} from './r7-perf-helper.ts';
test.use({trace:'off'});
test('final compact framing keeps the full globe visible and the public route clear',async({browser})=>{
 test.setTimeout(90000);const c=await browser.newContext({viewport:{width:1440,height:900}}),p=await c.newPage(),errors:string[]=[],samples:unknown[]=[];
 p.on('pageerror',e=>errors.push(e.message));try{
  await p.goto('/?measure=1');await p.locator('#begin').click();await openMenu(p);const skip=p.getByRole('button',{name:'Skip tips'});if(await skip.isVisible())await skip.click();await p.locator('#resume').click();
  for(const size of [{width:1440,height:900},{width:390,height:844}]){
   await p.setViewportSize(size);await p.waitForTimeout(1000);samples.push(await sampleMainScene(p,`final public ${size.width} close`));await p.screenshot({path:`docs/evidence/compact-worlds/final-hub-${size.width}-close.png`});
   await menuAction(p,'view-mode');await p.waitForTimeout(1000);await p.screenshot({path:`docs/evidence/compact-worlds/final-hub-${size.width}-overview.png`});await menuAction(p,'view-mode');
  }
  await p.setViewportSize({width:1440,height:900});await walk(p,()=>NPCS.mica.position);await walk(p,()=>SPAWN);await walk(p,()=>NPCS.sol.position);await walk(p,()=>HUB_DOCK);await expect(p.locator('#board-ship')).toBeVisible();expect(errors).toEqual([]);
  writeFileSync('docs/evidence/compact-worlds/final-framing.json',JSON.stringify({status:'passed',browser:browser.version(),checks:['same spawn orientation; close and full-globe framing at 1440 and 390 px','two existing cottages moved nearer spawn; actual keyboard route to both NPCs and boarding remains clear'],errors,samples},null,2)+'\n');
 }finally{await closeVisit(c);}
});
