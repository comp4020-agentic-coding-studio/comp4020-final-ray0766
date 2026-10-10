// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as T from 'three';
import {HomeInterior,type HomeInteriorOptions} from '../src/client/home-interior.ts';
import {Workshop,type WorkshopBridge} from '../src/client/workshop.ts';
import {defaultHomeInterior,homeEntry} from '../src/shared/home.ts';
import {groundFlight} from '../src/shared/flight.ts';
import type {PlayerState} from '../src/shared/world.ts';
import type {Universe} from '../src/shared/planets.ts';
import type {LibraryEntry} from '../src/shared/blueprints.ts';
import {industrialCabin} from '../src/assets/claude-geometry/blueprint/samples.ts';

interface FrameGate {signal?:AbortSignal;settled:boolean;release:()=>void}
interface LoadingTask {title:string;finished:boolean;retry?:()=>void;onCancel?:()=>void;update:ReturnType<typeof vi.fn>;finish:ReturnType<typeof vi.fn>;fail:ReturnType<typeof vi.fn>}
const mocks=vi.hoisted(()=>({
  frames:[] as FrameGate[],tasks:[] as LoadingTask[],
  stage:vi.fn(),templates:vi.fn(),view:vi.fn(),library:vi.fn(),room:vi.fn(),furniture:vi.fn(),courier:vi.fn(),door:vi.fn(),drawing:vi.fn(),
}));

vi.mock('../src/client/loading-state.ts',()=>({
  beginSceneLoading:(title:string,options:{onCancel?:()=>void}={})=>{
    const task:LoadingTask={title,finished:false,onCancel:options.onCancel,update:vi.fn(),finish:vi.fn(),fail:vi.fn()};
    task.finish.mockImplementation(()=>{task.finished=true;});
    task.fail.mockImplementation((_message:string,retry:()=>void)=>{task.retry=retry;});
    mocks.tasks.push(task);return task;
  },
  yieldSceneFrame:(signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
    const abort=()=>{gate.settled=true;reject(new DOMException('Cancelled','AbortError'));};
    const gate:FrameGate={signal,settled:false,release:()=>{if(gate.settled)return;gate.settled=true;signal?.removeEventListener('abort',abort);resolve();}};
    mocks.frames.push(gate);
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  }),
}));
vi.mock('../src/client/presentation-stage.ts',()=>({createPresentationStage:(...args:unknown[])=>mocks.stage(...args)}));
vi.mock('../src/assets/claude-geometry/blueprint/view/templates.ts',()=>({PartTemplates:class{constructor(...args:unknown[]){return mocks.templates(...args);}}}));
vi.mock('../src/assets/claude-geometry/blueprint/view/workshop-view.ts',()=>({WorkshopView:class{constructor(...args:unknown[]){return mocks.view(...args);}}}));
vi.mock('../src/client/presentation.ts',()=>({createWorldStyleLibrary:()=>mocks.library(),configureHomeLighting:vi.fn()}));
vi.mock('../src/client/village-drawing.ts',()=>({createVillageDrawing:()=>mocks.drawing()}));
vi.mock('../src/client/character.ts',()=>({courier:()=>mocks.courier()}));
vi.mock('../src/client/home-door.ts',()=>({createHomeDoor:()=>mocks.door()}));
vi.mock('../src/client/home-room-art.ts',()=>({createHomeRoomArt:(...args:unknown[])=>mocks.room(...args),applyHomeRoomTheme:vi.fn()}));
vi.mock('../src/assets/claude-geometry/style/geometry.ts',async importOriginal=>{
  const original=await importOriginal<typeof import('../src/assets/claude-geometry/style/geometry.ts')>();
  return{...original,PartBuilder:class extends original.PartBuilder{override build(name?:string){return name?.startsWith('home-item-')?mocks.furniture(name):super.build(name);}}};
});
vi.mock('../src/assets/claude-geometry/blueprint/parts/kit.ts',async importOriginal=>({
  ...await importOriginal<object>(),libraryMaterials:()=>({owned:()=>[]}),
}));
vi.mock('../src/shared/blueprint-parts.ts',async importOriginal=>({
  ...await importOriginal<object>(),emitPart:vi.fn(),
}));
vi.mock('../src/client/build-art.ts',()=>({disposeGeometry:(root:T.Object3D)=>{
  root.traverse(object=>{const mesh=object as T.Mesh;if(!mesh.isMesh)return;mesh.geometry.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();});
  root.removeFromParent();
}}));

