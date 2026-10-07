import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { closeVisit, menuAction } from './flight-helper.ts';

const evidence='docs/evidence/r7-village';
test.use({trace:'off'});
async function readUniverse(page:Page){const response=await page.request.get(new URL('/api/universe',page.url()).href);expect(response.status()).toBe(200);return response.json();}
async function ready(page:Page){
  if(await page.locator('#begin').isVisible())await page.locator('#begin').click();
  await expect(page.locator('#scene-sync')).toContainText('Live');
  const skip=page.getByRole('button',{name:'Skip tips'});if(await skip.isVisible())await skip.click();
  await expect.poll(async()=>Number(await page.locator('#world canvas').getAttribute('data-triangles'))).toBeGreaterThan(100);
}
async function measure(page:Page,label:string){
  await page.waitForTimeout(1200);
  return page.evaluate(async label=>{
    const c=document.querySelector('#world canvas') as HTMLCanvasElement,gl=c.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');
    const intervals:number[]=[],calls:number[]=[],triangles:number[]=[],cpu:number[]=[];let previous=0;
    await new Promise<void>(resolve=>{const sample=(time:number)=>{if(previous){intervals.push(time-previous);calls.push(Number(c.dataset.drawCalls));triangles.push(Number(c.dataset.triangles));if(c.dataset.renderCpuMs)cpu.push(Number(c.dataset.renderCpuMs));}previous=time;if(intervals.length<90)requestAnimationFrame(sample);else resolve();};requestAnimationFrame(sample);});
    const sorted=intervals.toSorted((a,b)=>a-b);
    return{label,viewport:[innerWidth,innerHeight],buffer:[c.width,c.height],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',calls:Math.max(...calls),triangles:Math.max(...triangles),medianFrameIntervalMs:sorted[45],p95FrameIntervalMs:sorted[85],renderCpuMs:cpu.length?cpu.reduce((a,b)=>a+b,0)/cpu.length:null,position:c.dataset.groundPosition,camera:c.dataset.cameraPosition};
  },label);
}

test('schema 9 visit returns in R7 with the same coat, task and ship; compare real hub views',async({browser})=>{
  test.setTimeout(120_000);mkdirSync(evidence,{recursive:true});const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors:string[]=[],samples:unknown[]=[];
  let upgraded:ReturnType<typeof spawn>|undefined;page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('http://127.0.0.1:8107/');await ready(page);
    await menuAction(page,'open-shipyard');await page.locator('#sy-starter').selectOption({value:'2'});await page.locator('#sy-name').fill('Before R7');await page.locator('#sy-registration').fill('OLD-729');await page.locator('#sy-save').click();await expect(page.locator('#sy-status')).toContainText('Saved ·');await page.locator('#sy-close').click();
    const before=(await readUniverse(page)).player;
    await page.reload();await ready(page);samples.push(await measure(page,'54ade hub desktop'));await page.screenshot({path:`${evidence}/before-hub-desktop.png`});
    await page.setViewportSize({width:390,height:844});samples.push(await measure(page,'54ade hub phone viewport'));await page.screenshot({path:`${evidence}/before-hub-phone.png`});
    execFileSync('python3',['-c',"import sqlite3; s=sqlite3.connect('file:.data/r7-upgrade-v9.sqlite?mode=ro',uri=True); d=sqlite3.connect('.data/r7-upgraded.sqlite'); s.backup(d); d.close(); s.close()"]);
    upgraded=spawn(process.execPath,['src/server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:'8108',HOST:'127.0.0.1',DATABASE_PATH:'.data/r7-upgraded.sqlite'},stdio:['ignore','pipe','pipe']});
    let logs='';upgraded.stdout?.on('data',data=>{logs+=data;});upgraded.stderr?.on('data',data=>{logs+=data;});
    await expect.poll(async()=>{try{return(await fetch('http://127.0.0.1:8108/healthz')).status;}catch{return 0;}}).toBe(200);
    await page.setViewportSize({width:1440,height:900});await page.goto('http://127.0.0.1:8108/?measure=1');await ready(page);
    const after=(await readUniverse(page)).player;expect(after.character).toBe(before.character);expect(after.quest).toBe(before.quest);expect(after.position).toEqual(before.position);expect(after.ship).toEqual(before.ship);
    samples.push(await measure(page,'R7 hub desktop'));await page.screenshot({path:`${evidence}/after-hub-desktop.png`});
    await menuAction(page,'open-shipyard');await expect(page.locator('#sy-name')).toHaveValue('Before R7');await page.screenshot({path:`${evidence}/after-shipyard-desktop.png`});await page.locator('#sy-close').click();
    await page.setViewportSize({width:390,height:844});samples.push(await measure(page,'R7 hub phone viewport'));await page.screenshot({path:`${evidence}/after-hub-phone.png`});await menuAction(page,'open-shipyard');await expect(page.locator('#sy-name')).toHaveValue('Before R7');await page.screenshot({path:`${evidence}/after-shipyard-phone.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.locator('#sy-close').click();
    expect(errors).toEqual([]);expect(logs).toContain('consistent backup');writeFileSync(`${evidence}/upgrade-and-hub.json`,JSON.stringify({status:'passed',browser:browser.version(),fixtures:'New anonymous visit created using old 54ade UI in a temporary v9 copy; same in-memory cookie returns after SQLite backup and schema10 migration. No real 8098 data changed. Phone viewport is desktop emulation.',checks:['same saved coat, quest, position, custom ship','v9 migration made its own consistent backup','desktop and 390px ship preview, no page errors'],samples,pageErrors:errors},null,2)+'\n');
  }catch(error){await page.screenshot({path:`${evidence}/upgrade-failure.png`}).catch(()=>{});writeFileSync(`${evidence}/upgrade-failure.json`,JSON.stringify({error:String(error),pageErrors:errors,samples},null,2)+'\n');throw error;}
  finally{await closeVisit(context);upgraded?.kill('SIGTERM');}
});
