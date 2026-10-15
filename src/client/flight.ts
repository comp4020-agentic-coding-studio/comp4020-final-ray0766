import { setText } from './i18n.ts';
import * as T from 'three';
import { ORBIT_DETAIL_BUDGET,ORBIT_VISIBLE_BUDGET,regionFor } from '../shared/regions.ts';
import { makeShip } from './ship-model.ts';
import type { ShipDesign } from '../assets/claude-geometry/ship/design.ts';
import { orbitalPlanetAsync, configureSpace } from './space-art.ts';
import {beginSceneLoading,sceneLoadingActive,yieldSceneFrame} from './loading-state.ts';
import { bearing, flightStep, forward, LAND_SPEED, spaceDistance, wrapAngle } from '../shared/flight.ts';
import type { FlightState } from '../shared/flight.ts';
import type { PlanetSummary, Universe } from '../shared/planets.ts';
import type { PlayerState } from '../shared/world.ts';
import { bodyRadius, landingRadius } from '../shared/world-size.ts';
import { RADIUS } from '../shared/world.ts';
import {createVillageDrawing} from './village-drawing.ts';
import {applyArtMaterial} from './art-profile.ts';
import { needsFlightDetour } from './flight-guidance.ts';
import type { SaveProgress } from './save-progress.ts';
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
  private ship=makeShip();private bodies=new Map<string,{root:T.Group,low:T.Mesh,detail:T.Group|null,label:HTMLButtonElement,radius?:number,environment?:string|null}>();
  private lowGeometry=new T.IcosahedronGeometry(RADIUS,2);private lowMaterials=['#5ea476','#91b7aa','#e0d3ab'].map(color=>applyArtMaterial(new T.MeshStandardMaterial({color,roughness:1})));
  private drawing:ReturnType<typeof createVillageDrawing>;
  private detailPreparation:{controller:AbortController;feedback:ReturnType<typeof beginSceneLoading>}|null=null;
  private beacons:T.Points|null=null;private lodAt=-Infinity;private labelIds=new Set<string>();
  private keys=new Set<string>();private stick=new T.Vector2();private held={thrust:false,brake:false};
  private ack:FlightState|null=null;private saving:Promise<void>|null=null;private saveAt=0;private cameraStarted=false;private hudAt=0;
  private dialog=el<HTMLDialogElement>('flight-dialog');private action:'launch'|'land'='launch';private landingId:string|null=null;private pendingTarget:string|null=null;
  private look=new T.PerspectiveCamera();private turn=new T.Quaternion();private steering=new T.Vector2();private enginePower=0;private bank=0;private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private bridge:Bridge){
    configureSpace(this.scene,bridge.renderer);this.scene.add(this.ship.root);this.drawing=createVillageDrawing(bridge.renderer,this.scene,this.camera,true);
    el('board-ship').onclick=()=>this.openLaunch();el('land-ship').onclick=()=>this.openLanding();
    el('cancel-flight').onclick=()=>this.dialog.close();el('confirm-flight').onclick=()=>void this.transition();
    this.dialog.addEventListener('close',()=>this.clear());this.dialog.addEventListener('cancel',e=>{if(this.busy)e.preventDefault();});
    window.addEventListener('keydown',e=>{
      if(!this.active||this.paused||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))return;
      const k=e.key.toLowerCase();if(['w','s','a','d',' ','arrowleft','arrowright','arrowup','arrowdown'].includes(k)){e.preventDefault();this.keys.add(k);}
      if(k==='l'&&!e.repeat)this.openLanding();
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>this.clear());
    document.addEventListener('visibilitychange',()=>{this.clear();if(document.hidden)void this.flush();});
    const stick=el('flight-stick');let pointer:number|null=null;
    const drag=(e:PointerEvent)=>{const r=stick.getBoundingClientRect();this.stick.set((e.clientX-r.left-r.width/2)/38,-(e.clientY-r.top-r.height/2)/38).clampLength(0,1);el('flight-knob').style.transform=`translate(${this.stick.x*31}px,${-this.stick.y*31}px)`;};
    stick.onpointerdown=e=>{pointer=e.pointerId;stick.setPointerCapture(e.pointerId);drag(e);};stick.onpointermove=e=>{if(pointer===e.pointerId)drag(e);};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(name,()=>{pointer=null;this.stick.set(0,0);el('flight-knob').style.transform='';});
    for(const control of ['thrust','brake'] as const){const button=el('ship-'+control);button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);this.held[control]=true;};for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>this.held[control]=false);}
    let dragStart:{x:number;y:number}|null=null;
    bridge.canvas.addEventListener('pointerdown',e=>{if(this.active&&!this.paused){dragStart={x:e.clientX,y:e.clientY};bridge.canvas.setPointerCapture(e.pointerId);}});
    bridge.canvas.addEventListener('pointermove',e=>{if(dragStart)this.stick.set((e.clientX-dragStart.x)/100,-(e.clientY-dragStart.y)/100).clampLength(0,1);});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])bridge.canvas.addEventListener(name,()=>{dragStart=null;this.stick.set(0,0);});
    window.addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();});
    setInterval(()=>{if(this.active&&bridge.online()&&!this.busy&&!document.hidden)void this.flush();},350);
  }
  get active(){return this.pilot?.mode==='space';}
  private get paused(){return sceneLoadingActive()||this.presentation||this.busy||!this.bridge.online()||document.hidden||!!document.querySelector('dialog[open]');}
  clear(){this.keys.clear();this.stick.set(0,0);this.held.thrust=false;this.held.brake=false;this.steering.set(0,0);el('flight-knob').style.transform='';}
  receive(f:FlightState,force=false){
    if(f.mode!=='space'&&this.detailPreparation){this.detailPreparation.controller.abort();this.detailPreparation.feedback.finish();this.detailPreparation=null;}
    if(!this.pilot||force||f.mode!==this.pilot.mode||f.journey!==this.pilot.journey){this.bridge.progress?.reset('flight');this.pilot=structuredClone(f);this.ack=structuredClone(f);this.cameraStarted=false;this.clear();}
    document.body.classList.toggle('in-space',!!this.active);el('flight-hud').hidden=!this.active;el('flight-labels').hidden=!this.active;
    if(this.pendingTarget&&this.active){this.pilot!.targetId=this.pendingTarget;this.pendingTarget=null;this.bridge.progress?.dirty('flight');}
  }
  universe(u:Universe){
    this.planets=u.planets;
    let changed=false;
    for(const p of u.planets){
      const old=this.bodies.get(p.id);if(old){setText(old.label, p.name, true);if(old.environment!==p.environment||old.radius!==p.radius){if(old.detail)this.disposeOrbit(old.detail);old.detail=null;old.environment=p.environment;old.radius=p.radius;old.low.scale.setScalar(bodyRadius(p)/RADIUS);this.lodAt=-Infinity;}continue;}
      const root=new T.Group(),low=new T.Mesh(this.lowGeometry,this.lowMaterials[p.slot%3]);low.scale.setScalar(bodyRadius(p)/RADIUS);root.add(low);root.position.fromArray(p.center);root.visible=false;this.scene.add(root);
      const label=document.createElement('button');label.className='space-label';label.dataset.planetId=p.id;setText(label, p.name, true);label.onclick=()=>this.mark(p.id);el('flight-labels').append(label);this.bodies.set(p.id,{root,low,detail:null,label,radius:p.radius,environment:p.environment});changed=true;
    }
    if(changed){
      if(this.beacons){this.scene.remove(this.beacons);this.beacons.geometry.dispose();(this.beacons.material as T.Material).dispose();}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.planets.flatMap(p=>p.center),3));
      this.beacons=new T.Points(g,new T.PointsMaterial({color:'#90a9b9',size:2.8,sizeAttenuation:true,transparent:true,opacity:.6}));this.scene.add(this.beacons);this.lodAt=-Infinity;
    }
  }
  private disposeOrbit(detail:T.Group){if(typeof detail.userData.disposeOwned==='function'){detail.userData.disposeOwned();return;}detail.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms)if(m.userData.ownedResource)m.dispose();}});detail.removeFromParent();}
  private updateLod(now:number){
    if(!this.pilot||now-this.lodAt<250)return;this.lodAt=now;
    const sorted=[...this.planets].sort((a,b)=>spaceDistance(this.pilot!.position,a.center)-spaceDistance(this.pilot!.position,b.center));
    const detailed=new Set(sorted.filter(p=>spaceDistance(this.pilot!.position,p.center)<170).slice(0,ORBIT_DETAIL_BUDGET).map(p=>p.id));
    const visible=new Set(sorted.filter(p=>spaceDistance(this.pilot!.position,p.center)<550).slice(0,ORBIT_VISIBLE_BUDGET).map(p=>p.id));
    this.labelIds=new Set(sorted.filter(p=>spaceDistance(this.pilot!.position,p.center)<400).slice(0,5).map(p=>p.id));if(this.pilot.targetId)this.labelIds.add(this.pilot.targetId);
    for(const p of this.planets){
      const body=this.bodies.get(p.id)!;body.root.visible=visible.has(p.id);body.low.visible=!detailed.has(p.id);
      if(!detailed.has(p.id)&&body.detail){this.disposeOrbit(body.detail);body.detail=null;}
      body.low.visible=!body.detail;
    }
    if(!this.detailPreparation)this.prepareDetails(sorted.filter(p=>detailed.has(p.id)&&!this.bodies.get(p.id)!.detail));
    this.bridge.canvas.dataset.orbitDetailed=String([...this.bodies.values()].filter(body=>!!body.detail).length);this.bridge.canvas.dataset.orbitVisible=String(visible.size);this.bridge.canvas.dataset.orbitTotal=String(this.planets.length);
  }

  private prepareDetails(planets:PlanetSummary[]){
    if(!planets.length||!this.active)return;
    const controller=new AbortController(),signal=controller.signal,feedback=beginSceneLoading('Preparing nearby worlds…');
    const task=this.detailPreparation={controller,feedback};this.clear();
    void(async()=>{
      let pending:T.Group|null=null;
      try{
        await yieldSceneFrame(signal);await yieldSceneFrame(signal);
        for(let i=0;i<planets.length;i++){
          const planet=planets[i],body=this.bodies.get(planet.id)!;
          feedback.update('Preparing the view…',i,planets.length);
          pending=await orbitalPlanetAsync(planet.slot,planet.environment,bodyRadius(planet),{signal,budgetMs:6,yieldFrame:()=>yieldSceneFrame(signal),
            onGroundProgress:(done,total)=>feedback.update('Preparing the ground…',done,total),
            onProgress:p=>feedback.update('Bringing buildings into view…',p.readyObjects,p.totalObjects)});
          feedback.update('Finishing the view…',i,planets.length);await yieldSceneFrame(signal);
          await this.bridge.renderer.compileAsync(pending,this.camera,this.scene);
          if(signal.aborted||!this.active||this.detailPreparation!==task)throw new DOMException('Loading cancelled.','AbortError');
          // A universe poll may have changed the environment while preparing.
          if(body.environment!==planet.environment||body.radius!==planet.radius){this.disposeOrbit(pending);pending=null;continue;}
          body.detail=pending;body.root.add(pending);pending=null;body.low.visible=false;
          feedback.update('Preparing the view…',i+1,planets.length);await yieldSceneFrame(signal);
        }
        if(this.detailPreparation===task){this.detailPreparation=null;this.lodAt=-Infinity;}feedback.finish();
      }catch(error){
        if(pending)this.disposeOrbit(pending);
        if(signal.aborted||this.detailPreparation!==task){feedback.finish();return;}
        feedback.fail('Could not finish loading. Your saved world is unchanged.',()=>{controller.abort();feedback.finish();if(this.detailPreparation===task)this.detailPreparation=null;this.lodAt=-Infinity;});
        console.error('Orbit preparation failed',error);
      }
    })();
  }

  mark(id:string){
    if(this.active){if(this.pilot!.targetId!==id){this.pilot!.targetId=id;this.bridge.progress?.dirty('flight');}}else this.pendingTarget=id;
    this.clear();this.bridge.notice(this.active?'Bearing marked. Turn toward the diamond and fly.':'Bearing marked. Board your ship when you are ready.');
  }
  setDesign(design: ShipDesign) {
    this.ship.setDesign(design);
    el('flight-hud').dataset.shipDesign = this.ship.document;
    setText(document.querySelector('.flight-ident b')!, design.registration || design.name);
    setText(document.querySelector('.flight-ident span')!, design.name);
  }
  openLaunch(){if(this.active||this.busy||!this.bridge.player())return;if(!this.bridge.canBoard()){this.bridge.notice('Walk to the boarding gate beside your parked ship.');return;}this.clear();this.bridge.clearGround();this.action='launch';setText(el('flight-title'), 'Boarding clearance');setText(el('flight-detail'), 'Your ship is docked at this gate. Confirm boarding and departure, or stay on the surface. W to thrust, A / D to turn, ↑ / ↓ to climb or dive, S to brake.');setText(el('confirm-flight'), 'Launch ship');this.dialog.showModal();}
  private nearby(){if(!this.pilot)return null;return [...this.planets].sort((a,b)=>spaceDistance(this.pilot!.position,a.center)-spaceDistance(this.pilot!.position,b.center))[0]??null;}
  private openLanding(){const p=this.nearby();if(!p||!this.pilot||spaceDistance(this.pilot.position,p.center)>landingRadius(p)||this.pilot.speed>LAND_SPEED||this.busy)return;this.clear();this.action='land';this.landingId=p.id;setText(el('flight-title'), `Land on ${p.name}?`);setText(el('flight-detail'), p.kind==='hub'?'Return to the public starport boarding gate. Explore the streets, meet visitors or try the optional delivery.':p.mine?'Your own little world. Your saved buildings are waiting. You will disembark beside your return beacon.':p.claimed?'A neighbour’s world. You can walk and look around; only its owner can build.':'An empty world to explore. You can make it your home if you do not already own one.');setText(el('confirm-flight'), 'Land and explore');this.dialog.showModal();}
  private async transition(){
    if(this.busy||!this.bridge.online())return;this.busy=true;this.clear();el<HTMLButtonElement>('confirm-flight').disabled=true;el<HTMLButtonElement>('cancel-flight').disabled=true;
    try{
      if(this.action==='launch')await this.bridge.flushGround();else await this.flush();
      const p=this.bridge.player()!;const u=await this.bridge.command(this.action==='launch'?'flight/takeoff':'flight/land',{planetId:this.action==='launch'?p.planetId:this.landingId,journey:p.flight.journey});
      this.bridge.applyUniverse(u);this.dialog.close();this.bridge.notice(this.action==='launch'?(this.presentation?'Departure clearance granted · Sunseed Harbour':'You have the controls. Fly toward a world, brake, then land.'):'Feet on a new little world. Your journey is saved.');
    }catch(error){this.bridge.failed(error);}finally{this.busy=false;el<HTMLButtonElement>('confirm-flight').disabled=false;el<HTMLButtonElement>('cancel-flight').disabled=false;}
  }
  async flush():Promise<void>{
    if(this.saving){await this.saving;return this.flush();}
    if(!this.active||!this.bridge.online()||!this.pilot||!this.ack)return;
    const f={...structuredClone(this.pilot),sequence:this.ack.sequence+1};
    if(JSON.stringify({...f,sequence:0})===JSON.stringify({...this.ack,sequence:0})){this.bridge.progress?.reset('flight');return;}
    this.saveAt=performance.now();
    const ticket=this.bridge.progress?.begin('flight');
    this.saving=(async()=>{try{const {mode: _mode,...body}=f;void _mode;const saved=await this.bridge.checkpoint(body);this.ack=structuredClone(saved.flight);if(ticket)this.bridge.progress?.acknowledge(ticket);if(this.pilot)this.pilot.sequence=saved.flight.sequence;this.bridge.apply(saved);}catch(error){this.clear();this.bridge.failed(error);}finally{this.saving=null;}})();await this.saving;
  }
  frame(dt:number,now:number,renderer:T.WebGLRenderer){
    if(!this.pilot)return;
    const paused=this.paused||(this.saving!==null&&now-this.saveAt>1100);
    const input={thrust:this.held.thrust||this.keys.has('w'),brake:this.held.brake||this.keys.has('s')||this.keys.has(' '),turn:this.stick.x+Number(this.keys.has('d')||this.keys.has('arrowright'))-Number(this.keys.has('a')||this.keys.has('arrowleft')),pitch:this.stick.y+Number(this.keys.has('arrowup'))-Number(this.keys.has('arrowdown'))};
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
    const cameraRange=innerWidth<600?16.2:10.5;const behind=pos.clone().addScaledVector(front,-cameraRange-f.speed*.045).addScaledVector(up,4.3).addScaledVector(right,innerWidth<600?.45:1.35);
    this.look.position.copy(behind);this.look.up.copy(up);this.look.lookAt(pos.clone().addScaledVector(front,13));
    if(!this.cameraStarted){this.camera.position.copy(behind);this.camera.quaternion.copy(this.look.quaternion);this.cameraStarted=true;}
    this.camera.up.copy(up);this.camera.position.lerp(behind,this.reduced?1:1-Math.exp(-7*dt));this.camera.quaternion.slerp(this.look.quaternion,this.reduced?1:1-Math.exp(-6*dt));
    this.camera.fov+=(52+(this.reduced?0:f.speed*.13)-this.camera.fov)*(1-Math.exp(-3*dt));this.camera.updateProjectionMatrix();this.updateLod(now);
    for(const body of this.bodies.values())if(body.root.visible&&body.detail?.userData.updateTown)body.detail.userData.updateTown(this.camera.position.clone().sub(body.root.position));
    const drawingTarget=this.nearby();this.drawing.render(drawingTarget?new T.Vector3(...drawingTarget.center):pos,true);
    if(now-this.hudAt<80)return;this.hudAt=now;
    setText(el('ship-speed'), f.speed.toFixed(0).padStart(2,'0'));setText(el('flight-throttle'), paused?'STANDBY':input.brake?'BRAKING':input.thrust?'MAIN DRIVE':'COAST');setText(el('flight-heading'), `HDG ${Math.round((f.yaw*180/Math.PI+360)%360).toString().padStart(3,'0')}°  /  PITCH ${Math.round(f.pitch*180/Math.PI)}°`);el('velocity-bar').style.width=`${f.speed/36*100}%`;document.body.classList.toggle('ship-braking',input.brake);el('flight-hud').dataset.speed=f.speed.toFixed(3);el('flight-hud').dataset.position=JSON.stringify(f.position);
    const closest=this.nearby();if(closest)setText(el('location-chip'), regionFor(closest.slot).name.toUpperCase()+' / FLIGHT');const distance=closest?spaceDistance(f.position,closest.center):Infinity;const landing=distance<=(closest?landingRadius(closest):0)&&f.speed<=LAND_SPEED;
    el<HTMLButtonElement>('land-ship').disabled=!landing||this.busy||!this.bridge.online();setText(el('land-ship'), landing?`Land · ${closest!.name}`:distance<=(closest?landingRadius(closest):0)?'Brake to land':'Approach a world to land');
    setText(el('flight-altitude'), `${Math.max(0,distance-(closest?bodyRadius(closest):RADIUS)).toFixed(0)} m above ${closest?.name??'the nearest world'}`);
    const target=this.planets.find(p=>p.id===f.targetId)??closest;
    if(target){
      const b=bearing(f.position,target.center),yaw=wrapAngle(b.yaw-f.yaw),pitch=b.pitch-f.pitch,d=spaceDistance(f.position,target.center);
      setText(el('course-name'), target.name, true);setText(el('course-distance'), `${regionFor(target.slot).name} · ${Math.round(d)} m · ${target.mine?'Your world':target.claimed?'Neighbour':'Unclaimed'}`);
      setText(el('course-heading'), Math.abs(yaw)<.06&&Math.abs(pitch)<.06?'On course · thrust forward':`${Math.abs(yaw)<.06?'Ahead':yaw>0?'Turn right →':'← Turn left'}${Math.abs(pitch)>.06?pitch>0?' · nose up ↑':' · nose down ↓':''}`);
      if(closest&&needsFlightDetour(f.position,f.speed,closest,target))setText(el('course-heading'), 'World ahead · turn away, then fly around it');
      el('flight-hud').dataset.yawError=String(yaw);el('flight-hud').dataset.pitchError=String(pitch);el('flight-hud').dataset.distance=String(d);el('flight-hud').dataset.target=target.id;
      const p=new T.Vector3(...target.center).project(this.camera);el('course-marker').style.left=`${Math.max(7,Math.min(93,(p.x*.5+.5)*100))}%`;el('course-marker').style.top=`${Math.max(26,Math.min(70,(-p.y*.5+.5)*100))}%`;el('course-marker').classList.toggle('behind',p.z>1||Math.abs(yaw)>1.5);
    }
    for(const p of this.planets){const label=this.bodies.get(p.id)!.label;const point=new T.Vector3(...p.center).add(new T.Vector3(0,bodyRadius(p)+3,0)).project(this.camera);label.hidden=!this.labelIds.has(p.id)||point.z>1||Math.abs(point.x)>.92||Math.abs(point.y)>.8||spaceDistance(f.position,p.center)>400;label.style.left=`${(point.x*.5+.5)*100}%`;label.style.top=`${(-point.y*.5+.5)*100}%`;label.classList.toggle('selected',p.id===target?.id);}
    this.bridge.canvas.dataset.drawCalls=String(renderer.info.render.calls);this.bridge.canvas.dataset.triangles=String(renderer.info.render.triangles);
  }
}
