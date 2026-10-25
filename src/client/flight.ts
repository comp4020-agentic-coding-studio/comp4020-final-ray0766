import { setText } from './i18n.ts';
import * as T from 'three';
import { ORBIT_VISIBLE_BUDGET,regionFor } from '../shared/regions.ts';
import { makeShip } from './ship-model.ts';
import type { ShipDesign } from '../assets/claude-geometry/ship/design.ts';
import { orbitalPlanetAsync, configureSpace } from './space-art.ts';
import {beginSceneLoading,sceneLoadingActive,sceneLoadingLabel,yieldSceneFrame} from './loading-state.ts';
import { bearing, flightStep, forward, spaceDistance, wrapAngle } from '../shared/flight.ts';
import type { FlightState } from '../shared/flight.ts';
import type { PlanetSummary, Universe } from '../shared/planets.ts';
import type { PlayerState } from '../shared/world.ts';
import { bodyRadius } from '../shared/world-size.ts';
import { RADIUS } from '../shared/world.ts';
import {createVillageDrawing} from './village-drawing.ts';
import {applyArtMaterial} from './art-profile.ts';
import {planFlightRoute,flightRouteInput} from './flight-route.ts';
import type {Vec3} from '../shared/world.ts';
import type { SaveProgress } from './save-progress.ts';
import {getQualityProfile} from './quality.ts';
import {orbitPlan,orbitCacheLimit,orbitBufferBytes} from './orbit-preload.ts';
import {flightCameraPose,clipFlightEye,flightIndicator} from './flight-look.ts';
import {FlightControls,shipHeading} from './flight-controls.ts';



