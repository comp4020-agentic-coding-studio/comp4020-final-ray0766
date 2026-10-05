import * as T from 'three';
import { CATALOGUE, MAX_OBJECTS, placementProblem } from '../shared/planets.ts';
import type { BuildKind, Universe } from '../shared/planets.ts';
import type { PlayerState, Vec3 } from '../shared/world.ts';
import { builtObject, disposeGeometry } from './build-art.ts';
import { surfacePoint } from './terrain.ts';
import type { Obstacle } from './scene.ts';
const el = <E extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as E;
interface Bridge {
  canvas: HTMLCanvasElement; camera: T.Camera; scene: T.Scene;
  ground: () => T.Mesh; applyPlayer: (p:PlayerState) => boolean;
  obstacles: (blocks:Obstacle[]) => void; pause: (building:boolean) => void;
  read: () => Promise<Universe>; write: (route:string, body:unknown) => Promise<Universe>;
  flush: () => Promise<void>; notice: (text:string) => void;
}
type Draft = { id: string; kind: BuildKind; position: Vec3 | null; rotation: number; version?: number };
export class Colony {
  universe: Universe | null = null;
  building = false; syncing = true; busy = false;
  private map = el<HTMLDialogElement>('star-map');
  private layer = new T.Group(); private ghost: T.Group | null = null;
  private objects = new Map<string,T.Group>(); private draft: Draft | null = null;
  private placing = false; private selected: string | null = null;
  private painted = ''; private cards = ''; private pointer: {x:number;y:number} | null = null;
  private ray = new T.Raycaster(); private pollBusy = false;
  constructor(private bridge: Bridge) {
    bridge.scene.add(this.layer);
    el('open-map').onclick=()=>{bridge.pause(this.building);this.map.showModal();void this.poll();};
    el('find-planet').onclick=()=>this.map.showModal();
    el('close-map').onclick=()=>this.map.close();
    el('my-planet').onclick=()=>{if(this.universe?.ownedPlanetId)void this.visit(this.universe.ownedPlanetId);};
    el('claim-planet').onclick=()=>void this.claim();
    el('build-mode').onclick=()=>this.setBuilding(!this.building);
    el('finish-building').onclick=()=>this.setBuilding(false);
    el('rotate-object').onclick=()=>{if(this.draft){this.draft.rotation=(this.draft.rotation+Math.PI/4)%(Math.PI*2);this.preview();this.editor();}};
    el('move-object').onclick=()=>{this.placing=true;this.editor();};
    el('cancel-object').onclick=()=>{this.clearDraft();this.editor();};
    el('save-object').onclick=()=>void this.save();
    el('remove-object').onclick=()=>void this.remove();
    el<HTMLSelectElement>('built-list').onchange=()=>this.select(el<HTMLSelectElement>('built-list').value);
    for(const kind of Object.keys(CATALOGUE) as BuildKind[]) {
      const button=document.createElement('button');button.className='catalogue-item';button.dataset.kind=kind;button.setAttribute('aria-label',`Add ${CATALOGUE[kind].name.toLowerCase()}`);
      const icon=document.createElement('span');icon.textContent=CATALOGUE[kind].icon;const name=document.createElement('strong');name.textContent=CATALOGUE[kind].name;
      button.append(icon,name);button.onclick=()=>{if(this.busy)return;this.clearDraft();this.draft={id:crypto.randomUUID(),kind,position:null,rotation:0};this.placing=true;this.editor();};el('catalogue').append(button);
    }
    bridge.canvas.addEventListener('pointerdown',e=>{if(this.building)this.pointer={x:e.clientX,y:e.clientY};});
    bridge.canvas.addEventListener('pointerup',e=>{
      if(!this.building||this.busy||!this.pointer||Math.hypot(e.clientX-this.pointer.x,e.clientY-this.pointer.y)>10)return;
      this.pointer=null;this.point(e.clientX,e.clientY);
    });
    window.addEventListener('keydown',e=>{if(this.building&&!this.map.open&&e.key.toLowerCase()==='r'){e.preventDefault();el('rotate-object').click();}});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void this.poll();});
    setInterval(()=>{if(!document.hidden)void this.poll();},1000);
    void this.poll();
  }
  get paused() { return this.building || this.map.open || this.busy; }
  private clearDraft(){this.draft=null;this.selected=null;this.placing=false;el<HTMLSelectElement>('built-list').value='';if(this.ghost){disposeGeometry(this.ghost);this.ghost=null;}}
  private setBuilding(value:boolean){
    this.building=value&&!!this.universe?.currentPlanet.mine&&this.syncing;this.clearDraft();
    document.body.classList.toggle('building',this.building);el('builder').hidden=!this.building;this.bridge.pause(this.building);this.editor();this.hud();
  }
  private accept(next:Universe){
    if(!this.bridge.applyPlayer(next.player))return;
    if(this.universe?.currentPlanet.id===next.currentPlanet.id&&this.universe.currentPlanet.revision>next.currentPlanet.revision)return;
    const changed=this.universe?.currentPlanet.id!==next.currentPlanet.id;
    this.universe=next;this.syncing=true;
    if(changed){this.setBuilding(false);this.clearDraft();}
    if(this.building&&!next.currentPlanet.mine)this.setBuilding(false);
    const key=next.currentPlanet.id+':'+next.currentPlanet.revision;
    if(this.painted!==key){
      this.painted=key;for(const child of [...this.layer.children])disposeGeometry(child);this.objects.clear();
      for(const obj of next.currentPlanet.objects){const group=builtObject(obj.kind);this.locate(group,obj.position,obj.rotation);group.userData.objectId=obj.id;this.layer.add(group);this.objects.set(obj.id,group);}
      const list=el<HTMLSelectElement>('built-list');list.replaceChildren(new Option('Select a saved object…',''));
      next.currentPlanet.objects.forEach((o,i)=>list.add(new Option(`${CATALOGUE[o.kind].name} ${i+1}`,o.id)));list.value=this.selected??'';
      this.bridge.obstacles(next.currentPlanet.objects.filter(o=>CATALOGUE[o.kind].height>.6).map(o=>({point:new T.Vector3(...o.position),radius:CATALOGUE[o.kind].radius,height:CATALOGUE[o.kind].height})));
      if(this.selected&&!next.currentPlanet.objects.some(o=>o.id===this.selected))this.clearDraft();
    }
    this.hud();this.editor();this.starMap();
  }
  private async poll(){
    if(this.pollBusy||this.busy)return;this.pollBusy=true;
    try{this.accept(await this.bridge.read());}catch{this.syncing=false;this.hud();this.editor();}finally{this.pollBusy=false;}
  }
  private async command(route:string,body:unknown){
    if(this.busy||!this.syncing)return false;this.busy=true;this.editor();this.hud();
    try{const next=await this.bridge.write(route,body);this.accept(next);return true;}
    catch(error){if(error instanceof Error&&'status' in error&&error.status===409)this.clearDraft();this.bridge.notice(error instanceof Error?error.message:'Could not save. Please retry.');return false;}
    finally{this.busy=false;this.editor();this.hud();void this.poll();}
  }
  private async visit(id:string){
    if(this.busy)return;this.setBuilding(false);await this.bridge.flush();
    if(await this.command('planets/visit',{planetId:id})){this.map.close();this.bridge.notice('A new little view. Welcome.');}
  }
  private async claim(){
    if(!this.universe)return;
    if(await this.command('planets/claim',{planetId:this.universe.currentPlanet.id})){this.bridge.notice('This little world is yours to shape.');this.setBuilding(true);}
  }
  private locate(group:T.Object3D,position:Vec3,rotation:number){const n=new T.Vector3(...position);group.position.copy(surfacePoint(n,.015));group.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),n);group.rotateY(rotation);}
  private point(x:number,y:number){
    this.ray.setFromCamera(new T.Vector2(x/innerWidth*2-1,-y/innerHeight*2+1),this.bridge.camera);
    if(this.placing&&this.draft){const hit=this.ray.intersectObject(this.bridge.ground())[0];if(hit){this.draft.position=hit.point.normalize().toArray() as Vec3;this.preview();this.editor();}return;}
    const hit=this.ray.intersectObjects([...this.objects.values()],true)[0];
    const surface=this.ray.intersectObject(this.bridge.ground())[0];
    if(!hit||(surface&&hit.distance>surface.distance+.15)){this.clearDraft();this.editor();return;}
    let obj:T.Object3D|null=hit.object;while(obj&&!obj.userData.objectId)obj=obj.parent;
    if(obj?.userData.objectId)this.select(obj.userData.objectId);
  }
  private select(id:string){if(this.busy)return;const found=this.universe?.currentPlanet.objects.find(o=>o.id===id);this.clearDraft();if(found){this.selected=found.id;this.draft={...found,position:[...found.position]};this.preview();}el<HTMLSelectElement>('built-list').value=id;this.editor();}
  private preview(){
    if(this.ghost){disposeGeometry(this.ghost);this.ghost=null;}
    if(!this.draft?.position)return;
    this.ghost=builtObject(this.draft.kind);this.locate(this.ghost,this.draft.position,this.draft.rotation);
    const invalid=placementProblem(this.draft.kind,this.draft.position,this.universe!.currentPlanet.objects,this.draft.id);
    this.ghost.traverse(o=>{if(o instanceof T.Mesh){o.material=new T.MeshBasicMaterial({color:invalid?'#c87055':'#c8df9b',transparent:true,opacity:.45,depthWrite:false});o.castShadow=false;}});
    this.bridge.scene.add(this.ghost);
  }
  private async save(){
    const d=this.draft;if(!d?.position||!this.universe)return;
    const route=d.version?'objects/update':'objects/create';
    const body={planetId:this.universe.currentPlanet.id,objectId:d.id,position:d.position,rotation:d.rotation,...(d.version?{expectedVersion:d.version}:{kind:d.kind})};
    if(await this.command(route,body)){this.clearDraft();this.editor();this.bridge.notice('Saved. Everyone visiting can see your change.');}
  }
  private async remove(){const d=this.draft;if(!d?.version||!this.universe)return;if(await this.command('objects/delete',{planetId:this.universe.currentPlanet.id,objectId:d.id,expectedVersion:d.version})){this.clearDraft();this.editor();this.bridge.notice('Removed from your planet.');}}
  private editor(){
    const d=this.draft;el('object-tools').hidden=!d;
    el('build-instruction').textContent=this.busy?'Saving your change…':!this.syncing?'Connection lost. Building is paused.':d?(this.placing?'Tap an open spot on the planet, then save.':'Object selected. Move, rotate or remove it.'):'Choose something to add, or tap an existing object.';
    el('build-selection').textContent=d?CATALOGUE[d.kind].name:'Your building kit';
    const problem=d?.position?placementProblem(d.kind,d.position,this.universe?.currentPlanet.objects??[],d.id):null;
    el('placement-status').textContent=problem??(d?.position?`Turn: ${Math.round(d.rotation*180/Math.PI)}°`:'');
    el<HTMLButtonElement>('save-object').disabled=this.busy||!this.syncing||!d?.position||!!problem;
    el('save-object').textContent=this.busy?'Saving…':d?.version?'Save changes':'Place object';
    el<HTMLButtonElement>('move-object').hidden=!d?.version;el<HTMLButtonElement>('remove-object').hidden=!d?.version;
    for(const id of ['rotate-object','move-object','remove-object','cancel-object'])el<HTMLButtonElement>(id).disabled=this.busy||!this.syncing;
    document.querySelectorAll<HTMLButtonElement>('.catalogue-item').forEach(b=>{b.disabled=this.busy||!this.syncing;b.setAttribute('aria-pressed',String(b.dataset.kind===d?.kind));});
  }
  private hud(){
    const u=this.universe;if(!u)return;const p=u.currentPlanet;
    document.body.dataset.planet=p.kind;el('planet-name').textContent=p.name;
    el('planet-card').dataset.revision=String(p.revision);
    el('planet-type').textContent=p.kind==='hub'?'SHARED HARBOUR':p.mine?'YOUR LITTLE WORLD':p.claimed?'A NEIGHBOUR’S WORLD':'AN UNWRITTEN WORLD';
    el('planet-description').textContent=p.kind==='hub'?'Meet the neighbours, or find a place of your own.':p.mine?'Only you can build here. Everyone is welcome to visit.':p.claimed?'Take a look around. This visit is read-only.':'A blank planet, waiting for someone’s first idea.';
    el('planet-count').textContent=p.kind==='hub'?'Public place':`${p.objectCount} / ${MAX_OBJECTS} objects`;
    el('scene-sync').textContent=this.busy?'Saving…':this.syncing?'Live · saved changes sync':'Offline · retrying';
    el<HTMLButtonElement>('claim-planet').hidden=p.kind==='hub'||p.claimed||!!u.ownedPlanetId;
    el<HTMLButtonElement>('claim-planet').disabled=this.busy||!this.syncing;
    el<HTMLButtonElement>('build-mode').hidden=!p.mine;el('build-mode').textContent=this.building?'Building…':'Build on my planet';
    el<HTMLButtonElement>('build-mode').disabled=this.busy||!this.syncing;
    el('find-planet').hidden=p.kind!=='hub';el('delivery-toggle').hidden=p.kind!=='hub';
    el('my-planet').hidden=!u.ownedPlanetId||u.ownedPlanetId===p.id;
    el('ownership-note').hidden=!(p.kind==='garden'&&!p.claimed&&u.ownedPlanetId);
  }
  private starMap(){
    const u=this.universe!;const key=JSON.stringify(u.planets.map(p=>[p.id,p.claimed,p.mine,p.objectCount]))+u.currentPlanet.id;
    if(key===this.cards)return;this.cards=key;el('planet-list').replaceChildren();
    const priority=(p:Universe['planets'][number])=>p.mine?0:p.kind==='hub'?1:!p.claimed?2:3;
    const ordered=[...u.planets].sort((a,b)=>priority(a)-priority(b));
    for(const [index,p] of ordered.entries()){
      const card=document.createElement('article');card.className='planet-option';card.dataset.planetId=p.id;
      const orb=document.createElement('div');orb.className='map-orb';orb.style.setProperty('--orb',p.kind==='hub'?'#d8b783':p.mine?'#91b499':p.claimed?'#9bb9c0':'#cdd4bc');orb.style.rotate=`${index*27}deg`;orb.textContent=p.kind==='hub'?'⌂':p.claimed?'✦':'·';
      const info=document.createElement('div'),tag=document.createElement('small'),name=document.createElement('h3'),detail=document.createElement('p');
      tag.textContent=p.kind==='hub'?'Shared':p.mine?'My planet':p.claimed?'Neighbour · read only':'Blank · unclaimed';name.textContent=p.name;detail.textContent=p.kind==='hub'?'An optional delivery awaits.':`${p.objectCount} saved object${p.objectCount===1?'':'s'}.`;
      const button=document.createElement('button');button.className='quiet visit-planet';button.textContent=p.id===u.currentPlanet.id?'You are here':'Visit planet ↗';button.disabled=p.id===u.currentPlanet.id;button.onclick=()=>void this.visit(p.id);
      info.append(tag,name,detail);card.append(orb,info,button);el('planet-list').append(card);
    }
  }
}
