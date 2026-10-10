import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { begin, menu, rendererContext, measureAction, integrationUrl, groundWalk } from './integration-browser-helpers.ts';
import { samplePublicVillage } from '../src/shared/sample-public-village.ts';
import { distance } from '../src/shared/world.ts';
import type { Vec3 } from '../src/shared/world.ts';

const baseURL=integrationUrl();if(new URL(baseURL).port!=='8134')throw Error('Town audit requires the disposable 8134 copy.');
const phase=process.argv[2]??'town-first';if(!/^[a-z0-9-]+$/.test(phase))throw Error('Use a simple evidence name.');
const output=join('docs/evidence/village-world',phase);mkdirSync(output,{recursive:true});
const fixtures=JSON.parse(readFileSync('.data/village-view-fixtures.json','utf8')) as {name:string;position:Vec3;road:string;cookie:string}[];
const selected=process.argv[3]?.split(',');
if(selected?.some(name=>!fixtures.some(f=>f.name===name)))throw Error('Unknown view selection.');
const browser=await chromium.launch({channel:'chrome',headless:true}),errors:string[]=[],api:unknown[]=[],results:unknown[]=[];
const town=samplePublicVillage();
try {
  for(const touch of [false,true])for(const fixture of fixtures.filter(f=>(!selected||selected.includes(f.name))&&(!touch||['front','north'].includes(f.name)))){
    const context=await browser.newContext({baseURL,viewport:touch?{width:390,height:844}:{width:1440,height:1000},hasTouch:touch,isMobile:touch,locale:'en-US'});
    await context.addCookies([{name:'little_post',value:fixture.cookie,url:baseURL,httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('console',entry=>{if(entry.type()==='error')errors.push(entry.text());});
    await page.addInitScript(()=>{
      const data={start:performance.now(),firstFrame:0,previous:0,frames:[] as number[],longTasks:[] as number[],feedbackAt:null as number|null,loadingFrames:0,raf:0,running:true,observer:null as PerformanceObserver|null};
      (window as Window&{__villageColdLoad?:typeof data}).__villageColdLoad=data;
      if(PerformanceObserver.supportedEntryTypes.includes('longtask')){data.observer=new PerformanceObserver(list=>data.longTasks.push(...list.getEntries().map(e=>e.duration)));data.observer.observe({type:'longtask'});}
      const tick=(now:number)=>{
        if(!data.running)return;
        if(!data.firstFrame)data.firstFrame=performance.now();
        if(data.previous)data.frames.push(now-data.previous);data.previous=now;
        if(document.body?.classList.contains('scene-loading')){data.feedbackAt??=now;data.loadingFrames++;}
        data.raf=requestAnimationFrame(tick);
      };data.raf=requestAnimationFrame(tick);
    });
    page.on('response',response=>{if(response.status()>=400)api.push({route:new URL(response.url()).pathname,status:response.status()});});
    const size=touch?'390':'1440',prefix=`${size}-${fixture.name}`,samples:Record<string,unknown>[]=[];let failure:string|undefined;
    try {
      await begin(page,touch);
      const cold=await page.evaluate(()=>{
        const data=(window as Window&{__villageColdLoad?:{start:number;firstFrame:number;frames:number[];longTasks:number[];feedbackAt:number|null;loadingFrames:number;raf:number;running:boolean;observer:PerformanceObserver|null}}).__villageColdLoad!;
        data.running=false;cancelAnimationFrame(data.raf);data.observer?.disconnect();
        const stats=(values:number[])=>{const a=[...values].sort((a,b)=>a-b);return a.length?{samples:a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],p99:a[Math.ceil(a.length*.99)-1],max:a.at(-1)}:null;};
        return {readyMs:performance.now()-data.start,firstFrameMs:data.firstFrame-data.start,feedbackFirstObservedMs:data.feedbackAt===null?null:data.feedbackAt-data.start,loadingFrames:data.loadingFrames,frames:stats(data.frames),longTasks:stats(data.longTasks),longFrames:{over50ms:data.frames.filter(x=>x>50).length,over100ms:data.frames.filter(x=>x>100).length}};
      });
      samples.push({label:prefix+'-cold-page-load',...cold,timingMeaning:'Fresh browser context, sampling from pre-app init script through complete loading and Begin. Includes loading frames and server/asset wait; firstFrameMs exposes any delay before the first rAF. No physical-phone or GPU-timing claim.'});
      await page.waitForTimeout(2200);
      await measureAction(page,prefix+'-settled-ground',samples,async()=>{await page.waitForTimeout(2000);},2000);
      await page.screenshot({path:join(output,prefix+'-ground.png')});
      await menu(page,'#view-mode',touch);await page.waitForTimeout(1200);
      await measureAction(page,prefix+'-overview',samples,async()=>{await page.waitForTimeout(2000);},2000);
      await page.screenshot({path:join(output,prefix+'-overview.png')});
      await menu(page,'#view-mode',touch);
      const feet=JSON.parse(await page.locator('#world canvas').getAttribute('data-ground-position')??'[]') as Vec3;
      const next=town.objects.filter(o=>town.roadObjects.includes(o.id)&&distance(o.position,feet,21.6)>.7&&distance(o.position,feet,21.6)<4.5).sort((a,b)=>distance(a.position,feet)-distance(b.position,feet))[0];
      if(next)await measureAction(page,prefix+'-actual-walk',samples,()=>groundWalk(page,next.position,touch,.4,12000),2000);
      await page.screenshot({path:join(output,prefix+'-walk.png')});
    }catch(error){failure=String(error);await page.screenshot({path:join(output,prefix+'-failed.png')}).catch(()=>{});}
    results.push({name:prefix,fixtureMeaning:'Initial saved positions prepared only in disposable database; subsequent movement uses real keyboard or touch controls.',failure,renderer:await rendererContext(page).catch(()=>null),samples,data:await page.locator('#world canvas').evaluate(el=>({...el.dataset})).catch(()=>null)});
    console.log(JSON.stringify({name:prefix,failure,samples:samples.map(s=>({label:s.label,frames:s.frames,drawCalls:s.drawCalls,triangles:s.triangles}))}));
    await context.close();
  }
}finally{writeFileSync(join(output,'report.json'),JSON.stringify({browser:'Installed Google Chrome via Playwright',version:browser.version(),physicalPhone:false,errors,api,results},null,2));await browser.close();}
if(errors.length||api.length||results.some(r=>(r as {failure?:string}).failure))process.exitCode=1;
