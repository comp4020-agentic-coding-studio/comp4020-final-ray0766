// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mountSceneShortcuts,restoreSceneFocus} from '../src/client/scene-shortcuts.ts';
let canvas:HTMLCanvasElement,menu:HTMLDialogElement,allowed:boolean,controls:ReturnType<typeof mountSceneShortcuts>;
let open:ReturnType<typeof vi.fn<()=>void>>,release:ReturnType<typeof vi.fn<()=>void>>;
function key(target:EventTarget,key:string,flags:KeyboardEventInit={},type='keydown'){
 const e=new KeyboardEvent(type,{key,bubbles:true,cancelable:true,...flags});target.dispatchEvent(e);return e;
}
beforeEach(()=>{
 document.body.innerHTML='<canvas tabindex="0"></canvas><dialog><button>Close</button><input><button>Resume</button></dialog>';
 canvas=document.querySelector('canvas')!;menu=document.querySelector('dialog')!;allowed=true;release=vi.fn();open=vi.fn(()=>menu.setAttribute('open',''));
 controls=mountSceneShortcuts({scene:()=>canvas,canOpenMenu:()=>allowed,openMenu:open,releaseMouse:release});
});
afterEach(()=>{controls.dispose();document.body.innerHTML='';vi.restoreAllMocks();});
it('opens once from the scene and consumes the opening hold and release only',()=>{
 expect(key(canvas,'Tab').defaultPrevented).toBe(true);expect(open).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledTimes(1);
 const button=menu.querySelector('button')!;
 expect(key(button,'Tab',{repeat:true}).defaultPrevented).toBe(true);
 expect(key(button,'Tab',{},'keyup').defaultPrevented).toBe(true);expect(open).toHaveBeenCalledTimes(1);
 expect(key(button,'Tab').defaultPrevented).toBe(false);expect(key(button,'Tab',{shiftKey:true}).defaultPrevented).toBe(false);
 expect(key(button,'Tab',{},'keyup').defaultPrevented).toBe(false);
});
it('does not intercept controls, editable content, or their descendants',()=>{
 for(const html of ['<input>','<textarea></textarea>','<select><option>x</option></select>','<button><span>x</span></button>','<a href="#">x</a>','<div contenteditable="true"><span>x</span></div>']){
  const host=document.createElement('div');host.innerHTML=html;document.body.append(host);
  const target=host.querySelector('span')??host.firstElementChild!;
  expect(key(target,'Tab').defaultPrevented).toBe(false);host.remove();
 }
 expect(open).not.toHaveBeenCalled();expect(release).not.toHaveBeenCalled();
});
it('preserves modified Tab, composition, existing prevention and repeated keys without a scene hold',()=>{
 for(const flags of [{shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true},{repeat:true}])expect(key(canvas,'Tab',flags).defaultPrevented).toBe(false);
 const e=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});e.preventDefault();canvas.dispatchEvent(e);expect(open).not.toHaveBeenCalled();
});
it('blocks scene opening while a modal, editor, onboarding or transition owns interaction',()=>{
 allowed=false;expect(key(canvas,'Tab').defaultPrevented).toBe(false);allowed=true;menu.setAttribute('open','');
 expect(key(canvas,'Tab').defaultPrevented).toBe(false);expect(open).not.toHaveBeenCalled();
});
it('allows body focus to open, and resets an interrupted hold on blur',()=>{
 key(document.body,'Tab');window.dispatchEvent(new Event('blur'));menu.removeAttribute('open');key(canvas,'Tab');expect(open).toHaveBeenCalledTimes(2);
});
it('Escape only releases capture and never reaches unrelated key handlers',()=>{
 const later=vi.fn();window.addEventListener('keydown',later);window.addEventListener('keyup',later);
 try{for(const target of[canvas,menu.querySelector('input')!]){
  expect(key(target,'Escape').defaultPrevented).toBe(true);expect(key(target,'Escape',{},'keyup').defaultPrevented).toBe(true);
 }expect(release).toHaveBeenCalledTimes(2);expect(open).not.toHaveBeenCalled();expect(later).not.toHaveBeenCalled();}
 finally{window.removeEventListener('keydown',later);window.removeEventListener('keyup',later);}
});
it('prevents native Escape cancellation before dialog listeners, but leaves explicit close available',()=>{
 menu.setAttribute('open','');const legacy=vi.fn(()=>menu.removeAttribute('open'));menu.addEventListener('cancel',legacy);
 const e=new Event('cancel',{bubbles:false,cancelable:true});menu.dispatchEvent(e);
 expect(e.defaultPrevented).toBe(true);expect(legacy).not.toHaveBeenCalled();expect(menu.open).toBe(true);expect(release).toHaveBeenCalledTimes(1);
 menu.querySelector('button')!.onclick=()=>menu.removeAttribute('open');menu.querySelector('button')!.click();expect(menu.open).toBe(false);
});
it('leaves Space guide input and unrelated keys to their own handlers',()=>{
 expect(key(canvas,' ',{code:'Space'}).defaultPrevented).toBe(false);expect(key(canvas,'w').defaultPrevented).toBe(false);expect(open).not.toHaveBeenCalled();
});

it('a queued close event cannot steal a newly opened guide/editor focus',()=>{
 const bubble=document.createElement('section');bubble.setAttribute('role','dialog');bubble.innerHTML='<input>';document.body.append(bubble);const input=bubble.querySelector('input')!;input.focus();restoreSceneFocus(canvas);expect(document.activeElement).toBe(input);
 bubble.hidden=true;menu.setAttribute('open','');menu.querySelector('button')!.focus();restoreSceneFocus(canvas);expect(document.activeElement).toBe(menu.querySelector('button'));
 menu.removeAttribute('open');restoreSceneFocus(canvas);expect(document.activeElement).toBe(canvas);
});
