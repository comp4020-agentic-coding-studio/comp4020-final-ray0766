// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {Workshop} from '../src/client/workshop.ts';
import {Colony} from '../src/client/colony.ts';
import {industrialCabin} from '../src/assets/claude-geometry/blueprint/samples.ts';
import type {LibraryEntry} from '../src/shared/blueprints.ts';
import type {Universe} from '../src/shared/planets.ts';
import {groundFlight} from '../src/shared/flight.ts';
import {SPAWN} from '../src/shared/world.ts';

// Exercise the host's real controls and editor validation without WebGL or a DB.
const preview=vi.hoisted(()=>({ghost:vi.fn()}));
vi.mock('../src/client/presentation-stage.ts',()=>({createPresentationStage:()=>({
  renderer:{domElement:document.createElement('canvas'),forceContextLoss:vi.fn(),compileAsync:vi.fn(async()=>{})},
  library:{},scene:new T.Scene(),camera:new T.PerspectiveCamera(),controls:{enabled:true},resize:vi.fn(),frameBox:vi.fn(),
  onFrame:vi.fn(),ready:vi.fn(async()=>{}),renderOnce:vi.fn(),start:vi.fn(),dispose:vi.fn(),
})}));
vi.mock('../src/assets/claude-geometry/blueprint/view/templates.ts',()=>({PartTemplates:class {get(){}dispose(){}}}));
vi.mock('../src/assets/claude-geometry/blueprint/view/workshop-view.ts',()=>({WorkshopView:class {
  level=0;
  constructor(stage:{renderer:{domElement:HTMLCanvasElement}}){document.getElementById('ws-stage')!.append(stage.renderer.domElement);}
  setGhost=preview.ghost;
  pointToGrid(x:number){return x<0?null:{gx:0,gz:0};}
  slotAt(part:string,_x:number,_z:number,rot:number){return {part,x:0,z:0,level:this.level,rot};}
  setLevel(level:number){this.level=level;}
  bounds(){return null;}
  dispose(){}
}}));
vi.mock('../src/client/build-art.ts',()=>({builtObject:()=>new T.Group(),disposeGeometry:(o:T.Object3D)=>o.removeFromParent()}));
vi.mock('../src/client/shared-assets.ts',()=>({SHARED_ASSET_VERSION:'fixture',worldMaterials:vi.fn()}));

