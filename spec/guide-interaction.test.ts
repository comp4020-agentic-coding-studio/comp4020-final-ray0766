// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {Scene,OrthographicCamera,Vector3,Group} from 'three';
import {guideShortcut,localGuideAnswer,nearbyGuidePoint} from '../src/client/guide-interaction.ts';
import {createWorldGuide} from '../src/client/world-guide.ts';
import {portPoint} from '../src/shared/ports.ts';
import type {Universe} from '../src/shared/planets.ts';
import type {GroundWorld} from '../src/shared/physics/world.ts';
vi.mock('../src/client/character.ts',()=>({courier:()=>({root:new Group(),greet:vi.fn(),animate:vi.fn()})}));
vi.mock('../src/client/tutorial-route.ts',()=>({createTutorialRoute:()=>{const root=new Group();return{root,diagnostics:{connected:true,reason:'direct'},frame:vi.fn(x=>root.visible=!!x.visible&&!x.paused&&!!x.target)}}}));
afterEach(()=>{document.body.innerHTML='';vi.unstubAllGlobals();});
it('Space respects editing, native controls, modifiers, composition and held keys',()=>{
 for(const tag of ['input','textarea','select','button','a']){const el=document.createElement(tag);document.body.append(el);const e=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true});el.addEventListener('keydown',()=>expect(guideShortcut(e)).toBe(false));el.dispatchEvent(e);}
 const el=document.createElement('div');el.setAttribute('contenteditable','true');document.body.append(el);el.addEventListener('keydown',e=>expect(guideShortcut(e as KeyboardEvent)).toBe(false));el.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));
 expect(guideShortcut(new KeyboardEvent('keydown',{key:' ',code:'Space'}))).toBe(true);
 for(const flags of [{repeat:true},{isComposing:true},{ctrlKey:true},{metaKey:true},{altKey:true}])expect(guideShortcut(new KeyboardEvent('keydown',{key:' ',...flags}))).toBe(false);
 expect(guideShortcut(new KeyboardEvent('keydown',{key:'Escape'}))).toBe(false);
});
it('tries bounded safe placements, never overlaps the player or returns a blocked spot',()=>{
 const feet=new Vector3(0,0,0),up=new Vector3(0,1,0),front=new Vector3(0,0,1),seen:Vector3[]=[];
 const point=nearbyGuidePoint(feet,up,front,p=>{seen.push(p);return p.x<0?p:null;});expect(seen).toHaveLength(2);expect(point!.x).toBeLessThan(0);expect(point!.distanceTo(feet)).toBeGreaterThan(.75);expect(feet.toArray()).toEqual([0,0,0]);
 expect(nearbyGuidePoint(feet,up,front,()=>null)).toBeNull();expect(nearbyGuidePoint(feet,up,front,()=>feet)).toBeNull();
});
it('uses only explicit fixed knowledge and a truthful unknown fallback in both languages',()=>{
 expect(localGuideAnswer('How do I save?','en')).toContain('Progress saved');expect(localGuideAnswer('怎么返回','zh')).toContain('传送门');
 expect(localGuideAnswer('Give me admin access','en')).toContain('no answer');expect(localGuideAnswer('删除所有记录','zh')).toContain('没有');
});
it('shows a stationary scene companion, replaces/clears routes and closes on transitions',()=>{
 document.body.innerHTML='<div class="minimal-bar"></div><button id="help"></button><div id="world"><canvas tabindex="0"></canvas></div>';vi.stubGlobal('innerWidth',390);vi.stubGlobal('innerHeight',844);
 const scene=new Scene(),camera=new OrthographicCamera(-5,5,5,-5,.1,100);camera.position.set(0,3,5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const release=vi.fn(),guide=createWorldGuide(scene,release),universe={currentPlanet:{id:'p',radius:14,objects:[],blueprints:{},mine:false},player:{flight:{mode:'ground'},location:{kind:'exterior'}}} as unknown as Universe;
 const frame={universe,position:[0,1,0] as [number,number,number],world:{baseRadius:14} as GroundWorld,enabled:true,visible:true,time:1,reducedMotion:true,scene,camera,feet:new Vector3(),up:new Vector3(0,1,0),forward:new Vector3(0,0,1),roomKey:'p',indoor:false,online:true,stand:(p:Vector3)=>p};
 guide.frame(frame);document.getElementById('world-guide-open')!.click();expect(guide.talking).toBe(true);expect(document.querySelector('dialog[open]')).toBeNull();expect(document.getElementById('world-guide-dialog')!.getAttribute('aria-modal')).toBe('false');
 document.getElementById('world-guide-chat-open')!.click();expect(document.getElementById('world-guide-chat')!.parentElement).toBe(document.body);expect(document.getElementById('world-guide-dialog')!.contains(document.getElementById('world-guide-chat'))).toBe(false);document.getElementById('world-guide-close')!.click();expect(document.getElementById('world-guide-dialog')!.hidden).toBe(true);expect(document.getElementById('world-guide-chat')!.hidden).toBe(false);expect(guide.talking).toBe(true);document.getElementById('world-guide-chat-close')!.click();expect(guide.talking).toBe(false);
 guide.close();const canvas=document.querySelector('canvas')!;canvas.focus();canvas.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));expect(guide.talking).toBe(true);expect(document.getElementById('world-guide-dialog')!.hidden).toBe(false);expect(document.getElementById('world-guide-chat')!.hidden).toBe(false);
 const held=new KeyboardEvent('keydown',{key:' ',code:'Space',repeat:true,bubbles:true,cancelable:true});document.getElementById('world-guide-close')!.dispatchEvent(held);expect(held.defaultPrevented).toBe(true);const releaseKey=new KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true,cancelable:true});document.getElementById('world-guide-close')!.dispatchEvent(releaseKey);expect(releaseKey.defaultPrevented).toBe(true);expect(guide.talking).toBe(true);
 canvas.focus();canvas.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));expect(document.getElementById('world-guide-chat')!.hidden).toBe(true);expect(document.getElementById('world-guide-dialog')!.hidden).toBe(true);canvas.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true,cancelable:true}));canvas.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));canvas.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true,cancelable:true}));expect(guide.talking).toBe(true);
 const typing=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true});document.getElementById('world-guide-question')!.dispatchEvent(typing);expect(typing.defaultPrevented).toBe(false);expect(document.getElementById('world-guide-chat')!.hidden).toBe(false);
 document.getElementById('world-guide-close')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(guide.talking).toBe(true);
 const start=guide.frame(frame).position;document.querySelector<HTMLButtonElement>('[data-topic="visit"]')!.click();expect(guide.active).toBe(true);expect(guide.frame(frame).routeVisible).toBe(true);
 for(let i=0;i<50;i++)expect(guide.frame({...frame,time:2+i*.1}).position).toEqual(start);
 document.querySelector<HTMLButtonElement>('[data-topic="save"]')!.click();expect(guide.active).toBe(false);expect(guide.frame(frame).routeVisible).toBe(false);
 const input=document.getElementById('world-guide-question') as HTMLInputElement;input.value='How do I return home?';document.getElementById('world-guide-form')!.dispatchEvent(new Event('submit',{cancelable:true}));expect(document.getElementById('world-guide-answer')!.textContent).toContain('Progress saved');expect(document.getElementById('world-guide-ai-answer')!.textContent).toBe('');expect(input.value).toBe('How do I return home?');
 guide.frame({...frame,roomKey:'indoors',indoor:true});expect(guide.talking).toBe(false);expect(guide.frame({...frame,roomKey:'indoors',indoor:true}).actorVisible).toBe(false);expect(release).toHaveBeenCalled();
 guide.frame({...frame,roomKey:'indoors',indoor:true,universe:{...universe,player:{...universe.player,location:{kind:'interior'}}} as Universe});expect(document.getElementById('world-guide-chat-home')!.hidden).toBe(false);document.getElementById('world-guide-chat-home')!.click();expect(document.getElementById('world-guide-chat')!.hidden).toBe(false);guide.close();
 guide.findShip();expect(guide.talking).toBe(true);expect(document.getElementById('world-guide-availability')!.textContent).toContain('Step 1');expect(guide.frame({...frame,roomKey:'indoors',indoor:true}).routeVisible).toBe(false);
 const outside=guide.frame(frame);expect(outside.selected).toBe('visit');expect(outside.routeVisible).toBe(true);expect(guide.talking).toBe(false);
 guide.findShip();guide.frame({...frame,position:portPoint('p')});expect(document.getElementById('world-guide-availability')!.textContent).toContain('Your ship is here');
 document.getElementById('world-guide-stop')!.click();expect(guide.active).toBe(false);expect(guide.frame(frame).routeVisible).toBe(false);
 const aboard={...universe,player:{...universe.player,flight:{mode:'space'}}} as Universe;guide.frame({...frame,universe:aboard,visible:false});expect(guide.talking).toBe(false);expect((document.getElementById('world-guide-open') as HTMLButtonElement).disabled).toBe(true);expect(document.getElementById('world-guide-open')!.title).toContain('already aboard');expect(release).toHaveBeenCalled();
});