import {flightCheckpointDelay} from './flight-checkpoint.ts';
const el=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
interface Bridge {
  progress?: SaveProgress;
  canvas:HTMLCanvasElement; renderer:T.WebGLRenderer; online:()=>boolean; player:()=>PlayerState|undefined;
  checkpoint:(body:unknown)=>Promise<PlayerState>; command:(route:string,body:unknown)=>Promise<Universe>;
  apply:(p:PlayerState)=>void; applyUniverse:(u:Universe)=>void; flushGround:()=>Promise<void>;
  clearGround:()=>void; canBoard:()=>boolean; failed:(error:unknown)=>void; notice:(message:string)=>void;
}
export class SpaceFlight {
  scene=new T.Scene();camera=new T.PerspectiveCamera(58,innerWidth/innerHeight,.1,18000);
  presentation=false;pilot:FlightState|null=null; planets:PlanetSummary[]=[];busy=false;
  private route:Vec3[]=[];private routeIndex=0;private travelling=false;private routeNote='Choose a destination. The ship handles takeoff and landing.';
  private travelSelect=document.createElement('select');private travelButton=document.createElement('button');private travelStatus=document.createElement('p');
  private departureSelect=document.createElement('select');private preview=document.createElement('p');private requestId=crypto.randomUUID();
  private skipButton=document.createElement('button');private returnButton=document.createElement('button');private renameButton=document.createElement('button');
  private confirmTarget:string|null=null;private confirmRevision=0;private routeTrip='';private arrivalFailed=false;
  private ship=makeShip();private bodies=new Map<string,{root:T.Group,low:T.Mesh,detail:T.Group|null,label:HTMLButtonElement,lastUsed:number,bytes:number,radius?:number,environment?:string|null}>();
  private lowGeometry=new T.IcosahedronGeometry(RADIUS,2);private lowMaterials=['#5ea476','#91b7aa','#e0d3ab'].map(color=>applyArtMaterial(new T.MeshStandardMaterial({color,roughness:1})));
  private drawing:ReturnType<typeof createVillageDrawing>;
  private detailPreparation:{controller:AbortController;feedback:ReturnType<typeof beginSceneLoading>}|null=null;
  private orbitWarmed=false;private orbitBuilds=0;private wantedDetails=new Set<string>();private visibleDetails=new Set<string>();
  private orbitNotice=document.createElement('div');
  private beacons:T.Points|null=null;private lodAt=-Infinity;private labelIds=new Set<string>();
  private controls:FlightControls;private noseMarker=document.createElement('div');
  private ack:FlightState|null=null;private ackAt=0;private checkpointPacing=false;private saving:Promise<void>|null=null;private speedPeakPending:Promise<void>|null=null;private saveAt=0;private cameraStarted=false;private hudAt=0;
  private dialog=el<HTMLDialogElement>('flight-dialog');private action:'launch'|'retarget'='launch';private pendingTarget:string|null=null;
  private look=new T.PerspectiveCamera();private turn=new T.Quaternion();private steering=new T.Vector2();private enginePower=0;private bank=0;private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private bridge:Bridge){
    this.orbitNotice.className='orbit-preparation';this.orbitNotice.hidden=true;this.orbitNotice.setAttribute('role','status');this.orbitNotice.setAttribute('aria-live','polite');
    this.orbitNotice.innerHTML='<span></span><progress></progress><button type="button" hidden></button>';el('flight-hud').append(this.orbitNotice);
    configureSpace(this.scene,bridge.renderer);this.scene.fog=null;this.scene.add(this.ship.root);this.drawing=createVillageDrawing(bridge.renderer,this.scene,this.camera,true);
    el('board-ship').onclick=()=>this.openLaunch();
    el('cancel-flight').onclick=()=>this.dialog.close();el('confirm-flight').onclick=()=>void this.transition();
    this.dialog.addEventListener('cancel',e=>{if(this.busy)e.preventDefault();});
    this.departureSelect.id='trip-departure';this.departureSelect.setAttribute('aria-label','Destination');this.preview.id='trip-preview';
    el('flight-detail').after(this.departureSelect,this.preview);this.departureSelect.onchange=()=>this.updatePreview();
    const navigation=document.createElement('section');navigation.className='flat-flight-navigation';navigation.setAttribute('aria-label','Automatic journey');
    const label=document.createElement('label');setText(label,'Destination');this.travelSelect.id='flight-destination';label.htmlFor=this.travelSelect.id;
    this.travelButton.id='flight-travel';this.travelButton.type='button';setText(this.travelButton,'Resume journey');this.travelButton.onclick=()=>void this.startTravel();
    this.skipButton.id='flight-skip';setText(this.skipButton,'Skip journey');this.skipButton.onclick=()=>void this.finishTrip();
    this.returnButton.id='flight-return';setText(this.returnButton,'Cancel · return to departure');this.returnButton.onclick=()=>void this.returnTrip();
    this.travelStatus.id='flight-route-status';this.travelStatus.setAttribute('role','status');
    navigation.append(label,this.travelSelect,this.travelButton,this.skipButton,this.returnButton,this.travelStatus);el('flight-hud').append(navigation);
    this.travelSelect.onchange=()=>this.mark(this.travelSelect.value);
    const forwardButton=document.createElement('button');forwardButton.id='flight-look-forward';setText(forwardButton,'Look forward');forwardButton.onclick=()=>{if(this.pilot)this.controls.lookForward(this.pilot);};navigation.append(forwardButton);
    this.controls=new FlightControls(bridge.canvas,()=>!!this.active&&!this.paused,()=>{},[],false);
    this.noseMarker.id='flight-nose-marker';this.noseMarker.setAttribute('aria-hidden','true');el('flight-hud').append(this.noseMarker);
    let pointer:{x:number;y:number;distance:number}|null=null;
    bridge.canvas.addEventListener('pointerdown',e=>{if(e.button===0)pointer={x:e.clientX,y:e.clientY,distance:0};});
    bridge.canvas.addEventListener('pointermove',e=>{if(pointer)pointer.distance=Math.max(pointer.distance,Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y));});
    bridge.canvas.addEventListener('pointercancel',()=>{pointer=null;});
    bridge.canvas.addEventListener('pointerup',e=>{const click=pointer;pointer=null;if(!click||click.distance>6||!this.active||this.paused)return;const rect=bridge.canvas.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),this.camera);
      const hits=this.planets.filter(p=>this.bodies.get(p.id)?.root.visible).flatMap(p=>{const point=ray.ray.intersectSphere(new T.Sphere(new T.Vector3(...p.center),bodyRadius(p)),new T.Vector3());return point?[{id:p.id,d:point.distanceTo(ray.ray.origin)}]:[];}).sort((a,b)=>a.d-b.d);if(hits[0])this.mark(hits[0].id);
    });
    this.renameButton.id='rename-planet';setText(this.renameButton,'Name my planet');el('my-planet').after(this.renameButton);this.renameButton.onclick=()=>this.openRename();
    window.addEventListener('blur',()=>this.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden){this.clear();void this.flush();}});
    setInterval(()=>{if(this.active&&bridge.online()&&!this.busy&&!document.hidden)void this.flush();},350);
  }
  get active(){return this.pilot?.mode==='space';}

  private get paused(){return sceneLoadingActive()||this.presentation||this.busy||!this.bridge.online()||document.hidden||!!document.querySelector('dialog[open]');}
  clear(){this.travelling=false;this.controls?.clear();this.steering.set(0,0);this.routeNote='Journey paused. Resume, skip, or return to departure.';}
  receive(f:FlightState,force=false){
    if(f.mode!=='space'&&this.detailPreparation){this.detailPreparation.controller.abort();this.detailPreparation.feedback.finish();this.detailPreparation=null;}
    const entering=!this.pilot||f.mode!==this.pilot.mode||f.journey!==this.pilot.journey;
    if(entering||force){this.bridge.progress?.reset('flight');this.pilot=structuredClone(f);this.ack=structuredClone(f);this.ackAt=performance.now();this.cameraStarted=false;this.orbitWarmed=false;this.clear();if(entering)this.controls?.lookForward(f);}
    document.body.classList.toggle('in-space',!!this.active);el('flight-hud').hidden=!this.active;el('flight-labels').hidden=!this.active;

    if(this.active&&this.pilot?.targetId&&this.travelSelect)this.travelSelect.value=this.pilot.targetId;
  }
  universe(u:Universe){
    this.planets=u.planets;
    const selected=this.travelSelect.value,departure=this.departureSelect.value;
    const ordered=[...u.planets].sort((a,b)=>(a.kind==='hub'?0:a.mine?1:a.claimed?2:3)-(b.kind==='hub'?0:b.mine?1:b.claimed?2:3));
    for(const select of [this.travelSelect,this.departureSelect]){select.replaceChildren(...ordered.map(p=>{const option=document.createElement('option');option.value=p.id;setText(option,`${p.kind==='hub'?'Main planet':p.mine?'My planet':p.claimed?'Neighbour':'Unclaimed'} · ${p.name}`);return option;}));}
    this.travelSelect.value=u.player.trip?.status==='active'?u.player.trip.targetId:selected||u.ownedPlanetId||'hub';
    this.departureSelect.value=this.dialog.open?departure:this.pendingTarget??u.ownedPlanetId??'hub';this.renameButton.hidden=!u.ownedPlanetId;
    if(!this.busy&&this.dialog.open&&this.action==='retarget'&&(u.player.trip?.status!=='active'||u.player.trip.revision!==this.confirmRevision)){this.dialog.close();this.bridge.notice('Your trip changed. Refresh its destination before trying again.');}
    if(this.travelling&&this.routeTrip!==this.tripKey())this.clear();this.updatePreview();
    let changed=false;
    for(const p of this.planets){
      const old=this.bodies.get(p.id);if(old){setText(old.label,p.name,true);if(old.environment!==p.environment||old.radius!==p.radius){if(old.detail)this.disposeOrbit(old.detail);old.detail=null;old.bytes=0;old.environment=p.environment;old.radius=p.radius;old.low.scale.setScalar(bodyRadius(p)/RADIUS);this.lodAt=-Infinity;}continue;}
      const root=new T.Group(),low=new T.Mesh(this.lowGeometry,this.lowMaterials[p.slot%3]);low.scale.setScalar(bodyRadius(p)/RADIUS);root.add(low);root.position.fromArray(p.center);root.visible=false;this.scene.add(root);
      const label=document.createElement('button');label.className='space-label';label.dataset.planetId=p.id;setText(label,p.name,true);label.onclick=()=>this.mark(p.id);el('flight-labels').append(label);this.bodies.set(p.id,{root,low,detail:null,label,lastUsed:0,bytes:0,radius:p.radius,environment:p.environment});changed=true;
    }
    if(changed){if(this.beacons){this.scene.remove(this.beacons);this.beacons.geometry.dispose();(this.beacons.material as T.Material).dispose();}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.planets.flatMap(p=>p.center),3));this.beacons=new T.Points(g,new T.PointsMaterial({color:'#90a9b9',size:2.8,sizeAttenuation:true,transparent:true,opacity:.6}));this.scene.add(this.beacons);this.lodAt=-Infinity;}
  }
  private disposeOrbit(detail:T.Group){if(typeof detail.userData.disposeOwned==='function'){detail.userData.disposeOwned();return;}detail.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms)if(m.userData.ownedResource)m.dispose();}});detail.removeFromParent();}
  private updateLod(now:number){
    if(!this.pilot||now-this.lodAt<250)return;this.lodAt=now;
    const limit=orbitCacheLimit(getQualityProfile().id),{sorted,detailed,wanted}=orbitPlan(this.planets,this.pilot,limit);
    const active=this.visibleDetails=new Set(detailed.map(p=>p.id));this.wantedDetails=new Set(wanted.map(p=>p.id));
    const visible=new Set(sorted.slice(0,ORBIT_VISIBLE_BUDGET).map(p=>p.id));if(this.pilot.targetId&&!visible.has(this.pilot.targetId)){if(visible.size>=ORBIT_VISIBLE_BUDGET)visible.delete([...visible].at(-1)!);visible.add(this.pilot.targetId);}
    this.labelIds=new Set(sorted.slice(0,5).map(p=>p.id));if(this.pilot.targetId)this.labelIds.add(this.pilot.targetId);
    for(const p of this.planets){
      const body=this.bodies.get(p.id)!;body.root.visible=visible.has(p.id);
      if(this.wantedDetails.has(p.id))body.lastUsed=now;
      if(body.detail)body.detail.visible=active.has(p.id);
      body.low.visible=!body.detail||!active.has(p.id);
    }
    this.trimDetails(limit);
    if(!this.detailPreparation){const missing=wanted.filter(p=>!this.bodies.get(p.id)!.detail);if(missing.length)this.prepareDetails(missing,!this.orbitWarmed);else this.orbitWarmed=true;}
    const cached=[...this.bodies.values()].filter(body=>!!body.detail);
    this.bridge.canvas.dataset.orbitDetailed=String(cached.filter(body=>body.detail!.visible).length);this.bridge.canvas.dataset.orbitVisible=String(visible.size);this.bridge.canvas.dataset.orbitTotal=String(this.planets.length);
    this.bridge.canvas.dataset.orbitCached=String(cached.length);this.bridge.canvas.dataset.orbitCacheBytes=String(cached.reduce((sum,b)=>sum+b.bytes,0));this.bridge.canvas.dataset.orbitBuilds=String(this.orbitBuilds);this.bridge.canvas.dataset.orbitCacheLimit=String(limit);
  }
  private trimDetails(limit:number){
    const cached=[...this.bodies.entries()].filter(([,b])=>b.detail).sort(([a,x],[b,y])=>Number(this.wantedDetails.has(a))-Number(this.wantedDetails.has(b))||x.lastUsed-y.lastUsed);
    while(cached.length>limit){const [,body]=cached.shift()!;this.disposeOrbit(body.detail!);body.detail=null;body.bytes=0;body.low.visible=true;}
  }
  private orbitFeedback(blocking:boolean):ReturnType<typeof beginSceneLoading>{
    if(blocking)return beginSceneLoading('Preparing your flight corridor…');
    const root=this.orbitNotice,text=root.querySelector('span')!,progress=root.querySelector('progress')!,retry=root.querySelector('button')!;
    root.hidden=false;retry.hidden=true;
    return {
      update(label,done,total){root.hidden=false;text.textContent=sceneLoadingLabel(label);progress.hidden=false;if(total&&done!==undefined){progress.max=total;progress.value=done;}else progress.removeAttribute('value');},
      finish(){root.hidden=true;},
      fail(message,again){text.textContent=sceneLoadingLabel(message);progress.hidden=true;retry.hidden=false;setText(retry,'Try again');retry.onclick=again;},
    };
  }
  private prepareDetails(planets:PlanetSummary[],blocking:boolean){
    if(!planets.length||!this.active)return;
    const controller=new AbortController(),signal=controller.signal,feedback=this.orbitFeedback(blocking);
    const task=this.detailPreparation={controller,feedback};
    // One bounded first wait. A slower build can continue with real progress
    // while the already-rendered coarse worlds and authoritative hulls remain usable.
    const timer=blocking?setTimeout(()=>{if(this.detailPreparation===task){this.orbitWarmed=true;controller.abort();feedback.finish();}},12000):undefined;
    void(async()=>{
      let pending:T.Group|null=null;
      try{
        await yieldSceneFrame(signal);await yieldSceneFrame(signal);
        for(let i=0;i<planets.length;i++){
          const planet=planets[i],body=this.bodies.get(planet.id)!;
          if(!this.wantedDetails.has(planet.id)||body.detail)continue;
          feedback.update('Preparing nearby worlds…',i,planets.length);
          pending=await orbitalPlanetAsync(planet.slot,planet.environment,bodyRadius(planet),{signal,budgetMs:getQualityProfile().id==='smooth'?3:6,yieldFrame:()=>yieldSceneFrame(signal),
            onGroundProgress:(done,total)=>feedback.update('Preparing the ground…',done,total),
            onProgress:p=>feedback.update('Bringing buildings into view…',p.readyObjects,p.totalObjects)});
          feedback.update('Finishing the view…',i,planets.length);await yieldSceneFrame(signal);
          await this.bridge.renderer.compileAsync(pending,this.camera,this.scene);
          if(signal.aborted||!this.active||this.detailPreparation!==task)throw new DOMException('Loading cancelled.','AbortError');
          if(body.environment!==planet.environment||body.radius!==planet.radius||!this.wantedDetails.has(planet.id)){this.disposeOrbit(pending);pending=null;continue;}
          this.trimDetails(orbitCacheLimit(getQualityProfile().id)-1);
          body.bytes=orbitBufferBytes(pending);pending.visible=this.visibleDetails.has(planet.id);body.low.visible=!pending.visible;body.detail=pending;body.root.add(pending);pending=null;this.orbitBuilds++;
          feedback.update('Preparing nearby worlds…',i+1,planets.length);await yieldSceneFrame(signal);
        }
        if(this.detailPreparation===task){this.orbitWarmed=true;this.detailPreparation=null;this.lodAt=-Infinity;}feedback.finish();
      }catch(error){
        if(pending)this.disposeOrbit(pending);
        if(signal.aborted||this.detailPreparation!==task){feedback.finish();if(this.detailPreparation===task){this.detailPreparation=null;this.lodAt=-Infinity;}return;}
        feedback.fail('Could not finish loading. Your saved world is unchanged.',()=>{controller.abort();feedback.finish();if(this.detailPreparation===task)this.detailPreparation=null;this.lodAt=-Infinity;});
        console.error('Orbit preparation failed',error);
      }finally{if(timer!==undefined)clearTimeout(timer);}
    })();
  }
  private tripKey(){const t=this.bridge.player()?.trip;return t?`${t.id}:${t.revision}`:'';}
  private updatePreview(){const p=this.planets.find(p=>p.id===this.departureSelect.value);if(!p)return;this.preview.style.setProperty('--destination-color',p.kind==='hub'?'#ddc78f':p.mine?'#73ad80':'#8fb6b8');setText(this.preview,`${p.name} · ${p.kind==='hub'?'Public starport':p.mine?'Your saved home':p.claimed?'Visit only · building belongs to its owner':'An unclaimed world to explore'}`);}
  async startTravel(){
    if(!this.pilot||this.busy||!this.bridge.online())return;
    const trip=this.bridge.player()?.trip;
    if(!trip||trip.status!=='active'){this.action='launch';this.openTripDialog();return;}
    const target=this.planets.find(p=>p.id===trip.targetId);if(!target)return;
    this.clear();this.arrivalFailed=false;this.pilot.targetId=target.id;this.travelSelect.value=target.id;this.bridge.progress?.dirty('flight');
    this.route=planFlightRoute(this.pilot.position,target,this.planets);this.routeIndex=0;this.routeTrip=this.tripKey();this.travelling=this.route.length>0;
    this.routeNote=this.travelling?'Flying automatically. Drag to look around; click a planet to change destination.':'No clear route. Skip after preparation, or return to departure.';
  }
  private async finishTrip(){
    const t=this.bridge.player()?.trip;if(!t||t.status!=='active'||this.busy||!this.bridge.online())return;
    this.busy=true;this.clear();this.routeNote='Preparing destination… Arrival waits for server confirmation and scene loading.';
    try{await this.flush();const u=await this.bridge.command('trip/finish',{tripId:t.id,revision:t.revision,visitEpoch:this.bridge.player()?.location?.visitEpoch??0});this.bridge.applyUniverse(u);this.dialog.close();this.arrivalFailed=false;}
    catch(error){this.arrivalFailed=true;this.routeNote='Arrival could not be prepared. Retry arrival or return to departure.';this.bridge.failed(error);}
    finally{this.busy=false;}
  }
  private async returnTrip(){
    const t=this.bridge.player()?.trip;if(!t||t.status!=='active'||this.busy)return;this.busy=true;this.clear();
    try{await this.flush();const u=await this.bridge.command('trip/change',{tripId:t.id,revision:t.revision,action:'return',visitEpoch:this.bridge.player()?.location?.visitEpoch??0});this.bridge.applyUniverse(u);this.busy=false;await this.startTravel();}catch(error){this.bridge.failed(error);}finally{this.busy=false;}
  }
  mark(id:string){
    if(!this.planets.some(p=>p.id===id)||this.busy)return;
    const trip=this.bridge.player()?.trip;
    if(this.active&&trip?.status==='active'){
      this.travelSelect.value=trip.targetId;if(id===trip.targetId)return;this.action='retarget';this.confirmTarget=id;this.confirmRevision=trip.revision;this.departureSelect.hidden=true;this.preview.hidden=true;
      setText(el('flight-title'),'Change destination?');setText(el('flight-detail'),`Fly to ${this.planets.find(p=>p.id===id)!.name}? Your current trip stays unchanged until you confirm.`);setText(el('confirm-flight'),'Change destination');setText(el('cancel-flight'),'Keep destination');this.dialog.showModal();
    }else{this.pendingTarget=id;this.departureSelect.value=id;this.openLaunch();}
  }
  setDesign(design:ShipDesign){this.ship.setDesign(design);el('flight-hud').dataset.shipDesign=this.ship.document;setText(document.querySelector('.flight-ident b')!,design.registration||design.name);setText(document.querySelector('.flight-ident span')!,design.name);}
  openLaunch(){if(this.busy||!this.bridge.player())return;if(!this.active&&!this.bridge.canBoard()){this.bridge.notice('Walk to the boarding gate beside your parked ship.');return;}this.clear();this.bridge.clearGround();this.action='launch';this.openTripDialog();}
  private openTripDialog(){this.requestId=crypto.randomUUID();this.departureSelect.hidden=false;this.preview.hidden=false;setText(el('flight-title'),'Where would you like to go?');setText(el('flight-detail'),'Choose a planet. Takeoff, flight and landing are automatic. You can look around, skip after loading, or return to departure.');setText(el('confirm-flight'),'Depart');setText(el('cancel-flight'),this.active?'Cancel':'Stay here');this.updatePreview();this.dialog.showModal();}
  private nearby(){if(!this.pilot)return null;return [...this.planets].sort((a,b)=>spaceDistance(this.pilot!.position,a.center)-spaceDistance(this.pilot!.position,b.center))[0]??null;}
  private async transition(){
    if(this.busy||!this.bridge.online())return;this.busy=true;el<HTMLButtonElement>('confirm-flight').disabled=true;el<HTMLButtonElement>('cancel-flight').disabled=true;
    try{
      this.clear();if(this.active)await this.flush();else await this.bridge.flushGround();const p=this.bridge.player()!,t=p.trip;
      const body=this.action==='launch'?{targetId:this.departureSelect.value,journey:p.flight.journey,requestId:this.requestId,visitEpoch:p.location?.visitEpoch??0}:{tripId:t?.id,revision:this.confirmRevision,targetId:this.confirmTarget,action:'retarget',visitEpoch:p.location?.visitEpoch??0};
      const u=await this.bridge.command(this.action==='launch'?'trip/start':'trip/change',body);this.bridge.applyUniverse(u);this.dialog.close();this.busy=false;await this.startTravel();
    }catch(error){this.bridge.failed(error);}finally{this.busy=false;el<HTMLButtonElement>('confirm-flight').disabled=false;el<HTMLButtonElement>('cancel-flight').disabled=false;}
  }
  private openRename(){
    const p=this.planets.find(p=>p.mine);if(!p)return;el<HTMLDialogElement>('menu-dialog').close();el<HTMLDialogElement>('star-map').close();
    const dialog=document.createElement('dialog'),title=document.createElement('h2'),input=document.createElement('input'),save=document.createElement('button'),cancel=document.createElement('button'),status=document.createElement('p');
    dialog.id='rename-dialog';title.id='rename-title';dialog.setAttribute('aria-labelledby',title.id);setText(title,'Name my planet');input.id='planet-name-input';input.setAttribute('aria-label','Planet name');input.maxLength=64;input.value=p.name;setText(save,'Save name');save.id='save-planet-name';setText(cancel,'Cancel');cancel.onclick=()=>dialog.close();status.setAttribute('role','status');
    save.onclick=async()=>{save.disabled=true;try{const u=await this.bridge.command('planets/rename',{planetId:p.id,name:input.value});this.bridge.applyUniverse(u);dialog.close();this.bridge.notice('Planet name saved.');}catch(error){setText(status,error instanceof Error?error.message:'Could not save. Try again.');}finally{save.disabled=false;}};
    dialog.append(title,input,status,save,cancel);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();input.focus();
  }

  async flush():Promise<void>{
    if(this.saving){await this.saving;return this.flush();}
    if(!this.active||!this.bridge.online()||!this.pilot||!this.ack)return;
    const f={...structuredClone(this.pilot),sequence:this.ack.sequence+1};
    if(JSON.stringify({...f,sequence:0})===JSON.stringify({...this.ack,sequence:0})){this.bridge.progress?.reset('flight');return;}
    this.saveAt=performance.now();const ticket=this.bridge.progress?.begin('flight');
    this.saving=(async()=>{try{
      const delay=flightCheckpointDelay(this.ack!,f,performance.now()-this.ackAt);
      if(delay>0){this.checkpointPacing=true;await new Promise<void>(resolve=>setTimeout(resolve,delay));this.checkpointPacing=false;}
      const {mode: _mode,...body}=f;void _mode;const saved=await this.bridge.checkpoint(body);this.ack=structuredClone(saved.flight);this.ackAt=performance.now();if(ticket)this.bridge.progress?.acknowledge(ticket);if(this.pilot)this.pilot.sequence=saved.flight.sequence;this.bridge.apply(saved);
    }catch(error){this.clear();this.bridge.failed(error);}finally{this.checkpointPacing=false;this.saving=null;}})();await this.saving;
  }
  private holdSpeedPeak(input:{thrust:boolean;brake:boolean}){
    if(this.speedPeakPending)return true;
    if(!this.pilot||!this.ack||input.thrust&&!input.brake||this.pilot.speed<=this.ack.speed+.01)return false;
    const pending=this.flush();this.speedPeakPending=pending;void pending.finally(()=>{if(this.speedPeakPending===pending)this.speedPeakPending=null;});return true;
  }
  frame(dt:number,now:number,renderer:T.WebGLRenderer){
    if(!this.pilot)return;
    let paused=this.paused||this.checkpointPacing||(this.saving!==null&&now-this.saveAt>1100);
    if(!paused&&this.travelling&&this.route[this.routeIndex]&&spaceDistance(this.pilot.position,this.route[this.routeIndex])<1.5&&this.pilot.speed<.1){this.routeIndex++;if(this.routeIndex>=this.route.length){this.travelling=false;if(!paused)void this.finishTrip();}}
    if(this.paused)this.controls.clear();
    const input=this.travelling&&this.route[this.routeIndex]?flightRouteInput(this.pilot,this.route[this.routeIndex],true):{thrust:false,brake:true,turn:0,pitch:0};
    if(!paused)paused=this.holdSpeedPeak(input);
    this.steering.lerp(new T.Vector2(input.turn,input.pitch),1-Math.exp(-10*dt));
    if(!paused){
      const before=this.pilot,next=flightStep(before,{...input,turn:this.steering.x,pitch:this.steering.y},dt,this.planets);
      this.pilot=next;
      if(next.position.some((v,i)=>v!==before.position[i])||next.yaw!==before.yaw||next.pitch!==before.pitch||next.speed!==before.speed)this.bridge.progress?.dirty('flight');
    }
    const f=this.pilot,pos=new T.Vector3(...f.position),front=new T.Vector3(...forward(f.yaw,f.pitch));
    const right=new T.Vector3().crossVectors(front,new T.Vector3(0,1,0)).normalize(),up=new T.Vector3().crossVectors(right,front).normalize();
    this.turn.setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,front.clone().negate()));this.ship.root.position.copy(pos);this.ship.root.quaternion.copy(this.turn);this.bank+=(this.steering.x*-.28-this.bank)*(1-Math.exp(-5*dt));this.ship.root.rotateZ(this.bank);
    this.enginePower+=((input.thrust&&!paused?1:input.brake?.04:.12)-this.enginePower)*(1-Math.exp(-6*dt));this.ship.animate(this.enginePower,input.brake);
    const view=flightCameraPose(f,this.controls.orbit,this.planets),behind=view.position;
    this.ship.root.scale.setScalar(1);
    this.look.position.copy(behind);this.look.up.copy(view.up);this.look.lookAt(view.target);
    if(!this.cameraStarted){this.camera.position.copy(behind);this.camera.quaternion.copy(this.look.quaternion);this.cameraStarted=true;}
    this.camera.up.copy(view.up);this.camera.position.copy(clipFlightEye(pos,this.camera.position.clone().lerp(behind,this.reduced?1:1-Math.exp(-10*dt)),this.planets));this.camera.quaternion.slerp(this.look.quaternion,this.reduced?1:1-Math.exp(-10*dt));
    this.ship.root.visible=true;this.camera.aspect=innerWidth/innerHeight;if(innerWidth<700)this.camera.setViewOffset(innerWidth,innerHeight,0,innerHeight*.12,innerWidth,innerHeight);else this.camera.clearViewOffset();this.camera.updateProjectionMatrix();this.updateLod(now);this.bridge.canvas.dataset.railVisible='0';
    this.bridge.canvas.dataset.flightLook=JSON.stringify({mode:'free-orbit-3d',orbit:{...this.controls.orbit},eye:this.camera.position.toArray(),forward:this.camera.getWorldDirection(new T.Vector3()).toArray(),up:this.camera.up.toArray()});
    for(const body of this.bodies.values())if(body.root.visible&&body.detail?.userData.updateTown)body.detail.userData.updateTown(this.camera.position.clone().sub(body.root.position));
    const drawingTarget=this.nearby();this.drawing.render(drawingTarget?new T.Vector3(...drawingTarget.center):pos,true);
    if(now-this.hudAt<80)return;this.hudAt=now;
    // Render-enabled roots are not proof of on-screen worlds. Expose the
    // camera-frustum intersection separately for browser regression evidence.
    this.camera.updateMatrixWorld();
    const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse));
    const inView=this.planets.filter(p=>this.bodies.get(p.id)?.root.visible&&frustum.intersectsSphere(new T.Sphere(new T.Vector3(...p.center),bodyRadius(p))));
    this.bridge.canvas.dataset.orbitInView=JSON.stringify(inView.map(p=>p.id));
    const shipScreen=pos.clone().project(this.camera);
    this.bridge.canvas.dataset.shipScreen=JSON.stringify(shipScreen.toArray());
    const shipMarker=el('ship-marker');shipMarker.style.left=`${(shipScreen.x*.5+.5)*100}%`;shipMarker.style.top=`${(-shipScreen.y*.5+.5)*100}%`;shipMarker.hidden=!this.ship.root.visible||shipScreen.z>1||Math.abs(shipScreen.x)>1||Math.abs(shipScreen.y)>1;
    setText(el('ship-speed'), f.speed.toFixed(0).padStart(2,'0'));setText(el('flight-throttle'), paused?'STANDBY':input.brake?'BRAKING':input.thrust?'MAIN DRIVE':'COAST');const heading=shipHeading(f);setText(el('flight-heading'), `Ship heading ${heading.degrees}° · automatic height`);el('flight-hud').dataset.yaw=String(f.yaw);el('flight-hud').dataset.pitch=String(f.pitch);el('velocity-bar').style.width=`${f.speed/36*100}%`;document.body.classList.toggle('ship-braking',input.brake);el('flight-hud').dataset.speed=f.speed.toFixed(3);el('flight-hud').dataset.position=JSON.stringify(f.position);
    const closest=this.nearby();if(closest)setText(el('location-chip'), regionFor(closest.slot).name.toUpperCase()+' / FLIGHT');const distance=closest?spaceDistance(f.position,closest.center):Infinity;
    setText(el('flight-altitude'), `${Math.max(0,distance-(closest?bodyRadius(closest):RADIUS)).toFixed(0)} m above ${closest?.name??'the nearest world'}`);
    const target=this.planets.find(p=>p.id===f.targetId)??closest;
    if(target){
      const b=bearing(f.position,target.center),yaw=wrapAngle(b.yaw-f.yaw),pitch=b.pitch-f.pitch,d=spaceDistance(f.position,target.center);
      setText(el('course-name'), target.name, true);setText(el('course-distance'), `${regionFor(target.slot).name} · ${Math.round(d)} m · ${target.kind==='hub'?'Main planet':target.mine?'Your world':target.claimed?'Neighbour':'Unclaimed'}`);
      setText(el('course-heading'),this.routeNote);
      el('flight-hud').dataset.yawError=String(yaw);el('flight-hud').dataset.pitchError=String(pitch);el('flight-hud').dataset.distance=String(d);el('flight-hud').dataset.target=target.id;
      const indicator=flightIndicator(this.camera,new T.Vector3(...target.center)),marker=el('course-marker');marker.style.left=`${(indicator.x*.5+.5)*100}%`;marker.style.top=`${(-indicator.y*.5+.5)*100}%`;marker.classList.toggle('behind',indicator.behind);marker.dataset.direction=indicator.visible?'visible':indicator.behind?'behind':'offscreen';setText(marker,indicator.visible?'◇':indicator.behind?'↩':'➤');marker.style.transform=`translate(-50%,-50%) rotate(${indicator.visible||indicator.behind?0:indicator.angle-90}deg)`;
      const nose=flightIndicator(this.camera,pos.clone().addScaledVector(front,70));this.noseMarker.style.left=`${(nose.x*.5+.5)*100}%`;this.noseMarker.style.top=`${(-nose.y*.5+.5)*100}%`;setText(this.noseMarker,nose.behind?'Ship heading ↩':'Ship heading ▲');
      setText(el('course-heading'),this.travelling?'Automatic journey in progress':indicator.behind?'Target behind the view · drag to look around':indicator.visible?'Destination in view':'Target outside the view · follow the edge arrow');

    }
    for(const p of this.planets){const label=this.bodies.get(p.id)!.label;const point=new T.Vector3(...p.center).add(new T.Vector3(0,bodyRadius(p)+3,0)).project(this.camera);label.hidden=!this.labelIds.has(p.id)||point.z>1||Math.abs(point.x)>.92||Math.abs(point.y)>.8;label.style.left=`${(point.x*.5+.5)*100}%`;label.style.top=`${(-point.y*.5+.5)*100}%`;label.classList.toggle('selected',p.id===target?.id);}
    setText(this.travelStatus,this.routeNote);el('flight-hud').dataset.driving=this.travelling?'automatic':'paused';el('flight-hud').dataset.travelling=String(this.travelling);
    const trip=this.bridge.player()?.trip;this.travelButton.hidden=this.travelling;setText(this.travelButton,trip?.status==='active'?'Resume journey':'Choose destination');this.travelButton.disabled=this.busy||!this.bridge.online();this.travelSelect.disabled=this.busy;
    this.skipButton.disabled=this.busy||trip?.status!=='active'||!this.bridge.online();setText(this.skipButton,this.arrivalFailed?'Retry arrival':'Skip journey');this.returnButton.disabled=this.skipButton.disabled;
    this.bridge.canvas.dataset.drawCalls=String(renderer.info.render.calls);this.bridge.canvas.dataset.triangles=String(renderer.info.render.triangles);
  }
}
