// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {defaultHomeInterior} from '../src/shared/home.ts';
import type {HomeDescriptor} from '../src/shared/home.ts';
import type {Universe} from '../src/shared/planets.ts';
import type {PlayerState} from '../src/shared/world.ts';
import {NPCS,SPAWN} from '../src/shared/world.ts';
import {deriveTutorialStep,mountTutorial,TUTORIAL_KEY} from '../src/client/tutorial.ts';
import type {TutorialContext} from '../src/client/tutorial.ts';

vi.mock('../src/shared/teleport.ts',()=>({stationSites:(planet:{id:string})=>planet.id==='hub'||planet.id==='own'?[{interact:[0,1,0],arrival:[0,.99,.1]}]:[]}));
const home:HomeDescriptor={planetId:'own',buildingId:'house',interiorId:'room',door:{position:[0,1,0],yaw:0},interior:defaultHomeInterior(),canEdit:true,buildingVersion:1,variant:'base',canUndo:false};
function fixture(){
  const player={character:'clay',quest:'available',position:[...SPAWN],deliveries:0,revision:1,planetId:'hub',flight:{mode:'ground'},location:{kind:'exterior',planetId:'hub',visitEpoch:1},arrival:{version:1,homePreparation:'pending',homePlanetId:null}} as unknown as PlayerState;
  const universe={player,ownedPlanetId:null,planets:[],currentPlanet:{id:'hub',kind:'hub',name:'Hub',objects:[],blueprints:{},radius:21.6}} as unknown as Universe;
  return {universe,online:true,ready:true,touch:false} as TutorialContext;
}
function prepare(context:TutorialContext){
  context.universe.ownedPlanetId='own';
  Object.assign(context.universe.player,{arrival:{version:1,homePreparation:'ready',homePlanetId:'own'}});
}
function arriveHome(context:TutorialContext){
  prepare(context);context.universe.currentPlanet={...context.universe.currentPlanet,id:'own',kind:'garden',mine:true};
  Object.assign(context.universe.player,{planetId:'own',home:structuredClone(home),location:{kind:'exterior',planetId:'own',visitEpoch:2}});
}
let tutorial:ReturnType<typeof mountTutorial>|undefined;
beforeEach(()=>{
  localStorage.clear();document.body.innerHTML='<button id="open-menu">Menu</button><aside id="first-visit-tip"></aside>';document.body.className='';document.documentElement.lang='en';
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
});
afterEach(()=>{tutorial?.dispose();tutorial=undefined;vi.restoreAllMocks();});
const card=()=>document.querySelector<HTMLElement>('#core-tutorial')!;

it('uses only acknowledged quest, ownership and room entry to advance one current target',()=>{
  const context=fixture(),u=context.universe;
  expect(deriveTutorialStep(u)).toMatchObject({kind:'mica',number:1,target:{kind:'mica',position:NPCS.mica.position,planetId:'hub'}});
  // A predicted walk or local proximity cannot turn available into carrying.
  u.player.position=[...NPCS.mica.position];expect(deriveTutorialStep(u).kind).toBe('mica');
  u.player.quest='carrying';expect(deriveTutorialStep(u)).toMatchObject({kind:'sol',number:2,target:{position:NPCS.sol.position}});
  u.player.quest='delivered';expect(deriveTutorialStep(u)).toMatchObject({kind:'preparing',target:null});
  prepare(context);expect(deriveTutorialStep(u)).toMatchObject({kind:'gate',number:3,target:{kind:'gate',planetId:'hub'}});
  arriveHome(context);expect(deriveTutorialStep(u)).toMatchObject({kind:'home',number:4,target:{kind:'home',planetId:'own'}});
  u.player.location={kind:'interior',planetId:'own',buildingId:'wrong',interiorId:'other',position:[0,0,0],yaw:0,sequence:0,visitEpoch:2};
  expect(deriveTutorialStep(u).kind).toBe('home');
  u.player.location={...u.player.location,buildingId:'house',interiorId:'room'};
  expect(deriveTutorialStep(u)).toMatchObject({kind:'complete',number:5,target:null});
  // Removing an own gate may legitimately make preparation retryable. An
  // acknowledged owner already inside the room has still completed the loop.
  Object.assign(u.player,{arrival:{version:1,homePreparation:'retry',homePlanetId:'own'}});
  expect(deriveTutorialStep(u).kind).toBe('complete');
});

it('preserves skipped preference across pending → ready, remount and acknowledged quest updates',()=>{
  const context=fixture();tutorial=mountTutorial({read:()=>context});
  expect(tutorial.active).toBe(true);expect(tutorial.target?.kind).toBe('mica');
  tutorial.skip();expect(localStorage.getItem(TUTORIAL_KEY)).toBe('skipped');
  prepare(context);context.universe.player.quest='carrying';tutorial.receive(context.universe);
  expect(tutorial.active).toBe(false);expect(tutorial.target).toBeNull();expect(card().hidden).toBe(true);
  tutorial.dispose();tutorial=mountTutorial({read:()=>context});expect(tutorial.active).toBe(false);
  tutorial.replay();expect(tutorial.step?.kind).toBe('sol');expect(tutorial.target?.kind).toBe('sol');
});

