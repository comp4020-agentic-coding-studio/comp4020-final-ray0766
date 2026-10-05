import { test,expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { visit,readUniverse,claimAndBuild,openMenu,menuAction,closeVisit } from './flight-helper.ts';
import { normalize } from '../../src/shared/world.ts';
// Mac Chrome trace finalisation stalled with four active WebGL contexts.
// Keep real controls, assertions, screenshots and frame samples; omit only this trace.
test.use({trace:'off'});
test.setTimeout(300000);
test('four independent visitors meet, expire, reconnect and remain isolated across planets',async({browser})=>{
  const contexts=await Promise.all([0,1,2,3].map(i=>browser.newContext({viewport:i?{width:800,height:600}:{width:1440,height:900}})));
  const pages=await Promise.all(contexts.map(c=>c.newPage())),[owner,guest,third,fourth]=pages;const errors:string[]=[];
  for(const p of pages){p.on('pageerror',e=>errors.push(e.message));await p.goto('/');await p.getByRole('button',{name:'Let’s wander'}).click();}
  for(const[p,key]of [[guest,'d'],[third,'a'],[fourth,'s']] as const){await p.keyboard.down(key);await p.waitForTimeout(550);await p.keyboard.up(key);}
  await expect(owner.locator('canvas')).toHaveAttribute('data-visitors','3',{timeout:7000});await expect(owner.locator('canvas')).toHaveAttribute('data-visible-visitors','3');
  await menuAction(owner,'view-mode');await owner.waitForTimeout(1000);await owner.screenshot({path:'docs/evidence/round-5/four-visitors.png'});
  const sample=await owner.evaluate(async()=>{const ms:number[]=[];let last=performance.now();await new Promise<void>(resolve=>{const end=last+2500;const frame=(now:number)=>{ms.push(now-last);last=now;if(now<end)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});ms.shift();ms.sort((a,b)=>a-b);return{medianMs:ms[Math.floor(ms.length/2)],p95Ms:ms[Math.floor(ms.length*.95)],meanFps:ms.length*1000/ms.reduce((a,b)=>a+b,0),render:{...document.querySelector('canvas')!.dataset},userAgent:navigator.userAgent};});
  await writeFile('docs/evidence/round-5/four-client-sample.json',JSON.stringify({at:new Date().toISOString(),viewports:pages.map(p=>p.viewportSize()),note:'Four simultaneous independent Mac Chrome contexts; window mode is indicated by userAgent. Not four physical devices. Other local work may contend for CPU/GPU.',...sample},null,2));
  await menuAction(owner,'view-mode');await contexts[3].setOffline(true);await expect(owner.locator('canvas')).toHaveAttribute('data-visitors','2',{timeout:9000});await contexts[3].setOffline(false);await expect(owner.locator('canvas')).toHaveAttribute('data-visitors','3',{timeout:8000});
  await closeVisit(contexts[2]);await expect(owner.locator('canvas')).toHaveAttribute('data-visitors','2',{timeout:9000});
  const target=await visit(owner);await claimAndBuild(owner);await owner.locator('#finish-building').click();await expect(owner.locator('canvas')).toHaveAttribute('data-visitors','0');await expect(guest.locator('canvas')).toHaveAttribute('data-visitors','1',{timeout:4000});
  await visit(guest,target);await expect(owner.locator('canvas')).toHaveAttribute('data-visitors','1',{timeout:6000});await expect(guest.locator('canvas')).toHaveAttribute('data-visitors','1',{timeout:6000});
  await openMenu(guest);await expect(guest.locator('#planet-description')).toContainText('read-only');await expect(guest.locator('#build-mode')).not.toBeVisible();await guest.locator('#resume').click();
  const denied=await guest.request.post('/api/objects/create',{data:{planetId:target,objectId:randomUUID(),kind:'lamp',position:normalize([.4,1,.4]),rotation:0}});expect(denied.status()).toBe(403);
  await guest.keyboard.down('d');await guest.waitForTimeout(500);await guest.keyboard.up('d');await owner.waitForTimeout(1200);
  await owner.screenshot({path:'docs/evidence/round-5/owner-and-visitor.png'});
  await visit(owner,'hub');await expect(guest.locator('canvas')).toHaveAttribute('data-visitors','0',{timeout:6000});await expect(owner.locator('canvas')).toHaveAttribute('data-visitors','1',{timeout:6000});expect((await readUniverse(guest)).currentPlanet.id).toBe(target);expect((await readUniverse(owner)).currentPlanet.id).toBe('hub');
  expect(errors).toEqual([]);await closeVisit(contexts[0]);await closeVisit(contexts[1]);await closeVisit(contexts[3]);
});
