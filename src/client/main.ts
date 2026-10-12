import { homeDoorCenterOffset } from '../shared/home-door.ts';
import { initI18n, setAttribute, setHTML, setText } from './i18n.ts';
import './i18n.css';
import {SPRINT_SPEED,SPEED} from '../shared/world.ts';
import {SPRINT_FLAG,JUMP_FLAG} from '../shared/physics/world.ts';
import * as T from 'three';
import { lazyPanel,openPanel } from './lazy-panel.ts';
import type { HistoryPage, HistorySnapshot } from '../shared/history.ts';
import { defaultShip } from '../shared/ships.ts';
import { configureRenderer, configureGroundLighting, groundPresentation, createWorldPracticalLights, updateGroundFog, fitGroundSunShadowDepth } from './presentation.ts';
import { worldMaterials } from './shared-assets.ts';
import { textureFormat } from './resource-policy.ts';
import { GroundWorld, groundPose, FIXED_STEP, MAX_PATH_STEPS, physicsVersionFor } from '../shared/physics/world.ts';
import type { GroundPose, MotionStep } from '../shared/physics/world.ts';
import {STEP_HEIGHT} from '../shared/physics/body.ts';
import './presentation.css';
import './style.css';
import './colony.css';
import './flight.css';
import './immersive.css';
import { mountOnboarding } from './onboarding.ts';
import { BOARD_RADIUS, portPoint } from '../shared/ports.ts';
import { GroundPresence } from './presence.ts';
import { PresenceVisitGate } from './presence-visit.ts';
import { canAcceptPlayer, isDoorOnlyRevision } from './sync.ts';
import { PRESENCE_INTERVAL } from '../shared/presence.ts';
import type { PresenceSnapshot } from '../shared/presence.ts';
import { SpaceFlight } from './flight.ts';
import { Colony } from './colony.ts';
import { disposeGeometry } from './build-art.ts';
import type { Universe,PlanetView } from '../shared/planets.ts';
import {samplePublicVillage,isSamplePublicRadius} from '../shared/sample-public-village.ts';
import {prewarmTerrainFits} from '../shared/terrain-prewarm.ts';
import {createPublicTownArtAsync} from './public-town-art.ts';
import {terrainModelAsync} from './terrain-model.ts';
import {beginSceneLoading,sceneLoadingActive,yieldSceneFrame} from './loading-state.ts';
import { surfacePoint,surfaceNormal,surfaceTangent,surfaceOrientation,surfaceScale,logicalNormal,groundRadius,groundField } from './terrain.ts';
import { SurfaceWalker, cameraPose } from './motion.ts';
import { GroundCameraRig } from './ground-camera.ts';
import { SimpleFollowCameraRig } from './simple-follow-camera.ts';
import { IndoorFollowRooms } from './indoor-follow-room.ts';
import { legacyOutdoorCameraPose, clipLegacyCameraBoom } from './legacy-ground-camera.ts';
import { TownCameraCutaway } from './camera-cutaway.ts';
import type { CameraCutawayDiagnostics } from './camera-cutaway.ts';
import type { CameraFrameCertificate } from './camera-frame-collision.ts';
import type { CameraExactAvatarMesh } from './camera-exact-residual.ts';
import { registerCameraExactAvatarShadowGeometry } from './camera-exact-avatar-shadow.ts';
import type { CameraCutawayPoint } from './camera-cutaway-plan.ts';
import { CameraShipCollision } from './camera-ship-collision.ts';
import { AvatarOcclusion } from './avatar-occlusion.ts';
import { createWorld, courier } from './scene.ts';
import { distance, INTERACT_DISTANCE, NPCS, RADIUS, SPAWN } from '../shared/world.ts';
import type { Character, NpcId, PlayerState, Vec3 } from '../shared/world.ts';
import { HomeInterior } from './home-interior.ts';
import { HomeControls } from './home-controls.ts';
import { createHomeDoor, placeHomeDoor } from './home-door.ts';
import { createStateLoader } from './state-loader.ts';
import { worldVisualSignature } from './world-visual-signature.ts';
import { PhotoMode } from './photo-mode.ts';
import {TownResidents} from './town-residents.ts';
import {residentDialogue} from '../shared/town-residents.ts';
import type {TownResidentDefinition} from '../shared/town-residents.ts';
import {createVillageDrawing} from './village-drawing.ts';
import {arrivalViewScore} from './arrival-camera.ts';
import { HomeSetup } from './home-setup.ts';
import { TeleportStations } from './teleport-station.ts';
import type {PhotoView} from './photo-mode.ts';

