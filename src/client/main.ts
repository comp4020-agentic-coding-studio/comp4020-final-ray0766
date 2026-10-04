import * as T from 'three';
import './style.css';
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
let busy = false, online = false, noticeUntil = 0;
const lastSaved = new T.Vector3();
let near: NpcId | null = null;
let queue: Promise<unknown> = Promise.resolve();
const courierDialog = $<HTMLDialogElement>('courier-dialog');
const helpDialog = $<HTMLDialogElement>('help-dialog');
const action = $<HTMLButtonElement>('interact');
function status(message: string, error = false) { $('save-status').textContent = message; $('save-status').classList.toggle('error', error); }
function notice(message: string, duration = 5000) { $('notice').textContent = message; $('notice').hidden = false; noticeUntil = performance.now() + duration; }
class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
async function request(path: string, body?: unknown): Promise<PlayerState> {
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
  if (!state || next.revision >= state.revision) state = next;
  online = true; status('Progress saved'); renderTask();
}
function failed(error: unknown) {
  online = false; status('Offline · retrying', true);
  notice(error instanceof Error ? error.message : 'Could not save. Reconnecting…');
}
function renderTask() {
  const carrying = state.quest === 'carrying', done = state.quest === 'delivered';
  player.parcel.visible = carrying;
  world.flowers.visible = done;
  if (done) { $('distance').textContent = 'Saved for your next visit'; $('compass').textContent = '✓'; $('compass').style.transform = ''; if (near) action.innerHTML = `Talk to ${NPCS[near].name} <kbd>E</kbd>`; }
  $('mission-title').textContent = done ? 'Something good is growing.' : carrying ? 'A little care, on its way.' : 'A seed of an idea';
  $('mission-detail').textContent = done ? 'Sol has the seeds. One small kindness, delivered. The rest of the world is yours to wander.' : carrying ? 'A packet of sunseeds for Sol. Follow the stones to the glasshouse.' : 'Mica has a parcel for the glasshouse. Follow the stepping stones to the post office.';
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
renderer.setClearColor('#e7ede3', 1);
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
$('world').append(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Little Post planet. Use WASD or arrow keys to walk; E to talk.');
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(43, innerWidth / innerHeight, .1, 150);
const fill = new T.AmbientLight('#fff3d9', 2); scene.add(fill);
const sun = new T.DirectionalLight('#fff1d9', 3.2); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=16;sun.shadow.camera.bottom=-16;sun.shadow.camera.far=65;sun.shadow.normalBias=.04;sun.shadow.bias=-.0002;
scene.add(sun);scene.add(sun.target);
const world = createWorld(scene);
const player = courier('clay');scene.add(player.root);
const destinationRing = new T.Mesh(new T.RingGeometry(.2,.27,24),new T.MeshBasicMaterial({color:'#fff7db',side:T.DoubleSide,transparent:true,opacity:.9}));
destinationRing.visible=false;scene.add(destinationRing);
const poseCamera = new T.PerspectiveCamera();
function resize() { camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight); }
window.addEventListener('resize',resize);resize();
function clearInput() { keys.clear();joy.set(0,0);$('stick').style.transform='';target=null; }
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=> { if(document.hidden) { clearInput(); void savePosition(true); } });
window.addEventListener('keydown',event=> {
  if(courierDialog.open || helpDialog.open || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
  const key=event.key.toLowerCase();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e'].includes(key)) {
    event.preventDefault();keys.add(key);target=null;
    if(key==='e' && !event.repeat) void interact();
  }
});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
const raycaster = new T.Raycaster();
let pointerStart: {x:number;y:number} | null=null;
renderer.domElement.addEventListener('pointerdown',e=> {pointerStart={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointerup',e=> {
  if(!walker || !online || !pointerStart || Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>10) return;
  raycaster.setFromCamera(new T.Vector2(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1),camera);
  const hit=raycaster.intersectObject(world.globe)[0];
  if(hit) {target=hit.point.normalize();destinationRing.position.copy(target).multiplyScalar(RADIUS+.025);destinationRing.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),target);}
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
$('wardrobe').onclick=()=>{clearInput();courierDialog.showModal();};
$('help').onclick=()=>{clearInput();helpDialog.showModal();};
document.querySelectorAll<HTMLButtonElement>('dialog .close, .close-help').forEach(b=>b.onclick=()=>b.closest('dialog')?.close());
$('begin').onclick=()=>{courierDialog.close();notice('Follow the stones. Mica is expecting you.');};
document.querySelectorAll<HTMLButtonElement>('[data-character]').forEach(button=>button.onclick=async()=>{
  if(busy || !state) return;
  busy=true;const old=state.character;player.setColor(button.dataset.character as Character);status('Saving coat…');
  try {accept(await serial(()=>request('character',{character:button.dataset.character})));}
  catch(error){player.setColor(old);failed(error);}finally{busy=false;}
});
let saving=false;
async function savePosition(force=false) {
  if(!walker || !state || saving || !online || (!force && walker.up.distanceTo(lastSaved)<.001)) return;
  saving=true;const p=walker.up.toArray() as Vec3;
  try {const next=await serial(()=>request('move',{position:p}));lastSaved.fromArray(p);accept(next);}
  catch(error) {
    if(error instanceof ApiError && error.status===409) {walker=new SurfaceWalker(state.position);lastSaved.copy(walker.up);clearInput();}
    failed(error);
  }finally{saving=false;}
}
async function interact() {
  if(!near || busy || !online) return;
  if(state.quest==='delivered') {notice(near==='sol'?'“A whole summer in one little packet. Thank you.” — Sol':'“Nothing else to carry today. Enjoy the long way home.” — Mica');return;}
  if(near==='sol' && state.quest==='available') {notice('“Mica is keeping the seeds at the post office.” — Sol');return;}
  if(near==='mica' && state.quest==='carrying') {notice('“Sol is just along the stepping stones, at the glasshouse.” — Mica');return;}
  const requestedAction = near === 'mica' ? 'pickup' : 'deliver';
  busy=true;action.disabled=true;status('Saving delivery…');
  try {
    const p=walker.up.toArray() as Vec3;
    const next=await serial(async()=> {await request('move',{position:p});return request('interact',{action:requestedAction});});
    lastSaved.fromArray(p);accept(next);
    notice(state.quest==='carrying'?'“Sunseeds, for Sol. A little sunshine for the glasshouse.” — Mica':'“You made it. Let’s grow something good.” — Sol',6500);
  }catch(error){failed(error);}finally{busy=false;action.disabled=false;}
}
action.onclick=()=>void interact();
setInterval(()=>void savePosition(),350);
setInterval(async()=>{
  if(online || busy) return;
  try {
    const next=await serial(()=>request('state'));accept(next);
    walker=new SurfaceWalker(next.position);lastSaved.copy(walker.up);clearInput();notice('Back at your last saved spot. Welcome home.');
  }catch{status('Offline · retrying',true);}
},2500);
window.addEventListener('online',()=>notice('Reconnecting to the post office…'));

let previous=performance.now(),elapsed=0,uiTick=0,started=false;
function animate(now:number) {
  requestAnimationFrame(animate);
  const dt=Math.min((now-previous)/1000,.05);previous=now;elapsed+=dt;
  if(!walker) return;
  const paused=courierDialog.open||helpDialog.open||!online||document.hidden;
  let x=joy.x+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  let y=joy.y+Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
  if(target && !paused) {
    const d=target.clone().projectOnPlane(walker.up);
    if(walker.up.angleTo(target)*RADIUS<.2){target=null;}else{d.normalize();x=d.dot(walker.right());y=d.dot(walker.north);}
  }
  const old=walker.up.clone(),north=walker.north.clone(),face=walker.facing.clone();
  if(paused) {walker.velocity.set(0,0,0);} else walker.step(x,y,dt);
  if(world.blocks.some(b=>walker.up.angleTo(b.point)*RADIUS<b.radius+.19)) {
    walker.up.copy(old);walker.north.copy(north);walker.facing.copy(face);walker.velocity.set(0,0,0);target=null;
  }
  destinationRing.visible=!!target;
  player.root.position.copy(walker.up).multiplyScalar(RADIUS+.015);player.root.quaternion.copy(walker.orientation());player.animate(elapsed,walker.velocity.length(),reduced);
  const pose=cameraPose(walker,innerWidth<600);
  poseCamera.position.copy(pose.position);poseCamera.up.copy(walker.up);poseCamera.lookAt(pose.target);
  if(!started){camera.position.copy(pose.position);camera.quaternion.copy(poseCamera.quaternion);started=true;}
  camera.position.lerp(pose.position,reduced?1:1-Math.exp(-7*dt));camera.quaternion.slerp(poseCamera.quaternion,reduced?1:1-Math.exp(-8*dt));
  sun.position.copy(walker.up).multiplyScalar(24).addScaledVector(walker.right(),-12).addScaledVector(walker.north,7);sun.target.position.set(0,0,0);
  world.npcs.forEach(n=>{n.avatar.animate(elapsed,0,reduced);n.beacon.position.y=1.72+(reduced?0:Math.sin(elapsed*2)*.06);n.beacon.visible=state.quest!=='delivered'&&n.id===(state.quest==='available'?'mica':'sol');});
  renderer.render(scene,camera);
  uiTick+=dt;
  if(uiTick>.1) {
    uiTick=0;near=null;
    for(const n of world.npcs){
      const d=distance(walker.up.toArray() as Vec3,NPCS[n.id].position);if(d<INTERACT_DISTANCE-.12)near=n.id;
      const p=n.anchor.position.clone().addScaledVector(n.anchor.position.clone().normalize(),2.05);
      const visible=new T.Vector3(...NPCS[n.id].position).dot(camera.position.clone().sub(p))>0;
      p.project(camera);const label=$('npc-'+n.id);label.hidden=!visible||p.z>1||Math.abs(p.x)>.92||Math.abs(p.y)>.88;
      label.style.left=`${(p.x*.5+.5)*innerWidth}px`;label.style.top=`${(-p.y*.5+.5)*innerHeight}px`;
    }
    action.hidden=!near||paused;
    if(near){action.innerHTML=(state.quest==='available'&&near==='mica'?'Collect the parcel':state.quest==='carrying'&&near==='sol'?'Deliver to Sol':`Talk to ${NPCS[near].name}`)+' <kbd>E</kbd>';$('nearby').textContent=near==='mica'?'A little sunshine, ready to go.':'Something’s waiting to grow.';}
    else $('nearby').textContent='';
    if(state.quest!=='delivered') {
      const destination=new T.Vector3(...NPCS[state.quest==='available'?'mica':'sol'].position);
      const d=walker.up.angleTo(destination)*RADIUS;
      $('distance').textContent=d<INTERACT_DISTANCE?'You’re here · say hello':`${Math.round(d)} little metres away`;
      const tangent=destination.projectOnPlane(walker.up).normalize();
      $('compass').style.transform=`rotate(${Math.atan2(tangent.dot(walker.right()),tangent.dot(walker.north))*180/Math.PI}deg)`;
    }else{$('distance').textContent='Saved for your next visit';$('compass').textContent='✓';$('compass').style.transform='';}
    if(now>noticeUntil)$('notice').hidden=true;
  }
}
requestAnimationFrame(animate);
try {
  const initial=await request('state');state=initial;walker=new SurfaceWalker(state.position);lastSaved.copy(walker.up);accept(initial);
  if(initial.revision===0)courierDialog.showModal();else notice('A familiar little planet. Welcome back.');
} catch(error){failed(error);}
