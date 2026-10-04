import * as T from 'three';
import './style.css';
import { surfacePoint } from './terrain.ts';
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
let overview = false;
const lastSaved = new T.Vector3();
let near: NpcId | null = null;
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
renderer.domElement.setAttribute('aria-label', 'Little Post planet. Use WASD or arrow keys to walk; E to talk.');
const scene = new T.Scene();
const sky = new T.Group();scene.add(sky);
for (let i=0;i<7;i++) {
  const cloud=new T.Group();sky.add(cloud);
  cloud.position.set((i-3)*7,8+(i%3)*1.5,-23-(i%2)*7);
  for(let j=0;j<4;j++){
    const puff=new T.Mesh(new T.IcosahedronGeometry(1.5,1),new T.MeshBasicMaterial({color:i%2?'#deead4':'#c8dfce',transparent:true,opacity:.72,depthWrite:false}));
    puff.position.set((j-1.5)*1.7,Math.sin(j*2)*.35,0);puff.scale.set(1.2,.4,.65);cloud.add(puff);
  }
}
scene.fog = new T.Fog('#9cc8c4', 21, 48);
const camera = new T.PerspectiveCamera(48, innerWidth / innerHeight, .1, 150);
const fill = new T.AmbientLight('#d2e5d4', .95); scene.add(fill);
const sun = new T.DirectionalLight('#fff0cc', 2.15); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=16;sun.shadow.camera.bottom=-16;sun.shadow.camera.far=65;sun.shadow.normalBias=.09;sun.shadow.bias=-.0003;
scene.add(sun);scene.add(sun.target);
const world = createWorld(scene);
const player = courier('clay');scene.add(player.root);
const silhouette = new T.Mesh(new T.CapsuleGeometry(.22, .90, 4, 8), new T.MeshBasicMaterial({color:'#ffdfa0',transparent:true,opacity:.24,depthTest:false,depthWrite:false}));
silhouette.visible=false;silhouette.renderOrder=100;scene.add(silhouette);
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
  if(hit) {target=hit.point.normalize();destinationRing.position.copy(surfacePoint(target,.05));destinationRing.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),target);}
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
$('view-mode').onclick=()=>{ overview=!overview; $('view-mode').setAttribute('aria-label',overview?'Walking view':'View planet'); $('view-mode').innerHTML=overview?'↗ <span>Walking view</span>':'◉ <span>Planet view</span>'; };
$('close-conversation').onclick=()=>{ $('conversation').hidden=true; conversationUntil=0; };
$('wardrobe').onclick=()=>{clearInput();courierDialog.showModal();};
$('help').onclick=()=>{clearInput();helpDialog.showModal();};
document.querySelectorAll<HTMLButtonElement>('dialog .close, .close-help').forEach(b=>b.onclick=()=>b.closest('dialog')?.close());
$('begin').onclick=()=>{courierDialog.close();notice('Follow the lane to Mica’s post office.');};
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
  if(state.quest==='delivered') {speak(near,near==='sol'?'A whole summer in one little packet. Thank you. Stay a while — the flowers are already finding the sun.':'Nothing else to carry today. There’s a lovely path by the pond if you’re taking the long way home.');return;}
  if(near==='sol' && state.quest==='available') {speak('sol','Mica is keeping the sunseeds at the post office. Would you bring them over?');return;}
  if(near==='mica' && state.quest==='carrying') {speak('mica','Sol is just along the lane, at the glasshouse. Take your time; the seeds aren’t in a hurry.');return;}
  const requestedAction = near === 'mica' ? 'pickup' : 'deliver';
  busy=true;action.disabled=true;status('Saving delivery…');
  try {
    const p=walker.up.toArray() as Vec3;
    const next=await serial(async()=> {await request('move',{position:p});return request('interact',{action:requestedAction});});
    lastSaved.fromArray(p);accept(next);
    speak(state.quest==='carrying'?'mica':'sol',state.quest==='carrying'?'Sunseeds, for Sol. A little sunshine for the glasshouse. Keep them close, won’t you?':'You made it! A whole summer in a little packet. Let’s grow something good.');
    player.greet(elapsed);
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
  player.root.position.copy(surfacePoint(walker.up,.018));player.root.quaternion.copy(walker.orientation());player.animate(elapsed,walker.velocity.length(),reduced);
  const pose=cameraPose(walker,innerWidth<600,overview);
  pose.position.addScaledVector(walker.up,world.height(walker.up));
  pose.target.addScaledVector(walker.up,world.height(walker.up));
  const headPoint=surfacePoint(walker.up,1.05);
  const sight=new T.Ray(pose.position.clone(),headPoint.clone().sub(pose.position).normalize());
  const sightLength=pose.position.distanceTo(headPoint);
  silhouette.visible=world.blocks.some(b=>{
    const center=surfacePoint(b.point,b.height*.50),along=center.clone().sub(sight.origin).dot(sight.direction);
    return along>.4&&along<sightLength-.5&&sight.distanceSqToPoint(center)<Math.pow(Math.max(b.radius,b.height*.28),2);
  });
  silhouette.position.copy(surfacePoint(walker.up,.84));silhouette.quaternion.copy(player.root.quaternion);
  poseCamera.position.copy(pose.position);poseCamera.up.copy(walker.up);poseCamera.lookAt(pose.target);
  if(!started){camera.position.copy(pose.position);camera.quaternion.copy(poseCamera.quaternion);started=true;}
  camera.position.lerp(pose.position,reduced?1:1-Math.exp(-7*dt));camera.quaternion.slerp(poseCamera.quaternion,reduced?1:1-Math.exp(-8*dt));
  sun.position.copy(walker.up).multiplyScalar(24).addScaledVector(walker.right(),-12).addScaledVector(walker.north,7);sun.target.position.set(0,0,0);
  const skyRight=walker.right(),skyBack=walker.north.clone().negate();
  sky.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(skyRight,walker.up,skyBack));
  world.animate(elapsed,reduced);
  world.npcs.forEach(n=>{n.avatar.animate(elapsed,0,reduced);if(near===n.id){const local=n.anchor.worldToLocal(player.root.position.clone());const yaw=Math.atan2(local.x,local.z);const diff=Math.atan2(Math.sin(yaw-n.avatar.root.rotation.y),Math.cos(yaw-n.avatar.root.rotation.y));n.avatar.root.rotation.y+=diff*(1-Math.exp(-4*dt));}n.beacon.position.y=2.0+(reduced?0:Math.sin(elapsed*2)*.06);n.beacon.visible=state.quest!=='delivered'&&n.id===(state.quest==='available'?'mica':'sol');});
  renderer.render(scene,camera);
  uiTick+=dt;
  if(uiTick>.1) {
    renderer.domElement.dataset.drawCalls=String(renderer.info.render.calls);
    renderer.domElement.dataset.triangles=String(renderer.info.render.triangles);
    uiTick=0;near=null;
    for(const n of world.npcs){
      const d=distance(walker.up.toArray() as Vec3,NPCS[n.id].position);if(d<INTERACT_DISTANCE-.12)near=n.id;
      const p=n.anchor.position.clone().addScaledVector(n.anchor.position.clone().normalize(),2.12);
      const labelRay=new T.Ray(camera.position.clone(),p.clone().sub(camera.position).normalize());
      const groundHit=labelRay.intersectSphere(new T.Sphere(new T.Vector3(),RADIUS-.10),new T.Vector3());
      const visible=!groundHit||camera.position.distanceTo(groundHit)>camera.position.distanceTo(p);
      p.project(camera);const label=$('npc-'+n.id);
      const active=state.quest!=='delivered'&&n.id===(state.quest==='available'?'mica':'sol');
      const offscreen=Math.abs(p.x)>.84||Math.abs(p.y)>.84;
      label.hidden=!visible||p.z>1||(!active&&offscreen);
      label.classList.toggle('offscreen',offscreen);label.dataset.side=p.x>0?'right':'left';
      label.style.left=`${Math.max(52,Math.min(innerWidth-52,(p.x*.5+.5)*innerWidth))}px`;
      label.style.top=`${Math.max(innerWidth<600?222:100,Math.min(innerHeight-210,(-p.y*.5+.5)*innerHeight))}px`;
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
    if(now>conversationUntil)$('conversation').hidden=true;
  }
}
requestAnimationFrame(animate);
try {
  const initial=await request('state');state=initial;walker=new SurfaceWalker(state.position);lastSaved.copy(walker.up);accept(initial);
  if(initial.revision===0)courierDialog.showModal();else notice('A familiar little planet. Welcome back.');
} catch(error){failed(error);}