function deferred<Value>(){let resolve!:(value:Value)=>void,reject!:(reason?:unknown)=>void;const promise=new Promise<Value>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function frame(){await settle();const gate=mocks.frames.find(item=>!item.settled);expect(gate,`expected a browser frame; status: ${document.getElementById('ws-status')?.textContent??document.getElementById('home-room-status')?.textContent}`).toBeDefined();gate!.release();await settle();}
async function advanceUntil(done:()=>boolean){
  for(let i=0;i<100&&!done();i++)await frame();
  expect(done(),'preparation should settle within a bounded number of frames').toBe(true);
}
function ownedModel(name:string){
  const group=new T.Group(),geometry=new T.BoxGeometry(.5,.5,.5),material=new T.MeshStandardMaterial();
  group.name=name;group.add(new T.Mesh(geometry,material));
  return{group,geometryDisposed:vi.spyOn(geometry,'dispose'),materialDisposed:vi.spyOn(material,'dispose')};
}
const rooms:ReturnType<typeof ownedModel>[]=[],furniture:ReturnType<typeof ownedModel>[]=[],homes:HomeInterior[]=[],workshops:Workshop[]=[];
function fakeStage(){return{
  library:{textureFormat:'none'},scene:new T.Scene(),camera:new T.PerspectiveCamera(),
  renderer:{domElement:document.createElement('canvas'),compileAsync:vi.fn(async()=>{}),forceContextLoss:vi.fn()},
  controls:{enabled:true,target:new T.Vector3(),update:vi.fn()},practical:{stats:()=>({})},stats:()=>({}),
  onFrame:vi.fn(),ready:vi.fn(async()=>{}),start:vi.fn(),resize:vi.fn(),frameBox:vi.fn(),renderOnce:vi.fn(),dispose:vi.fn(),
};}
type FakeStage=ReturnType<typeof fakeStage>;
const stages:FakeStage[]=[],templates:Array<{get:ReturnType<typeof vi.fn>;dispose:ReturnType<typeof vi.fn>}>=[],views:Array<{dispose:ReturnType<typeof vi.fn>}>=[];
const dialogMethods=new Map(['showModal','close'].map(name=>[name,Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,name)]));
beforeEach(()=>{
  vi.clearAllMocks();mocks.frames.length=0;mocks.tasks.length=0;rooms.length=0;furniture.length=0;stages.length=0;templates.length=0;views.length=0;
  document.body.innerHTML='';document.body.className='';document.documentElement.lang='en';
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
  Object.defineProperties(HTMLDialogElement.prototype,{
    showModal:{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}},
    close:{configurable:true,value:function(this:HTMLDialogElement){this.open=false;this.dispatchEvent(new Event('close'));}},
  });
  vi.spyOn(window,'confirm').mockReturnValue(true);
  mocks.stage.mockImplementation(()=>{const stage=fakeStage();stages.push(stage);return stage;});
  mocks.templates.mockImplementation(()=>{const value={get:vi.fn(),dispose:vi.fn()};templates.push(value);return value;});
  mocks.view.mockImplementation(()=>{const value={bounds:()=>new T.Box3(),setLevel:vi.fn(),setGhost:vi.fn(),dispose:vi.fn()};views.push(value);return value;});
  mocks.library.mockImplementation(()=>({attachRenderer:vi.fn(),dispose:vi.fn()}));
  mocks.room.mockImplementation(()=>{const model=ownedModel(`room-${rooms.length}`);rooms.push(model);return model;});
  mocks.furniture.mockImplementation((name:string)=>{const model=ownedModel(name);furniture.push(model);return model;});
  mocks.courier.mockImplementation(()=>({root:new T.Group(),setColor:vi.fn(),animate:vi.fn()}));
  mocks.door.mockImplementation(()=>({root:new T.Group(),setOpen:vi.fn(),setPart:vi.fn(),frame:vi.fn(),dispose:vi.fn()}));
  mocks.drawing.mockImplementation(()=>({render:vi.fn(),resize:vi.fn(),dispose:vi.fn()}));
});
afterEach(async()=>{
  for(const home of homes.splice(0))home.dispose();
  for(const workshop of workshops.splice(0))workshop.close(true);
  await settle();vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML='';
  for(const[name,descriptor]of dialogMethods)if(descriptor)Object.defineProperty(HTMLDialogElement.prototype,name,descriptor);else Reflect.deleteProperty(HTMLDialogElement.prototype,name);
});

