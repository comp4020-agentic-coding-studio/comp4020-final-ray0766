// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {mountWelcome} from '../src/client/welcome.ts';
import {beginSceneLoading,sceneLoadingActive} from '../src/client/loading-state.ts';

const deviceNotes={
  en:'Little Worlds uses real-time 3D graphics. Lower-performance devices may load slowly, stutter, or fail to finish loading. Please try “Smooth” quality first; if the game still does not run smoothly, consider using a more powerful computer. Loading failures may also be related to your network or browser settings.',
  zh:'小星球使用实时 3D 画面。性能较低的设备可能加载缓慢、出现卡顿，或无法完成加载。请先尝试「流畅」画质；若仍无法顺畅运行，建议换用性能更强的电脑。加载失败也可能与网络或浏览器设置有关。',
};
const html=readFileSync('index.html','utf8');
const markup=html.slice(html.indexOf('<div id="boot-loading">'),html.indexOf('<script>'));
const tasks:ReturnType<typeof beginSceneLoading>[]=[];
let welcome:ReturnType<typeof mountWelcome>|undefined;
const get=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id)! as T;
const dialogMethods=new Map(['showModal','close'].map(name=>[name,Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,name)]));
const begin=(title='Preparing your world…')=>{const task=beginSceneLoading(title);tasks.push(task);return task;};
beforeEach(()=>{
  document.documentElement.lang='en';document.body.insertAdjacentHTML('beforeend',markup);
  Object.defineProperties(HTMLDialogElement.prototype,{
    showModal:{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}},
    close:{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}},
  });
});
afterEach(()=>{
  welcome?.dispose();welcome=undefined;for(const task of tasks.splice(0))task.finish();
  get('boot-loading').remove();vi.restoreAllMocks();
  for(const[name,descriptor]of dialogMethods)if(descriptor)Object.defineProperty(HTMLDialogElement.prototype,name,descriptor);else Reflect.deleteProperty(HTMLDialogElement.prototype,name);
});
it('shows a static indeterminate stage before the main module and offers no premature Start',()=>{
  expect(html.indexOf('id="boot-loading"')).toBeLessThan(html.indexOf('id="game-module"'));
  expect(get('welcome-stage').textContent).toBe('Downloading game modules…');
  expect(get('welcome-progress').hasAttribute('value')).toBe(false);
  expect(get<HTMLButtonElement>('welcome-start').disabled).toBe(true);
  expect(get<HTMLDialogElement>('welcome-panel').open).toBe(false);
});
it('requires both committed world readiness and completed real tasks before first Start',()=>{
  const start=vi.fn();welcome=mountWelcome({onStart:start});
  get('welcome-start').click();expect(start).not.toHaveBeenCalled();
  const task=begin();task.update('Preparing the ground…',3,8);
  expect(get<HTMLProgressElement>('welcome-progress').value).toBe(3);expect(get('welcome-count').textContent).toContain('3 / 8');
  expect(document.querySelector<HTMLDialogElement>('.scene-loading-overlay')!.open).toBe(false);
  expect(get<HTMLDialogElement>('welcome-panel').open).toBe(true);
  welcome.ready({firstVisit:true});expect(get<HTMLButtonElement>('welcome-start').disabled).toBe(true);
  task.finish();expect(get<HTMLButtonElement>('welcome-start').disabled).toBe(false);expect(get('boot-loading').hidden).toBe(false);
  get('welcome-start').click();get('welcome-start').click();expect(start).toHaveBeenCalledOnce();expect(get('boot-loading').hidden).toBe(true);
});
it('lets returning players enter automatically without another mandatory welcome',()=>{
  const start=vi.fn();welcome=mountWelcome({onStart:start});const task=begin();
  welcome.ready({firstVisit:false});expect(start).not.toHaveBeenCalled();task.finish();
  expect(start).toHaveBeenCalledOnce();expect(get('boot-loading').hidden).toBe(true);
});
it('keeps unknown final/shader stages indeterminate and translates live without changing readiness',async()=>{
  welcome=mountWelcome({onStart:vi.fn()});const task=begin();task.update('Bringing buildings into view…',4,9);
  task.update('Finishing the view…');expect(get('welcome-progress').hasAttribute('value')).toBe(false);expect(get('welcome-count').hidden).toBe(true);
  document.documentElement.lang='zh-CN';await Promise.resolve();
  expect(get('welcome-stage').textContent).toBe('正在完成画面…');expect(get('welcome-start').textContent).toBe('正在准备你的星球…');
  expect(get('welcome-panel').querySelector('h1')!.textContent).toBe('小星球');
  expect(get<HTMLButtonElement>('welcome-start').disabled).toBe(true);
});
it('presents only actual graphics failure guidance, with explicit retry and no identity/network work',()=>{
  const start=vi.fn(),retry=vi.fn();welcome=mountWelcome({onStart:start,onRetry:retry});
  expect(get('welcome-help').textContent).not.toContain('hardware');expect(get('welcome-retry').hidden).toBe(true);
  welcome.failed('graphics');expect(get('welcome-stage').textContent).toBe('The 3D view is temporarily unavailable.');
  expect(get('welcome-help').textContent).toContain('hardware acceleration');expect(get('welcome-start').hidden).toBe(true);
  get('welcome-retry').click();expect(retry).toHaveBeenCalledOnce();expect(start).not.toHaveBeenCalled();expect(get<HTMLButtonElement>('welcome-start').disabled).toBe(true);
});
it('embeds task errors and retries the existing task while still blocking world input',()=>{
  const start=vi.fn(),retry=vi.fn();welcome=mountWelcome({onStart:start});const task=begin();
  task.fail('Could not finish loading. Your saved world is unchanged.',retry);expect(get('welcome-retry').hidden).toBe(false);
  get('welcome-retry').click();expect(retry).toHaveBeenCalledOnce();expect(sceneLoadingActive()).toBe(true);expect(start).not.toHaveBeenCalled();
  task.update('Finishing the view…');expect(get('welcome-retry').hidden).toBe(true);task.finish();
  expect(get<HTMLButtonElement>('welcome-start').disabled).toBe(true);
});
it('keeps quality controls usable during loading and releases the loading modal on disposal',()=>{
  const quality=document.createElement('div'),button=document.createElement('button'),change=vi.fn();quality.append(button);button.onclick=change;
  welcome=mountWelcome({onStart:vi.fn(),qualityControl:quality});const task=begin();
  button.click();expect(change).toHaveBeenCalledOnce();expect(get('welcome-quality').hidden).toBe(false);
  const cancel=new Event('cancel',{cancelable:true});get('welcome-panel').dispatchEvent(cancel);expect(cancel.defaultPrevented).toBe(true);
  welcome.dispose();expect(document.querySelector<HTMLDialogElement>('.scene-loading-overlay')!.open).toBe(true);task.finish();
});

