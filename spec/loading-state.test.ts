// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {beginSceneLoading,sceneLoadingActive,yieldSceneFrame} from '../src/client/loading-state.ts';

const tasks:ReturnType<typeof beginSceneLoading>[]=[];
const begin=(...args:Parameters<typeof beginSceneLoading>)=>{const task=beginSceneLoading(...args);tasks.push(task);return task;};
const dialog=()=>document.querySelector<HTMLDialogElement>('.scene-loading-overlay')!;
const dialogMethods=new Map(['showModal','close'].map(name=>[name,Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,name)]));
beforeEach(()=>{
  document.documentElement.lang='en';
  Object.defineProperties(HTMLDialogElement.prototype,{
    showModal:{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}},
    close:{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}},
  });
});
afterEach(()=>{
  for(const task of tasks.splice(0))task.finish();vi.restoreAllMocks();vi.unstubAllGlobals();
  for(const[name,descriptor]of dialogMethods)if(descriptor)Object.defineProperty(HTMLDialogElement.prototype,name,descriptor);else Reflect.deleteProperty(HTMLDialogElement.prototype,name);
});

it('keeps the latest nested task above dialogs and restores the earlier task until it finishes',()=>{
  const ground=begin('Preparing your world…');ground.update('Preparing the ground…',2,5);
  const workshop=begin('Opening the workshop…');
  expect(dialog().open).toBe(true);expect(dialog().querySelector('strong')!.textContent).toBe('Opening the workshop…');
  ground.update('Bringing buildings into view…',4,5);
  expect(dialog().querySelector('strong')!.textContent).toBe('Opening the workshop…');
  workshop.finish();workshop.finish();
  expect(sceneLoadingActive()).toBe(true);expect(dialog().open).toBe(true);
  expect(dialog().querySelector('.scene-loading-phase')!.textContent).toBe('Bringing buildings into view…');
  expect(dialog().querySelector('progress')!.value).toBe(4);
  ground.finish();expect(sceneLoadingActive()).toBe(false);expect(dialog().open).toBe(false);
  expect(document.body.classList.contains('scene-loading')).toBe(false);
});

it('blocks new gameplay input but lets release handlers clear held keys and pointers',()=>{
  const task=begin('Preparing your world…'),received:string[]=[],capture=(event:Event)=>received.push(event.type);
  const names=['keydown','keyup','pointerdown','pointerup','pointercancel','click','wheel'];
  for(const name of names)window.addEventListener(name,capture);
  try{
    for(const name of names)document.body.dispatchEvent(new Event(name,{bubbles:true,cancelable:true}));
    expect(received).toEqual(['keyup','pointerup','pointercancel']);
    task.finish();document.body.dispatchEvent(new Event('keydown',{bubbles:true}));
    expect(received.at(-1)).toBe('keydown');
  }finally{for(const name of names)window.removeEventListener(name,capture);}
});

it('keeps failure feedback modal and lets its retry button run without unblocking gameplay',()=>{
  const task=begin('Preparing your world…'),retry=vi.fn();
  task.fail('Could not finish loading. Your saved world is unchanged.',retry);
  expect(dialog().open).toBe(true);expect(dialog().querySelector('progress')!.hidden).toBe(true);
  dialog().querySelector('button')!.click();expect(retry).toHaveBeenCalledTimes(1);
  expect(sceneLoadingActive()).toBe(true);
  task.update('Finishing the view…');expect(dialog().querySelector('button')!.hidden).toBe(true);
  expect(dialog().querySelector('progress')!.hidden).toBe(false);
});

it('cancels an outstanding animation frame even when the browser has stopped painting',async()=>{
  const frame=vi.fn(()=>37),cancel=vi.fn();vi.stubGlobal('requestAnimationFrame',frame);vi.stubGlobal('cancelAnimationFrame',cancel);
  const controller=new AbortController(),waiting=yieldSceneFrame(controller.signal);
  const rejected=expect(waiting).rejects.toMatchObject({name:'AbortError'});controller.abort();await rejected;
  expect(cancel).toHaveBeenCalledWith(37);
  await expect(yieldSceneFrame(controller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(frame).toHaveBeenCalledTimes(1);
});

it('cancels only an explicitly cancellable latest task, keeping a required world load blocked',()=>{
  const ground=begin('Preparing your world…'),cancel=vi.fn();
  const workshop=begin('Opening the workshop…',{onCancel:()=>{cancel();workshop.finish();}});
  dialog().dispatchEvent(new Event('cancel',{cancelable:true}));
  expect(cancel).toHaveBeenCalledTimes(1);expect(sceneLoadingActive()).toBe(true);
  expect(dialog().querySelector<HTMLButtonElement>('.scene-loading-cancel')!.hidden).toBe(true);
  const escape=new Event('cancel',{cancelable:true});dialog().dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);expect(cancel).toHaveBeenCalledTimes(1);expect(dialog().open).toBe(true);
  ground.finish();
});

it('uses neutral localized feedback without asserting an unacknowledged movement was saved',()=>{
  document.documentElement.lang='zh-CN';begin('Preparing your world…');
  expect(dialog().querySelector('strong')!.textContent).toBe('正在准备你的星球…');
  expect(dialog().querySelector('.scene-loading-help')!.textContent).toBe('画面准备完成后即可继续操作。');
});