function player(version=1,visitEpoch=1):PlayerState{
  const interior=defaultHomeInterior();interior.version=version;
  return{character:'clay',quest:'available',position:[0,1,0],deliveries:0,revision:version,planetId:'planet',flight:groundFlight(),
    home:{planetId:'planet',buildingId:'building',interiorId:'room',door:{position:[0,1,0],yaw:0},interior,canEdit:true,buildingVersion:1,variant:'base',canUndo:false},
    location:{kind:'interior',planetId:'planet',buildingId:'building',interiorId:'room',position:homeEntry(interior.room),yaw:0,sequence:0,visitEpoch}};
}
function universe(state:PlayerState):Universe{
  return{player:state,planets:[],ownedPlanetId:state.planetId,currentPlanet:{id:state.planetId,name:'Test garden',kind:'garden',claimed:true,mine:true,revision:state.revision,objectCount:0,center:[0,0,0],slot:1,objects:[]}};
}
function interior(){
  const renderer={domElement:document.createElement('canvas'),compileAsync:vi.fn(async()=>{}),info:{render:{calls:0}}};
  const options={renderer:renderer as unknown as T.WebGLRenderer,move:vi.fn(),save:vi.fn(),door:vi.fn(),exit:vi.fn(),applyPlayer:vi.fn(),applyUniverse:vi.fn(),recover:vi.fn()} satisfies HomeInteriorOptions;
  const home=new HomeInterior(options);homes.push(home);return{home,renderer,options};
}
function workshop(read:WorkshopBridge['read']=async()=>[]){
  const bridge={read:vi.fn(read),save:vi.fn(),place:vi.fn(),allowed:()=>true} satisfies WorkshopBridge;
  const panel=new Workshop(bridge);workshops.push(panel);return{panel,bridge};
}
function saved(name:string):LibraryEntry{const blueprint=industrialCabin();blueprint.name=name;return{blueprint,version:1,hash:'0'.repeat(64)};}
function button(id:string){return document.getElementById(id) as HTMLButtonElement;}