const el=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
function select(id:string,value:string){el<HTMLSelectElement>(id).value=value;el(id).dispatchEvent(new Event('change',{bubbles:true}));}
function name(value:string){el<HTMLInputElement>('ws-name').value=value;el('ws-name').dispatchEvent(new Event('input',{bubbles:true}));}
function pointer(canvas:HTMLCanvasElement,type:string,x=0,id=1,extra:object={}){
  const event=new MouseEvent(type,{bubbles:true,clientX:x,clientY:0,button:0,...extra});
  Object.defineProperties(event,{pointerId:{value:id},isPrimary:{value:id===1}});canvas.dispatchEvent(event);
}
Object.assign(HTMLDialogElement.prototype,{showModal(this:HTMLDialogElement){this.open=true;},close(this:HTMLDialogElement){this.open=false;}});
let windowListeners:Parameters<typeof window.addEventListener>[];
let documentListeners:Parameters<typeof document.addEventListener>[];
const panels:Workshop[]=[];
beforeEach(()=>{
  vi.useFakeTimers();preview.ghost.mockClear();windowListeners=[];documentListeners=[];
  const windowAdd=window.addEventListener.bind(window),documentAdd=document.addEventListener.bind(document);
  vi.spyOn(window,'addEventListener').mockImplementation((...args)=>{windowListeners.push(args);windowAdd(...args);});
  vi.spyOn(document,'addEventListener').mockImplementation((...args)=>{documentListeners.push(args);documentAdd(...args);});
  vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(this:HTMLDialogElement){this.open=true;});
  vi.spyOn(HTMLDialogElement.prototype,'close').mockImplementation(function(this:HTMLDialogElement){this.open=false;});
  vi.spyOn(window,'confirm').mockReturnValue(false);
});
afterEach(()=>{
  for(const panel of panels.splice(0))panel.close(true);
  windowListeners.forEach(args=>window.removeEventListener(...args));
  documentListeners.forEach(args=>document.removeEventListener(...args));
  document.body.replaceChildren();document.body.className='';vi.restoreAllMocks();vi.useRealTimers();
});
async function workshop(){
  const saved:LibraryEntry={blueprint:industrialCabin(),hash:'fixture',version:1};
  const save=vi.fn(async()=>saved),place=vi.fn();
  const panel=new Workshop({read:async()=>[saved],save,place,allowed:()=>true});panels.push(panel);
  let ready=false;const opening=panel.open().then(()=>{ready=true;});
  // The real loading lifecycle yields browser frames before enabling controls.
  // Drive those frames under fake timers instead of waiting on a paused clock.
  for(let frame=0;frame<100&&!ready;frame++)await vi.advanceTimersByTimeAsync(16);
  expect(ready,'workshop opening should settle within the frame budget').toBe(true);await opening;
  expect(panel.preparing).toBe(false);
  return {panel,save,place};
}
describe('workshop placement feedback and draft protection',()=>{
  it('revalidates the preview after adding, undoing and changing the active level',async()=>{
    await workshop();el('ws-new').click();select('ws-tool','floor.deck');
    const canvas=el('ws-stage').querySelector('canvas')!;
    pointer(canvas,'pointermove');expect(preview.ghost.mock.lastCall?.[1]).toBe(true);
    pointer(canvas,'pointerdown');pointer(canvas,'pointerup');
    expect(preview.ghost.mock.lastCall?.[1]).toBe(false);
    expect(el('ws-hint').textContent).toContain('Cannot place');
    el('ws-undo').click();expect(preview.ghost.mock.lastCall?.[1]).toBe(true);
    select('ws-level','1');expect(preview.ghost.mock.lastCall?.[0]?.level).toBe(1);
    expect(preview.ghost.mock.lastCall?.[1]).toBe(false);
    select('ws-tool','select');expect(preview.ghost.mock.lastCall?.[0]).toBeNull();
  });
  it('explains invalid and valid cell placements before adding, and disabled save/place actions',async()=>{
    await workshop();el('ws-new').click();
    expect(el('ws-save-state').textContent).toContain('Add at least one part');
    select('ws-tool','floor.deck');
    expect(el('ws-hint').textContent).toContain('Ready to add');
    el('ws-add').click();expect(el('ws-hint').textContent).toContain('Cannot place');
    select('ws-x','4');expect(el('ws-hint').textContent).toContain('Ready to add');
    name('');expect(el('ws-save-state').textContent).toContain('Give the blueprint a name');
    name('My draft');expect(el('ws-save-state').textContent).toContain('Save your changes');
    expect(el<HTMLButtonElement>('ws-place').disabled).toBe(true);
  });
  it('keeps unsaved edits when close, new, starter or load discard is declined',async()=>{
    const {panel}=await workshop();name('Keep my draft');
    for(const id of ['ws-new','ws-cabin','ws-load','ws-close']){el(id).click();expect(panel.opened).toBe(true);expect(el<HTMLInputElement>('ws-name').value).toBe('Keep my draft');}
    const cancel=new Event('cancel',{cancelable:true});el('workshop').dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);expect(panel.opened).toBe(true);
    const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true);
    vi.mocked(window.confirm).mockReturnValue(true);el('ws-close').click();expect(panel.opened).toBe(false);
  });
  it('retains a failed save draft and prevents placing it',async()=>{
    const {save,place}=await workshop();save.mockRejectedValue(new Error('Offline fixture'));name('Unsent draft');
    el('ws-save').click();await Promise.resolve();await Promise.resolve();
    expect(el('ws-status').textContent).toBe('Offline fixture');expect(el('ws-count').textContent).toContain('Unsaved');
    el('ws-place').click();expect(place).not.toHaveBeenCalled();expect(el<HTMLInputElement>('ws-name').value).toBe('Unsent draft');
  });
});