it('resumes the server step after a refresh and never repeats a completed delivery or resets an interior position',()=>{
  const context=fixture();context.universe.player.quest='carrying';tutorial=mountTutorial({read:()=>context});
  expect(tutorial.step?.kind).toBe('sol');tutorial.dispose();tutorial=undefined;
  arriveHome(context);context.universe.player.quest='delivered';context.universe.player.deliveries=1;
  context.universe.player.location={kind:'interior',planetId:'own',buildingId:'house',interiorId:'room',position:[1,0,1],yaw:1,sequence:6,visitEpoch:2};
  const saved=JSON.stringify(context.universe);tutorial=mountTutorial({read:()=>context});
  expect(tutorial.step?.kind).toBe('complete');expect(localStorage.getItem(TUTORIAL_KEY)).toBe('completed');
  tutorial.replay();expect(tutorial.step?.kind).toBe('complete');expect(JSON.stringify(context.universe)).toBe(saved);
  tutorial.skip();tutorial.dispose();tutorial=mountTutorial({read:()=>context});expect(tutorial.active).toBe(false);expect(tutorial.target).toBeNull();
});

it('does not force older identities, and their explicit replay explains the real flight/claim/build path',()=>{
  const context=fixture();Reflect.deleteProperty(context.universe.player,'arrival');
  const saved=JSON.stringify(context.universe);tutorial=mountTutorial({read:()=>context});
  expect(tutorial.active).toBe(false);expect(card().hidden).toBe(true);expect(localStorage.length).toBe(0);
  tutorial.replay();expect(tutorial.step?.kind).toBe('legacy');expect(tutorial.target).toBeNull();
  expect(card().textContent).toContain('Make this my planet');expect(card().textContent).toContain('cannot claim a home');
  expect(JSON.stringify(context.universe)).toBe(saved);
});

it('provides return instructions without a route in flight or on a neighbour world',()=>{
  const context=fixture();prepare(context);context.universe.currentPlanet={...context.universe.currentPlanet,id:'neighbour',kind:'garden'};
  tutorial=mountTutorial({read:()=>context});expect(tutorial.step?.kind).toBe('return-hub');expect(tutorial.target).toBeNull();
  context.universe.player.quest='delivered';tutorial.receive(context.universe);
  expect(tutorial.step?.kind).toBe('return-home');expect(tutorial.target).toBeNull();
  Object.assign(context.universe.player.flight,{mode:'space'});tutorial.receive(context.universe);expect(tutorial.target).toBeNull();
  expect(card().textContent).toContain('In flight');
});

it('keeps a real pending/retry home status and only invokes an explicit retry once at a time',async()=>{
  const context=fixture();context.universe.player.quest='delivered';Object.assign(context.universe.player,{arrival:{version:1,homePreparation:'retry',homePlanetId:null}});
  let finish!:()=>void;const retry=vi.fn(()=>new Promise<void>(resolve=>finish=resolve));tutorial=mountTutorial({read:()=>context,retryHome:retry});
  const button=card().querySelector<HTMLButtonElement>('.tutorial-retry')!;
  expect(button.hidden).toBe(false);expect(tutorial.step?.kind).toBe('preparing');expect(card().textContent).not.toContain('Make this my planet');
  button.click();button.click();expect(retry).toHaveBeenCalledTimes(1);expect(button.disabled).toBe(true);
  expect(tutorial.step?.kind).toBe('preparing');finish();await Promise.resolve();await Promise.resolve();
  expect(tutorial.step?.kind).toBe('preparing');expect(button.disabled).toBe(false);
  prepare(context);tutorial.receive(context.universe);expect(tutorial.step?.kind).toBe('gate');expect(button.hidden).toBe(true);
});

it('switches Chinese/touch instructions in place, pauses overlays behind dialogs, and does not duplicate the old card',async()=>{
  const context=fixture();context.touch=true;tutorial=mountTutorial({read:()=>context});
  expect(document.getElementById('first-visit-tip')!.hidden).toBe(true);expect(card().textContent).toContain('thumbstick');
  document.documentElement.lang='zh-CN';await Promise.resolve();expect(card().textContent).toContain('去邮局认识 Mica');expect(card().textContent).toContain('摇杆');
  const dialog=document.createElement('dialog');dialog.open=true;document.body.append(dialog);tutorial.receive(context.universe);
  expect(card().hidden).toBe(true);expect(tutorial.target).toBeNull();dialog.remove();tutorial.receive(context.universe);expect(card().hidden).toBe(false);
  context.online=false;tutorial.receive(context.universe);expect(card().textContent).toContain('连接暂时中断');expect(tutorial.target).toBeNull();
});

