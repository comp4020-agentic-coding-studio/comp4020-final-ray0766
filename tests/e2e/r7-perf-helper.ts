import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Vector3 } from 'three';
import { MAX_OBJECTS, placementProblem } from '../../src/shared/planets.ts';
import type { BuildKind } from '../../src/shared/planets.ts';
import { MAX_STRUCTURES, structureFit, structureSize } from '../../src/shared/blueprints.ts';
import type { LibraryEntry } from '../../src/shared/blueprints.ts';
import type { Vec3 } from '../../src/shared/world.ts';
import { readUniverse } from './flight-helper.ts';

/** Read the actual main renderer. rAF cadence is browser scheduling, and
 * renderCpuMs is CPU submission time; neither is a GPU-synchronised timing. */
export async function sampleMainScene(page:Page,label:string){
  await page.bringToFront();
  await expect.poll(async()=>Number(await page.locator('#world canvas').getAttribute('data-triangles'))).toBeGreaterThan(100);
  await page.waitForTimeout(900);
  const sample=await page.locator('#world canvas').evaluate(async node=>{
    const canvas=node as HTMLCanvasElement,drawCalls:number[]=[],triangles:number[]=[],raf:number[]=[],cpu:number[]=[];
    const start=performance.now();let previous=0;
    await new Promise<void>(resolve=>{
      const tick=(now:number)=>{
        if(previous)raf.push(now-previous);previous=now;
        drawCalls.push(Number(canvas.dataset.drawCalls));triangles.push(Number(canvas.dataset.triangles));
        const ms=Number(canvas.dataset.renderCpuMs);if(canvas.dataset.renderCpuMs!==undefined&&Number.isFinite(ms))cpu.push(ms);
        if(now-start<2500)requestAnimationFrame(tick);else resolve();
      };requestAnimationFrame(tick);
    });
    const stats=(values:number[])=>{const a=values.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?{median:a[Math.floor((a.length-1)*.5)],p95:a[Math.floor((a.length-1)*.95)],max:a.at(-1)!}:null;};
    const vector=(name:string)=>canvas.dataset[name]?JSON.parse(canvas.dataset[name]!):null;
    return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},drawingBuffer:{width:canvas.width,height:canvas.height},seconds:(performance.now()-start)/1000,
      frames:raf.length,drawCalls:stats(drawCalls),triangles:stats(triangles),rafCadenceMs:stats(raf),renderCpuMs:stats(cpu),
      cameraPosition:vector('cameraPosition'),cameraHeading:vector('cameraHeading'),groundPosition:vector('groundPosition'),
      visitors:Number(canvas.dataset.visitors??0),quality:canvas.dataset.quality,
      shadowObjects:Number(canvas.dataset.placedShadowObjects??0),shadowObjectsTotal:Number(canvas.dataset.placedShadowTotal??0)};
  });
  const u=await readUniverse(page);
  return {label,...sample,objects:u.currentPlanet.objectCount,structures:u.currentPlanet.objects.filter(o=>o.kind==='structure').length,
    timingNote:'Main scene, 2.5 s stationary capture. Draw/triangle counters update about 10 Hz. rAF is browser cadence; optional render CPU counter is a 30-frame submission mean, not GPU time. Phone dimensions emulate a handset on this Mac.'};
}

/** Optional capacity fixture, normal authorised owner APIs only. Call after
 * movement checks: this fills the same test planet to the unchanged limits.
 * No player position, saved history or existing object is rewritten. */
export async function populateCapacity(page:Page,entry:LibraryEntry){
  let u=await readUniverse(page),cursor=0,attempts=0;
  if(!u.currentPlanet.mine||u.currentPlanet.environment)throw Error('Capacity fixture expects the test owner on a legacy-ground planet.');
  const count=2048,player=new Vector3(...u.player.position),size=structureSize(entry.blueprint.parts);
  const kinds:BuildKind[]=['cottage','tree','path','flowers','bench','lamp'];
  async function add(kind:BuildKind|'structure'){
    while(cursor<count){
      const i=cursor++,y=1-2*(i+.5)/count,r=Math.sqrt(1-y*y),angle=i*Math.PI*(3-Math.sqrt(5));
      const position:Vec3=[r*Math.cos(angle),y,r*Math.sin(angle)],rotation=(i%8)*Math.PI/4;
      if(player.angleTo(new Vector3(...position))*10<(kind==='structure'?size.radius:1.05)+1.2)continue;
      if(placementProblem(kind,position,u.currentPlanet.objects,undefined,kind==='structure'?size.radius:undefined))continue;
      if(kind==='structure'&&structureFit(entry.blueprint.parts,position,rotation).problem)continue;
      attempts++;
      const response=await page.request.post('/api/objects/create',{data:{planetId:u.currentPlanet.id,objectId:randomUUID(),kind,position,rotation,...(kind==='structure'?{blueprintHash:entry.hash}:{})}});
      if(!response.ok())throw Error(`Capacity ${kind}: ${response.status()} ${await response.text()}`);
      u=await response.json();return;
    }
    throw Error('Capacity fixture exhausted valid non-overlapping sites.');
  }
  while(u.currentPlanet.objects.filter(o=>o.kind==='structure').length<MAX_STRUCTURES)await add('structure');
  let n=0;while(u.currentPlanet.objectCount<MAX_OBJECTS)await add(kinds[n++%kinds.length]);
  await expect(page.locator('#planet-count')).toHaveText(`${MAX_OBJECTS} / ${MAX_OBJECTS} objects`,{timeout:10000});
  return {objects:u.currentPlanet.objectCount,structures:u.currentPlanet.objects.filter(o=>o.kind==='structure').length,attempts,
    composition:Object.fromEntries(['structure',...kinds].map(kind=>[kind,u.currentPlanet.objects.filter(o=>o.kind===kind).length]))};
}