describe('home preparation lifecycle',()=>{
  it('yields before geometry, blocks input and actions, then presents the prepared room',async()=>{
    const{home,renderer,options}=interior(),state=player();home.receive(state);
    const photo=vi.fn();window.addEventListener('open-photo-mode',photo,{once:true});
    expect(home.active).toBe(true);expect(home.preparing).toBe(true);expect(mocks.room).not.toHaveBeenCalled();
    expect(mocks.tasks[0].onCancel).toBeUndefined();
    expect(document.querySelector<HTMLElement>('.home-interior-ui')!.hidden).toBe(true);
    await frame();expect(mocks.room).not.toHaveBeenCalled();await frame();expect(mocks.room).toHaveBeenCalledTimes(1);
    for(const id of ['home-toggle-door','home-exit','home-arrange','home-save','home-photo'])button(id).click();
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));
    home.frame(.05,1);await home.flush();
    for(const action of [options.move,options.save,options.door,options.exit])expect(action).not.toHaveBeenCalled();
    expect(photo).not.toHaveBeenCalled();window.removeEventListener('open-photo-mode',photo);
    expect(mocks.drawing.mock.results[0].value.render).not.toHaveBeenCalled();
    await advanceUntil(()=>!home.preparing);
    expect(mocks.tasks.every(task=>task.finished)).toBe(true);expect(document.querySelector<HTMLElement>('.home-interior-ui')!.hidden).toBe(false);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
    home.frame(.05,2);await home.flush();
    expect(JSON.parse(renderer.domElement.dataset.homePosition!)).toEqual(state.location!.kind==='interior'?state.location!.position:[]);
    expect(options.move).not.toHaveBeenCalled();expect(button('home-arrange').disabled).toBe(false);
  });

  it('does not finish an indoor load after receiving a newer exterior location',async()=>{
    const{home,renderer}=interior();home.receive(player());await frame();
    const outside=player();outside.revision=2;outside.location={kind:'exterior',planetId:'planet',visitEpoch:2};home.receive(outside);
    await settle();
    expect(home.active).toBe(false);expect(home.preparing).toBe(false);expect(mocks.room).not.toHaveBeenCalled();
    expect(mocks.tasks.every(task=>task.finished)).toBe(true);expect(mocks.frames.every(gate=>gate.settled)).toBe(true);
    expect(document.querySelector<HTMLElement>('.home-interior-ui')!.hidden).toBe(true);expect(renderer.domElement.dataset.homeInterior).toBeUndefined();
  });

  it.each(['door','save'] as const)('does not reopen a room when an old %s response arrives after a newer exterior state',async action=>{
    const{home,renderer,options}=interior();home.receive(player());await advanceUntil(()=>!home.preparing);
    const pending=deferred<Universe>();options[action].mockReturnValueOnce(pending.promise);
    if(action==='save'){
      button('home-arrange').click();button('home-material-sage').click();button('home-save').click();
    }else button('home-toggle-door').click();
    await settle();expect(options[action]).toHaveBeenCalledTimes(1);

    const outside=player();outside.revision=3;outside.location={kind:'exterior',planetId:'planet',visitEpoch:2};home.receive(outside);
    expect(home.active).toBe(false);expect(renderer.domElement.dataset.homeInterior).toBeUndefined();
    const late=player(action==='save'?2:1);late.revision=2;
    if(action==='door'){late.home!.interior.doorOpen=false;late.home!.interior.doorVersion=1;}
    else late.home!.interior.material='sage';
    const reply=universe(late);pending.resolve(reply);await settle();

    // Exercise the actual async action continuation, not just direct receive.
    expect(options.applyUniverse).toHaveBeenCalledWith(reply);
    expect(home.active).toBe(false);expect(home.preparing).toBe(false);expect(mocks.tasks).toHaveLength(1);
    expect(mocks.tasks.every(task=>task.finished)).toBe(true);expect(mocks.frames.every(gate=>gate.settled)).toBe(true);
    expect(document.querySelector<HTMLElement>('.home-interior-ui')!.hidden).toBe(true);
    expect(document.body.classList.contains('home-interior-active')).toBe(false);
    expect(renderer.domElement.dataset.homeInterior).toBeUndefined();
  });

  it('keeps preparing a newer room when an older recovery response arrives',async()=>{
    const{home,renderer,options}=interior();home.receive(player());await advanceUntil(()=>!home.preparing);
    const recovery=deferred<Universe>();options.recover.mockReturnValueOnce(recovery.promise);
    home.setOnline(false);button('home-retry').click();await settle();expect(options.recover).toHaveBeenCalledTimes(1);

    const latest=player(3);home.receive(latest);await frame();
    const preparation=mocks.tasks.at(-1)!,waiting=mocks.frames.find(gate=>!gate.settled)!;
    expect(mocks.tasks).toHaveLength(2);expect(home.preparing).toBe(true);expect(preparation.finished).toBe(false);
    const stale=player();stale.revision=2;recovery.resolve(universe(stale));await settle();

    expect(mocks.tasks.at(-1)).toBe(preparation);expect(preparation.finished).toBe(false);
    expect(waiting.signal?.aborted).toBe(false);expect(home.preparing).toBe(true);
    expect(options.applyUniverse).not.toHaveBeenCalled();
    await advanceUntil(()=>!home.preparing);home.frame(.05,1);
    expect(home.active).toBe(true);expect(renderer.domElement.dataset.homeVersion).toBe('3');
    expect(document.querySelector<HTMLElement>('.home-interior-ui')!.hidden).toBe(false);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(2);expect(mocks.tasks).toHaveLength(2);
    expect(mocks.tasks.every(task=>task.finished)).toBe(true);
  });

  it('restores an accepted recovery pose within the same room version and visit',async()=>{
    const{home,renderer,options}=interior();home.receive(player());await advanceUntil(()=>!home.preparing);
    const restored=player();restored.revision=2;
    const position:[number,number,number]=[.75,0,1.8],yaw=1.1;
    if(restored.location?.kind!=='interior')throw new Error('Expected indoor fixture');
    restored.location.position=position;restored.location.yaw=yaw;restored.location.sequence=1;
    const response=universe(restored);options.recover.mockResolvedValueOnce(response);
    home.setOnline(false);button('home-retry').click();await settle();
    expect(options.recover).toHaveBeenCalledTimes(1);expect(options.applyUniverse).toHaveBeenCalledWith(response);
    expect(home.preparing).toBe(true);await advanceUntil(()=>!home.preparing);home.frame(.05,1);
    expect(JSON.parse(renderer.domElement.dataset.homePosition!)).toEqual(position);
    expect(home.facing[0]).toBeCloseTo(Math.sin(yaw));expect(home.facing[2]).toBeCloseTo(Math.cos(yaw));
    expect(renderer.domElement.dataset.homeVersion).toBe('1');expect(button('home-retry').hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('.home-interior-ui')!.hidden).toBe(false);
    expect(button('home-arrange').disabled).toBe(false);expect(mocks.tasks.every(task=>task.finished)).toBe(true);
  });

  it('prepares and reveals the same room version again for a new visit',async()=>{
    const{home,renderer}=interior();home.receive(player());await advanceUntil(()=>!home.preparing);
    const outside=player();outside.revision=2;outside.location={kind:'exterior',planetId:'planet',visitEpoch:2};home.receive(outside);
    const returnVisit=player(1,3);returnVisit.revision=3;home.receive(returnVisit);
    expect(home.preparing).toBe(true);expect(document.querySelector<HTMLElement>('.home-interior-ui')!.hidden).toBe(true);
    await advanceUntil(()=>!home.preparing);home.frame(.05,1);
    expect(home.active).toBe(true);expect(document.querySelector<HTMLElement>('.home-interior-ui')!.hidden).toBe(false);
    expect(renderer.domElement.dataset.homeVersion).toBe('1');expect(renderer.compileAsync).toHaveBeenCalledTimes(2);
    expect(mocks.tasks.every(task=>task.finished)).toBe(true);
  });

  it('discards a superseded room while compilation is outstanding',async()=>{
    const{home,renderer}=interior(),compile=deferred<void>();renderer.compileAsync.mockImplementationOnce(()=>compile.promise);
    home.receive(player());await advanceUntil(()=>renderer.compileAsync.mock.calls.length===1);
    const abandoned=rooms[0],oldFurniture=[...furniture],oldTask=mocks.tasks[0];
    const replacement=player(2);replacement.home!.interior.room.width=9.6;home.receive(replacement);
    expect(oldTask.finished).toBe(true);
    await advanceUntil(()=>!home.preparing);home.frame(.05,1);
    expect(renderer.domElement.dataset.homeVersion).toBe('2');expect(home.scene.getObjectByName(rooms[1].group.name)).toBe(rooms[1].group);
    compile.resolve();await settle();home.frame(.05,2);
    expect(renderer.domElement.dataset.homeVersion).toBe('2');expect(home.scene.getObjectByName(abandoned.group.name)).toBeUndefined();
    for(const model of [abandoned,...oldFurniture]){expect(model.geometryDisposed).toHaveBeenCalledTimes(1);expect(model.materialDisposed).toHaveBeenCalledTimes(1);}
  });

  it('cancels a pending build on disposal and releases resources without reviving the UI',async()=>{
    const{home,renderer}=interior(),compile=deferred<void>();renderer.compileAsync.mockImplementationOnce(()=>compile.promise);
    home.receive(player());await advanceUntil(()=>renderer.compileAsync.mock.calls.length===1);
    home.dispose();homes.splice(homes.indexOf(home),1);compile.resolve();await settle();
    expect(home.active).toBe(false);expect(home.preparing).toBe(false);expect(document.querySelector('.home-interior-ui')).toBeNull();
    expect(mocks.tasks.every(task=>task.finished)).toBe(true);
    for(const model of [...rooms,...furniture])expect(model.geometryDisposed).toHaveBeenCalledTimes(1);
    expect(mocks.library.mock.results[0].value.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.drawing.mock.results[0].value.dispose).toHaveBeenCalledTimes(1);
  });

  it('retries a failed build without changing saved room data',async()=>{
    const{home,renderer,options}=interior(),state=player(),before=JSON.stringify(state);
    renderer.compileAsync.mockRejectedValueOnce(new Error('Compile interrupted'));home.receive(state);
    await advanceUntil(()=>mocks.tasks.some(task=>!!task.retry));
    expect(home.preparing).toBe(true);expect(button('home-arrange').disabled).toBe(true);
    mocks.tasks.find(task=>task.retry)!.retry!();await advanceUntil(()=>!home.preparing);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(2);expect(JSON.stringify(state)).toBe(before);
    expect(options.save).not.toHaveBeenCalled();expect(mocks.tasks.every(task=>task.finished)).toBe(true);
  });
});

