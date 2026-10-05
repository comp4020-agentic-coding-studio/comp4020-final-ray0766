/* global performance, requestAnimationFrame, document, innerWidth, innerHeight, devicePixelRatio, navigator */
// Real Mac Chrome measurement; separate from pass/fail navigation regression.
import { walkToPort,launch } from '../tests/e2e/flight-helper.ts';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.APP_URL??'http://127.0.0.1:8080';
const folder='docs/evidence/round-5';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
  for(const phone of [false,true]){
    const context=await browser.newContext({baseURL:base,viewport:phone?{width:390,height:844}:{width:1600,height:1000},isMobile:phone,hasTouch:phone});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await page.getByRole('button',{name:'Let’s wander'}).click();await page.waitForTimeout(1200);await page.screenshot({path:`${folder}/${phone?'phone':'desktop'}-headed-street.png`});await walkToPort(page,phone);await page.screenshot({path:`${folder}/${phone?'phone':'desktop'}-headed-gate.png`});await launch(page);await page.waitForTimeout(5700);
    await page.keyboard.down('w');await page.waitForTimeout(900);await page.keyboard.up('w');
    const result=await page.evaluate(async()=>{
      const samples=[];let previous=performance.now();await new Promise(resolve=>{const begin=previous;function frame(now){samples.push(now-previous);previous=now;if(now-begin<3000)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});samples.shift();samples.sort((a,b)=>a-b);
      const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
      return{medianFrameMs:samples[Math.floor(samples.length*.5)],p95FrameMs:samples[Math.floor(samples.length*.95)],meanFps:1000*samples.length/samples.reduce((a,b)=>a+b,0),frames:samples.length,drawCalls:Number(canvas.dataset.drawCalls),triangles:Number(canvas.dataset.triangles),viewport:{width:innerWidth,height:innerHeight},devicePixelRatio,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'not exposed',userAgent:navigator.userAgent,overflow:document.documentElement.scrollWidth>innerWidth,flightMode:document.body.classList.contains('in-space'),detailedPlanets:Number(canvas.dataset.orbitDetailed),solidPlanets:Number(canvas.dataset.orbitVisible),surveyedPlanets:Number(canvas.dataset.orbitTotal)};
    });
    await page.keyboard.down('w');await page.waitForTimeout(250);await page.screenshot({path:`${folder}/${phone?'phone':'desktop'}-industrial-flight.png`});await page.keyboard.up('w');await page.keyboard.down('s');await page.waitForTimeout(500);await page.keyboard.up('s');
    const record={measuredAt:new Date().toISOString(),note:'Mac Google Chrome headed. Three-second moving/coasting sample after shader warm-up. Phone is viewport/touch emulation, not physical-device performance. No FPS pass threshold.',...result,errors};await writeFile(`${folder}/${phone?'phone':'desktop'}-flight-performance.json`,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));await context.close();
  }
}finally{await browser.close();}
