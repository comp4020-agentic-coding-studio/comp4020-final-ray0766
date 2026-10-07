import { initI18n, setAttribute, setHTML, setText } from './i18n.ts';
import './i18n.css';
import {SPRINT_SPEED,SPEED} from '../shared/world.ts';
import {SPRINT_FLAG,JUMP_FLAG} from '../shared/physics/world.ts';
import * as T from 'three';
import { lazyPanel,openPanel } from './lazy-panel.ts';
import type { HistoryPage, HistorySnapshot } from '../shared/history.ts';
import { defaultShip } from '../shared/ships.ts';
import { configureRenderer, configureGroundLighting, groundPresentation, createWorldPracticalLights, updateGroundFog } from './presentation.ts';
import { worldMaterials } from './shared-assets.ts';
import { textureFormat } from './resource-policy.ts';
import { GroundWorld, groundPose, FIXED_STEP, MAX_PATH_STEPS, physicsVersionFor } from '../shared/physics/world.ts';
import type { GroundPose, MotionStep } from '../shared/physics/world.ts';
import './presentation.css';
import './style.css';
import './colony.css';
import './flight.css';
import './immersive.css';
import { mountOnboarding } from './onboarding.ts';
import { BOARD_RADIUS, portPoint } from '../shared/ports.ts';
import { GroundPresence } from './presence.ts';
import { canAcceptPlayer, isDoorOnlyRevision } from './sync.ts';
import { PRESENCE_INTERVAL } from '../shared/presence.ts';
import type { PresenceSnapshot } from '../shared/presence.ts';
import { SpaceFlight } from './flight.ts';
import { Colony } from './colony.ts';
import { disposeGeometry } from './build-art.ts';
import type { Universe } from '../shared/planets.ts';
import { surfacePoint,surfaceNormal,surfaceTangent,surfaceOrientation,surfaceScale,logicalNormal,groundRadius,groundField } from './terrain.ts';
import { SurfaceWalker, cameraPose } from './motion.ts';
import { createWorld, courier } from './scene.ts';
import { distance, INTERACT_DISTANCE, NPCS, RADIUS } from '../shared/world.ts';
import type { Character, NpcId, PlayerState, Vec3 } from '../shared/world.ts';
import { HomeInterior } from './home-interior.ts';
import { HomeControls } from './home-controls.ts';
import { createHomeDoor, placeHomeDoor } from './home-door.ts';
import { createStateLoader } from './state-loader.ts';
import { worldVisualSignature } from './world-visual-signature.ts';

