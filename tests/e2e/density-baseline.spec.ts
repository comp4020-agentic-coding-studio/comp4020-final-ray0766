import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {closeVisit,openMenu,menuAction} from './flight-helper.ts';
import {sampleMainScene} from './r7-perf-helper.ts';
const dir='docs/evidence/village-density';test.use({trace:'off'});
test('same spawn camera baseline density and rendering counters',async({browser})=>{
 test.skip(process.env.DENSITY_BASELINE!=='before','Historical baseline is opt-in to avoid overwriting evidence.');
 if(!String(test.info().project.use.baseURL).endsWith(':8115'))throw Error('Use isolated 8115.');test.setTimeout(90000);mkdirSync(dir,{recursive:true});const c=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900}}),p=await c.newPage(),errors:string[]=[],samples:unknown[]=[];
 p.on('pageerror',e=>errors.push(e.message));try{await p.goto('/?measure=1');await p.locator('#begin').click();await openMenu(p);const skip=p.getByRole('button',{name:'Skip tips',exact:true});if(await skip.isVisible())await skip.click();await p.locator('#resume').click();
 for(const size of [{width:1440,height:900},{width:390,height:844}]){await p.setViewportSize(size);await p.waitForTimeout(1200);samples.push(await sampleMainScene(p,`before ${size.width} close`));await p.screenshot({path:`${dir}/before-${size.width}-close.png`});await menuAction(p,'view-mode');await p.waitForTimeout(1000);samples.push(await sampleMainScene(p,`before ${size.width} overview`));await p.screenshot({path:`${dir}/before-${size.width}-overview.png`});await menuAction(p,'view-mode');}
 expect(errors).toEqual([]);writeFileSync(`${dir}/before.json`,JSON.stringify({commit:'7dc0b017d1df16a9686ddc3a09af49f2f65cecb4',browser:browser.version(),samples,errors},null,2)+'\n');}finally{await closeVisit(c);}
});
