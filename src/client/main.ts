import * as T from 'three';
import { TerrainWorkshop } from './terrain-workshop.ts';
import { PrivateHistory } from './history.ts';
import type { HistoryPage, HistorySnapshot } from '../shared/history.ts';
import { Shipyard } from './shipyard.ts';
import { defaultShip } from '../shared/ships.ts';
import { PracticalLights } from '../assets/claude-geometry/style/practical.ts';
import { worldMaterials } from './shared-assets.ts';
import { textureFormat } from './resource-policy.ts';
import { GroundWorld, groundPose, FIXED_STEP, MAX_PATH_STEPS } from '../shared/physics/world.ts';
import type { GroundPose, MotionStep } from '../shared/physics/world.ts';
import './style.css';
import './colony.css';
import './flight.css';
import './immersive.css';
import { BOARD_RADIUS, portPoint } from '../shared/ports.ts';
import { GroundPresence } from './presence.ts';
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

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys = new Set<string>();
const joy = new T.Vector2();
let state: PlayerState;
let walker: SurfaceWalker;
let target: T.Vector3 | null = null;
let busy = false, online = false, noticeUntil = 0, conversationUntil = 0;
let overview = false;let cameraPitch=0;
let departure:{time:number;base:T.Vector3;start:T.Vector3;rotation:T.Quaternion}|null=null;
let colony: Colony | undefined;
let flight: SpaceFlight | undefined;
let activePlanet = 'hub';let activeEnvironment:string|null=null,terrainRevision=-1;
let groundWorld:GroundWorld|null=null,standing:GroundPose|null=null,physicsClock=0;
let motionPending:MotionStep[]=[];
const lastSaved = new T.Vector3();
let near: NpcId | null = null;let nearDock=false,guideDock=false;
let queue: Promise<unknown> = Promise.resolve();
const courierDialog = $<HTMLDialogElement>('courier-dialog');
const helpDialog = $<HTMLDialogElement>('help-dialog');
const action = $<HTMLButtonElement>('interact');
function status(message: string, error = false) { $('save-status').textContent = message; $('save-status').classList.toggle('error', error); }
function speak(id: NpcId, message: string) {
  $('speaker').textContent = `${NPCS[id].name} · ${NPCS[id].place}`;
  $('dialogue-text').textContent = message; $('conversation').hidden = false;
  conversationUntil = performance.now() + 7000;
  world.npcs.find(n => n.id === id)?.avatar.greet(elapsed);
}
function notice(message: string, duration = 5000) { $('notice').textContent = message; $('notice').hidden = false; noticeUntil = performance.now() + duration; }
class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
async function request<T = PlayerState>(path: string, body?: unknown): Promise<T> {
  const response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(response.status, result.error ?? 'Please try again.');
  return result;
}
// All mutations share a queue: a delivery can never overtake its last movement.
function serial<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run, run); queue = result.catch(() => {}); return result;
}
function accept(next: PlayerState) {
  const reconnecting = !online;
  const previousGround=state?.ground;
  const previousPlanet=state?.planetId;const previousMode=state?.flight.mode;
  const justLanded=state?.flight.mode==='space'&&next.flight.mode==='ground'&&next.revision>=state.revision;
  if (!state || next.revision >= state.revision) state = next;
  if (state.planetId !== activePlanet||(state.environment??null)!==activeEnvironment) {
    activeEnvironment=state.environment??null;terrainRevision=-1;
    activePlanet = state.planetId; world.dispose();world.parked.dispose(); disposeGeometry(worldRoot); worldRoot = new T.Scene(); scene.add(worldRoot);
    world = createWorld(worldRoot, activePlanet === 'hub',activeEnvironment);renderer.domElement.dataset.terrainId=groundField().id;configureGround(); walker = new SurfaceWalker(state.position);lastSaved.copy(walker.up);clearInput();started=false;near=null;
    $('npc-mica').hidden=true;$('npc-sol').hidden=true;$('conversation').hidden=true;document.body.classList.remove('delivery-open');
  }
  if((reconnecting||justLanded) && walker){cameraPitch=0;walker=new SurfaceWalker(state.position);lastSaved.copy(walker.up);clearInput();started=false;}
  const newGeometry=state.ground?.sceneRevision!==previousGround?.sceneRevision;
  if(state.ground&&(!standing||reconnecting||justLanded||newGeometry||previousPlanet!==state.planetId)){
    standing={position:[...state.position],...state.ground};motionPending=[];physicsClock=0;walker=new SurfaceWalker(state.position);lastSaved.copy(walker.up);started=false;
  }
  if(state.planetId==='hub'){standing=null;groundWorld=null;motionPending=[];physicsClock=0;}
  if(previousPlanet!==state.planetId||previousMode!==state.flight.mode)presence.clear();
  const design=(state.ship??defaultShip()).design;world.parked.setDesign(design);flight?.setDesign(design);renderer.domElement.dataset.shipDesign=world.parked.document;
  flight?.receive(state.flight,reconnecting);
  if(previousMode==='ground'&&state.flight.mode==='space'&&activePlanet==='hub'&&!reduced&&flight){departure={time:0,base:world.parked.root.position.clone(),start:camera.position.clone(),rotation:camera.quaternion.clone()};flight.presentation=true;document.body.classList.add('departing');notice('Departure clearance granted · Sunseed Harbour',4200);}
  online = navigator.onLine; status(online?'Progress saved':'Offline · retrying',!online); renderTask();
}
function failed(error: unknown) {
  online = false; status('Offline · retrying', true);
  notice(error instanceof Error ? error.message : 'Could not save. Reconnecting…');
}
function renderTask() {
  const carrying = state.quest === 'carrying', done = state.quest === 'delivered';
  player.parcel.visible = carrying && activePlanet === 'hub';
  world.flowers.visible = done;
  if (done) { $('distance').textContent = 'Saved for your next visit'; $('compass').textContent = '✓'; $('compass').style.transform = ''; if (near) action.innerHTML = `Talk to ${NPCS[near].name} <kbd>E</kbd>`; }
  $('mission-title').textContent = done ? 'Something good is growing.' : carrying ? 'A little care, on its way.' : 'A seed of an idea';
  $('mission-detail').textContent = done ? 'One small kindness, delivered. Take the long way home.' : carrying ? 'Bring the sunseeds to Sol at the glasshouse.' : 'Find Mica at the post office.';
  $('destination-name').textContent = done ? 'Delivery complete · thank you' : carrying ? 'Sol · Glasshouse' : 'Mica · Post office';
  $('step-pickup').className = state.quest === 'available' ? 'current' : 'done';
  $('step-deliver').className = carrying ? 'current' : done ? 'done' : '';
  $('step-done').className = done ? 'current' : '';
  document.querySelectorAll<HTMLButtonElement>('[data-character]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.character === state.character)));
  player.setColor(state.character);
}
let renderer: T.WebGLRenderer;
try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch {
  $('world').innerHTML = '<div class="fallback">This browser could not start WebGL. Try an up-to-date browser with hardware acceleration. <a href="/readme/">Read about Little Post</a></div>';
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.setClearColor('#9cc8c4', 0);
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.03;
$('world').append(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Little Worlds planet. Use WASD or arrow keys to walk; board your ship to fly between worlds.');
worldMaterials().attachRenderer(renderer,textureFormat());
const scene = new T.Scene();
const practical=new PracticalLights('medium');scene.add(practical.group);
const sky = new T.Group();scene.add(sky);
const stars:number[]=[];for(let i=0;i<260;i++){const p=new T.Vector3(Math.sin(i*21.2),Math.cos(i*14.3),Math.sin(i*9.2)).normalize().multiplyScalar(65);stars.push(...p.toArray());}
const starGeo=new T.BufferGeometry();starGeo.setAttribute('position',new T.Float32BufferAttribute(stars,3));sky.add(new T.Points(starGeo,new T.PointsMaterial({color:'#819dab',size:.085,fog:false})));
scene.fog = new T.Fog('#0f202b', 28, 65);
const camera = new T.PerspectiveCamera(52, innerWidth / innerHeight, .08, 2400);
const fill = new T.AmbientLight('#839aaf', 1.1); scene.add(fill);
const sun = new T.DirectionalLight('#efd4b0', 2.5); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=16;sun.shadow.camera.bottom=-16;sun.shadow.camera.far=65;sun.shadow.normalBias=.09;sun.shadow.bias=-.0003;
scene.add(sun);scene.add(sun.target);
let worldRoot = new T.Scene();scene.add(worldRoot);
let world = createWorld(worldRoot);
function configureGround(){
 const hub=activePlanet==='hub';sky.visible=!hub;scene.fog=hub?new T.FogExp2('#665b60',.0033):new T.Fog('#0f202b',28,65);fill.color.set(hub?'#839bad':'#839aaf');fill.intensity=hub?.48:1.1;sun.color.set(hub?'#e8bd99':'#efd4b0');sun.intensity=hub?2.35:2.5;sun.shadow.camera.left=hub?-45:-16;sun.shadow.camera.right=hub?45:16;sun.shadow.camera.top=hub?45:16;sun.shadow.camera.bottom=hub?-45:-16;sun.shadow.camera.far=hub?180:65;sun.shadow.camera.updateProjectionMatrix();scene.environmentIntensity=hub?.43:.5;
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
function clearInput() { keys.clear();joy.set(0,0);$('stick').style.transform='';target=null; }
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=> { if(document.hidden) { clearInput(); void savePosition(true); } });
window.addEventListener('keydown',event=> {
  if(flight?.active || document.querySelector('dialog[open]') || colony?.paused || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
  const key=event.key.toLowerCase();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e'].includes(key)) {
    event.preventDefault();keys.add(key);target=null;
    if(key==='e' && !event.repeat){if(nearDock)flight?.openLaunch();else void interact();}
  }
});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
const raycaster = new T.Raycaster();
let pointerStart: {x:number;y:number;lastX:number;lastY:number;dragged:boolean} | null=null;
renderer.domElement.addEventListener('pointerdown',e=> {if(!flight?.active&&!document.querySelector('dialog[open]')&&!colony?.paused){pointerStart={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,dragged:false};renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!pointerStart||!walker||flight?.active||document.querySelector('dialog[open]')||colony?.paused)return;
  if(Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>7)pointerStart.dragged=true;
  if(pointerStart.dragged){walker.north.applyAxisAngle(walker.up,-(e.clientX-pointerStart.lastX)*.004).projectOnPlane(walker.up).normalize();cameraPitch=T.MathUtils.clamp(cameraPitch+(e.clientY-pointerStart.lastY)*.003,-.3,.7);target=null;}
  pointerStart.lastX=e.clientX;pointerStart.lastY=e.clientY;
});
renderer.domElement.addEventListener('pointercancel',()=>pointerStart=null);
renderer.domElement.addEventListener('lostpointercapture',()=>pointerStart=null);
renderer.domElement.addEventListener('pointerup',e=> {
  if(flight?.active || document.querySelector('dialog[open]') || colony?.paused || !walker || !online || !pointerStart || pointerStart.dragged || Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>10) return;
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
$('view-mode').onclick=()=>{menu.close();overview=!overview; $('view-mode').setAttribute('aria-label',overview?'Walking view':'View planet'); $('view-mode').innerHTML=overview?'↗ <span>Walking view</span>':'◉ <span>Planet view</span>'; };
$('close-conversation').onclick=()=>{ $('conversation').hidden=true; conversationUntil=0; };
$('wardrobe').onclick=()=>{menu.close();clearInput();courierDialog.showModal();};
$('help').onclick=()=>{menu.close();clearInput();helpDialog.showModal();};
document.querySelectorAll<HTMLButtonElement>('dialog .close, .close-help').forEach(b=>b.onclick=()=>b.closest('dialog')?.close());
$('begin').onclick=()=>{courierDialog.close();notice('Follow the blue-lit street to STARPORT / 01.',6500);};
const menu=$<HTMLDialogElement>('menu-dialog');
$('open-menu').onclick=()=>{clearInput();flight?.clear();menu.showModal();void savePosition(true);};
$('close-menu').onclick=$('resume').onclick=()=>menu.close();
const terrainWorkshop=new TerrainWorkshop({read:()=>request<Universe>('universe'),save:async body=>{await savePosition(true);const next=await serial(()=>request<Universe>('terrain/apply',body));colony?.accept(next);return next;},allowed:()=>!!colony?.universe?.currentPlanet.mine&&online&&state.flight.mode==='ground'});
$('open-terrain').onclick=()=>{menu.close();clearInput();colony?.stopBuilding();void terrainWorkshop.open();};
const history=new PrivateHistory({page:(id,after)=>request<HistoryPage>('history?planetId='+encodeURIComponent(id)+'&after='+after),snapshot:(id,seq)=>request<HistorySnapshot>('history/snapshot?planetId='+encodeURIComponent(id)+(seq===undefined?'':'&sequence='+seq))});
$('open-history').onclick=()=>{if(!colony?.universe?.currentPlanet.mine)return;menu.close();clearInput();void history.open(colony.universe.currentPlanet.id);};
const shipyard=new Shipyard({read:async()=>{const next=await serial(()=>request('state'));accept(next);return next.ship??defaultShip();},save:async body=>{const next=await serial(()=>request('ship/save',body));accept(next);return next.ship??defaultShip();},allowed:()=>!!state&&online&&state.flight.mode==='ground'});
$('open-shipyard').onclick=()=>{menu.close();clearInput();if(state?.flight.mode==='space'){notice('Land before changing your ship.');return;}void shipyard.open();};
$('guide-port').onclick=()=>{guideDock=true;menu.close();notice('Your parked ship is marked. Walk there to board.');};
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();clearInput();flight?.clear();menu.showModal();void savePosition(true);}if(e.key.toLowerCase()==='m'&&!document.querySelector('dialog[open]')){$('open-map').click();}});
document.querySelectorAll<HTMLButtonElement>('[data-character]').forEach(button=>button.onclick=async()=>{
  if(busy || !state) return;
  busy=true;const old=state.character;player.setColor(button.dataset.character as Character);status('Saving coat…');
  try {accept(await serial(()=>request('character',{character:button.dataset.character})));}
  catch(error){player.setColor(old);failed(error);}finally{busy=false;}
});
let saving:Promise<void>|null=null;
async function savePosition(force=false):Promise<void> {
  if(saving){await saving;if(force)return savePosition(true);return;}
  if(!walker||!state||state.flight.mode==='space'||!online)return;
  const privateWorld=activePlanet!=='hub';
  if(privateWorld&&!motionPending.length)return;
  if(!privateWorld&&!force&&walker.up.distanceTo(lastSaved)<.001)return;
  const steps=privateWorld?motionPending.splice(0,MAX_PATH_STEPS):[],p=steps.length?steps.at(-1)!.slice(0,3) as Vec3:walker.up.toArray() as Vec3,planetId=state.planetId;
  const motion=steps.length?{sequence:(state.ground?.sequence??0)+1,steps}:undefined;
  saving=(async()=>{
    try{const next=await serial(()=>request('move',{position:p,planetId,...(motion?{motion}:{})}));lastSaved.fromArray(next.position);accept(next);}
    catch(error){motionPending=[];if(error instanceof ApiError&&error.status===409){walker=new SurfaceWalker(state.position);standing=state.ground?{position:[...state.position],...state.ground}:null;lastSaved.copy(walker.up);clearInput();}failed(error);}
  })().finally(()=>{saving=null;});
  await saving;
  if(force&&motionPending.length&&online)await savePosition(true);
}
async function interact() {
  if(state?.flight.mode==='space' || !near || busy || !online) return;
  if(state.quest==='delivered') {speak(near,near==='sol'?'A whole summer in one little packet. Thank you. Stay a while — the flowers are already finding the sun.':'Nothing else to carry today. There’s a lovely path by the pond if you’re taking the long way home.');return;}
  if(near==='sol' && state.quest==='available') {speak('sol','Mica is keeping the sunseeds at the post office. Would you bring them over?');return;}
  if(near==='mica' && state.quest==='carrying') {speak('mica','Sol is just along the lane, at the glasshouse. Take your time; the seeds aren’t in a hurry.');return;}
  const requestedAction = near === 'mica' ? 'pickup' : 'deliver';
  busy=true;action.disabled=true;status('Saving delivery…');
  try {
    const p=walker.up.toArray() as Vec3;
    const next=await serial(async()=> {await request('move',{position:p,planetId:state.planetId});return request('interact',{action:requestedAction});});
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
  presenceBusy=true;const planetId=activePlanet;
  try{const snapshot=await request<PresenceSnapshot>('presence',{planetId,facing:walker.facing.toArray()});if(activePlanet===planetId&&state.flight.mode==='ground')presence.receive(snapshot);}
  catch{/* Presence is ephemeral; a failed heartbeat must not alter durable saves. */}
  finally{presenceBusy=false;}
},PRESENCE_INTERVAL);
setInterval(async()=>{
  if(online || busy) return;
  try {
    const next=await serial(()=>request('state'));accept(next);
    walker=new SurfaceWalker(next.position);lastSaved.copy(walker.up);clearInput();ensureColony();notice('Back at your last saved spot. Welcome home.');
  }catch{status('Offline · retrying',true);}
},2500);
window.addEventListener('online',()=>notice('Reconnecting to your worlds…'));
window.addEventListener('offline',()=>{online=false;clearInput();flight?.clear();status('Offline · retrying',true);});

let previous=performance.now(),elapsed=0,uiTick=0,started=false;
function animate(now:number) {
  requestAnimationFrame(animate);
  const dt=Math.min((now-previous)/1000,.05);previous=now;elapsed+=dt;
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
  const paused=!!document.querySelector('dialog[open]')||courierDialog.open||helpDialog.open||!!colony?.paused||!online||document.hidden;
  let x=joy.x+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  let y=joy.y+Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
  if(target && !paused) {
    const d=target.clone().projectOnPlane(walker.up);
    if(walker.up.angleTo(target)*RADIUS<.2){target=null;}else{d.normalize();x=d.dot(walker.right());y=d.dot(walker.north);}
  }
  if(activePlanet==='hub'){
    const old=walker.up.clone(),north=walker.north.clone(),face=walker.facing.clone();
    if(paused)walker.velocity.set(0,0,0);else walker.step(x,y,dt,1/surfaceScale(walker.up));
    if(world.blocks.some(b=>walker.up.angleTo(b.point)*RADIUS<b.radius+.19&&walker.up.angleTo(b.point)<=old.angleTo(b.point)+.00001)){
      walker.up.copy(old);walker.north.copy(north);walker.facing.copy(face);walker.velocity.set(0,0,0);target=null;
    }
  }else if(groundWorld&&standing){
    if(paused){walker.velocity.set(0,0,0);physicsClock=0;}else{
      physicsClock=Math.min(.05,physicsClock+dt);
      while(physicsClock>=FIXED_STEP&&motionPending.length<MAX_PATH_STEPS){
        physicsClock-=FIXED_STEP;const before=standing;
        walker.step(x,y,FIXED_STEP,RADIUS/standing.radius);
        const resolved=groundWorld.move(before,walker.up.toArray() as Vec3,FIXED_STEP),normal=new T.Vector3(...resolved.position);
        const correction=new T.Quaternion().setFromUnitVectors(walker.up,normal);
        walker.up.copy(normal);walker.north.applyQuaternion(correction).projectOnPlane(normal).normalize();walker.facing.applyQuaternion(correction).projectOnPlane(normal).normalize();walker.velocity.applyQuaternion(correction).projectOnPlane(normal);
        standing=resolved;
        if(distance(before.position,resolved.position)>.000001||Math.abs(before.radius-resolved.radius)>.000001||before.grounded!==resolved.grounded||before.verticalSpeed!==resolved.verticalSpeed)
          motionPending.push([...resolved.position.map(v=>Number(v.toFixed(7))),Number(FIXED_STEP.toFixed(7))] as MotionStep);
      }
    }
  }
  destinationRing.visible=!!target;
  const feet=activePlanet==='hub'?surfacePoint(walker.up):walker.up.clone().multiplyScalar(standing?.radius??groundPose(walker.up.toArray() as Vec3,groundField()).radius);
  player.root.position.copy(feet).addScaledVector(walker.up,.018);player.root.quaternion.copy(surfaceOrientation(walker.up,walker.facing));player.animate(elapsed,walker.velocity.length()*surfaceScale(walker.up),reduced);
  const fov=activePlanet==='hub'?(innerWidth<600?65:55):(innerWidth<600&&!overview?58:48);if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
  const renderUp=surfaceNormal(walker.up),renderNorth=surfaceTangent(walker.up,walker.north),renderRight=new T.Vector3().crossVectors(renderNorth,renderUp).normalize();
  const hub=activePlanet==='hub',phone=innerWidth<600;
  const pose=hub?{position:surfacePoint(walker.up,overview?65:(phone?2.75:2.35)).addScaledVector(renderNorth,overview?-72:(phone?-6.4:-4.7)).addScaledVector(renderRight,overview?0:.45),target:surfacePoint(walker.up,overview?4:1.48+Math.tan(cameraPitch)*9).addScaledVector(renderNorth,overview?-12:6)}:cameraPose(walker,phone,overview);
  pose.position.addScaledVector(walker.up,world.height(walker.up));
  pose.target.addScaledVector(walker.up,world.height(walker.up));
  if(!hub&&standing){const lift=standing.radius-RADIUS-world.height(walker.up);pose.position.addScaledVector(walker.up,lift);pose.target.addScaledVector(walker.up,lift);}
  const headPoint=feet.clone().addScaledVector(renderUp,1.35);
  player.root.visible=true;
  if(!hub&&!overview&&groundWorld){
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
  if(!hub&&!overview&&groundWorld){const boom=camera.position.clone().sub(headPoint),limit=groundWorld.cameraDistance(headPoint,camera.position);if(limit<boom.length())camera.position.copy(headPoint).addScaledVector(boom.normalize(),Math.max(.02,limit));}
  if(hub){sun.target.position.copy(surfacePoint(walker.up));sun.position.copy(sun.target.position).addScaledVector(renderUp,65).add(new T.Vector3(-55,0,45).projectOnPlane(renderUp));}else{sun.position.copy(walker.up).multiplyScalar(24).addScaledVector(walker.right(),-12).addScaledVector(walker.north,7);sun.target.position.set(0,0,0);}
  const skyRight=walker.right(),skyBack=walker.north.clone().negate();
  sky.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(skyRight,walker.up,skyBack));
  if('setSunDirection' in world)world.setSunDirection(sun.position.clone().sub(sun.target.position).normalize().toArray() as Vec3);
  world.animate(elapsed,reduced,camera.position,renderUp);
  world.npcs.forEach(n=>{n.avatar.animate(elapsed,0,reduced);if(near===n.id){const local=n.anchor.worldToLocal(player.root.position.clone());const yaw=Math.atan2(local.x,local.z);const diff=Math.atan2(Math.sin(yaw-n.avatar.root.rotation.y),Math.cos(yaw-n.avatar.root.rotation.y));n.avatar.root.rotation.y+=diff*(1-Math.exp(-4*dt));}n.beacon.position.y=2.0+(reduced?0:Math.sin(elapsed*2)*.06);n.beacon.visible=state.quest!=='delivered'&&n.id===(state.quest==='available'?'mica':'sol');});
  presence.frame(now,dt,walker.up,reduced);
  practical.update(scene,camera,dt);renderer.render(scene,camera);
  uiTick+=dt;
  if(uiTick>.1) {
    renderer.domElement.dataset.practical=JSON.stringify(practical.stats());renderer.domElement.dataset.textureFormat=worldMaterials().textureFormat;renderer.domElement.dataset.scanFormats=JSON.stringify(worldMaterials().scanStats().map(s=>s.format));
    renderer.domElement.dataset.feetRadius=String(standing?.radius??RADIUS);renderer.domElement.dataset.grounded=String(standing?.grounded??true);renderer.domElement.dataset.groundSupport=groundWorld&&standing?groundWorld.support(standing.position,standing.radius+.01).tag:'terrain';
    renderer.domElement.dataset.cameraHeading=JSON.stringify(walker.north.toArray());renderer.domElement.dataset.cameraPitch=String(cameraPitch);renderer.domElement.dataset.groundScale=String(surfaceScale(walker.up));renderer.domElement.dataset.groundRadius=String(groundRadius());renderer.domElement.dataset.quality=innerWidth<700?'compact':'full';
    renderer.domElement.dataset.drawCalls=String(renderer.info.render.calls);
    renderer.domElement.dataset.triangles=String(renderer.info.render.triangles);
    uiTick=0;near=null;
    const dockPoint=new T.Vector3(...portPoint(activePlanet)),displayDockDistance=surfaceNormal(walker.up).angleTo(surfaceNormal(dockPoint))*groundRadius(),dockDistance=walker.up.angleTo(dockPoint)*RADIUS;nearDock=dockDistance<BOARD_RADIUS-.12;
    $('boarding-prompt').hidden=!nearDock||paused;$('dock-context').textContent=activePlanet==='hub'?'STARPORT / BOARDING GATE':'PARKED SHIP / RETURN BEACON';
    $('dock-guide').hidden=!guideDock||nearDock||paused;const toward=dockPoint.projectOnPlane(walker.up).normalize();$('dock-arrow').style.transform=`rotate(${Math.atan2(toward.dot(walker.right()),toward.dot(walker.north))*180/Math.PI}deg)`;$('dock-guide-text').textContent=`Parked ship · ${Math.round(displayDockDistance)} m`;
    renderer.domElement.dataset.portDistance=String(dockDistance);renderer.domElement.dataset.groundPosition=JSON.stringify(walker.up.toArray());

    for(const n of world.npcs){
      const d=distance(walker.up.toArray() as Vec3,NPCS[n.id].position);if(d<INTERACT_DISTANCE-.12)near=n.id;
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
    if(near){action.innerHTML=(state.quest==='available'&&near==='mica'?'Collect the parcel':state.quest==='carrying'&&near==='sol'?'Deliver to Sol':`Talk to ${NPCS[near].name}`)+' <kbd>E</kbd>';$('nearby').textContent=near==='mica'?'A little sunshine, ready to go.':'Something’s waiting to grow.';}
    else $('nearby').textContent='';
    if(state.quest!=='delivered') {
      const destination=new T.Vector3(...NPCS[state.quest==='available'?'mica':'sol'].position);
      $('distance').textContent=near===(state.quest==='available'?'mica':'sol')?'You’re here · say hello':`${Math.round(surfaceNormal(walker.up).angleTo(surfaceNormal(destination))*groundRadius())} m away`;
      const tangent=destination.projectOnPlane(walker.up).normalize();
      $('compass').style.transform=`rotate(${Math.atan2(tangent.dot(walker.right()),tangent.dot(walker.north))*180/Math.PI}deg)`;
    }else{$('distance').textContent='Saved for your next visit';$('compass').textContent='✓';$('compass').style.transform='';}
    if(now>noticeUntil)$('notice').hidden=true;
    if(now>conversationUntil)$('conversation').hidden=true;
  }
}
function ensureColony() {
  if(colony)return;
  flight=new SpaceFlight({canvas:renderer.domElement,renderer,online:()=>online,player:()=>state,checkpoint:body=>serial(()=>request('flight/checkpoint',body)),command:(route,body)=>serial(()=>request<Universe>(route,body)),apply:accept,applyUniverse:u=>colony?.accept(u),flushGround:async()=>{await savePosition(true);await queue;},clearGround:()=>{clearInput();colony?.stopBuilding();},canBoard:()=>!!walker&&!colony?.building&&distance(walker.up.toArray() as Vec3,portPoint(activePlanet))<BOARD_RADIUS-.12,failed,notice});
  flight.setDesign((state.ship??defaultShip()).design);flight.receive(state.flight);scene.environment=flight.scene.environment;scene.environmentIntensity=activePlanet==='hub'?.43:.5;
  colony = new Colony({canvas:renderer.domElement,camera,scene,ground:()=>world.globe,
    applyPlayer:p=>{accept(p);return state.planetId===p.planetId&&state.revision<=p.revision;},
    universe:u=>{flight?.universe(u);const p=u.currentPlanet;if(p.environment&&terrainRevision!==p.revision){
      world.dispose();world.parked.dispose();disposeGeometry(worldRoot);worldRoot=new T.Scene();scene.add(worldRoot);world=createWorld(worldRoot,false,p.environment,p.objects,p.blueprints);world.parked.setDesign((state.ship??defaultShip()).design);configureGround();terrainRevision=p.revision;renderer.domElement.dataset.terrainId=groundField().id;started=false;
    }if(u.currentPlanet.kind==='garden'&&(!groundWorld||groundWorld.planetId!==u.currentPlanet.id||groundWorld.revision!==u.currentPlanet.revision))groundWorld=new GroundWorld(u.currentPlanet);},bearing:id=>flight?.mark(id),
    obstacles:blocks=>{if(activePlanet!=='hub')world.blocks.splice(0,world.blocks.length,...blocks);},
    pause:building=>{clearInput();overview=building;$('view-mode').setAttribute('aria-label',overview?'Walking view':'View planet');$('view-mode').innerHTML=overview?'↗ <span>Walking view</span>':'◉ <span>Planet view</span>';},
    libraryRead:()=>request<import('../shared/blueprints.ts').LibraryEntry[]>('blueprints'),librarySave:body=>serial(()=>request<import('../shared/blueprints.ts').LibraryEntry>('blueprints/save',body)),
    read:()=>request<Universe>('universe'),write:(route,body)=>serial(()=>request<Universe>(route,body)),flush:async()=>{await savePosition(true);await queue;},notice,
  });
  $('delivery-toggle').onclick=()=>{menu.close();document.body.classList.toggle('delivery-open');$('delivery-toggle').textContent=document.body.classList.contains('delivery-open')?'Hide delivery':'Try a delivery';};
}
requestAnimationFrame(animate);
try {
  const initial=await request('state');state=initial;walker=new SurfaceWalker(state.position);lastSaved.copy(walker.up);accept(initial);
  ensureColony();
  if(initial.revision===0)courierDialog.showModal();else notice('A familiar little planet. Welcome back.');
} catch(error){failed(error);}