initI18n();

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys = new Set<string>();let jumpQueued=false;
const joy = new T.Vector2();
let state: PlayerState;
let walker: SurfaceWalker;
let target: T.Vector3 | null = null;
let busy = false, online = false, noticeUntil = 0, conversationUntil = 0;
let overview = false;let cameraPitch=0;
let departure:{time:number;base:T.Vector3;start:T.Vector3;rotation:T.Quaternion}|null=null;
let colony: Colony | undefined;
let flight: SpaceFlight | undefined;
let homeInterior: HomeInterior | undefined;
let homeTransition=false;
let homeControls: HomeControls | undefined;
let activeRadius=14;let activePlanet = 'hub';let activeEnvironment:string|null=null,terrainSignature='';
let groundWorld:GroundWorld|null=null,standing:GroundPose|null=null,physicsClock=0;
let motionPending:MotionStep[]=[];
let motionEpoch=0,physicsMismatch=false;
function clearGroundMotion(){motionPending=[];physicsClock=0;motionEpoch++;}
const lastSaved = new T.Vector3();
let near: NpcId | null = null;let nearDock=false,guideDock=false;
let queue: Promise<unknown> = Promise.resolve();
const courierDialog = $<HTMLDialogElement>('courier-dialog');
const helpDialog = $<HTMLDialogElement>('help-dialog');
const action = $<HTMLButtonElement>('interact');
function status(message: string, error = false) { setText($('save-status'), message); $('save-status').classList.toggle('error', error); }
function speak(id: NpcId, message: string) {
  setText($('speaker'), `${NPCS[id].name} · ${NPCS[id].place}`);
  setText($('dialogue-text'), message); $('conversation').hidden = false;
  conversationUntil = performance.now() + 7000;
  world.npcs.find(n => n.id === id)?.avatar.greet(elapsed);
}
function notice(message: string, duration = 5000) { setText($('notice'), message); $('notice').hidden = false; noticeUntil = performance.now() + duration; }
class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
async function request<T = PlayerState>(path: string, body?: unknown): Promise<T> {
  if(body && typeof body==='object' && state?.location && /^(move|flight\/(takeoff|checkpoint|land))$/.test(path)) body={...body,visitEpoch:state.location.visitEpoch};
  const response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    // A first visit performs the bounded layout/route validation before it can
    // acknowledge the new home. Ordinary reads and saved edits keep 5 seconds.
    signal: AbortSignal.timeout(path==='state'&&!state?20000:5000),
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(response.status, result.error ?? 'Please try again.');
  return result;
}
// All mutations share a queue: a delivery can never overtake its last movement.
function serial<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run, run); queue = result.catch(() => {}); return result;
}
const stateLoader=createStateLoader(()=>request('state'));
function accept(next: PlayerState) {
  if(next.location?.kind!=='interior'&&next.flight.mode==='ground'&&next.ground?.physicsVersion!==physicsVersionFor(next.planetId)){
    physicsMismatch=true;online=false;clearGroundMotion();clearInput();presence.clear();
    status('Update ready · reload this page',true);notice('The walking model was updated. Reload this page to continue safely.',30000);return false;
  }
  if(!canAcceptPlayer(state,next))return false;
  const reconnecting = !online;
  const doorOnlyRevision = isDoorOnlyRevision(state,next);
  const previousGround=state?.ground;
  const previousPlanet=state?.planetId;const previousMode=state?.flight.mode;
  const locationChanged=state?.location?.kind!==next.location?.kind||state?.location?.visitEpoch!==next.location?.visitEpoch;
  const justLanded=state?.flight.mode==='space'&&next.flight.mode==='ground'&&next.revision>=state.revision;
  if (!state || next.revision >= state.revision) state = next;
  if (state.planetId !== activePlanet||(state.environment??null)!==activeEnvironment||(state.worldRadius??10)!==activeRadius) {
    activeRadius=state.worldRadius??10;activeEnvironment=state.environment??null;terrainSignature='';
    activePlanet = state.planetId; world.dispose();world.parked.dispose(); disposeGeometry(worldRoot); worldRoot = new T.Scene(); scene.add(worldRoot);
    world = createWorld(worldRoot, activePlanet === 'hub',activeEnvironment,[],{},activeRadius);renderer.domElement.dataset.terrainId=groundField().id;configureGround(); walker = new SurfaceWalker(state.position);lastSaved.copy(walker.up);clearInput();started=false;near=null;
    $('npc-mica').hidden=true;$('npc-sol').hidden=true;$('conversation').hidden=true;document.body.classList.remove('delivery-open');
  }
  if((reconnecting||justLanded||locationChanged) && walker){cameraPitch=0;walker=new SurfaceWalker(state.position);lastSaved.copy(walker.up);clearInput();clearGroundMotion();started=false;}
  const newGeometry=state.ground?.sceneRevision!==previousGround?.sceneRevision||state.ground?.physicsVersion!==previousGround?.physicsVersion;
  const priorPlanet=colony?.universe?.currentPlanet;
  if(doorOnlyRevision&&state.ground&&state.home&&priorPlanet?.id===state.planetId&&priorPlanet.homeDoor){
    groundWorld=new GroundWorld({...priorPlanet,revision:state.ground.sceneRevision,homeDoor:{...priorPlanet.homeDoor,open:state.home.interior.doorOpen,version:state.home.interior.doorVersion}});
  }
  if(state.ground&&(!standing||reconnecting||justLanded||locationChanged||newGeometry||previousPlanet!==state.planetId)){
    standing={position:[...state.position],...state.ground};clearGroundMotion();
    if(doorOnlyRevision&&walker&&!reconnecting&&!locationChanged){
      const normal=new T.Vector3(...state.position),correction=new T.Quaternion().setFromUnitVectors(walker.up,normal);
      walker.up.copy(normal);walker.north.applyQuaternion(correction).projectOnPlane(normal).normalize();walker.facing.applyQuaternion(correction).projectOnPlane(normal).normalize();walker.velocity.applyQuaternion(correction).projectOnPlane(normal);
    }else{walker=new SurfaceWalker(state.position);clearInput();started=false;}
    lastSaved.copy(walker.up);
  }
  if(previousPlanet!==state.planetId||previousMode!==state.flight.mode||locationChanged)presence.clear();
  if(state.location?.kind==='interior')document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog=>dialog.close());
  const design=(state.ship??defaultShip()).design;world.parked.setDesign(design);flight?.setDesign(design);renderer.domElement.dataset.shipDesign=world.parked.document;
  flight?.receive(state.flight,reconnecting);
  if(previousMode==='ground'&&state.flight.mode==='space'&&activePlanet==='hub'&&!reduced&&flight){departure={time:0,base:world.parked.root.position.clone(),start:camera.position.clone(),rotation:camera.quaternion.clone()};flight.presentation=true;document.body.classList.add('departing');notice('Departure clearance granted · Sunseed Harbour',4200);}
  physicsMismatch=false;online = navigator.onLine; status(online?'Progress saved':'Offline · retrying',!online); renderTask();
  homeInterior?.receive(state);homeInterior?.setOnline(online);homeControls?.receivePlayer(state);
  placeHomeDoor(exteriorHomeDoor,state.flight.mode==='ground'?state.home:null);
  return true;
}
function failed(error: unknown) {
  clearGroundMotion();
  presence.clear();
  online = false; status('Offline · retrying', true);
  homeInterior?.setOnline(false);
  notice(error instanceof Error ? error.message : 'Could not save. Reconnecting…');
}
function renderTask() {
  const carrying = state.quest === 'carrying', done = state.quest === 'delivered';
  player.parcel.visible = carrying && activePlanet === 'hub';
  world.flowers.visible = done;
  if (done) { setText($('distance'), 'Saved for your next visit'); setText($('compass'), '✓'); $('compass').style.transform = ''; if (near) setHTML(action, `Talk to ${NPCS[near].name} <kbd>E</kbd>`); }
  setText($('mission-title'), done ? 'Something good is growing.' : carrying ? 'A little care, on its way.' : 'A seed of an idea');
  setText($('mission-detail'), done ? 'One small kindness, delivered. Take the long way home.' : carrying ? 'Bring the sunseeds to Sol at the glasshouse.' : 'Find Mica at the post office.');
  setText($('destination-name'), done ? 'Delivery complete · thank you' : carrying ? 'Sol · Glasshouse' : 'Mica · Post office');
  $('step-pickup').className = state.quest === 'available' ? 'current' : 'done';
  $('step-deliver').className = carrying ? 'current' : done ? 'done' : '';
  $('step-done').className = done ? 'current' : '';
  document.querySelectorAll<HTMLButtonElement>('[data-character]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.character === state.character)));
  player.setColor(state.character);
}
let renderer: T.WebGLRenderer;
try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch {
  setHTML($('world'), '<div class="fallback">This browser could not start WebGL. Try an up-to-date browser with hardware acceleration. <a href="/readme/">Read about Little Post</a></div>');
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.setClearColor('#9cc8c4', 0);
configureRenderer(renderer, 'world');
$('world').append(renderer.domElement);
setAttribute(renderer.domElement, 'aria-label', 'Little Worlds planet. Use WASD or arrows to walk, hold Shift to run, Space to jump; board your ship to fly between worlds.');
// Optional local measurements: CPU submission time, not GPU frame time.
// Keep diagnostics off the normal visit and never use them as game inputs.
if(new URLSearchParams(location.search).has('measure')){
  const draw=renderer.render.bind(renderer);let frames=0,total=0;
  renderer.render=(target,view)=>{const begin=performance.now();draw(target,view);total+=performance.now()-begin;
    if(++frames===30){renderer.domElement.dataset.renderCpuMs=(total/frames).toFixed(3);frames=0;total=0;}};
}
worldMaterials().attachRenderer(renderer,textureFormat());
const scene = new T.Scene();
const exteriorHomeDoor=createHomeDoor();scene.add(exteriorHomeDoor.root);exteriorHomeDoor.root.visible=false;
const practical=createWorldPracticalLights();scene.add(practical.group);
const sky = new T.Group();scene.add(sky);
const stars:number[]=[];for(let i=0;i<260;i++){const p=new T.Vector3(Math.sin(i*21.2),Math.cos(i*14.3),Math.sin(i*9.2)).normalize().multiplyScalar(65);stars.push(...p.toArray());}
const starGeo=new T.BufferGeometry();starGeo.setAttribute('position',new T.Float32BufferAttribute(stars,3));sky.add(new T.Points(starGeo,new T.PointsMaterial({color:'#819dab',size:.085,fog:false})));
const camera = new T.PerspectiveCamera(52, innerWidth / innerHeight, .08, 2400);
const fill = new T.AmbientLight(); scene.add(fill);
const sun = new T.DirectionalLight(); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.normalBias=.09;sun.shadow.bias=-.0003;
scene.add(sun);scene.add(sun.target);
let worldRoot = new T.Scene();scene.add(worldRoot);
let world = createWorld(worldRoot);
function configureGround(){
 sky.visible=activePlanet!=='hub';configureGroundLighting(activePlanet,scene,fill,sun,activeRadius);
}
configureGround();
const player = courier('clay');scene.add(player.root);
const presence=new GroundPresence(scene,renderer.domElement);
const silhouette = new T.Mesh(new T.CapsuleGeometry(.22, .90, 4, 8), new T.MeshBasicMaterial({color:'#ffdfa0',transparent:true,opacity:.24,depthTest:false,depthWrite:false}));
silhouette.visible=false;silhouette.renderOrder=100;scene.add(silhouette);
const destinationRing = new T.Mesh(new T.RingGeometry(.2,.27,24),new T.MeshBasicMaterial({color:'#fff7db',side:T.DoubleSide,transparent:true,opacity:.9}));
destinationRing.visible=false;scene.add(destinationRing);
const poseCamera = new T.PerspectiveCamera();
function resize() { renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.35:1.8));const shadowSize=innerWidth<700?1024:2048;if(sun.shadow.mapSize.x!==shadowSize){sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.map?.dispose();sun.shadow.map=null;}camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight); }
window.addEventListener('resize',resize);resize();
function clearInput() { jumpQueued=false;keys.clear();joy.set(0,0);$('stick').style.transform='';target=null; }
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=> { if(document.hidden) { clearInput(); void savePosition(true); } });
window.addEventListener('keydown',event=> {
  if(homeInterior?.active||homeTransition)return;
  if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||flight?.active||document.querySelector('dialog[open]')||colony?.paused||(event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')))return;
  const key=event.key.toLowerCase();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','shift',' '].includes(key)) {
    event.preventDefault();if(key===' '&&event.repeat)return;if(key===' '&&!keys.has(key))jumpQueued=true;keys.add(key);target=null;
    if(key==='e' && !event.repeat){if(homeControls?.canEnter)void homeControls.enter();else if(nearDock)flight?.openLaunch();else void interact();}
  }
});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
const raycaster = new T.Raycaster();
let pointerStart: {x:number;y:number;lastX:number;lastY:number;dragged:boolean} | null=null;
renderer.domElement.addEventListener('pointerdown',e=> {if(!homeInterior?.active&&!flight?.active&&!document.querySelector('dialog[open]')&&!colony?.paused){pointerStart={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,dragged:false};renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointermove',e=>{
  if(homeInterior?.active||!pointerStart||!walker||flight?.active||document.querySelector('dialog[open]')||colony?.paused)return;
  if(Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>7)pointerStart.dragged=true;
  if(pointerStart.dragged){walker.north.applyAxisAngle(walker.up,-(e.clientX-pointerStart.lastX)*.004).projectOnPlane(walker.up).normalize();cameraPitch=T.MathUtils.clamp(cameraPitch+(e.clientY-pointerStart.lastY)*.003,-.3,.7);target=null;}
  pointerStart.lastX=e.clientX;pointerStart.lastY=e.clientY;
});
renderer.domElement.addEventListener('pointercancel',()=>pointerStart=null);
renderer.domElement.addEventListener('lostpointercapture',()=>pointerStart=null);
renderer.domElement.addEventListener('pointerup',e=> {
  if(homeInterior?.active || flight?.active || document.querySelector('dialog[open]') || colony?.paused || !walker || !online || !pointerStart || pointerStart.dragged || Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>10) return;
  raycaster.setFromCamera(new T.Vector2(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1),camera);
  const hit=raycaster.intersectObject(world.globe)[0];
  if(hit) {target=logicalNormal(hit.point.normalize());destinationRing.position.copy(surfacePoint(target,.05));destinationRing.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),surfaceNormal(target));}
  pointerStart=null;
});
const joystick=$('joystick');let joyPointer:number|null=null;
function drag(e:PointerEvent) {
  const rect=joystick.getBoundingClientRect();joy.set((e.clientX-rect.left-rect.width/2)/36,-(e.clientY-rect.top-rect.height/2)/36);joy.clampLength(0,1);
  $('stick').style.transform=`translate(${joy.x*30}px,${-joy.y*30}px)`;
}
joystick.addEventListener('pointerdown',e=>{joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);target=null;drag(e);});
joystick.addEventListener('pointermove',e=>{if(joyPointer===e.pointerId)drag(e);});
for(const name of ['pointerup','pointercancel','lostpointercapture']) joystick.addEventListener(name,()=>{joyPointer=null;joy.set(0,0);$('stick').style.transform='';});
$('view-mode').onclick=()=>{menu.close();overview=!overview; setAttribute($('view-mode'), 'aria-label', overview?'Walking view':'View planet'); setHTML($('view-mode'), overview?'↗ <span>Walking view</span>':'◉ <span>Planet view</span>'); };
$('close-conversation').onclick=()=>{ $('conversation').hidden=true; conversationUntil=0; };
$('wardrobe').onclick=()=>{menu.close();clearInput();courierDialog.showModal();};
$('help').onclick=()=>{menu.close();clearInput();helpDialog.showModal();};
document.querySelectorAll<HTMLButtonElement>('dialog .close, .close-help').forEach(b=>b.onclick=()=>b.closest('dialog')?.close());
const welcomeKey=(player:PlayerState)=>`little-worlds:welcomed:${player.home?.interiorId??'harbour'}`;
$('begin').onclick=()=>{try{localStorage.setItem(welcomeKey(state),'1');}catch{/* A blocked preference store must not prevent starting. */}courierDialog.close();notice(state.home?'Walk to your home’s door, then choose Enter home.':'Follow the short path to SUNSEED · PORT.',6500);};
const menu=$<HTMLDialogElement>('menu-dialog');
$('open-menu').onclick=()=>{if(homeInterior?.active||homeTransition)return;clearInput();flight?.clear();menu.showModal();void savePosition(true);};
$('close-menu').onclick=$('resume').onclick=()=>menu.close();
const terrainWorkshop=lazyPanel(async()=>{const {TerrainWorkshop}=await import('./terrain-workshop.ts');return new TerrainWorkshop({read:()=>request<Universe>('universe'),save:async body=>{await savePosition(true);const next=await serial(()=>request<Universe>('terrain/apply',body));colony?.accept(next);return next;},allowed:()=>!!colony?.universe?.currentPlanet.mine&&online&&state.flight.mode==='ground'});});
$('open-terrain').onclick=()=>void openPanel($<HTMLButtonElement>('open-terrain'),terrainWorkshop,async panel=>{if(!colony?.universe?.currentPlanet.mine||state.flight.mode!=='ground'||!colony.stopBuilding())return;clearInput();await savePosition(true);menu.close();await panel.open();});
const history=lazyPanel(async()=>{const {PrivateHistory}=await import('./history.ts');return new PrivateHistory({page:(id,after)=>request<HistoryPage>('history?planetId='+encodeURIComponent(id)+'&after='+after),snapshot:(id,seq)=>request<HistorySnapshot>('history/snapshot?planetId='+encodeURIComponent(id)+(seq===undefined?'':'&sequence='+seq))});});
$('open-history').onclick=()=>void openPanel($<HTMLButtonElement>('open-history'),history,async panel=>{if(!colony?.universe?.currentPlanet.mine)return;clearInput();await savePosition(true);menu.close();await panel.open(colony.universe.currentPlanet.id);});
const shipyard=lazyPanel(async()=>{const {Shipyard}=await import('./shipyard.ts');return new Shipyard({read:async()=>{const next=await serial(()=>request('state'));accept(next);return next.ship??defaultShip();},save:async body=>{const next=await serial(()=>request('ship/save',body));accept(next);return next.ship??defaultShip();},allowed:()=>!!state&&online&&state.flight.mode==='ground'});});
$('open-shipyard').onclick=()=>{if(state?.flight.mode==='space'){notice('Land before changing your ship.');return;}void openPanel($<HTMLButtonElement>('open-shipyard'),shipyard,async panel=>{if(state.flight.mode==='space')return;clearInput();await savePosition(true);menu.close();await panel.open();});};
$('guide-port').onclick=()=>{guideDock=true;menu.close();notice('Your parked ship is marked. Walk there to board.');};
window.addEventListener('keydown',e=>{if(homeInterior?.active||homeTransition)return;if(e.key==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();clearInput();flight?.clear();menu.showModal();void savePosition(true);}if(e.key.toLowerCase()==='m'&&!e.defaultPrevented&&!e.isComposing&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))&&!document.querySelector('dialog[open]')){$('open-map').click();}});
document.querySelectorAll<HTMLButtonElement>('[data-character]').forEach(button=>button.onclick=async()=>{
  if(busy || !state) return;
  busy=true;const old=state.character;player.setColor(button.dataset.character as Character);status('Saving coat…');
  try {accept(await serial(()=>request('character',{character:button.dataset.character})));}
  catch(error){player.setColor(old);failed(error);}finally{busy=false;}
});
let saving:Promise<void>|null=null;
async function savePosition(force=false):Promise<void> {
  if(saving){await saving;if(force)return savePosition(true);return;}
  if(!walker||!state||state.location?.kind==='interior'||state.flight.mode==='space'||!online)return;
  if(!motionPending.length)return;
  const steps=motionPending.splice(0,MAX_PATH_STEPS),p=steps.at(-1)!.slice(0,3) as Vec3,planetId=state.planetId;
  const epoch=motionEpoch,motion=steps.length?{sequence:(state.ground?.sequence??0)+1,physicsVersion:physicsVersionFor(planetId),steps}:undefined;
  saving=(async()=>{
    try{
      // A refresh/recovery can happen while this save waits in the mutation
      // queue or in flight. Neither an old send nor its response may rebase the
      // new collision world back to the old standing height.
      const next=await serial(async()=>epoch===motionEpoch?request('move',{position:p,planetId,...(motion?{motion}:{})}):null);
      if(!next||epoch!==motionEpoch)return;
      if(accept(next))lastSaved.fromArray(next.position);
    }
    catch(error){if(epoch!==motionEpoch)return;if(error instanceof ApiError&&error.status===409){walker=new SurfaceWalker(state.position);standing=state.ground?{position:[...state.position],...state.ground}:null;lastSaved.copy(walker.up);clearInput();}failed(error);}
  })().finally(()=>{saving=null;});
  await saving;
  if(force&&motionPending.length&&online)await savePosition(true);
}
async function interact() {
  if(state?.location?.kind==='interior'||state?.flight.mode==='space' || !near || busy || !online) return;
  if(state.quest==='delivered') {speak(near,near==='sol'?'A whole summer in one little packet. Thank you. Stay a while — the flowers are already finding the sun.':'Nothing else to carry today. There’s a lovely path past the orchard if you’re taking the long way home.');return;}
  if(near==='sol' && state.quest==='available') {speak('sol','Mica is keeping the sunseeds at the post office. Would you bring them over?');return;}
  if(near==='mica' && state.quest==='carrying') {speak('mica','Sol is just along the lane, at the glasshouse. Take your time; the seeds aren’t in a hurry.');return;}
  const requestedAction = near === 'mica' ? 'pickup' : 'deliver';
  busy=true;action.disabled=true;status('Saving delivery…');
  try {
    const p=walker.up.toArray() as Vec3;
    await savePosition(true);
    const next=await serial(()=>request('interact',{action:requestedAction}));
    lastSaved.fromArray(p);accept(next);
    speak(state.quest==='carrying'?'mica':'sol',state.quest==='carrying'?'Sunseeds, for Sol. A little sunshine for the glasshouse. Keep them close, won’t you?':'You made it! A whole summer in a little packet. Let’s grow something good.');
    player.greet(elapsed);
  }catch(error){failed(error);}finally{busy=false;action.disabled=false;}
}
action.onclick=()=>void interact();
setInterval(()=>void savePosition(),350);
let presenceBusy=false;
setInterval(async()=>{
  if(presenceBusy||!online||!walker||state?.flight.mode!=='ground'||document.hidden)return;
  presenceBusy=true;const planetId=activePlanet,ticket=presence.ticket(planetId),location=state.location,epoch=location?.visitEpoch??0;
  const interior=location?.kind==='interior';
  try{const snapshot=await request<PresenceSnapshot>('presence',{planetId,facing:interior?[Math.sin(location.yaw),0,Math.cos(location.yaw)]:walker.facing.toArray(),...(location?{scope:interior?`home:${location.buildingId}`:'exterior',visitEpoch:epoch}:{})});
    if(activePlanet===planetId&&state.flight.mode==='ground'&&(state.location?.visitEpoch??0)===epoch){if(interior)homeInterior?.receivePresence(snapshot);else presence.receive(snapshot,performance.now(),ticket);}}
  catch{/* Presence is ephemeral; a failed heartbeat must not alter durable saves. */}
  finally{presenceBusy=false;}
},PRESENCE_INTERVAL);
setInterval(async()=>{
  if(online || busy || physicsMismatch || stateLoader.pending) return;
  try {
    const next=await serial(()=>stateLoader.read());if(!accept(next))return;
    walker=new SurfaceWalker(next.position);lastSaved.copy(walker.up);clearInput();ensureColony();notice('Back at your last saved spot. Welcome home.');
  }catch{status('Offline · retrying',true);}
},2500);
window.addEventListener('online',()=>notice('Reconnecting to your worlds…'));
window.addEventListener('offline',()=>{presence.clear();online=false;homeInterior?.setOnline(false);clearGroundMotion();clearInput();flight?.clear();status('Offline · retrying',true);});