describe('workshop preparation lifecycle',()=>{
  it('paints before building its stage and enables editing only after compilation',async()=>{
    const{panel,bridge}=workshop(),opening=panel.open();
    expect(panel.preparing).toBe(true);expect(mocks.stage).not.toHaveBeenCalled();
    await frame();expect(mocks.stage).not.toHaveBeenCalled();await frame();
    await advanceUntil(()=>stages.length===1);
    const compiling=deferred<void>();stages[0].renderer.compileAsync.mockImplementationOnce(()=>compiling.promise);
    await advanceUntil(()=>stages[0].renderer.compileAsync.mock.calls.length===1);
    for(const id of ['ws-save','ws-place','ws-add','ws-example-load'])button(id).click();
    expect(bridge.save).not.toHaveBeenCalled();expect(bridge.place).not.toHaveBeenCalled();expect(stages[0].start).not.toHaveBeenCalled();
    expect((document.getElementById('ws-name') as HTMLInputElement).disabled).toBe(true);
    compiling.resolve();await advanceUntil(()=>!panel.preparing);await opening;
    expect(stages[0].start).toHaveBeenCalledTimes(1);expect(button('ws-save').disabled).toBe(false);
    expect(mocks.tasks.every(task=>task.finished)).toBe(true);
  });

  it('ignores an old library response after cancellation and reopening',async()=>{
    const oldRead=deferred<LibraryEntry[]>(),newRead=deferred<LibraryEntry[]>();
    const{panel,bridge}=workshop();bridge.read.mockImplementationOnce(()=>oldRead.promise).mockImplementationOnce(()=>newRead.promise);
    const first=panel.open();await advanceUntil(()=>bridge.read.mock.calls.length===1);
    expect(mocks.tasks[0].onCancel).toBeTypeOf('function');mocks.tasks[0].onCancel!();
    expect(panel.preparing).toBe(false);expect(panel.opened).toBe(false);expect(mocks.tasks[0].finished).toBe(true);
    const second=panel.open();await advanceUntil(()=>bridge.read.mock.calls.length===2);newRead.resolve([saved('Latest private name')]);
    await advanceUntil(()=>!panel.preparing);await second;oldRead.resolve([saved('Stale private name')]);await first;await settle();
    expect(panel.opened).toBe(true);expect((document.getElementById('ws-name') as HTMLInputElement).value).toBe('Latest private name');
    expect(document.getElementById('ws-library')!.textContent).toBe('Latest private name');expect(mocks.tasks.every(task=>task.finished)).toBe(true);
  });

  it('releases stage, view and templates when cancelled during compilation',async()=>{
    const{panel}=workshop(),opening=panel.open();await advanceUntil(()=>stages.length===1);
    const compile=deferred<void>();stages[0].renderer.compileAsync.mockImplementationOnce(()=>compile.promise);
    await advanceUntil(()=>stages[0].renderer.compileAsync.mock.calls.length===1);
    expect(mocks.tasks[0].onCancel).toBeTypeOf('function');mocks.tasks[0].onCancel!();
    expect(panel.opened).toBe(false);expect(panel.preparing).toBe(false);expect(mocks.tasks.every(task=>task.finished)).toBe(true);
    compile.resolve();await opening;await settle();
    expect(stages[0].start).not.toHaveBeenCalled();expect(stages[0].dispose).toHaveBeenCalledTimes(1);expect(stages[0].renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(templates[0].dispose).toHaveBeenCalledTimes(1);expect(views[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('lets the user cancel a failed load and open a usable workshop again',async()=>{
    const{panel,bridge}=workshop();bridge.read.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce([saved('Opened after cancel')]);
    const first=panel.open();await advanceUntil(()=>mocks.tasks.some(task=>!!task.retry));await first;
    const failed=mocks.tasks[0];expect(panel.preparing).toBe(true);expect(button('ws-save').disabled).toBe(true);
    expect(failed.onCancel).toBeTypeOf('function');failed.onCancel!();await settle();
    expect(panel.preparing).toBe(false);expect(panel.opened).toBe(false);expect(failed.finished).toBe(true);
    expect(document.body.classList.contains('workshop-open')).toBe(false);
    expect(mocks.tasks.every(task=>task.finished)).toBe(true);

    const reopened=panel.open();await advanceUntil(()=>!panel.preparing);await reopened;
    expect(panel.opened).toBe(true);expect(button('ws-save').disabled).toBe(false);
    expect((document.getElementById('ws-name') as HTMLInputElement).value).toBe('Opened after cancel');
    expect(bridge.read).toHaveBeenCalledTimes(2);expect(bridge.save).not.toHaveBeenCalled();expect(bridge.place).not.toHaveBeenCalled();
    expect(mocks.tasks.every(task=>task.finished)).toBe(true);
  });

  it('retries a failed library read without saving or placing a blueprint',async()=>{
    const{panel,bridge}=workshop();bridge.read.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce([saved('Recovered plan')]);
    const opening=panel.open();await advanceUntil(()=>mocks.tasks.some(task=>!!task.retry));await opening;
    expect(panel.preparing).toBe(true);expect(button('ws-save').disabled).toBe(true);
    mocks.tasks.find(task=>task.retry)!.retry!();await advanceUntil(()=>!panel.preparing);
    expect(bridge.read).toHaveBeenCalledTimes(2);expect((document.getElementById('ws-name') as HTMLInputElement).value).toBe('Recovered plan');
    expect(bridge.save).not.toHaveBeenCalled();expect(bridge.place).not.toHaveBeenCalled();expect(mocks.tasks.every(task=>task.finished)).toBe(true);
  });
});
