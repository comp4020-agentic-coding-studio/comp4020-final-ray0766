import { expect, it, vi } from 'vitest';
import { prewarmTerrainFits } from '../src/shared/terrain-prewarm.ts';
import { fieldOf, objectSeat } from '../src/shared/terrain.ts';
import { structureFit } from '../src/shared/blueprints.ts';
import { defaultEnvironment, encodeEnvironment } from '../src/assets/claude-geometry/terrain/env.ts';
import type { PartPlacement } from '../src/shared/blueprint-model.ts';
import type { PlacedObject } from '../src/shared/planets.ts';

function scene(seed:number) {
  const parts:PartPlacement[]=[{n:1,part:'floor.deck',x:2,z:2,level:0,rot:0}];
  const objects:PlacedObject[]=[
    {id:'house',kind:'structure',blueprintHash:'test',position:[0,1,0],rotation:0,version:1,radius:1,height:3},
    {id:'path',kind:'path',position:[.1,Math.sqrt(.99),0],rotation:.7,assetVersion:2,version:1},
    {id:'tree',kind:'tree',position:[0,Math.sqrt(.96),.2],rotation:1,assetVersion:2,version:1},
  ];
  return {radius:21.6,environment:encodeEnvironment(defaultEnvironment('temperate',seed)),objects,blueprints:{test:parts}};
}
it('yields between bounded batches and leaves exact fits ready for physics without changing authored content',async()=>{
  const planet=scene(62904),before=JSON.stringify(planet),progress:number[]=[];
  let frames=0;
  const result=await prewarmTerrainFits(planet,{budgetMs:0,yieldFrame:async()=>{frames++;},onProgress:done=>progress.push(done)});
  expect(result).toMatchObject({completed:3,total:3,cancelled:false});
  expect(frames).toBe(3);expect(progress).toEqual([0,1,2,3]);expect(JSON.stringify(planet)).toBe(before);
  expect([...result.fits.keys()]).toEqual(planet.objects.map(object=>object.id));
  for(const object of planet.objects)expect(result.fits.get(object.id)).toEqual(objectSeat(result.field,object,planet.blueprints));
  const spy=vi.spyOn(result.field,'heightAt');
  try {
    const house=planet.objects[0];
    expect(structureFit(planet.blueprints.test,house.position,house.rotation,result.field)).toEqual(objectSeat(result.field,house,planet.blueprints));
    objectSeat(result.field,planet.objects[1]);objectSeat(result.field,planet.objects[2]);
    expect(spy).not.toHaveBeenCalled();
  } finally {spy.mockRestore();}
});
it('cancels without preparing later objects and can resume with already completed exact fits',async()=>{
  const planet=scene(62905),controller=new AbortController();
  const result=await prewarmTerrainFits(planet,{signal:controller.signal,budgetMs:0,yieldFrame:async()=>{},onProgress:done=>{if(done===1)controller.abort();}});
  expect(result).toMatchObject({completed:1,total:3,cancelled:true});
  expect([...result.fits.keys()]).toEqual(['house']);
  const spy=vi.spyOn(fieldOf(planet.environment,planet.radius),'heightAt');
  try {
    const house=planet.objects[0];structureFit(planet.blueprints.test,house.position,house.rotation,result.field);
    expect(spy).not.toHaveBeenCalled();
    objectSeat(result.field,planet.objects[1]);expect(spy).toHaveBeenCalled();
  } finally {spy.mockRestore();}
  expect(await prewarmTerrainFits(planet,{yieldFrame:async()=>{}})).toMatchObject({completed:3,cancelled:false});
});