initI18n();

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys = new Set<string>();let jumpQueued=false;
const joy = new T.Vector2();
let state: PlayerState;
let walker: SurfaceWalker;
let target: T.Vector3 | null = null;
let busy = false, online = false, noticeUntil = 0, conversationUntil = 0;
let overview = false;let cameraPitch=0;let doorstepCameraPending=false;
// Isolated local A/B build switch; no saved setting or world-data change.
// The follow camera permits occlusion; preview flags cannot enable visual masks.
const cameraCutawayB:boolean=false;
const cameraLocalExceptionB=cameraCutawayB&&import.meta.env.VITE_CAMERA_LOCAL_EXCEPTION==='1';
const createGroundCamera=()=>new SimpleFollowCameraRig();
const indoorFollowRooms=new IndoorFollowRooms();
const groundCamera=createGroundCamera();let cameraWasOverview=false;
let activeTownCutaway:TownCameraCutaway|undefined,unregisteredHubCutaway:TownCameraCutaway|undefined;
let groundCameraConflict:{worldGeneration:number;planet:string;startedAt:number}|null=null;
const cameraConflictTotals={triggerCount:0,completedFrozenMs:0,rolledBackDistanceMetres:0};
function endGroundCameraConflict(){if(groundCameraConflict)cameraConflictTotals.completedFrozenMs+=performance.now()-groundCameraConflict.startedAt;groundCameraConflict=null;}
function rebaseGroundCamera(){endGroundCameraConflict();groundCamera.reset();activeTownCutaway?.reset();started=false;}
const measureCamera=new URLSearchParams(location.search).get('measure')==='1';let cameraFrameSequence=0;
let departure:{time:number;base:T.Vector3;start:T.Vector3;rotation:T.Quaternion}|null=null;
let colony: Colony | undefined;
let flight: SpaceFlight | undefined;
let homeInterior: HomeInterior | undefined;
let homeTransition=false;
let photoMode:PhotoMode|undefined=undefined;let photoPaused=false;
let homeControls: HomeControls | undefined;
let homeSetup:HomeSetup|undefined;
let teleportStations:TeleportStations|undefined;
let activeRadius=14;let activePlanet = 'hub';let activeEnvironment:string|null=null;
let worldPending=false,worldGeneration=0,requestedWorldKey='',renderedWorldKey='',renderedSurfaceKey='';
let worldAbort:AbortController|null=null,worldFeedback:ReturnType<typeof beginSceneLoading>|null=null,pendingPlanet:PlanetView|null=null;
let placedObstacles:import('./scene.ts').Obstacle[]=[];
let groundWorld:GroundWorld|null=null,standing:GroundPose|null=null,physicsClock=0;
let motionPending:MotionStep[]=[];
let motionEpoch=0,physicsMismatch=false;
function clearGroundMotion(){motionPending=[];physicsClock=0;motionEpoch++;}
const lastSaved = new T.Vector3();
let near: NpcId | null = null;let nearDock=false,guideDock=false;
let residents:TownResidents|null=null,nearResident:TownResidentDefinition|null=null,speakingResident:TownResidentDefinition|null=null;
let residentConversationKey='';
let queue: Promise<unknown> = Promise.resolve();
const courierDialog = $<HTMLDialogElement>('courier-dialog');
const helpDialog = $<HTMLDialogElement>('help-dialog');
const action = $<HTMLButtonElement>('interact');
function status(message: string, error = false) { setText($('save-status'), message); $('save-status').classList.toggle('error', error); }
function canTalkToTaskResident(id:NpcId){
  const npc=world.npcs.find(n=>n.id===id);
  if(!npc||!walker||!standing?.grounded||activePlanet!=='hub'||state.location?.kind==='interior')return false;
  if(distance(walker.up.toArray() as Vec3,NPCS[id].position,groundRadius())>=INTERACT_DISTANCE-.12||Math.abs(standing.radius-npc.anchor.position.length())>.65)return false;
  const head=walker.up.clone().multiplyScalar(standing.radius+1.35),eyes=npc.anchor.position.clone().addScaledVector(npc.anchor.position.clone().normalize(),1.3);
  return !groundWorld||groundWorld.cameraDistance(head,eyes)+.03>=head.distanceTo(eyes);
}
function speak(id: NpcId, message: string) {
  closeResidentConversation();
  setText($('speaker'), `${NPCS[id].name} · ${NPCS[id].place}`);
  setText($('dialogue-text'), message); $('conversation').hidden = false;
  conversationUntil = performance.now() + 7000;
  world.npcs.find(n => n.id === id)?.avatar.greet(elapsed);
}
function closeResidentConversation(){
  if(speakingResident){$('conversation').hidden=true;conversationUntil=0;}
  speakingResident=null;residentConversationKey='';delete $('conversation').dataset.resident;
}
function renderResidentConversation(){
  if(!speakingResident)return;
  const language=document.documentElement.lang.startsWith('zh')?'zh':'en';
  const key=`${speakingResident.id}|${state.quest}|${language}`;if(key===residentConversationKey)return;residentConversationKey=key;
  setText($('speaker'),`${speakingResident.name[language]} · ${speakingResident.role[language]} · ${language==='zh'?'小镇居民':'Village resident'}`,true);
  setText($('dialogue-text'),residentDialogue(speakingResident.id,state.quest,language),true);
}
function talkToResident(){
  if(!standing?.grounded)return;
  // A menu can close and E can arrive before the next render frame. Refresh
  // the live interaction state without advancing any resident or player.
  residents?.update({dt:0,time:elapsed,viewer:walker.up.toArray() as Vec3,camera,reducedMotion:reduced,enabled:true});
  const found=residents?.nearest(walker.up.toArray() as Vec3,standing?.radius);
  if(!found||near||nearDock||homeControls?.canEnter)return;
  if(speakingResident?.id===found.id&&!$('conversation').hidden)return;
  clearInput();speakingResident=found;renderResidentConversation();$('conversation').dataset.resident=found.id;
  $('conversation').hidden=false;conversationUntil=Infinity;residents?.greet(found.id,elapsed);
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
const presenceVisit=new PresenceVisitGate();
function changeVisit(route:string,body:unknown):Promise<Universe> {
  // Home entry/exit and flight takeoff/landing all change presence scope. Keep
  // heartbeats fenced until the acknowledged visit is applied locally too.
  return presenceVisit.transition(()=>serial(async()=>{
    const next=await request<Universe>(route,body);colony?.accept(next);return next;
  }));
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
  if(previousPlanet!==next.planetId||previousMode!==next.flight.mode||locationChanged)closeResidentConversation();
  const justLanded=state?.flight.mode==='space'&&next.flight.mode==='ground'&&next.revision>=state.revision;
  if (!state || next.revision >= state.revision) state = next;
  if (state.planetId !== activePlanet||(state.environment??null)!==activeEnvironment||(state.worldRadius??10)!==activeRadius) {
    activeRadius=state.worldRadius??10;activeEnvironment=state.environment??null;
    activePlanet = state.planetId;worldPending=true;worldGeneration++;worldAbort?.abort();requestedWorldKey='';
    worldFeedback?.finish();worldFeedback=beginSceneLoading('Preparing your world…');
    walker = new SurfaceWalker(state.position);lastSaved.copy(walker.up);clearInput();started=false;near=null;
    $('npc-mica').hidden=true;$('npc-sol').hidden=true;$('conversation').hidden=true;document.body.classList.remove('delivery-open');
  }
  if((reconnecting||justLanded||locationChanged) && walker){cameraPitch=0;walker=new SurfaceWalker(state.position);lastSaved.copy(walker.up);clearInput();clearGroundMotion();rebaseGroundCamera();}
  const newGeometry=state.ground?.sceneRevision!==previousGround?.sceneRevision||state.ground?.physicsVersion!==previousGround?.physicsVersion;
  const priorPlanet=colony?.universe?.currentPlanet;
  if(!worldPending&&doorOnlyRevision&&state.ground&&state.home&&priorPlanet?.id===state.planetId&&priorPlanet.homeDoor){
    groundWorld=new GroundWorld({...priorPlanet,revision:state.ground.sceneRevision,homeDoor:{...priorPlanet.homeDoor,open:state.home.interior.doorOpen,version:state.home.interior.doorVersion}});
  }
  if(state.ground&&(!standing||reconnecting||justLanded||locationChanged||newGeometry||previousPlanet!==state.planetId)){
    standing={position:[...state.position],...state.ground};clearGroundMotion();
    if(doorOnlyRevision&&walker&&!reconnecting&&!locationChanged){
      const normal=new T.Vector3(...state.position),correction=new T.Quaternion().setFromUnitVectors(walker.up,normal);
      walker.up.copy(normal);walker.north.applyQuaternion(correction).projectOnPlane(normal).normalize();walker.facing.applyQuaternion(correction).projectOnPlane(normal).normalize();walker.velocity.applyQuaternion(correction).projectOnPlane(normal);
    }else{walker=new SurfaceWalker(state.position);clearInput();rebaseGroundCamera();}
    lastSaved.copy(walker.up);
  }
  if(reconnecting&&state.flight.mode==='ground'&&state.location?.kind!=='interior'&&state.home?.door.frame
    &&distance(state.position,state.home.door.position,activeRadius)<3){
    // Choose an entrance view once the actual surrounding collision scene loads.
    walker.north.set(0,0,-1).applyQuaternion(new T.Quaternion().fromArray(state.home.door.frame.quaternion))
      .projectOnPlane(walker.up).normalize();
    walker.facing.copy(walker.north);doorstepCameraPending=true;started=false;
  }
  if((reconnecting||justLanded)&&state.flight.mode==='ground'&&activePlanet==='hub'
    &&distance(state.position,portPoint('hub'),activeRadius)<BOARD_RADIUS+.4){
    // Arrive looking down the real harbour approach toward the village.
    walker.north.set(...SPAWN).projectOnPlane(walker.up).normalize();
    walker.facing.copy(walker.north);started=false;
  }
  if(previousPlanet!==state.planetId||previousMode!==state.flight.mode||locationChanged)presence.clear();
  if(state.location?.kind==='interior')document.querySelectorAll<HTMLDialogElement>('dialog[open]:not(.scene-loading-overlay)').forEach(dialog=>dialog.close());
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
  setPlayerColor(state.character);
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
worldMaterials().attachRenderer(renderer,textureFormat());
const scene = new T.Scene();
const exteriorHomeDoor=createHomeDoor();scene.add(exteriorHomeDoor.root);exteriorHomeDoor.root.visible=false;
const practical=createWorldPracticalLights();scene.add(practical.group);
const camera = new T.PerspectiveCamera(52, innerWidth / innerHeight, .08, 2400);
const drawing=createVillageDrawing(renderer,scene,camera,true);
const fill = new T.AmbientLight(); scene.add(fill);
const sun = new T.DirectionalLight(); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.normalBias=.09;sun.shadow.bias=-.0003;
scene.add(sun);scene.add(sun.target);
let worldRoot = new T.Scene();scene.add(worldRoot);
// A lightweight empty surface owns the initial handles. The real PlanetView
// always enters preparation; do not synchronously build the whole public town
// before the first loading feedback can paint.
let world = createWorld(worldRoot,false,null,[],{},14);
function configureGround(){
 configureGroundLighting(activePlanet,scene,fill,sun,activeRadius);
}
function prepareSurface(planet:PlanetView){
  pendingPlanet=planet;
  // Public terrain consumes the fixed template; generated private terrain
  // follows every saved construction edit, excluding door-only changes.
  const key=worldVisualSignature(planet),surfaceKey=planet.kind==='hub'||!planet.environment?JSON.stringify([planet.id,planet.radius??10,planet.environment??null]):key;
  if(!worldPending&&key===renderedWorldKey){
    if(!groundWorld||groundWorld.planetId!==planet.id||groundWorld.revision!==planet.revision)groundWorld=new GroundWorld(planet);
    return;
  }
  if(key===requestedWorldKey&&worldAbort&&!worldAbort.signal.aborted)return;
  worldGeneration++;const generation=worldGeneration;worldAbort?.abort();const controller=worldAbort=new AbortController(),signal=controller.signal;
  requestedWorldKey=key;worldPending=true;clearInput();clearGroundMotion();
  worldFeedback?.finish();const feedback=worldFeedback=beginSceneLoading('Preparing your world…');
  const current=()=>generation===worldGeneration&&!signal.aborted;
  void(async()=>{
    let staged:ReturnType<typeof createWorld>|null=null,stagedResidents:TownResidents|null=null,town:Awaited<ReturnType<typeof createPublicTownArtAsync>>|undefined,placed:Awaited<ReturnType<Colony['prepareObjects']>>|undefined,terrain:Awaited<ReturnType<typeof terrainModelAsync>>|undefined;
    const nextRoot=new T.Scene();let committed=false;let stagedCutaway:TownCameraCutaway|undefined;
    try{
      await yieldSceneFrame(signal);await yieldSceneFrame(signal);
      const radius=planet.radius??10,village=planet.kind==='hub'&&isSamplePublicRadius(radius)?samplePublicVillage(radius):null,rebuildSurface=surfaceKey!==renderedSurfaceKey;
      if(village&&rebuildSurface){
        town=await createPublicTownArtAsync(village,radius,{cameraCutaway:cameraCutawayB}, {signal,budgetMs:6,yieldFrame:()=>yieldSceneFrame(signal),
          onGroundProgress:(done,total)=>feedback.update('Preparing the ground…',done,total),
          onProgress:p=>feedback.update('Bringing buildings into view…',p.readyObjects,p.totalObjects)});
      }
      await prewarmTerrainFits({environment:village?.environment??planet.environment,radius,objects:planet.objects,blueprints:planet.blueprints},
        {signal,yieldFrame:()=>yieldSceneFrame(signal),onProgress:(done,total)=>feedback.update('Preparing the ground…',done,total)});
      if(!current())throw new DOMException('Loading cancelled.','AbortError');
      placed=await colony!.prepareObjects(planet,{signal,budgetMs:6,yieldFrame:()=>yieldSceneFrame(signal),onProgress:(done,total)=>feedback.update('Bringing buildings into view…',done,total)});
      await yieldSceneFrame(signal);
      if(rebuildSurface){
        const terrainEnvironment=village?.environment??planet.environment;
        if(terrainEnvironment)terrain=await terrainModelAsync(terrainEnvironment,village?.objects??planet.objects,village?.blueprints??planet.blueprints,'medium',true,radius,village?.routes??planet.homeManifest?.routes??[],
          {signal,budgetMs:6,yieldFrame:()=>yieldSceneFrame(signal),onProgress:(done,total)=>feedback.update('Preparing the ground…',done,total)});
        await yieldSceneFrame(signal);
        staged=createWorld(nextRoot,planet.kind==='hub',planet.environment,planet.objects,planet.blueprints,radius,planet.homeManifest?.routes??[],town,terrain);
        stagedCutaway=town?.cutaway;town=undefined;terrain=undefined;staged.parked.setDesign((state.ship??defaultShip()).design);
      }
      nextRoot.add(placed.root);
      feedback.update('Finishing the view…');await yieldSceneFrame(signal);
      const physics=new GroundWorld(pendingPlanet!);
      if(staged&&village){
        for(const anchor of [...staged.npcs.map(n=>n.anchor),staged.dock]){
          const point=anchor.position.clone().normalize().toArray() as Vec3;
          anchor.position.setLength(physics.support(point,physics.radius(point)+STEP_HEIGHT).radius);
        }
      }
      if(staged&&village)stagedResidents=new TownResidents(nextRoot,physics);
      await yieldSceneFrame(signal);
      await renderer.compileAsync(nextRoot,camera,scene);
      if(!current())throw new DOMException('Loading cancelled.','AbortError');
      await yieldSceneFrame(signal);
      if(!current())throw new DOMException('Loading cancelled.','AbortError');
      // Commit complete geometry and collision together. The previous scene
      // and last displayed frame survive until this point, including failures.
      if(staged){
        closeResidentConversation();nearResident=null;residents?.dispose();residents=stagedResidents;stagedResidents=null;
        activeTownCutaway?.reset();unregisteredHubCutaway?.dispose();unregisteredHubCutaway=undefined;activeTownCutaway=stagedCutaway;
        // Legacy hub geometry has no eligible part registry. It still uses
        // the same physical certificate, with no building exemptions.
        if(cameraLocalExceptionB&&planet.kind==='hub'&&!activeTownCutaway)activeTownCutaway=unregisteredHubCutaway=new TownCameraCutaway([],[],planet.id);
        world.dispose();world.parked.dispose();disposeGeometry(worldRoot);
        worldRoot=nextRoot;scene.add(worldRoot);world=staged;staged=null;
      }
      placed.commit();placed=undefined;groundWorld=physics;
      if(planet.kind!=='hub')activeTownCutaway=colony!.cutaway;
      if(planet.kind!=='hub')world.blocks.splice(0,world.blocks.length,...placedObstacles);
      configureGround();renderedWorldKey=key;renderedSurfaceKey=surfaceKey;requestedWorldKey='';
      renderer.domElement.dataset.terrainId=groundField().id;renderer.domElement.dataset.shipDesign=world.parked.document;
      renderTask();started=false;committed=true;worldPending=false;
      // Render the first complete view under feedback, including its drawing
      // targets/shadow programs, before accepting new movement or actions.
      await yieldSceneFrame(signal);await yieldSceneFrame(signal);feedback.finish();
    }catch(error){
      if(!committed){stagedResidents?.dispose();placed?.dispose();staged?.dispose();staged?.parked.dispose();terrain?.dispose();disposeGeometry(nextRoot);town?.dispose();}
      if(!current()){feedback.finish();return;}
      // Keep controls blocked and expose retry; never substitute incomplete
      // geometry or persist a guessed player position after a failed load.
      requestedWorldKey=key;
      feedback.fail('Could not finish loading. Your saved world is unchanged.',()=>{if(pendingPlanet){requestedWorldKey='';prepareSurface(pendingPlanet);}});
      console.error('World preparation failed',error);
    }
  })();
}
configureGround();
const player = courier('clay');scene.add(player.root);
// The same head/coat/shoulder/satchel/parcel set as the independent upper-body
// framing contract. Bounds follow the actual current animation, including yaw.
const cameraUpperMeshes:T.Mesh[]=[];
player.head.traverse(object=>{if(object instanceof T.Mesh)cameraUpperMeshes.push(object);});
for(const child of player.head.parent!.children){
  if(child===player.head)continue;
  if(child instanceof T.Mesh)child.traverse(object=>{if(object instanceof T.Mesh)cameraUpperMeshes.push(object);});
  else for(const shoulder of child.children)if(shoulder instanceof T.Mesh)cameraUpperMeshes.push(shoulder);
}
const cameraUpperGeometry=cameraUpperMeshes.map(mesh=>{
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  const bounds=mesh.geometry.boundingBox!.clone(),corners:T.Vector3[]=[];
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new T.Vector3(x,y,z));
  return{bounds,corners};
});
// The courier factory's cel and mottle hooks only change shading/varyings.
// Record their identities at creation and at the trusted coat-colour setter;
// an unrelated shader or deformation cannot silently acquire exact proof.
const cameraAvatarMaterials=new WeakMap<T.Material,{compile:T.Material['onBeforeCompile'];beforeRender:T.Material['onBeforeRender']}>();
const cameraAvatarGeometry=cameraUpperMeshes.map(mesh=>mesh.geometry);
// Only the original factory courier geometry is registered at creation. The
// helper retains immutable raw vertices and checks current attribute stamps.
const cameraAvatarGeometryEvidence=cameraAvatarGeometry.map(registerCameraExactAvatarShadowGeometry);
function registerCameraAvatarMaterials(){
  for(const mesh of cameraUpperMeshes)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    cameraAvatarMaterials.set(material,{compile:material.onBeforeCompile,beforeRender:material.onBeforeRender});
  }
}
registerCameraAvatarMaterials();
function setPlayerColor(character:Character){player.setColor(character);registerCameraAvatarMaterials();}
function cameraAvatarFrame(){
  player.root.updateWorldMatrix(true,true);
  const bounds:{label:string;corners:CameraCutawayPoint[]}[]=[],meshes:{label:string;geometryId:string;visible:boolean;localBounds:{min:number[];max:number[]};matrixWorld:number[];geometryEvidence:{geometryId:string;vertexCount:number;positionVersion:number;currentPositionVersion:number;positionFingerprint:string}}[]=[];
  const exactMeshes:CameraExactAvatarMesh[]=[];let exactGeometryReady=true;
  for(const [index,mesh]of cameraUpperMeshes.entries()){
    let visible=true;for(let object:T.Object3D|null=mesh;object;object=object.parent)visible=visible&&object.visible;
    const label=`upper-mesh-${index}`,geometry=cameraUpperGeometry[index],position=mesh.geometry.getAttribute('position');
    const currentPositionVersion=position instanceof T.InterleavedBufferAttribute?position.data.version:position.version;
    const geometryId=`${mesh.geometry.uuid}:${currentPositionVersion}`,creation=cameraAvatarGeometryEvidence[index];
    if(visible){
      bounds.push({label,corners:geometry.corners.map(point=>point.clone().applyMatrix4(mesh.matrixWorld).toArray() as CameraCutawayPoint)});
      const material=Array.isArray(mesh.material)?null:mesh.material,known=material?cameraAvatarMaterials.get(material):undefined;
      if(mesh.geometry!==cameraAvatarGeometry[index]||currentPositionVersion!==creation.positionVersion||(mesh as T.SkinnedMesh).isSkinnedMesh||(mesh as T.InstancedMesh).isInstancedMesh
        ||Object.keys(mesh.geometry.morphAttributes).length||mesh.onBeforeRender!==T.Object3D.prototype.onBeforeRender
        ||!material||!(material instanceof T.MeshStandardMaterial)||material.displacementMap
        ||!known||material.onBeforeCompile!==known.compile||material.onBeforeRender!==known.beforeRender)exactGeometryReady=false;
      exactMeshes.push({label,geometryId,geometry:mesh.geometry,matrixWorld:mesh.matrixWorld.clone()});
    }
    if(measureCamera)meshes.push({label,geometryId,visible,localBounds:{min:geometry.bounds.min.toArray(),max:geometry.bounds.max.toArray()},matrixWorld:mesh.matrixWorld.toArray(),geometryEvidence:{geometryId,vertexCount:creation.vertexCount,positionVersion:creation.positionVersion,currentPositionVersion,positionFingerprint:creation.positionFingerprint}});
  }
  return{bounds,meshes,exactMeshes:exactGeometryReady?exactMeshes:undefined,opticalTargetPoints:bounds.flatMap(bound=>bound.corners)};
}
type CameraRenderFrame=ReturnType<TownCameraCutaway['captureFrameRenderEvidence']>['frame']&{assetsRevision:number};
const avatarOcclusion=new AvatarOcclusion(player.root);
const presence=new GroundPresence(scene,renderer.domElement);
const silhouette = new T.Mesh(new T.CapsuleGeometry(.22, .90, 4, 8), new T.MeshBasicMaterial({color:'#ffdfa0',transparent:true,opacity:.24,depthTest:false,depthWrite:false}));
silhouette.visible=false;silhouette.renderOrder=100;scene.add(silhouette);
const destinationRing = new T.Mesh(new T.RingGeometry(.2,.27,24),new T.MeshBasicMaterial({color:'#fff7db',side:T.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));
destinationRing.visible=false;scene.add(destinationRing);
const poseCamera = new T.PerspectiveCamera();
function resize() { if(photoMode?.capturing)return;renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.35:1.8));const shadowSize=innerWidth<700?1024:2048;if(sun.shadow.mapSize.x!==shadowSize){sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.map?.dispose();sun.shadow.map=null;}camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);drawing.resize(); }
window.addEventListener('resize',resize);resize();
function clearInput() { jumpQueued=false;keys.clear();joy.set(0,0);$('stick').style.transform='';target=null;pointerStart=null; }
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=> { if(document.hidden) { clearInput(); void savePosition(true); } });
window.addEventListener('keydown',event=> {
  if(homeInterior?.active||homeTransition||photoPaused)return;
  if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||flight?.active||document.querySelector('dialog[open]')||colony?.paused||(event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')))return;
  const key=event.key.toLowerCase();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','shift',' '].includes(key)) {
    event.preventDefault();if(key===' '&&event.repeat)return;if(key===' '&&!keys.has(key))jumpQueued=true;keys.add(key);target=null;
    if(key==='e' && !event.repeat){if(homeControls?.canEnter)void homeControls.enter();else if(nearDock)flight?.openLaunch();else if(teleportStations?.canUse){clearInput();void teleportStations.use();}else void interact();}
  }
});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
const raycaster = new T.Raycaster();
const cameraShipBounds=new T.Box3(),cameraShipCollision=new CameraShipCollision();
function probeGroundCamera(start:T.Vector3,end:T.Vector3,radius:number){
  // Raw diagnostics always retain every ordinary world and craft collision.
  return Math.min(groundWorld?.cameraDistance(start,end,radius)??start.distanceTo(end),probeParkedCamera(start,end,radius));
}
function probeParkedCamera(start:T.Vector3,end:T.Vector3,radius:number){
  const delta=end.clone().sub(start),length=delta.length();
  if(length<1e-8)return 0;
  let limit=length;
  // All five offset rays lie inside this padded segment box. Distant camera
  // candidates cannot touch the parked craft and need no mesh traversal.
  if(!cameraShipBounds.intersectsBox(new T.Box3().setFromPoints([start,end]).expandByScalar(radius)))return limit;
  const direction=delta.divideScalar(length),right=new T.Vector3().crossVectors(direction,start.clone().normalize());
  if(right.lengthSq()<1e-8)right.copy(walker.right());else right.normalize();
  const vertical=new T.Vector3().crossVectors(right,direction).normalize();
  raycaster.far=length;
  for(const [x,y] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
    raycaster.set(start.clone().addScaledVector(right,x*radius).addScaledVector(vertical,y*radius),direction);
    const hit=raycaster.intersectObject(world.parked.root,true).find(h=>h.object instanceof T.Mesh);
    if(hit)limit=Math.min(limit,Math.max(0,hit.distance-radius));
  }
  raycaster.far=Infinity;
  return limit;
}
let pointerStart: {x:number;y:number;lastX:number;lastY:number;dragged:boolean} | null=null;
renderer.domElement.addEventListener('pointerdown',e=> {if(!homeInterior?.active&&!homeTransition&&!photoPaused&&!flight?.active&&!document.querySelector('dialog[open]')&&!colony?.paused){pointerStart={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,dragged:false};renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointermove',e=>{
  if(homeInterior?.active||homeTransition||photoPaused||!pointerStart||!walker||flight?.active||document.querySelector('dialog[open]')||colony?.paused)return;
  if(Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>7)pointerStart.dragged=true;
  if(pointerStart.dragged){walker.turnView(-(e.clientX-pointerStart.lastX)*.004);cameraPitch=T.MathUtils.clamp(cameraPitch+(e.clientY-pointerStart.lastY)*.003,-.3,.7);target=null;}
  pointerStart.lastX=e.clientX;pointerStart.lastY=e.clientY;
});
renderer.domElement.addEventListener('pointercancel',()=>pointerStart=null);
renderer.domElement.addEventListener('lostpointercapture',()=>pointerStart=null);
renderer.domElement.addEventListener('pointerup',e=> {
  const released=pointerStart;pointerStart=null;
  if(homeInterior?.active || homeTransition || photoPaused || flight?.active || document.querySelector('dialog[open]') || colony?.paused || !walker || !online || !released || released.dragged || Math.hypot(e.clientX-released.x,e.clientY-released.y)>10) return;
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
$('close-conversation').onclick=()=>{closeResidentConversation();$('conversation').hidden=true;conversationUntil=0;};
$('wardrobe').onclick=()=>{menu.close();clearInput();courierDialog.showModal();};
$('help').onclick=()=>{menu.close();clearInput();helpDialog.showModal();};
document.querySelectorAll<HTMLButtonElement>('dialog .close, .close-help').forEach(b=>b.onclick=()=>b.closest('dialog')?.close());
const welcomeKey=(player:PlayerState)=>`little-worlds:welcomed:${player.home?.interiorId??'harbour'}`;
$('begin').onclick=()=>{try{localStorage.setItem(welcomeKey(state),'1');}catch{/* A blocked preference store must not prevent starting. */}courierDialog.close();notice(state.home?'Walk to your home’s door, then choose Enter home.':'Follow the short path to SUNSEED · PORT.',6500);};
const menu=$<HTMLDialogElement>('menu-dialog');
$('open-menu').onclick=()=>{if(homeInterior?.active||homeTransition)return;closeResidentConversation();clearInput();flight?.clear();menu.showModal();void savePosition(true);};
$('close-menu').onclick=$('resume').onclick=()=>menu.close();
const terrainWorkshop=lazyPanel(async()=>{const {TerrainWorkshop}=await import('./terrain-workshop.ts');return new TerrainWorkshop({read:()=>request<Universe>('universe'),save:async body=>{await savePosition(true);const next=await serial(()=>request<Universe>('terrain/apply',body));colony?.accept(next);return next;},allowed:()=>!!colony?.universe?.currentPlanet.mine&&online&&state.flight.mode==='ground'});});
$('open-terrain').onclick=()=>void openPanel($<HTMLButtonElement>('open-terrain'),terrainWorkshop,async panel=>{if(!colony?.universe?.currentPlanet.mine||state.flight.mode!=='ground'||!colony.stopBuilding())return;clearInput();await savePosition(true);menu.close();await panel.open();});
const history=lazyPanel(async()=>{const {PrivateHistory}=await import('./history.ts');return new PrivateHistory({page:(id,after)=>request<HistoryPage>('history?planetId='+encodeURIComponent(id)+'&after='+after),snapshot:(id,seq)=>request<HistorySnapshot>('history/snapshot?planetId='+encodeURIComponent(id)+(seq===undefined?'':'&sequence='+seq))});});
$('open-history').onclick=()=>void openPanel($<HTMLButtonElement>('open-history'),history,async panel=>{if(!colony?.universe?.currentPlanet.mine)return;clearInput();await savePosition(true);menu.close();await panel.open(colony.universe.currentPlanet.id);});
const shipyard=lazyPanel(async()=>{const {Shipyard}=await import('./shipyard.ts');return new Shipyard({read:async()=>{const next=await serial(()=>request('state'));accept(next);return next.ship??defaultShip();},save:async body=>{const next=await serial(()=>request('ship/save',body));accept(next);return next.ship??defaultShip();},allowed:()=>!!state&&online&&state.flight.mode==='ground'});});
$('open-shipyard').onclick=()=>{if(state?.flight.mode==='space'){notice('Land before changing your ship.');return;}void openPanel($<HTMLButtonElement>('open-shipyard'),shipyard,async panel=>{if(state.flight.mode==='space')return;clearInput();await savePosition(true);menu.close();await panel.open();});};
$('guide-port').onclick=()=>{guideDock=true;menu.close();notice('Your parked ship is marked. Walk there to board.');};
window.addEventListener('keydown',e=>{if(homeInterior?.active||homeTransition)return;if(e.key==='Escape'&&speakingResident){e.preventDefault();closeResidentConversation();clearInput();return;}if(e.key==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();clearInput();flight?.clear();menu.showModal();void savePosition(true);}if(e.key.toLowerCase()==='m'&&!e.defaultPrevented&&!e.isComposing&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))&&!document.querySelector('dialog[open]')){$('open-map').click();}});
document.querySelectorAll<HTMLButtonElement>('[data-character]').forEach(button=>button.onclick=async()=>{
  if(busy || !state) return;
  busy=true;const old=state.character;setPlayerColor(button.dataset.character as Character);status('Saving coat…');
  try {accept(await serial(()=>request('character',{character:button.dataset.character})));}
  catch(error){setPlayerColor(old);failed(error);}finally{busy=false;}
});
let saving:Promise<void>|null=null;
async function savePosition(force=false):Promise<void> {
  if(saving){await saving;if(force)return savePosition(true);return;}
  if(worldPending||!walker||!state||state.location?.kind==='interior'||state.flight.mode==='space'||!online)return;
  if(!motionPending.length)return;
  const steps=motionPending.splice(0,MAX_PATH_STEPS),p=steps.at(-1)!.slice(0,3) as Vec3,planetId=state.planetId;
  const epoch=motionEpoch;
  saving=(async()=>{
    try{
      // A refresh/recovery can happen while this save waits in the mutation
      // queue or in flight. Neither an old send nor its response may rebase the
      // new collision world back to the old standing height.
      await serial(async()=>{
        if(epoch!==motionEpoch)return;
        // Read the acknowledged sequence when sending, and acknowledge this
        // response before another queued mutation can change the ground scene.
        const motion={sequence:(state.ground?.sequence??0)+1,physicsVersion:physicsVersionFor(planetId),steps};
        const next=await request('move',{position:p,planetId,motion});
        if(epoch!==motionEpoch)return;
        if(accept(next))lastSaved.fromArray(next.position);
      });
    }
    catch(error){if(epoch!==motionEpoch)return;if(error instanceof ApiError&&error.status===409){walker=new SurfaceWalker(state.position);standing=state.ground?{position:[...state.position],...state.ground}:null;lastSaved.copy(walker.up);clearInput();rebaseGroundCamera();}failed(error);}
  })().finally(()=>{saving=null;});
  await saving;
  if(force&&motionPending.length&&online)await savePosition(true);
}
async function interact() {
  if(sceneLoadingActive()||state?.location?.kind==='interior'||state?.flight.mode==='space'||photoPaused||homeTransition||document.querySelector('dialog[open]')||colony?.paused||busy||!online)return;
  near=world.npcs.find(n=>canTalkToTaskResident(n.id))?.id??null;
  if(!near){talkToResident();return;}
  if(state.quest==='delivered') {speak(near,near==='sol'?'A whole summer in one little packet. Thank you. Stay a while — the flowers are already finding the sun.':'Nothing else to carry today. There’s a lovely path past the orchard if you’re taking the long way home.');return;}
  if(near==='sol' && state.quest==='available') {speak('sol','Mica is keeping the sunseeds at the post office. Would you bring them over?');return;}
  if(near==='mica' && state.quest==='carrying') {speak('mica','Sol is just along the lane, at the glasshouse. Take your time; the seeds aren’t in a hurry.');return;}
  const requestedAction = near === 'mica' ? 'pickup' : 'deliver';
  const requestedResident=near;
  busy=true;action.disabled=true;status('Saving delivery…');
  try {
    const p=walker.up.toArray() as Vec3;
    await savePosition(true);
    const next=await serial(async()=>canTalkToTaskResident(requestedResident)?request('interact',{action:requestedAction}):null);
    if(!next){status('Move closer to talk.');return;}
    lastSaved.fromArray(p);accept(next);
    speak(state.quest==='carrying'?'mica':'sol',state.quest==='carrying'?'Sunseeds, for Sol. A little sunshine for the glasshouse. Keep them close, won’t you?':'You made it! A whole summer in a little packet. Let’s grow something good.');
    player.greet(elapsed);
  }catch(error){failed(error);}finally{busy=false;action.disabled=false;}
}
action.onclick=()=>void interact();
setInterval(()=>void savePosition(),350);
setInterval(async()=>{
  if(!online||!walker||state?.flight.mode!=='ground'||document.hidden)return;
  const planetId=activePlanet,ticket=presence.ticket(planetId),location=state.location,epoch=location?.visitEpoch??0;
  const interior=location?.kind==='interior';
  try{const snapshot=await presenceVisit.heartbeat(()=>request<PresenceSnapshot>('presence',{planetId,facing:interior?[Math.sin(location.yaw),0,Math.cos(location.yaw)]:walker.facing.toArray(),...(location?{scope:interior?`home:${location.buildingId}`:'exterior',visitEpoch:epoch}:{})}));
    if(snapshot&&activePlanet===planetId&&state.flight.mode==='ground'&&(state.location?.visitEpoch??0)===epoch){if(interior)homeInterior?.receivePresence(snapshot);else presence.receive(snapshot,performance.now(),ticket);}}
  catch{/* Presence is ephemeral; a failed heartbeat must not alter durable saves. */}
},PRESENCE_INTERVAL);
setInterval(async()=>{
  if(online || busy || physicsMismatch || stateLoader.pending) return;
  try {
    const next=await serial(()=>stateLoader.read());if(!accept(next))return;
    walker=new SurfaceWalker(next.position);lastSaved.copy(walker.up);clearInput();rebaseGroundCamera();ensureColony();notice('Back at your last saved spot. Welcome home.');
  }catch{status('Offline · retrying',true);}
},2500);
window.addEventListener('online',()=>notice('Reconnecting to your worlds…'));
window.addEventListener('offline',()=>{presence.clear();online=false;homeInterior?.setOnline(false);clearGroundMotion();clearInput();flight?.clear();status('Offline · retrying',true);});

let previous=performance.now(),elapsed=0,uiTick=0,started=false;
function animate(now:number) {
  requestAnimationFrame(animate);
  const dt=Math.min((now-previous)/1000,.05);previous=now;elapsed+=dt;
  const groundCameraSuspended=worldPending||homeInterior?.preparing||homeInterior?.active||photoPaused||flight?.active||document.body.matches('.workshop-open,.shipyard-open,.history-open,.terrain-workshop-open');
  if(groundCameraSuspended||overview)activeTownCutaway?.reset();
  // Returning from a separate camera mode starts a new local eye sphere;
  // never connect that mode's view to the prior ground eye with a cut tube.
  if(groundCameraSuspended){groundCamera.reset();started=false;}
  if(groundCameraConflict&&(groundCameraSuspended||overview||groundCameraConflict.worldGeneration!==worldGeneration||groundCameraConflict.planet!==activePlanet))endGroundCameraConflict();
  if(cameraLocalExceptionB&&measureCamera){
    const recordedAt=performance.now(),activeFrozenMs=groundCameraConflict?recordedAt-groundCameraConflict.startedAt:0;
    renderer.domElement.dataset.cameraConflictMetrics=JSON.stringify({schema:'camera-conflict-metrics-v1',triggerCount:cameraConflictTotals.triggerCount,totalFrozenMs:cameraConflictTotals.completedFrozenMs+activeFrozenMs,activeFrozenMs,active:!!groundCameraConflict,rolledBackDistanceMetres:cameraConflictTotals.rolledBackDistanceMetres,recordedAt});
  }
  if(worldPending||homeInterior?.preparing)return;
  if(photoPaused){photoMode?.frame();return;}
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
    camera.up.copy(up);camera.position.copy(departure.start).lerp(shot,Math.min(1,t*3));camera.quaternion.copy(departure.rotation).slerp(poseCamera.quaternion,Math.min(1,t*3));
    world.animate(elapsed,reduced,camera.position,up,overview);renderer.domElement.dataset.departure=String(t);practical.update(scene,camera,dt);drawing.render(new T.Vector3(),overview);
    if(t>=1){ship.position.copy(departure.base);world.parked.animate(0,false);departure=null;flight.presentation=false;flight.clear();document.body.classList.remove('departing');delete renderer.domElement.dataset.departure;}return;
  }
  if(flight?.active){$('boarding-prompt').hidden=true;$('dock-guide').hidden=true;flight.frame(dt,now,renderer);if(now>noticeUntil)$('notice').hidden=true;return;}
  const scenePaused=sceneLoadingActive()||homeTransition||!!document.querySelector('dialog[open]')||courierDialog.open||helpDialog.open||!!colony?.paused||!online||document.hidden;
  const paused=scenePaused||!!document.activeElement?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  homeControls?.frame(walker.up.toArray() as Vec3,groundRadius(),!paused);
  let x=joy.x+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  let y=joy.y+Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
  if(target && !paused) {
    const d=target.clone().projectOnPlane(walker.up);
    if(walker.up.angleTo(target)*groundRadius()<.2){target=null;}else{d.normalize();x=d.dot(walker.right());y=d.dot(walker.north);}
  }
  // A rejected isolated pose must not let unrendered motion reach the save
  // timer. Only this synchronous frame's new movement can be rolled back.
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
  const fov=activeRadius>20&&!overview?(innerWidth<600?62:54):activePlanet==='hub'?(innerWidth<600?65:55):(innerWidth<600&&!overview?58:48);if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
  const renderUp=surfaceNormal(walker.up);
  const hub=activePlanet==='hub',phone=innerWidth<600;
  const headPoint=feet.clone().addScaledVector(renderUp,1.35);
  // Complete LOD bindings and parked-craft animation before planning the
  // camera. The chosen cut plan must keep this binding generation until draw.
  world.animate(elapsed,reduced,started?camera.position:feet.clone().addScaledVector(renderUp,3.6),renderUp,overview);
  // The craft does not move during this frame's camera solve. Refresh its
  // transforms and conservative bounds once, including arrival candidates.
  world.parked.root.updateWorldMatrix(true,true);cameraShipBounds.setFromObject(world.parked.root);
  const cameraShipSolidBounds=world.parked.solidBounds;cameraShipCollision.update(cameraShipSolidBounds,world.parked.root.matrixWorld);
  if(doorstepCameraPending&&groundWorld?.planetId===activePlanet&&!overview){
    // Score the rendered surroundings as well as the centre boom. This only
    // chooses an initial view; all placed objects and saved positions stay put.
    const entrance=walker.north.clone(),best=entrance.clone();let score=-Infinity;
    const meshes:T.Mesh[]=[];scene.updateMatrixWorld(true);
    scene.traverse(object=>{if(!(object instanceof T.Mesh))return;let parent:T.Object3D|null=object;
      while(parent&&!parent.userData.objectId)parent=parent.parent;if(parent)meshes.push(object);});
    const routePoints:T.Vector3[]=[];
    for(const route of colony?.universe?.currentPlanet.homeManifest?.routes??[])for(let i=1;i<route.points.length;i++){
      const a=new T.Vector3(...route.points[i-1]),b=new T.Vector3(...route.points[i]);
      for(const t of [.25,.5,.75,1]){const n=a.clone().lerp(b,t).normalize(),d=n.angleTo(walker.up)*activeRadius;
        if(d>2&&d<10)routePoints.push(surfacePoint(n,.15));}
    }
    const doorFrame=state.home?.door.frame,doorRotation=doorFrame?new T.Quaternion().fromArray(doorFrame.quaternion):null;
    const doorCentre=doorFrame?new T.Vector3(...doorFrame.position).add(new T.Vector3(homeDoorCenterOffset(state.home?.door.partId),1,0).applyQuaternion(doorRotation!)):null;
    const doorFront=doorRotation?new T.Vector3(0,0,1).applyQuaternion(doorRotation):null;
    const trial=camera.clone();let chosen:{obstruction:number;street:number}|null=null;
    for(const angle of [0,.28,-.28,.55,-.55,.85,-.85,1.1,-1.1,1.35,-1.35,1.6,-1.6,1.9,-1.9,2.2,-2.2]){
      walker.north.copy(entrance).applyAxisAngle(walker.up,angle);
      const candidate=cameraPose(walker,phone,false,groundRadius()),lift=feet.length()-groundRadius();
      candidate.position.addScaledVector(walker.up,lift);candidate.target.addScaledVector(walker.up,lift);
      const clear=groundWorld.cameraDistance(headPoint,candidate.position),boom=candidate.position.clone().sub(headPoint);
      if(clear<2.5)continue;
      trial.position.copy(headPoint).addScaledVector(boom.normalize(),Math.min(clear,headPoint.distanceTo(candidate.position)));
      trial.up.copy(renderUp);trial.lookAt(candidate.target);trial.updateMatrixWorld(true);
      if(doorCentre&&doorFront){const doorOnScreen=doorCentre.clone().project(trial);
        if(trial.position.clone().sub(doorCentre).dot(doorFront)<.3||Math.abs(doorOnScreen.x)>.88||doorOnScreen.y<-.75||doorOnScreen.y>.58)continue;}
      const image=arrivalViewScore(trial,headPoint,renderUp,meshes,routePoints),value=image.score-.18*Math.abs(angle);
      if(value>score){score=value;best.copy(walker.north);chosen=image;}
    }
    renderer.domElement.dataset.arrivalFraming=JSON.stringify(chosen);
    walker.north.copy(best);walker.facing.copy(best);doorstepCameraPending=false;started=false;
  }
  if(!started||cameraWasOverview!==overview){groundCamera.reset();activeTownCutaway?.reset();}
  cameraWasOverview=overview;
  player.root.visible=true;
  const cameraAvatar=cameraLocalExceptionB&&!overview?cameraAvatarFrame():null;
  let resolvedCameraArm:Pick<ReturnType<GroundCameraRig['update']>,'distance'|'desiredDistance'|'probeRadius'|'centerDistance'|'shoulder'|'avoidanceYaw'|'avoidanceTargetYaw'|'framingLimited'|'warningDistance'|'opticalDistance'|'eyeClear'|'frameWidth'|'frameHeight'|'avatarClearance'|'framingPitch'>|null=null,avatarOpacity=1;
  let smoothedHeading=walker.north.toArray(),smoothedPitch=cameraPitch;
  const committedCutawayFrame:CameraCutawayDiagnostics|null=null;
  const frameCollision:CameraFrameCertificate['diagnostics']|null=null,rawEyeClear:boolean|null=null,exceptionsExplicit=false;
  const frameRenderEvidence:CameraRenderFrame|null=null;
  if(overview){
    avatarOcclusion.restore();
    const pose=cameraPose(walker,phone,true,groundRadius());
    pose.position.addScaledVector(walker.up,world.height(walker.up));
    pose.target.addScaledVector(walker.up,world.height(walker.up));
    poseCamera.position.copy(pose.position);poseCamera.up.copy(renderUp);poseCamera.lookAt(pose.target);
    if(!started){camera.position.copy(pose.position);camera.quaternion.copy(poseCamera.quaternion);}
    camera.up.copy(renderUp);camera.position.lerp(pose.position,reduced?1:1-Math.exp(-7*dt));camera.quaternion.slerp(poseCamera.quaternion,reduced?1:1-Math.exp(-8*dt));
  }else{
    const room=indoorFollowRooms.update(groundWorld,feet,renderUp,dt);
    renderer.domElement.dataset.cameraRoom=room?.id??'outdoors';
    const roomMode=room?.id??'outdoors';
    if(renderer.domElement.dataset.previousCameraRoom!==roomMode){started=false;groundCamera.reset();}
    renderer.domElement.dataset.previousCameraRoom=roomMode;
    if(room){
    const pose=groundCamera.update({room,feet,up:renderUp,heading:surfaceTangent(walker.up,walker.north),pitch:cameraPitch,portrait:phone,fov:camera.fov,aspect:camera.aspect,radius:groundRadius(),dt,instant:!started,probe:probeGroundCamera});
    // Follow the control bearing at a fixed arm length, even when scenery blocks it.
    camera.position.copy(pose.position);camera.up.copy(pose.up);camera.lookAt(pose.target);
    smoothedHeading=pose.heading.toArray();smoothedPitch=pose.pitch;
    avatarOcclusion.restore();avatarOpacity=1;
    resolvedCameraArm={distance:pose.distance,desiredDistance:pose.desiredDistance,probeRadius:pose.probeRadius,centerDistance:pose.centerDistance,shoulder:pose.shoulder,avoidanceYaw:pose.avoidanceYaw,avoidanceTargetYaw:pose.avoidanceTargetYaw,framingLimited:pose.framingLimited,warningDistance:pose.warningDistance,opticalDistance:pose.opticalDistance,eyeClear:pose.eyeClear,frameWidth:pose.frameWidth,frameHeight:pose.frameHeight,avatarClearance:pose.avatarClearance,framingPitch:pose.framingPitch};
    }else{
      const probe=(start:T.Vector3,end:T.Vector3)=>groundWorld?.cameraDistance(start,end)??start.distanceTo(end);
      const pose=legacyOutdoorCameraPose(walker,phone,groundRadius(),feet,renderUp,cameraPitch,probe);
      player.root.visible=pose.playerVisible;
      // Retain the baseline hub/craft geometry checks alongside static proxies.
      const shortenAgainst=(root:T.Object3D)=>{
        const offset=pose.position.clone().sub(headPoint),length=offset.length();
        if(length<1e-10)return;
        raycaster.set(headPoint,offset.divideScalar(length));raycaster.far=length;
        const hit=raycaster.intersectObject(root,true).find(h=>h.object instanceof T.Mesh&&h.distance>.35);
        if(hit){const forward=pose.target.clone().sub(pose.position).normalize();pose.position.copy(headPoint).addScaledVector(offset,Math.max(0,hit.distance-.3));pose.target.copy(pose.position).addScaledVector(forward,3);}
        raycaster.far=Infinity;
      };
      if(hub)shortenAgainst(world.scenery);shortenAgainst(world.parked.root);
      poseCamera.position.copy(pose.position);poseCamera.up.copy(renderUp);poseCamera.lookAt(pose.target);
      if(!started){camera.position.copy(pose.position);camera.quaternion.copy(poseCamera.quaternion);}
      camera.up.copy(renderUp);camera.position.lerp(pose.position,reduced?1:1-Math.exp(-7*dt));camera.quaternion.slerp(poseCamera.quaternion,reduced?1:1-Math.exp(-8*dt));
      // Recheck the interpolated eye as in 4f0d596, preserving its view quaternion.
      camera.position.copy(clipLegacyCameraBoom(headPoint,camera.position,probe));
      camera.position.copy(clipLegacyCameraBoom(headPoint,camera.position,(start,end)=>probeParkedCamera(start,end,0)));
      avatarOcclusion.restore();avatarOpacity=1;
      renderer.domElement.dataset.cameraArm=JSON.stringify({strategy:'4f0d596-wall-fix',close:pose.close,distance:camera.position.distanceTo(headPoint)});
    }
    renderer.domElement.dataset.avatarOpacity=String(avatarOpacity);
    renderer.domElement.dataset.cameraArm=JSON.stringify(resolvedCameraArm);
  }
  started=true;
  updateGroundFog(scene,activePlanet,activeRadius,camera.position.length());
  silhouette.visible=false;
  /* Legacy occlusion silhouette is disabled with the follow camera.
  silhouette.visible=!overview&&!hub&&world.blocks.some(b=>{
    const center=surfacePoint(b.point,b.height*.50),along=center.clone().sub(sight.origin).dot(sight.direction);
    return along>.4&&along<sightLength-.5&&sight.distanceSqToPoint(center)<Math.pow(Math.max(b.radius,b.height*.28),2);
  });
  */
  silhouette.position.copy(feet).addScaledVector(walker.up,.84);silhouette.quaternion.copy(player.root.quaternion);
  if(hub||activeRadius>20){sun.target.position.copy(surfacePoint(walker.up));sun.position.copy(sun.target.position).addScaledVector(renderUp,overview?143:65).add(new T.Vector3(-55,0,45).projectOnPlane(renderUp));}else{sun.position.copy(walker.up).multiplyScalar(24).addScaledVector(walker.right(),-12).addScaledVector(walker.north,7);sun.target.position.set(0,0,0);}
  fitGroundSunShadowDepth(sun);
  if('setSunDirection' in world)world.setSunDirection(sun.position.clone().sub(sun.target.position).normalize().toArray() as Vec3);
  const cutawayFrame=cameraLocalExceptionB&&!overview?committedCutawayFrame:activeTownCutaway&&groundWorld?activeTownCutaway.update({world:groundWorld,camera,feet,up:renderUp,dt,enabled:cameraCutawayB&&!overview,diagnostics:measureCamera}):null;
  residents?.update({dt,time:elapsed,viewer:walker.up.toArray() as Vec3,camera,reducedMotion:reduced,enabled:!scenePaused});
  world.npcs.forEach(n=>{n.avatar.animate(elapsed,0,reduced);if(near===n.id){const local=n.anchor.worldToLocal(player.root.position.clone());const yaw=Math.atan2(local.x,local.z);const diff=Math.atan2(Math.sin(yaw-n.avatar.root.rotation.y),Math.cos(yaw-n.avatar.root.rotation.y));n.avatar.root.rotation.y+=diff*(1-Math.exp(-4*dt));}n.beacon.position.y=2.0+(reduced?0:Math.sin(elapsed*2)*.06);n.beacon.visible=state.quest!=='delivered'&&n.id===(state.quest==='available'?'mica':'sol');});
  presence.frame(now,dt,walker.up,reduced);
  colony?.updateShadows(feet);
  practical.update(scene,camera,dt);drawing.render(new T.Vector3(),overview);
  // Opt-in, atomic evidence from this rendered frame. Reading this snapshot can
  // never move the player, steer the camera, or write a saved position.
  if(measureCamera)renderer.domElement.dataset.cameraFrame=JSON.stringify({
    frameSeq:++cameraFrameSequence,frameTime:now,recordedAt:performance.now(),planet:activePlanet,overview,fov:camera.fov,aspect:camera.aspect,near:camera.near,
    position:walker.up.toArray(),radius:standing?.radius??groundRadius(),grounded:standing?.grounded??true,
    head:headPoint.toArray(),eye:camera.position.toArray(),heading:walker.north.toArray(),pitch:cameraPitch,
    up:camera.up.toArray(),forward:camera.getWorldDirection(new T.Vector3()).toArray(),quaternion:camera.quaternion.toArray(),
    facing:walker.facing.toArray(),smoothedHeading,smoothedPitch,arm:resolvedCameraArm,playerVisible:player.root.visible,avatarOpacity,
    cameraStrategy:renderer.domElement.dataset.cameraRoom==='outdoors'?'4f0d596-wall-fix':'indoor-follow',cutaway:cutawayFrame,
    collision:frameCollision,renderGeometry:frameRenderEvidence,collisionAccepted:frameCollision?true:null,rawEyeClear,exceptionsExplicit,
    avatarBounds:cameraAvatar?.bounds??null,avatarMeshes:cameraAvatar?.meshes??null,
    parkedShip:{document:world.parked.document,matrixWorld:world.parked.root.matrixWorld.toArray(),bounds:{min:cameraShipBounds.min.toArray(),max:cameraShipBounds.max.toArray()},solidBounds:{min:cameraShipSolidBounds.min.toArray(),max:cameraShipSolidBounds.max.toArray()},collisionMethod:'conservative-solid-obb-v1',rightFallback:walker.right().toArray()},
  });
  uiTick+=dt;
  if(uiTick>.1) {
    renderer.domElement.dataset.publicCounts=JSON.stringify(world.scenery.userData.publicCounts??null);renderer.domElement.dataset.townStats=JSON.stringify(world.scenery.userData.townStats??null);renderer.domElement.dataset.practical=JSON.stringify(practical.stats());if(renderer.domElement.dataset.renderCpuMs!==undefined)renderer.domElement.dataset.lightLevels=JSON.stringify(practical.group.children.filter((o):o is T.Light=>o instanceof T.Light).map(o=>o.userData.fullIntensity?o.intensity/o.userData.fullIntensity:0));renderer.domElement.dataset.textureFormat=worldMaterials().textureFormat;renderer.domElement.dataset.scanFormats=JSON.stringify(worldMaterials().scanStats().map(s=>s.format));
    renderer.domElement.dataset.feetRadius=String(standing?.radius??groundRadius());renderer.domElement.dataset.verticalSpeed=String(standing?.verticalSpeed??0);renderer.domElement.dataset.sprinting=String(keys.has('shift'));renderer.domElement.dataset.jumpHeld=String(!!standing?.jumpHeld);renderer.domElement.dataset.grounded=String(standing?.grounded??true);renderer.domElement.dataset.groundSupport=groundWorld&&standing?groundWorld.support(standing.position,standing.radius+.01).tag:'terrain';
    // Read-only pose evidence for obstruction checks; never an input to movement or saves.
    renderer.domElement.dataset.cameraPosition=JSON.stringify(camera.position.toArray());renderer.domElement.dataset.cameraHead=JSON.stringify(headPoint.toArray());renderer.domElement.dataset.playerVisible=String(player.root.visible);
    renderer.domElement.dataset.cameraHeading=JSON.stringify(walker.north.toArray());renderer.domElement.dataset.playerFacing=JSON.stringify(walker.facing.toArray());renderer.domElement.dataset.cameraForward=JSON.stringify(camera.getWorldDirection(new T.Vector3()).toArray());renderer.domElement.dataset.cameraUp=JSON.stringify(renderUp.toArray());renderer.domElement.dataset.cameraQuaternion=JSON.stringify(camera.quaternion.toArray());renderer.domElement.dataset.cameraPitch=String(cameraPitch);renderer.domElement.dataset.groundScale=String(surfaceScale(walker.up));renderer.domElement.dataset.groundRadius=String(groundRadius());renderer.domElement.dataset.quality=innerWidth<700?'compact':'full';
    renderer.domElement.dataset.drawCalls=String(renderer.info.render.calls);
    renderer.domElement.dataset.triangles=String(renderer.info.render.triangles);
    uiTick=0;near=null;
    renderer.domElement.dataset.residents=JSON.stringify(residents?.diagnostics??null);
    const dockPoint=new T.Vector3(...portPoint(activePlanet)),displayDockDistance=surfaceNormal(walker.up).angleTo(surfaceNormal(dockPoint))*groundRadius(),dockDistance=walker.up.angleTo(dockPoint)*groundRadius();nearDock=!!standing?.grounded&&dockDistance<BOARD_RADIUS-.12;
    $('boarding-prompt').hidden=!nearDock||paused;setText($('dock-context'), activePlanet==='hub'?'STARPORT / BOARDING GATE':'PARKED SHIP / RETURN BEACON');
    $('dock-guide').hidden=!guideDock||nearDock||paused;const toward=dockPoint.projectOnPlane(walker.up).normalize();$('dock-arrow').style.transform=`rotate(${Math.atan2(toward.dot(walker.right()),toward.dot(walker.north))*180/Math.PI}deg)`;setText($('dock-guide-text'), `Parked ship · ${Math.round(displayDockDistance)} m`);
    renderer.domElement.dataset.portDistance=String(dockDistance);renderer.domElement.dataset.groundPosition=JSON.stringify(walker.up.toArray());

    for(const n of world.npcs){
      const d=distance(walker.up.toArray() as Vec3,NPCS[n.id].position,groundRadius());
      if(canTalkToTaskResident(n.id))near=n.id;
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
    // Language controls pause movement while the existing conversation remains
    // readable and updates in place. Menus and scene transitions still close it.
    teleportStations?.frame(walker.up.toArray() as Vec3,groundRadius(),!scenePaused&&!paused&&!nearDock&&!!standing?.grounded&&online&&state.flight.mode==='ground'&&state.location?.kind!=='interior'&&!colony?.building&&!homeTransition);
    nearResident=!scenePaused&&standing?.grounded&&!near&&!nearDock&&!homeControls?.canEnter&&!teleportStations?.canUse?residents?.nearest(walker.up.toArray() as Vec3,standing.radius)??null:null;
    renderer.domElement.dataset.nearResident=nearResident?.id??'';
    if(speakingResident){if(scenePaused||nearResident?.id!==speakingResident.id)closeResidentConversation();else renderResidentConversation();}
    action.hidden=(!near&&!nearResident)||paused||nearDock||!!teleportStations?.canUse;
    if(near){delete action.dataset.residentPrompt;setHTML(action, (state.quest==='available'&&near==='mica'?'Collect the parcel':state.quest==='carrying'&&near==='sol'?'Deliver to Sol':`Talk to ${NPCS[near].name}`)+' <kbd>E</kbd>');setText($('nearby'), near==='mica'?'A little sunshine, ready to go.':'Something’s waiting to grow.');}
    else if(nearResident){
      const language=document.documentElement.lang.startsWith('zh')?'zh':'en';
      const promptKey=`${nearResident.id}|${language}`;
      if(action.dataset.residentPrompt!==promptKey){
        action.dataset.residentPrompt=promptKey;
        setText(action,language==='zh'?`与${nearResident.name.zh}交谈`:`Talk to ${nearResident.name.en}`,true);
        const hint=document.createElement('kbd');hint.textContent='E';action.append(hint);
        setText($('nearby'),`${language==='zh'?'小镇居民':'Village resident'} · ${nearResident.role[language]} · ${nearResident.place[language]}`,true);
      }
    }
    else{delete action.dataset.residentPrompt;setText($('nearby'), '');}
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
    move:body=>serial(()=>request('home/move',body)),save:body=>serial(()=>request<Universe>('home/save',body)),exit:body=>changeVisit('home/exit',body),door:body=>serial(()=>request<Universe>('home/door',body)),
    applyPlayer:next=>{accept(next);},applyUniverse:next=>colony?.accept(next),recover:()=>request<Universe>('universe'),
  });homeInterior.receive(state);homeInterior.setOnline(online);
  homeControls=new HomeControls({enter:async()=>{
    const home=state.home;if(!home?.canEdit||state.location?.kind==='interior')return;
    homeTransition=true;document.body.classList.add('home-transition');
    try{
      await savePosition(true);clearInput();clearGroundMotion();
      await changeVisit('home/enter',{planetId:state.planetId,buildingId:home.buildingId,visitEpoch:state.location?.visitEpoch??0});
    }finally{homeTransition=false;document.body.classList.remove('home-transition');}
  },command:async(route,body)=>{
    if(route!=='home/door')return serial(()=>request<Universe>(route,body));
    // A door changes the collision scene and advances the saved ground sequence.
    // Drain every existing step before changing it, then accept the new scene
    // inside the queue before allowing walking or the next movement request.
    homeTransition=true;clearInput();
    try{
      await savePosition(true);
      if(!online)throw new Error('Offline · retrying');
      return await serial(async()=>{const next=await request<Universe>(route,body);colony?.accept(next);return next;});
    }finally{homeTransition=false;}
  },apply:next=>{if(colony?.universe!==next)colony?.accept(next);},workshop:async()=>{await colony?.openHomeWorkshop();},pathPreview:planetId=>serial(()=>request<import('../shared/home-paths.ts').HomePathPreview>('home/paths/preview',{planetId})),previewPaths:objects=>{colony?.previewPaths(objects);if(objects.length){overview=true;setAttribute($('view-mode'),'aria-label','Walking view');setHTML($('view-mode'),'↗ <span>Walking view</span>');}},notice});
  homeSetup=new HomeSetup({preview:planetId=>serial(()=>request<import('../shared/home-setup.ts').HomeSetupPreview>('home/setup/preview',{planetId})),confirm:body=>serial(()=>request<Universe>('home/setup/confirm',body)),apply:next=>colony?.accept(next),ghost:addition=>{colony?.previewHome(addition);if(addition){overview=true;setAttribute($('view-mode'),'aria-label','Walking view');setHTML($('view-mode'),'↗ <span>Walking view</span>');}},notice});
  teleportStations=new TeleportStations({
    teleport:async(planetId,requestId)=>{
      // Same ordering as entering a home: every walked step is saved before the gate is used.
      homeTransition=true;
      try{
        await savePosition(true);if(!online)throw new Error('Offline · retrying');clearInput();clearGroundMotion();
        const next=await changeVisit('teleport',{planetId,requestId,visitEpoch:state.location?.visitEpoch??0});
        // Arrive facing the gate just used: the follow camera then sits over the open forecourt, not inside the ring.
        const site=next.player.flight.mode==='ground'?teleportStations?.arrivalSite(next.player.position,activeRadius):null;
        if(site&&walker){walker.north.set(...site.interact).sub(new T.Vector3(...site.arrival)).projectOnPlane(walker.up).normalize();walker.facing.copy(walker.north);started=false;}
        guideDock=false;return next;
      }finally{homeTransition=false;}
    },
    preview:planetId=>serial(()=>request<import('../shared/teleport.ts').TeleportStationPreview>('teleport/station/preview',{planetId})),
    confirm:body=>serial(()=>request<Universe>('teleport/station/confirm',body)),
    ghost:addition=>{colony?.previewHome(addition);if(addition){overview=true;setAttribute($('view-mode'),'aria-label','Walking view');setHTML($('view-mode'),'↗ <span>Walking view</span>');}},
    apply:next=>{if(colony?.universe!==next)colony?.accept(next);},notice});
  flight=new SpaceFlight({canvas:renderer.domElement,renderer,online:()=>online,player:()=>state,checkpoint:body=>serial(()=>request('flight/checkpoint',body)),command:changeVisit,apply:accept,applyUniverse:u=>{if(colony?.universe!==u)colony?.accept(u);},flushGround:async()=>{await savePosition(true);await queue;},clearGround:()=>{clearInput();colony?.stopBuilding();},canBoard:()=>!sceneLoadingActive()&&!homeTransition&&state.location?.kind!=='interior'&&!!walker&&!!standing?.grounded&&!colony?.building&&distance(walker.up.toArray() as Vec3,portPoint(activePlanet),groundRadius())<BOARD_RADIUS-.12,failed,notice});
  flight.setDesign((state.ship??defaultShip()).design);flight.receive(state.flight);scene.environment=flight.scene.environment;scene.environmentIntensity=groundPresentation(activePlanet,activeRadius).environmentIntensity;
  colony = new Colony({canvas:renderer.domElement,camera,scene,ground:()=>world.globe,deferObjects:true,cameraCutaway:cameraCutawayB,
    applyPlayer:accept,
    universe:u=>{homeSetup?.receive(u);teleportStations?.receive(u);homeControls?.receive(u);flight?.universe(u);prepareSurface(u.currentPlanet);},bearing:id=>flight?.mark(id),
    obstacles:blocks=>{placedObstacles=blocks;if(activePlanet!=='hub')world.blocks.splice(0,world.blocks.length,...blocks);},
    pause:building=>{clearInput();overview=building;setAttribute($('view-mode'), 'aria-label', overview?'Walking view':'View planet');setHTML($('view-mode'), overview?'↗ <span>Walking view</span>':'◉ <span>Planet view</span>');},
    libraryRead:()=>request<import('../shared/blueprints.ts').LibraryEntry[]>('blueprints'),librarySave:body=>serial(()=>request<import('../shared/blueprints.ts').LibraryEntry>('blueprints/save',body)),
    read:()=>request<Universe>('universe'),write:(route,body)=>serial(()=>request<Universe>(route,body)),flush:async()=>{await savePosition(true);await queue;},notice,
  });
  mountOnboarding({read:()=>colony?.universe?{universe:colony.universe,mode:state.flight.mode,building:colony.building,nearDock,online:online&&colony.syncing}:null});
  $('delivery-toggle').onclick=()=>{menu.close();document.body.classList.toggle('delivery-open');setText($('delivery-toggle'), document.body.classList.contains('delivery-open')?'Hide delivery':'Try a delivery');};
}
photoMode=new PhotoMode({renderer,
  ready:()=>!sceneLoadingActive()&&!!walker&&online&&!homeTransition&&!departure&&!colony?.paused,
  flush:async()=>{if(homeInterior?.active){await homeInterior.flush();await homeInterior.flush();}else if(flight?.active)await flight.flush();else await savePosition(true);await queue;},
  pause:active=>{photoPaused=active;groundCamera.reset();activeTownCutaway?.reset();started=false;if(active){avatarOcclusion.restore();}closeResidentConversation();clearInput();flight?.clear();homeInterior?.setPhotoMode(active);if(active)menu.close();else resize();},
  view:(mode,width,height):PhotoView=>{
    if(homeInterior?.active)return homeInterior.getPhotoView(width,height,mode);
    if(flight?.active){const view=flight.camera.clone();view.aspect=width/height;view.updateProjectionMatrix();return {scene:flight.scene,camera:view,target:view.position.clone().add(view.getWorldDirection(new T.Vector3()).multiplyScalar(30))};}
    const view=camera.clone(),aspect=width/height;view.aspect=aspect;
    const target=mode==='overview'?new T.Vector3():player.root.position.clone().addScaledVector(surfaceNormal(walker.up),1.25);
    if(mode==='overview'){
      view.fov=40;const distance=activeRadius/(Math.sin(T.MathUtils.degToRad(view.fov/2))*Math.min(1,aspect))*1.12;
      const bearing=camera.position.clone().normalize();view.position.copy(bearing.multiplyScalar(distance));view.up.copy(walker.north);view.lookAt(target);
    }
    view.updateProjectionMatrix();view.updateMatrixWorld(true);
    return {scene,camera:view,target,prepare:photo=>{updateGroundFog(scene,activePlanet,activeRadius,photo.position.length());world.animate(elapsed,true,photo.position,walker.up,mode==='overview');residents?.update({dt:0,time:elapsed,viewer:walker.up.toArray() as Vec3,camera:photo,reducedMotion:reduced,enabled:false});}};
  },notice,
});
const photoButton=document.createElement('button');photoButton.id='open-photo';setText(photoButton,'Photo mode');
$('view-mode').after(photoButton);photoButton.onclick=()=>void photoMode?.open();
window.addEventListener('open-photo-mode',()=>void photoMode?.open());
requestAnimationFrame(animate);
try {
  const initial=await stateLoader.read();state=initial;walker=new SurfaceWalker(state.position);lastSaved.copy(walker.up);accept(initial);
  ensureColony();
  if(initial.home)setText(courierDialog.querySelector('p')!, 'Your home is ready. Choose a suit, enter through its door, then make the room and garden yours.');
  let welcomed=false;try{welcomed=localStorage.getItem(welcomeKey(initial))==='1';}catch{/* Storage can be unavailable in private browsing. */}
  if(initial.revision===0&&!welcomed)courierDialog.showModal();else notice('A familiar little planet. Welcome back.');
} catch(error){failed(error);}