it('survives denied optional storage and cleans its DOM and observer without any game write',()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('denied');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('denied');});
  const context=fixture(),saved=JSON.stringify(context.universe);tutorial=mountTutorial({read:()=>context});
  expect(tutorial.target?.kind).toBe('mica');tutorial.skip();tutorial.replay();expect(JSON.stringify(context.universe)).toBe(saved);
  tutorial.dispose();expect(document.querySelector('#core-tutorial')).toBeNull();expect(tutorial.active).toBe(false);expect(document.body.classList.contains('tutorial-active')).toBe(false);
});

it('distinguishes checking, a proved route and unavailable connection without changing the current goal or saved state',()=>{
  const context=fixture(),saved=JSON.stringify(context.universe);tutorial=mountTutorial({read:()=>context});
  const status=card().querySelector<HTMLElement>('.tutorial-route-status')!;
  expect(card().dataset.routeState).toBe('checking');expect(status.textContent).toContain('Checking a walkable route');
  expect(card().querySelector('.tutorial-copy')!.textContent).not.toContain('Follow');
  context.route={state:'unavailable',planetId:'hub',targetKind:'mica'};tutorial.receive(context.universe);
  expect(card().dataset.routeState).toBe('unavailable');expect(status.textContent).toContain('No safe connection');
  expect(status.textContent).toContain('Return to the stone path');expect(status.textContent).toContain('avoid cutting through buildings');
  expect(card().querySelector('.tutorial-copy')!.textContent).not.toContain('Follow');
  expect(tutorial.step?.kind).toBe('mica');expect(tutorial.target?.kind).toBe('mica');expect(JSON.stringify(context.universe)).toBe(saved);
  context.route={state:'ready',planetId:'hub',targetKind:'mica'};tutorial.receive(context.universe);
  expect(status.textContent).toContain('Follow the bright route');
  context.route={...context.route,arrived:true};tutorial.receive(context.universe);
  expect(status.textContent).toContain('You are near the destination ring');expect(status.textContent).not.toContain('Follow');
  expect(context.universe.player.quest).toBe('available');
});

it('discards route feedback from another goal or world and clears it in flight, behind a dialog and in the room',()=>{
  const context=fixture();context.route={state:'unavailable',planetId:'hub',targetKind:'sol'};tutorial=mountTutorial({read:()=>context});
  const status=card().querySelector<HTMLElement>('.tutorial-route-status')!;
  expect(card().dataset.routeState).toBe('checking');expect(status.textContent).not.toContain('No safe connection');
  context.route={state:'unavailable',planetId:'another-world',targetKind:'mica'};tutorial.receive(context.universe);
  expect(card().dataset.routeState).toBe('checking');
  context.route={state:'unavailable',planetId:'hub',targetKind:'mica'};tutorial.receive(context.universe);
  expect(card().dataset.routeState).toBe('unavailable');
  Object.assign(context.universe.player.flight,{mode:'space'});tutorial.receive(context.universe);
  expect(status.hidden).toBe(true);expect(status.textContent).toBe('');expect(card().dataset.routeState).toBeUndefined();
  Object.assign(context.universe.player.flight,{mode:'ground'});
  const dialog=document.createElement('dialog');dialog.open=true;document.body.append(dialog);tutorial.receive(context.universe);
  expect(status.hidden).toBe(true);expect(card().dataset.routeState).toBeUndefined();dialog.remove();
  arriveHome(context);context.universe.player.quest='delivered';
  context.universe.player.location={kind:'interior',planetId:'own',buildingId:'house',interiorId:'room',position:[0,0,0],yaw:0,sequence:0,visitEpoch:2};
  tutorial.receive(context.universe);expect(tutorial.step?.kind).toBe('complete');expect(status.hidden).toBe(true);expect(status.textContent).toBe('');
});

it('localizes the safe fallback in place and keeps Skip available without confirming a task',async()=>{
  const context=fixture();context.touch=true;context.route={state:'unavailable',planetId:'hub',targetKind:'mica'};
  tutorial=mountTutorial({read:()=>context});document.documentElement.lang='zh-CN';await Promise.resolve();
  const status=card().querySelector<HTMLElement>('.tutorial-route-status')!;
  expect(status.textContent).toContain('暂未找到安全接路');expect(status.textContent).toContain('目标圈仍标着目的地');
  expect(status.textContent).toContain('回到石路');expect(status.textContent).toContain('不要直穿建筑');
  expect(card().querySelector('.tutorial-copy')!.textContent).not.toContain('沿路线');
  const skip=card().querySelector<HTMLButtonElement>('.tutorial-skip')!;expect(skip.disabled).toBe(false);skip.click();
  expect(tutorial.target).toBeNull();expect(status.hidden).toBe(true);expect(context.universe.player.quest).toBe('available');
  expect(document.activeElement?.id).toBe('open-menu');
});