let previous=performance.now(),elapsed=0,uiTick=0,started=false;
function animate(now:number) {
  requestAnimationFrame(animate);
  const dt=Math.min((now-previous)/1000,.05);previous=now;elapsed+=dt;
  exteriorHomeDoor.frame(dt,reduced);
  if(homeInterior?.active){homeInterior.frame(dt,elapsed);return;}
  if(!walker || (document.body.classList.contains('workshop-open')||document.body.classList.contains('shipyard-open')||document.body.classList.contains('history-open')||document.body.classList.contains('terrain-workshop-open'))) return;
  if(flight?.active&&departure){
    $('boarding-prompt').hidden=true;$('dock-guide').hidden=true;
    if(online&&!document.hidden&&!document.querySelector('dialog[open]'))departure.time+=dt;
    const t=Math.min(1,departure.time/3.4),smooth=t*t*(3-2*t),ship=world.parked.root;
    ship.position.copy(departure.base).add(new T.Vector3(0,18*smooth,-24*smooth));ship.updateWorldMatrix(true,false);world.parked.animate(.7,false);
    const pos=ship.getWorldPosition(new T.Vector3()),up=surfaceNormal(walker.up),north=surfaceTangent(walker.up,walker.north),right=new T.Vector3().crossVectors(north,up).normalize();
    const shot=pos.clone().addScaledVector(up,5+8*t).addScaledVector(north,-17-8*t).addScaledVector(right,10);
    poseCamera.position.copy(shot);poseCamera.up.copy(up);poseCamera.lookAt(pos.clone().addScaledVector(north,10));
    camera.position.copy(departure.start).lerp(shot,Math.min(1,t*3));camera.quaternion.copy(departure.rotation).slerp(poseCamera.quaternion,Math.min(1,t*3));
    world.animate(elapsed,reduced,camera.position,up);renderer.domElement.dataset.departure=String(t);practical.update(scene,camera,dt);renderer.render(scene,camera);
    if(t>=1){ship.position.copy(departure.base);world.parked.animate(0,false);departure=null;flight.presentation=false;flight.clear();document.body.classList.remove('departing');delete renderer.domElement.dataset.departure;}return;
  }
  if(flight?.active){$('boarding-prompt').hidden=true;$('dock-guide').hidden=true;flight.frame(dt,now,renderer);if(now>noticeUntil)$('notice').hidden=true;return;}
  const paused=homeTransition||!!document.querySelector('dialog[open]')||courierDialog.open||helpDialog.open||!!colony?.paused||!online||document.hidden||!!document.activeElement?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  homeControls?.frame(walker.up.toArray() as Vec3,groundRadius(),!paused);
  let x=joy.x+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  let y=joy.y+Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
  if(target && !paused) {
    const d=target.clone().projectOnPlane(walker.up);
    if(walker.up.angleTo(target)*groundRadius()<.2){target=null;}else{d.normalize();x=d.dot(walker.right());y=d.dot(walker.north);}
  }
  if(groundWorld&&standing){
    if(paused){clearInput();walker.velocity.set(0,0,0);physicsClock=0;}else{
      physicsClock=Math.min(.05,physicsClock+dt);
      while(physicsClock>=FIXED_STEP&&motionPending.length<MAX_PATH_STEPS){
        physicsClock-=FIXED_STEP;const before=standing;
        const flags=(keys.has('shift')?SPRINT_FLAG:0)|((keys.has(' ')||jumpQueued)?JUMP_FLAG:0);jumpQueued=false;
        walker.step(x,y,FIXED_STEP,RADIUS/standing.radius*(flags&SPRINT_FLAG?SPRINT_SPEED/SPEED:1));
        const resolved=groundWorld.move(before,walker.up.toArray() as Vec3,FIXED_STEP,flags),normal=new T.Vector3(...resolved.position);
        const correction=new T.Quaternion().setFromUnitVectors(walker.up,normal);
        walker.up.copy(normal);walker.north.applyQuaternion(correction).projectOnPlane(normal).normalize();walker.facing.applyQuaternion(correction).projectOnPlane(normal).normalize();walker.velocity.applyQuaternion(correction).projectOnPlane(normal);
        standing=resolved;
        if(distance(before.position,resolved.position)>.000001||Math.abs(before.radius-resolved.radius)>.000001||before.grounded!==resolved.grounded||before.verticalSpeed!==resolved.verticalSpeed||!!before.jumpHeld!==!!resolved.jumpHeld)
          motionPending.push([...resolved.position.map(v=>Number(v.toFixed(7))),Number(FIXED_STEP.toFixed(7)),flags] as MotionStep);
      }
    }
  }
  destinationRing.visible=!!target;
  const feet=walker.up.clone().multiplyScalar(standing?.radius??groundPose(walker.up.toArray() as Vec3,groundField()).radius);
  player.root.position.copy(feet).addScaledVector(walker.up,.018);player.root.quaternion.copy(surfaceOrientation(walker.up,walker.facing));player.animate(elapsed,walker.velocity.length()*(standing?.radius??groundRadius())/RADIUS,reduced,0,standing?.grounded??true);
  const fov=activeRadius>20&&!overview?(innerWidth<600?55:45):activePlanet==='hub'?(innerWidth<600?65:55):(innerWidth<600&&!overview?58:48);if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
  const renderUp=surfaceNormal(walker.up);
  const hub=activePlanet==='hub',phone=innerWidth<600;
  const pose=cameraPose(walker,phone,overview,groundRadius());
  if(hub&&activeRadius>20&&!overview){
    // The public route has longer sightlines than a private doorway. Keep the
    // next destination visible over the curve without changing model scale.
    pose.position.copy(walker.up).multiplyScalar(activeRadius+4.8).addScaledVector(walker.north,phone?-6.4:-6);
    pose.target.copy(walker.up).multiplyScalar(activeRadius+1.05).addScaledVector(walker.north,2);
  }
  pose.position.addScaledVector(walker.up,world.height(walker.up));
  pose.target.addScaledVector(walker.up,world.height(walker.up));
  if(standing&&!overview){const lift=standing.radius-groundRadius()-world.height(walker.up);pose.position.addScaledVector(walker.up,lift);pose.target.addScaledVector(walker.up,lift);}
  const headPoint=feet.clone().addScaledVector(renderUp,1.35);
  player.root.visible=true;
  if(!overview&&groundWorld){
    let clipped=groundWorld.cameraDistance(headPoint,pose.position);
    if(clipped<2.5){
      pose.position.copy(headPoint).addScaledVector(walker.north,-1.2);pose.target.copy(headPoint).addScaledVector(walker.north,3).addScaledVector(walker.up,Math.tan(cameraPitch)*3);
      clipped=groundWorld.cameraDistance(headPoint,pose.position);player.root.visible=clipped>1.35;
    }
    const boom=pose.position.clone().sub(headPoint);if(clipped<boom.length())pose.position.copy(headPoint).addScaledVector(boom.normalize(),Math.max(.02,clipped));
  }
  if(hub&&!overview){
    // Shorten the camera boom before it penetrates a facade when looking sideways.
    const offset=pose.position.clone().sub(headPoint),length=offset.length();raycaster.set(headPoint,offset.normalize());raycaster.far=length;
    const hit=raycaster.intersectObject(world.scenery,true).find(h=>h.distance>.35);
    if(hit&&hit.distance<length)pose.position.copy(headPoint).addScaledVector(offset,Math.max(.55,hit.distance-.3));raycaster.far=Infinity;
  }
  if(!overview){
    // A close walking camera must not enter the suspended parked craft.
    const offset=pose.position.clone().sub(headPoint),length=offset.length();raycaster.set(headPoint,offset.normalize());raycaster.far=length;
    const hit=raycaster.intersectObject(world.parked.root,true).find(h=>h.object instanceof T.Mesh&&h.distance>.35);
    if(hit)pose.position.copy(headPoint).addScaledVector(offset,Math.max(.55,hit.distance-.3));raycaster.far=Infinity;
  }
  const sight=new T.Ray(pose.position.clone(),headPoint.clone().sub(pose.position).normalize());
  const sightLength=pose.position.distanceTo(headPoint);
  silhouette.visible=!hub&&world.blocks.some(b=>{
    const center=surfacePoint(b.point,b.height*.50),along=center.clone().sub(sight.origin).dot(sight.direction);
    return along>.4&&along<sightLength-.5&&sight.distanceSqToPoint(center)<Math.pow(Math.max(b.radius,b.height*.28),2);
  });
  silhouette.position.copy(feet).addScaledVector(walker.up,.84);silhouette.quaternion.copy(player.root.quaternion);
  poseCamera.position.copy(pose.position);poseCamera.up.copy(renderUp);poseCamera.lookAt(pose.target);
  if(!started){camera.position.copy(pose.position);camera.quaternion.copy(poseCamera.quaternion);started=true;}
  camera.position.lerp(pose.position,reduced?1:1-Math.exp(-7*dt));camera.quaternion.slerp(poseCamera.quaternion,reduced?1:1-Math.exp(-8*dt));
  updateGroundFog(scene,activePlanet,activeRadius,camera.position.length(),overview);
  if(!overview&&groundWorld){const boom=camera.position.clone().sub(headPoint),limit=groundWorld.cameraDistance(headPoint,camera.position);if(limit<boom.length())camera.position.copy(headPoint).addScaledVector(boom.normalize(),Math.max(.02,limit));}
  if(!overview){const boom=camera.position.clone().sub(headPoint),length=boom.length();raycaster.set(headPoint,boom.normalize());raycaster.far=length;const hit=raycaster.intersectObject(world.parked.root,true).find(h=>h.object instanceof T.Mesh&&h.distance>.35);if(hit)camera.position.copy(headPoint).addScaledVector(boom,Math.max(.55,hit.distance-.3));raycaster.far=Infinity;}
  if(hub||activeRadius>20){sun.target.position.copy(surfacePoint(walker.up));sun.position.copy(sun.target.position).addScaledVector(renderUp,65).add(new T.Vector3(-55,0,45).projectOnPlane(renderUp));}else{sun.position.copy(walker.up).multiplyScalar(24).addScaledVector(walker.right(),-12).addScaledVector(walker.north,7);sun.target.position.set(0,0,0);}
  const skyRight=walker.right(),skyBack=walker.north.clone().negate();
  sky.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(skyRight,walker.up,skyBack));
  if('setSunDirection' in world)world.setSunDirection(sun.position.clone().sub(sun.target.position).normalize().toArray() as Vec3);
  world.animate(elapsed,reduced,camera.position,renderUp);
  world.npcs.forEach(n=>{n.avatar.animate(elapsed,0,reduced);if(near===n.id){const local=n.anchor.worldToLocal(player.root.position.clone());const yaw=Math.atan2(local.x,local.z);const diff=Math.atan2(Math.sin(yaw-n.avatar.root.rotation.y),Math.cos(yaw-n.avatar.root.rotation.y));n.avatar.root.rotation.y+=diff*(1-Math.exp(-4*dt));}n.beacon.position.y=2.0+(reduced?0:Math.sin(elapsed*2)*.06);n.beacon.visible=state.quest!=='delivered'&&n.id===(state.quest==='available'?'mica':'sol');});
  presence.frame(now,dt,walker.up,reduced);
  colony?.updateShadows(feet);
  practical.update(scene,camera,dt);renderer.render(scene,camera);
  uiTick+=dt;
  if(uiTick>.1) {
    renderer.domElement.dataset.publicCounts=JSON.stringify(world.scenery.userData.publicCounts??null);renderer.domElement.dataset.practical=JSON.stringify(practical.stats());if(renderer.domElement.dataset.renderCpuMs!==undefined)renderer.domElement.dataset.lightLevels=JSON.stringify(practical.group.children.filter((o):o is T.Light=>o instanceof T.Light).map(o=>o.userData.fullIntensity?o.intensity/o.userData.fullIntensity:0));renderer.domElement.dataset.textureFormat=worldMaterials().textureFormat;renderer.domElement.dataset.scanFormats=JSON.stringify(worldMaterials().scanStats().map(s=>s.format));
    renderer.domElement.dataset.feetRadius=String(standing?.radius??groundRadius());renderer.domElement.dataset.verticalSpeed=String(standing?.verticalSpeed??0);renderer.domElement.dataset.sprinting=String(keys.has('shift'));renderer.domElement.dataset.jumpHeld=String(!!standing?.jumpHeld);renderer.domElement.dataset.grounded=String(standing?.grounded??true);renderer.domElement.dataset.groundSupport=groundWorld&&standing?groundWorld.support(standing.position,standing.radius+.01).tag:'terrain';
    // Read-only pose evidence for obstruction checks; never an input to movement or saves.
    renderer.domElement.dataset.cameraPosition=JSON.stringify(camera.position.toArray());renderer.domElement.dataset.cameraHead=JSON.stringify(headPoint.toArray());renderer.domElement.dataset.playerVisible=String(player.root.visible);
    renderer.domElement.dataset.cameraHeading=JSON.stringify(walker.north.toArray());renderer.domElement.dataset.cameraPitch=String(cameraPitch);renderer.domElement.dataset.groundScale=String(surfaceScale(walker.up));renderer.domElement.dataset.groundRadius=String(groundRadius());renderer.domElement.dataset.quality=innerWidth<700?'compact':'full';
    renderer.domElement.dataset.drawCalls=String(renderer.info.render.calls);
    renderer.domElement.dataset.triangles=String(renderer.info.render.triangles);
    uiTick=0;near=null;
    const dockPoint=new T.Vector3(...portPoint(activePlanet)),displayDockDistance=surfaceNormal(walker.up).angleTo(surfaceNormal(dockPoint))*groundRadius(),dockDistance=walker.up.angleTo(dockPoint)*groundRadius();nearDock=!!standing?.grounded&&dockDistance<BOARD_RADIUS-.12;
    $('boarding-prompt').hidden=!nearDock||paused;setText($('dock-context'), activePlanet==='hub'?'STARPORT / BOARDING GATE':'PARKED SHIP / RETURN BEACON');
    $('dock-guide').hidden=!guideDock||nearDock||paused;const toward=dockPoint.projectOnPlane(walker.up).normalize();$('dock-arrow').style.transform=`rotate(${Math.atan2(toward.dot(walker.right()),toward.dot(walker.north))*180/Math.PI}deg)`;setText($('dock-guide-text'), `Parked ship · ${Math.round(displayDockDistance)} m`);
    renderer.domElement.dataset.portDistance=String(dockDistance);renderer.domElement.dataset.groundPosition=JSON.stringify(walker.up.toArray());

    for(const n of world.npcs){
      const d=distance(walker.up.toArray() as Vec3,NPCS[n.id].position,groundRadius());if(d<INTERACT_DISTANCE-.12)near=n.id;
      const p=n.anchor.position.clone().addScaledVector(n.anchor.position.clone().normalize(),2.12);
      const labelRay=new T.Ray(camera.position.clone(),p.clone().sub(camera.position).normalize());
      const groundHit=labelRay.intersectSphere(new T.Sphere(new T.Vector3(),groundRadius()-.10),new T.Vector3());
      const visible=!groundHit||camera.position.distanceTo(groundHit)>camera.position.distanceTo(p);
      p.project(camera);const label=$('npc-'+n.id);
      const active=state.quest!=='delivered'&&n.id===(state.quest==='available'?'mica':'sol');
      const offscreen=Math.abs(p.x)>.84||Math.abs(p.y)>.84;
      label.hidden=!visible||p.z>1||(!active&&offscreen)||(d>3&&!document.body.classList.contains('delivery-open'));
      label.classList.toggle('offscreen',offscreen);label.dataset.side=p.x>0?'right':'left';
      label.style.left=`${Math.max(52,Math.min(innerWidth-52,(p.x*.5+.5)*innerWidth))}px`;
      label.style.top=`${Math.max(innerWidth<600?222:100,Math.min(innerHeight-210,(-p.y*.5+.5)*innerHeight))}px`;
    }
    action.hidden=!near||paused||nearDock;
    if(near){setHTML(action, (state.quest==='available'&&near==='mica'?'Collect the parcel':state.quest==='carrying'&&near==='sol'?'Deliver to Sol':`Talk to ${NPCS[near].name}`)+' <kbd>E</kbd>');setText($('nearby'), near==='mica'?'A little sunshine, ready to go.':'Something’s waiting to grow.');}
    else setText($('nearby'), '');
    if(state.quest!=='delivered') {
      const destination=new T.Vector3(...NPCS[state.quest==='available'?'mica':'sol'].position);
      setText($('distance'), near===(state.quest==='available'?'mica':'sol')?'You’re here · say hello':`${Math.round(surfaceNormal(walker.up).angleTo(surfaceNormal(destination))*groundRadius())} m away`);
      const tangent=destination.projectOnPlane(walker.up).normalize();
      $('compass').style.transform=`rotate(${Math.atan2(tangent.dot(walker.right()),tangent.dot(walker.north))*180/Math.PI}deg)`;
    }else{setText($('distance'), 'Saved for your next visit');setText($('compass'), '✓');$('compass').style.transform='';}
    if(now>noticeUntil)$('notice').hidden=true;
    if(now>conversationUntil)$('conversation').hidden=true;
  }
}
function ensureColony() {
  if(colony)return;
  homeInterior=new HomeInterior({renderer,
    move:body=>serial(()=>request('home/move',body)),save:body=>serial(()=>request<Universe>('home/save',body)),exit:body=>serial(()=>request<Universe>('home/exit',body)),door:body=>serial(()=>request<Universe>('home/door',body)),
    applyPlayer:next=>{accept(next);},applyUniverse:next=>colony?.accept(next),recover:()=>request<Universe>('universe'),
  });homeInterior.receive(state);homeInterior.setOnline(online);
  homeControls=new HomeControls({enter:async()=>{
    const home=state.home;if(!home||state.location?.kind==='interior')return;
    homeTransition=true;document.body.classList.add('home-transition');
    try{
      await savePosition(true);clearInput();clearGroundMotion();
      const next=await serial(()=>request<Universe>('home/enter',{planetId:state.planetId,buildingId:home.buildingId,visitEpoch:state.location?.visitEpoch??0}));
      colony?.accept(next);
    }finally{homeTransition=false;document.body.classList.remove('home-transition');}
  },command:async(route,body)=>{if(route==='home/door')await savePosition(true);return serial(()=>request<Universe>(route,body));},apply:next=>colony?.accept(next),workshop:async()=>{await colony?.openHomeWorkshop();},pathPreview:planetId=>serial(()=>request<import('../shared/home-paths.ts').HomePathPreview>('home/paths/preview',{planetId})),previewPaths:objects=>{colony?.previewPaths(objects);if(objects.length){overview=true;setAttribute($('view-mode'),'aria-label','Walking view');setHTML($('view-mode'),'↗ <span>Walking view</span>');}},notice});
  flight=new SpaceFlight({canvas:renderer.domElement,renderer,online:()=>online,player:()=>state,checkpoint:body=>serial(()=>request('flight/checkpoint',body)),command:(route,body)=>serial(()=>request<Universe>(route,body)),apply:accept,applyUniverse:u=>colony?.accept(u),flushGround:async()=>{await savePosition(true);await queue;},clearGround:()=>{clearInput();colony?.stopBuilding();},canBoard:()=>!homeTransition&&state.location?.kind!=='interior'&&!!walker&&!!standing?.grounded&&!colony?.building&&distance(walker.up.toArray() as Vec3,portPoint(activePlanet),groundRadius())<BOARD_RADIUS-.12,failed,notice});
  flight.setDesign((state.ship??defaultShip()).design);flight.receive(state.flight);scene.environment=flight.scene.environment;scene.environmentIntensity=groundPresentation(activePlanet,activeRadius).environmentIntensity;
  colony = new Colony({canvas:renderer.domElement,camera,scene,ground:()=>world.globe,
    applyPlayer:accept,
    universe:u=>{homeControls?.receive(u);flight?.universe(u);const p=u.currentPlanet,signature=worldVisualSignature(p);if(p.environment&&terrainSignature!==signature){
      world.dispose();world.parked.dispose();disposeGeometry(worldRoot);worldRoot=new T.Scene();scene.add(worldRoot);world=createWorld(worldRoot,p.kind==='hub',p.environment,p.objects,p.blueprints,p.radius,p.homeManifest?.routes??[]);world.parked.setDesign((state.ship??defaultShip()).design);configureGround();terrainSignature=signature;renderer.domElement.dataset.terrainId=groundField().id;started=false;
    }if(!groundWorld||groundWorld.planetId!==u.currentPlanet.id||groundWorld.revision!==u.currentPlanet.revision)groundWorld=new GroundWorld(u.currentPlanet);},bearing:id=>flight?.mark(id),
    obstacles:blocks=>{if(activePlanet!=='hub')world.blocks.splice(0,world.blocks.length,...blocks);},
    pause:building=>{clearInput();overview=building;setAttribute($('view-mode'), 'aria-label', overview?'Walking view':'View planet');setHTML($('view-mode'), overview?'↗ <span>Walking view</span>':'◉ <span>Planet view</span>');},
    libraryRead:()=>request<import('../shared/blueprints.ts').LibraryEntry[]>('blueprints'),librarySave:body=>serial(()=>request<import('../shared/blueprints.ts').LibraryEntry>('blueprints/save',body)),
    read:()=>request<Universe>('universe'),write:(route,body)=>serial(()=>request<Universe>(route,body)),flush:async()=>{await savePosition(true);await queue;},notice,
  });
  mountOnboarding({read:()=>colony?.universe?{universe:colony.universe,mode:state.flight.mode,building:colony.building,nearDock,online:online&&colony.syncing}:null});
  $('delivery-toggle').onclick=()=>{menu.close();document.body.classList.toggle('delivery-open');setText($('delivery-toggle'), document.body.classList.contains('delivery-open')?'Hide delivery':'Try a delivery');};
}
requestAnimationFrame(animate);
try {
  const initial=await stateLoader.read();state=initial;walker=new SurfaceWalker(state.position);lastSaved.copy(walker.up);accept(initial);
  ensureColony();
  if(initial.home)setText(courierDialog.querySelector('p')!, 'Your home is ready. Choose a suit, enter through its door, then make the room and garden yours.');
  let welcomed=false;try{welcomed=localStorage.getItem(welcomeKey(initial))==='1';}catch{/* Storage can be unavailable in private browsing. */}
  if(initial.revision===0&&!welcomed)courierDialog.showModal();else notice('A familiar little planet. Welcome back.');
} catch(error){failed(error);}
