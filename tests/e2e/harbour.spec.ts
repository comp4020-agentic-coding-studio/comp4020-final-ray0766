import { test,expect } from '@playwright/test';
import { walkToPort,closeVisit,readUniverse,visit,openMenu } from './flight-helper.ts';
import { writeFile } from 'node:fs/promises';
test.use({trace:'off'});
test.setTimeout(240000);
for(const phone of [false,true])test(`harbour ${phone?'phone touch':'desktop'} materials, gate, departure skyline and return`,async({browser})=>{
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1600,height:1000},hasTouch:phone,isMobile:phone}),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('status of 409'))errors.push(m.text());});
  await page.goto('/');await page.getByRole('button',{name:'Let’s wander'}).click();await expect(page.locator('canvas')).toHaveAttribute('data-ground-radius','800');await page.waitForTimeout(1800);
  const prefix=`docs/evidence/round-6/${phone?'phone':'desktop'}`;await page.screenshot({path:prefix+'-street.png'});
  await walkToPort(page,phone);await page.waitForTimeout(600);await page.screenshot({path:prefix+'-gate.png'});
  await openMenu(page);await page.waitForTimeout(900);const before=(await readUniverse(page)).player;await page.reload();await expect(page.locator('#board-ship')).toBeVisible();expect((await readUniverse(page)).player.position).toEqual(before.position);
  await page.locator('#board-ship').click();await page.getByRole('button',{name:'Launch ship',exact:true}).click();await expect(page.locator('body')).toHaveClass(/departing/);await page.waitForTimeout(2300);await page.screenshot({path:prefix+'-departure.png'});
  await expect(page.locator('body')).not.toHaveClass(/departing/,{timeout:6000});await expect(page.locator('#flight-hud')).toHaveAttribute('data-speed',/\d/);await page.screenshot({path:prefix+'-orbit.png'});
  expect((await readUniverse(page)).player.flight.mode).toBe('space');await visit(page,'hub');await expect(page.locator('canvas')).toHaveAttribute('data-ground-radius','800');await expect(page.locator('#board-ship')).toBeVisible();await page.waitForTimeout(800);await page.screenshot({path:prefix+'-returned.png'});
  const stationary=(await readUniverse(page)).player.position,heading=await page.locator('canvas').getAttribute('data-camera-heading');
  if(phone){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:185,y:350}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:315,y:470}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.mouse.move(800,450);await page.mouse.down();await page.mouse.move(1120,530,{steps:16});await page.mouse.up();}
  await expect(page.locator('canvas')).not.toHaveAttribute('data-camera-heading',heading!);await page.waitForTimeout(900);expect((await readUniverse(page)).player.position).toEqual(stationary);await page.screenshot({path:prefix+'-look-around.png'});
  const measure=await page.evaluate(async()=>{const deltas:number[]=[];let last=performance.now();await new Promise<void>(resolve=>{const end=last+3000;function tick(t:number){deltas.push(t-last);last=t;if(t<end)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});deltas.shift();deltas.sort((a,b)=>a-b);const gl=document.querySelector('canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');return{meanFps:deltas.length*1000/deltas.reduce((a,b)=>a+b,0),medianMs:deltas[Math.floor(deltas.length/2)],p95Ms:deltas[Math.floor(deltas.length*.95)],render:{...document.querySelector('canvas')!.dataset},gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,width:document.documentElement.scrollWidth};});
  await writeFile(prefix+'-render.json',JSON.stringify({at:new Date().toISOString(),...measure,errors},null,2));expect(measure.width).toBe(phone?390:1600);expect(errors).toEqual([]);await closeVisit(context);
});
