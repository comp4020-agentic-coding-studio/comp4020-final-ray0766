// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Group,Mesh,PerspectiveCamera,Scene} from 'three';
import {SpaceFlight} from '../src/client/flight.ts';
import {orbitalPlanetAsync} from '../src/client/space-art.ts';
import {groundFlight} from '../src/shared/flight.ts';
import {sceneLoadingActive} from '../src/client/loading-state.ts';
import {setQualityPreference} from '../src/client/quality.ts';
import type {PlanetSummary} from '../src/shared/planets.ts';
vi.mock('../src/client/space-art.ts',()=>({orbitalPlanetAsync:vi.fn(async()=>new Group()),configureSpace:vi.fn()}));
const planets=Array.from({length:24},(_,i)=>({id:String(i),slot:i,name:String(i),center:[(i%6)*90,0,Math.floor(i/6)*90],radius:12,environment:null} as PlanetSummary));
const flights:SpaceFlight[]=[];
function fixture(){
 const notice=document.createElement('div');notice.innerHTML='<span></span><progress></progress><button></button>';
 const f=Object.assign(Object.create(SpaceFlight.prototype),{pilot:{...groundFlight(),mode:'space',position:[0,50,45],yaw:Math.PI/2},planets,scene:new Scene(),camera:new PerspectiveCamera(),orbitWarmed:false,orbitBuilds:0,lodAt:-Infinity,bodies:new Map(planets.map(p=>[p.id,{root:new Group(),low:new Mesh(),detail:null,label:document.createElement('button'),environment:null,radius:12,lastUsed:0,bytes:0}])),wantedDetails:new Set(),visibleDetails:new Set(),labelIds:new Set(),orbitNotice:notice,detailPreparation:null,clear:vi.fn(),bridge:{canvas:document.createElement('canvas'),renderer:{compileAsync:vi.fn(async()=>{})},online:()=>true}});flights.push(f);return f;
}
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};vi.useFakeTimers();vi.mocked(orbitalPlanetAsync).mockImplementation(async()=>new Group());vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>setTimeout(()=>cb(performance.now()),1));vi.stubGlobal('cancelAnimationFrame',clearTimeout);setQualityPreference('smooth');vi.spyOn(console,'error').mockImplementation(()=>{});if(!document.getElementById('flight-hud'))document.body.insertAdjacentHTML('beforeend','<div id="flight-hud"></div><div id="flight-labels"></div>');});
afterEach(()=>{for(const f of flights.splice(0)){const task=(f as unknown as {detailPreparation:{controller:AbortController;feedback:{finish:()=>void}}|null}).detailPreparation;task?.controller.abort();task?.feedback.finish();}vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();vi.clearAllMocks();});
it('warms more than the visible set once, then reuses it without another blocking task',async()=>{
 const f=fixture();f.updateLod(0);expect(sceneLoadingActive()).toBe(true);await vi.runAllTimersAsync();expect(sceneLoadingActive()).toBe(false);expect(orbitalPlanetAsync).toHaveBeenCalledTimes(12);f.updateLod(1000);expect(orbitalPlanetAsync).toHaveBeenCalledTimes(12);expect(f.bridge.canvas.dataset.orbitCached).toBe('12');expect(+f.bridge.canvas.dataset.orbitDetailed).toBeLessThanOrEqual(8);
});
it('continues driving while the next corridor is preparing, and keeps the cache bounded',async()=>{
 const f=fixture();f.updateLod(0);await vi.runAllTimersAsync();f.pilot.position=[270,50,45];f.updateLod(1000);expect(sceneLoadingActive()).toBe(false);expect(f.orbitNotice.hidden).toBe(false);await vi.runAllTimersAsync();f.updateLod(2000);expect(+f.bridge.canvas.dataset.orbitCached).toBeLessThanOrEqual(12);expect(f.clear).not.toHaveBeenCalled();
});
it('retains usable cached detail on a failed background build and offers explicit retry',async()=>{
 const f=fixture();f.updateLod(0);await vi.runAllTimersAsync();vi.mocked(orbitalPlanetAsync).mockRejectedValueOnce(Error('GPU compile fixture'));f.pilot.position=[270,50,45];f.updateLod(1000);await vi.runAllTimersAsync();expect(sceneLoadingActive()).toBe(false);expect(f.detailPreparation).not.toBeNull();expect(f.orbitNotice.querySelector('button').hidden).toBe(false);f.orbitNotice.querySelector('button').click();f.updateLod(2000);await vi.runAllTimersAsync();expect(f.detailPreparation).toBeNull();
});
it('limits the first blocking wait and continues with the rendered coarse worlds',async()=>{
 const f=fixture();let finish!:(value:Group)=>void;vi.mocked(orbitalPlanetAsync).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 f.updateLod(0);await vi.advanceTimersByTimeAsync(12010);expect(sceneLoadingActive()).toBe(false);expect(f.orbitWarmed).toBe(true);f.updateLod(13000);expect(sceneLoadingActive()).toBe(false);expect(orbitalPlanetAsync).toHaveBeenCalledTimes(1);finish(new Group());await vi.runAllTimersAsync();expect(f.detailPreparation).toBeNull();
});
it('cancels an in-flight preparation when returning to the ground',async()=>{
 const f=fixture();f.updateLod(0);f.receive(groundFlight());await vi.runAllTimersAsync();expect(sceneLoadingActive()).toBe(false);expect(f.detailPreparation).toBeNull();expect([...f.bodies.values()].filter((b:{detail:Group|null})=>b.detail).length).toBe(0);
});
it('keeps an authoritative active journey target when an older Atlas choice remains pending',()=>{
 const f=fixture();f.travelSelect=document.createElement('select');f.travelSelect.innerHTML='<option value="0">First</option><option value="1">Chosen in Atlas</option>';f.pendingTarget='1';
 f.receive({...f.pilot,journey:2,targetId:'0'},true);expect(f.pilot.targetId).toBe('0');expect(f.travelSelect.value).toBe('0');expect(f.pendingTarget).toBe('1');
});

it('preserves the chosen orbit on reconnection but initializes it for a new flight',()=>{
 const f=fixture(),lookForward=vi.fn();f.controls={lookForward};f.receive({...f.pilot},true);expect(lookForward).not.toHaveBeenCalled();f.receive({...f.pilot,journey:f.pilot.journey+1},true);expect(lookForward).toHaveBeenCalledOnce();
});