it('can remount the completed welcome DOM for a real context-loss notice',async()=>{
  const entered=vi.fn(),reload=vi.fn();welcome=mountWelcome({onStart:entered});
  welcome.ready({firstVisit:false});expect(entered).toHaveBeenCalledOnce();
  expect(get('boot-loading').hidden).toBe(true);expect(get<HTMLDialogElement>('welcome-panel').open).toBe(false);
  welcome=mountWelcome({onStart:vi.fn()});welcome.failed('graphics',reload);
  expect(get('boot-loading').hidden).toBe(false);expect(get<HTMLDialogElement>('welcome-panel').open).toBe(true);
  expect(get('welcome-stage').textContent).toBe('The 3D view is temporarily unavailable.');
  expect(get('welcome-start').hidden).toBe(true);expect(get('welcome-retry').hidden).toBe(false);
  document.documentElement.lang='zh-CN';await Promise.resolve();
  expect(get('welcome-stage').textContent).toBe('三维画面暂时不可用。');
  get('welcome-retry').click();expect(reload).toHaveBeenCalledOnce();
});

it.each(['en','zh-CN'])('keeps the device notice available before modules and after a module failure (%s)',language=>{
  const page=new JSDOM(html,{url:'http://welcome.test/',runScripts:'dangerously',beforeParse(window){
    window.localStorage.setItem('little-worlds:language:v1',language==='zh-CN'?'zh':'en');
  }});
  try {
    const doc=page.window.document,note=doc.getElementById('welcome-device-note')!;
    expect(doc.documentElement.lang).toBe(language);
    expect(note.textContent).toBe(deviceNotes[language==='zh-CN'?'zh':'en']);
    expect(doc.getElementById('welcome-panel')!.getAttribute('aria-describedby')!.split(' ')).toContain(note.id);
    doc.getElementById('game-module')!.dispatchEvent(new page.window.Event('error'));
    expect(doc.getElementById('welcome-retry')!.hidden).toBe(false);
    expect(note.textContent).toBe(deviceNotes[language==='zh-CN'?'zh':'en']);
  } finally {page.window.close();}
});
it.each(['en','zh-CN'])('offers retry when the built module script has no source HTML id (%s)',language=>{
  const page=new JSDOM(html.replace('id="game-module" ',''),{url:'http://welcome.test/',runScripts:'dangerously',beforeParse(window){
    window.localStorage.setItem('little-worlds:language:v1',language==='zh-CN'?'zh':'en');
  }});
  try{
    const doc=page.window.document,retry=doc.getElementById('welcome-retry')!;
    const image=doc.createElement('img');doc.body.append(image);image.dispatchEvent(new page.window.Event('error'));
    expect(retry.hidden).toBe(true);
    const script=doc.querySelector('script[type="module"][src]')!;expect(script.id).toBe('');
    script.dispatchEvent(new page.window.Event('error'));
    expect(retry.hidden).toBe(false);expect(doc.getElementById('welcome-start')!.hidden).toBe(true);
    expect(doc.getElementById('welcome-device-note')!.textContent).toBe(deviceNotes[language==='zh-CN'?'zh':'en']);
  }finally{page.window.close();}
});
it('preserves the device notice through readiness, graphics failure and live language changes',async()=>{
  welcome=mountWelcome({onStart:vi.fn()});
  expect(get('welcome-device-note').textContent).toBe(deviceNotes.en);
  document.documentElement.lang='zh-CN';await Promise.resolve();
  expect(get('welcome-device-note').textContent).toBe(deviceNotes.zh);
  welcome.ready({firstVisit:true});
  expect(get('welcome-device-note').textContent).toBe(deviceNotes.zh);
  welcome.failed('graphics');
  expect(get('welcome-device-note').textContent).toBe(deviceNotes.zh);
  expect(get('welcome-retry').hidden).toBe(false);
  document.documentElement.lang='en';await Promise.resolve();
  expect(get('welcome-device-note').textContent).toBe(deviceNotes.en);
});


it.each([null,'','bad','zh-CN','en','zh'])('uses English boot defaults and preserves only explicit saved Chinese (%s)',saved=>{
 const page=new JSDOM(html,{url:'http://welcome.test/',runScripts:'dangerously',beforeParse(window){
  Object.defineProperty(window.navigator,'language',{value:'zh-CN',configurable:true});
  if(saved!==null)window.localStorage.setItem('little-worlds:language:v1',saved);
 }});
 try{const doc=page.window.document,zh=saved==='zh';expect(doc.documentElement.lang).toBe(zh?'zh-CN':'en');expect(doc.getElementById('welcome-device-note')!.textContent).toBe(deviceNotes[zh?'zh':'en']);doc.getElementById('game-module')!.dispatchEvent(new page.window.Event('error'));expect(doc.getElementById('welcome-stage')!.textContent).toBe(zh?'游戏模块暂时无法加载。':'The game modules could not be loaded.');}finally{page.window.close();}
});
