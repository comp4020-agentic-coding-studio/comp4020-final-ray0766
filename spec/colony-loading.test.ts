// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {Group} from 'three';
import {Colony} from '../src/client/colony.ts';
import type {PlanetView} from '../src/shared/planets.ts';

afterEach(()=>{vi.restoreAllMocks();document.body.innerHTML='';});
const planet=():PlanetView=>({id:'private',kind:'garden',name:'Saved home',slot:1,center:[0,0,0],radius:12,environment:null,claimed:true,mine:true,revision:2,objectCount:3,
  objects:[1,2,3].map(n=>({id:String(n),kind:'path',position:[0,1,0],rotation:0,version:1})),blueprints:{}});
function fixture(){
  document.body.innerHTML='<select id="built-list"></select><canvas></canvas>';
  const old=new Group(),oldDisposed=vi.fn();old.userData.disposeOwned=oldDisposed;
  const layer=new Group();layer.add(old);
  const models:{group:Group;dispose:ReturnType<typeof vi.fn>}[]=[],obstacles=vi.fn();
  let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
  const render=vi.fn(()=>{now+=4;const group=new Group(),dispose=vi.fn();group.userData.disposeOwned=dispose;models.push({group,dispose});return group;});
  const colony=Object.assign(Object.create(Colony.prototype),{
    bridge:{canvas:document.querySelector('canvas'),obstacles},layer,objects:new Map(),painted:'',selected:null,
    shadows:{clear:vi.fn(),replace:vi.fn()},previewPaths:vi.fn(),renderObject:render,
  }) as Colony;
  const gates:Array<()=>void>=[],controller=new AbortController();
  const yieldFrame=()=>new Promise<void>(resolve=>gates.push(resolve));
  const frame=async()=>{expect(gates.length).toBeGreaterThan(0);gates.shift()!();for(let n=0;n<8;n++)await Promise.resolve();};
  return {colony,layer,old,oldDisposed,models,render,obstacles,controller,yieldFrame,frame};
}

it('keeps the old layer until all saved objects are prepared, then replaces it as one commit',async()=>{
  const f=fixture(),saved=planet(),before=JSON.stringify(saved),progress=vi.fn();
  const waiting=f.colony.prepareObjects(saved,{signal:f.controller.signal,yieldFrame:f.yieldFrame,budgetMs:6,onProgress:progress});
  expect(f.render).not.toHaveBeenCalled();expect(f.layer.children).toEqual([f.old]);
  await f.frame();expect(f.render).toHaveBeenCalledTimes(2);expect(f.oldDisposed).not.toHaveBeenCalled();
  await f.frame();const prepared=await waiting;
  expect(f.render).toHaveBeenCalledTimes(3);expect(f.layer.children).toEqual([f.old]);expect(prepared.root.children).toHaveLength(3);
  expect(progress).toHaveBeenLastCalledWith(3,3);prepared.commit();
  expect(f.layer.children).toEqual(f.models.map(model=>model.group));expect(f.oldDisposed).toHaveBeenCalledTimes(1);
  prepared.dispose();expect(f.models.every(model=>model.dispose.mock.calls.length===0)).toBe(true);
  expect(document.querySelector('canvas')!.dataset.placedAssetKinds).toBe('path,path,path');expect(JSON.stringify(saved)).toBe(before);
});

it('releases cancelled staged objects and preserves the visible layer and saved data',async()=>{
  const f=fixture(),saved=planet(),before=JSON.stringify(saved);
  const waiting=f.colony.prepareObjects(saved,{signal:f.controller.signal,yieldFrame:f.yieldFrame,budgetMs:6});
  const rejected=expect(waiting).rejects.toMatchObject({name:'AbortError'});
  await f.frame();f.controller.abort();await f.frame();await rejected;
  expect(f.render).toHaveBeenCalledTimes(2);expect(f.models.every(model=>model.dispose.mock.calls.length===1)).toBe(true);
  expect(f.layer.children).toEqual([f.old]);expect(f.oldDisposed).not.toHaveBeenCalled();expect(f.obstacles).not.toHaveBeenCalled();
  expect(JSON.stringify(saved)).toBe(before);
});

it('cleans an interrupted factory and does not replace the prior layer with partial geometry',async()=>{
  const f=fixture();f.render.mockImplementationOnce(()=>{const group=new Group(),dispose=vi.fn();group.userData.disposeOwned=dispose;f.models.push({group,dispose});return group;});
  f.render.mockImplementationOnce(()=>{throw Error('Model preparation failed');});
  const waiting=f.colony.prepareObjects(planet(),{signal:f.controller.signal,yieldFrame:f.yieldFrame});
  const rejected=expect(waiting).rejects.toThrow('Model preparation failed');await f.frame();await rejected;
  expect(f.models[0].dispose).toHaveBeenCalledTimes(1);expect(f.layer.children).toEqual([f.old]);expect(f.oldDisposed).not.toHaveBeenCalled();
});