async function colony(){
  document.body.innerHTML=new DOMParser().parseFromString(readFileSync('index.html','utf8'),'text/html').body.innerHTML;
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const camera=new T.PerspectiveCamera(50,1,.1,100);camera.position.set(0,0,30);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const ground=new T.Mesh(new T.SphereGeometry(10),new T.MeshBasicMaterial());
  const planet={id:'little-1',name:'Fixture',kind:'garden' as const,mine:true,claimed:true,revision:0,objectCount:0,center:[0,0,0] as [number,number,number],slot:1,objects:[]};
  const universe:Universe={currentPlanet:planet,planets:[planet],ownedPlanetId:planet.id,player:{character:'clay',quest:'available',position:SPAWN,deliveries:0,revision:0,planetId:planet.id,flight:groundFlight()}};
  const write=vi.fn(async()=>universe);
  const controller=new Colony({canvas,camera,scene:new T.Scene(),ground:()=>ground,applyPlayer:()=>true,obstacles:()=>{},pause:()=>{},read:async()=>universe,write,libraryRead:async()=>[],librarySave:vi.fn(),universe:()=>{},bearing:()=>{},flush:async()=>{},notice:()=>{}});
  await Promise.resolve();el('build-mode').click();document.querySelector<HTMLButtonElement>('[data-kind="tree"]')!.click();
  const point=()=>{pointer(canvas,'pointerdown',innerWidth/2,1,{clientY:innerHeight/2});pointer(canvas,'pointerup',innerWidth/2,1,{clientY:innerHeight/2});};
  // The ray hits the sphere at a visible point away from the landing clearance.
  const down=()=>pointer(canvas,'pointerdown',innerWidth/2,1,{clientY:innerHeight/2});
  const up=()=>pointer(canvas,'pointerup',innerWidth/2,1,{clientY:innerHeight/2});
  return {controller,canvas,point,down,up,write,dispose:()=>{ground.geometry.dispose();ground.material.dispose();}};
}
describe('planet builder cancellation and keyboard boundaries',()=>{
  it('does not place from a cancelled or dragged pointer gesture',async()=>{
    const {canvas,down,up,dispose}=await colony();
    down();pointer(canvas,'pointercancel',innerWidth/2);up();expect(el<HTMLButtonElement>('save-object').disabled).toBe(true);
    down();pointer(canvas,'pointermove',innerWidth/2+40);up();expect(el<HTMLButtonElement>('save-object').disabled).toBe(true);
    down();pointer(canvas,'pointerdown',innerWidth/2,2);up();expect(el<HTMLButtonElement>('save-object').disabled).toBe(true);
    dispose();
  });
  it('preserves a placed draft when cancelling, switching or finishing is declined',async()=>{
    const {controller,point,write,dispose}=await colony();point();
    expect(el<HTMLButtonElement>('save-object').disabled).toBe(false);
    for(const action of [()=>el('cancel-object').click(),()=>document.querySelector<HTMLButtonElement>('[data-kind="lamp"]')!.click(),()=>el('finish-building').click()]){
      action();expect(controller.building).toBe(true);expect(el('object-tools').hidden).toBe(false);expect(el('build-selection').textContent).toBe('Tree');
    }
    expect(window.confirm).toHaveBeenCalledTimes(3);
    vi.mocked(window.confirm).mockReturnValue(true);el('cancel-object').click();
    expect(el('object-tools').hidden).toBe(true);expect(write).not.toHaveBeenCalled();dispose();
  });
  it('ignores rotation during typing, composition, modified shortcuts, repeats and other dialogs',async()=>{
    const {dispose}=await colony();const rotate=vi.fn();el('rotate-object').addEventListener('click',rotate);
    for(const options of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{repeat:true}])document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'r',bubbles:true,cancelable:true,...options}));
    const editable=document.createElement('div');editable.setAttribute('contenteditable','true');editable.innerHTML='<span>typing</span>';document.body.append(editable);
    editable.firstElementChild!.dispatchEvent(new KeyboardEvent('keydown',{key:'r',bubbles:true}));
    el('built-list').dispatchEvent(new KeyboardEvent('keydown',{key:'r',bubbles:true}));
    el<HTMLDialogElement>('menu-dialog').showModal();document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'r',bubbles:true}));el<HTMLDialogElement>('menu-dialog').close();
    expect(rotate).not.toHaveBeenCalled();
    document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'r',bubbles:true}));expect(rotate).toHaveBeenCalledTimes(1);dispose();
  });
});
