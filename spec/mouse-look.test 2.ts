// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createMouseLook,lookDelta} from '../src/client/mouse-look.ts';
let canvas:HTMLCanvasElement,lock:Element|null,allowed:boolean,controls:ReturnType<typeof createMouseLook>;
let move:ReturnType<typeof vi.fn<(x:number,y:number)=>void>>,released:ReturnType<typeof vi.fn<()=>void>>,changed:ReturnType<typeof vi.fn<(mode:string)=>void>>;
const event=()=>document.dispatchEvent(new Event('pointerlockchange'));
function acquire(){lock=canvas;event();}
function motion(x:number,y:number){const e=new MouseEvent('mousemove');Object.defineProperties(e,{movementX:{value:x},movementY:{value:y}});document.dispatchEvent(e);}
beforeEach(()=>{
 document.body.innerHTML='<canvas></canvas>';canvas=document.querySelector('canvas')!;lock=null;allowed=true;
 Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>lock});Object.defineProperty(document,'hidden',{configurable:true,value:false});
 canvas.requestPointerLock=vi.fn();document.exitPointerLock=vi.fn(()=>{lock=null;event();});
 move=vi.fn();released=vi.fn();changed=vi.fn();controls=createMouseLook({element:canvas,canLook:()=>allowed,move,released,changed});
});
afterEach(()=>{controls.dispose();vi.restoreAllMocks();});
it('waits for an explicit request and confirmed lock before consuming unbuttoned movement',()=>{
 motion(100,20);expect(canvas.requestPointerLock).not.toHaveBeenCalled();expect(move).not.toHaveBeenCalled();
 controls.request();motion(10,2);expect(move).not.toHaveBeenCalled();expect(changed).toHaveBeenLastCalledWith('pending');acquire();motion(40,-20);
 expect(move).toHaveBeenCalledWith(40,-20);expect(changed).toHaveBeenLastCalledWith('locked');
});
it('does not request while blocked by a menu, editor, conversation or editable focus',()=>{
 allowed=false;controls.request();expect(canvas.requestPointerLock).not.toHaveBeenCalled();
});
it('releases on mode change before accepting another mouse delta',()=>{
 controls.request();acquire();allowed=false;motion(50,50);expect(move).not.toHaveBeenCalled();expect(lock).toBeNull();expect(released).toHaveBeenCalled();
});
it('cancels a pending capture if a menu opens before the browser grants it',()=>{
 controls.request();allowed=false;controls.sync();acquire();expect(lock).toBeNull();expect(move).not.toHaveBeenCalled();
});
it('ignores repeated requests while the browser is deciding',()=>{
 controls.request();controls.request();expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
});
it('Escape clears held movement and requires a new gesture to recapture',()=>{
 controls.request();acquire();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(lock).toBeNull();expect(released).toHaveBeenCalled();
 controls.sync();motion(400,400);expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);expect(move).not.toHaveBeenCalled();
});
it('native browser unlock clears held movement too',()=>{
 controls.request();acquire();lock=null;event();expect(released).toHaveBeenCalled();motion(10,10);expect(move).not.toHaveBeenCalled();
});
it('blur releases without changing heading or replaying free cursor displacement on return',()=>{
 controls.request();acquire();motion(3,4);window.dispatchEvent(new Event('blur'));motion(900,900);window.dispatchEvent(new Event('focus'));expect(move).toHaveBeenCalledTimes(1);
 controls.request();acquire();motion(1,2);expect(move.mock.calls).toEqual([[3,4],[1,2]]);
});
it('hidden pages release and cannot capture',()=>{
 controls.request();acquire();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));controls.request();expect(lock).toBeNull();expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
});
it('pointer-lock refusal enables drag fallback without retrying automatically',()=>{
 controls.request();document.dispatchEvent(new Event('pointerlockerror'));expect(controls.canCapture()).toBe(false);expect(changed).toHaveBeenLastCalledWith('drag');controls.sync();expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
 controls.request();acquire();expect(controls.canCapture()).toBe(true);expect(controls.locked()).toBe(true);
});
it('handles both synchronous exceptions and rejected promises',async()=>{
 canvas.requestPointerLock=vi.fn(()=>{throw Error('unsupported');});expect(()=>controls.request()).not.toThrow();expect(controls.canCapture()).toBe(false);
 canvas.requestPointerLock=vi.fn(()=>Promise.reject(Error('denied')));controls.request();await Promise.resolve();expect(changed).toHaveBeenLastCalledWith('drag');
});
it('unsupported browsers keep their cursor and drag fallback',()=>{
 Object.defineProperty(canvas,'requestPointerLock',{value:undefined,configurable:true});controls.request();expect(controls.canCapture()).toBe(false);expect(lock).toBeNull();
});
it('does not turn on touch pointer movement',()=>{
 canvas.dispatchEvent(new MouseEvent('pointermove',{clientX:200,clientY:100,bubbles:true}));expect(move).not.toHaveBeenCalled();expect(canvas.requestPointerLock).not.toHaveBeenCalled();
});
it('disposal cancels even a late asynchronous grant',()=>{
 controls.request();controls.dispose();acquire();expect(lock).toBeNull();motion(30,30);expect(move).not.toHaveBeenCalled();
});
it('maps right/up mouse movement to right/up look with finite bounded pitch',()=>{
 expect(lookDelta(100,-100,0)).toEqual({yaw:-.3,pitch:.25});expect(lookDelta(0,-10000,0).pitch).toBe(.7);expect(lookDelta(0,10000,0).pitch).toBe(-.3);
 expect(lookDelta(NaN,2,.2)).toEqual({yaw:0,pitch:.2});expect(lookDelta(1,Infinity,.2)).toEqual({yaw:0,pitch:.2});
});
