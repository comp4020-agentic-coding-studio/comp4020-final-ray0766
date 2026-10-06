import * as T from 'three';
import { REGIONS,regionFor } from '../shared/regions.ts';
import { spaceDistance } from '../shared/flight.ts';
import { CATALOGUE, MAX_OBJECTS, objectName, objectRadius, objectHeight, placementProblem } from '../shared/planets.ts';
import type { BuildKind, PlacedObject, Universe } from '../shared/planets.ts';
import type { PlayerState, Vec3 } from '../shared/world.ts';
import { builtObject, disposeGeometry } from './build-art.ts';
import { Workshop } from './workshop.ts';
import type { LibraryEntry } from '../shared/blueprints.ts';
import { structureFit, structureSize } from '../shared/blueprints.ts';
import { buildBlueprintModel } from '../assets/claude-geometry/blueprint/model3d.ts';
import { placedTransform } from '../assets/claude-geometry/blueprint/placement.ts';
import type { PartPlacement } from '../assets/claude-geometry/blueprint/model.ts';
import { SHARED_ASSET_VERSION, worldMaterials } from './shared-assets.ts';
import { surfacePoint } from './terrain.ts';
import type { Obstacle } from './scene.ts';
const el = <E extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as E;
export interface ColonyBridge {
  canvas: HTMLCanvasElement; camera: T.Camera; scene: T.Scene;
  ground: () => T.Mesh; applyPlayer: (p:PlayerState) => boolean;
  obstacles: (blocks:Obstacle[]) => void; pause: (building:boolean) => void;
  read: () => Promise<Universe>; write: (route:string, body:unknown) => Promise<Universe>;
  libraryRead: () => Promise<LibraryEntry[]>; librarySave: (body:unknown) => Promise<LibraryEntry>;
  universe:(u:Universe)=>void; bearing:(id:string)=>void;
  flush: () => Promise<void>; notice: (text:string) => void;
}
type Draft = Omit<PlacedObject,'position'|'version'> & {position:Vec3|null;version?:number};
export class Colony {
  universe: Universe | null = null;
  building = false; syncing = true; busy = false;
  private map = el<HTMLDialogElement>('star-map');
  private layer = new T.Group(); private ghost: T.Group | null = null;
  private objects = new Map<string,T.Group>(); private draft: Draft | null = null;
  private placing = false; private selected: string | null = null;
  private painted = ''; private cards = ''; private pointer: {x:number;y:number} | null = null;
  private workshop: Workshop;
  private localParts: Record<string,PartPlacement[]> = {};
  private ray = new T.Raycaster(); private pollBusy = false;
  constructor(private bridge: ColonyBridge) {
    bridge.scene.add(this.layer);
    this.workshop = new Workshop({read:bridge.libraryRead,save:bridge.librarySave,allowed:()=>!!this.universe?.currentPlanet.mine&&this.universe.player.flight.mode==='ground'&&this.syncing,
      place:entry=>{this.localParts[entry.hash]=entry.blueprint.parts;this.setBuilding(true);this.draft={id:crypto.randomUUID(),kind:'structure',blueprintHash:entry.hash,...structureSize(entry.blueprint.parts),position:null,rotation:0};this.placing=true;this.editor();bridge.notice('Tap an open spot, turn the structure, then Place object.');}});
    const workshopButton=document.createElement('button');workshopButton.id='open-workshop';workshopButton.className='primary';workshopButton.textContent='Open workshop';workshopButton.hidden=true;
    el('build-mode').after(workshopButton);
    workshopButton.onclick=()=>{el<HTMLDialogElement>('menu-dialog').close();this.setBuilding(false);void bridge.flush().then(()=>this.workshop.open()).catch(e=>bridge.notice(e instanceof Error?e.message:'Reconnect before opening the workshop.'));};
    el<HTMLSelectElement>('region-select').onchange=()=>{this.cards='';this.starMap();};
    el('open-map').onclick=()=>{el<HTMLDialogElement>('menu-dialog').close();bridge.pause(this.building);this.cards='';if(this.universe)this.starMap();this.map.showModal();void this.poll();};
    el('close-map').onclick=()=>this.map.close();
    el('my-planet').onclick=()=>{if(this.universe?.ownedPlanetId)this.mark(this.universe.ownedPlanetId);};
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
    window.addEventListener('keydown',e=>{if(this.building&&!document.querySelector('dialog[open]')&&e.key.toLowerCase()==='r'){e.preventDefault();el('rotate-object').click();}});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void this.poll();});
    setInterval(()=>{if(!document.hidden)void this.poll();},1000);
    void this.poll();
  }
  get paused() { return this.building || this.map.open || this.busy || this.workshop.opened; }
  private clearDraft(){this.draft=null;this.selected=null;this.placing=false;el<HTMLSelectElement>('built-list').value='';if(this.ghost){disposeGeometry(this.ghost);this.ghost=null;}}
  private setBuilding(value:boolean){
    this.building=value&&!!this.universe?.currentPlanet.mine&&this.syncing;this.clearDraft();
    document.body.classList.toggle('building',this.building);el('builder').hidden=!this.building;this.bridge.pause(this.building);if(this.building)el<HTMLDialogElement>('menu-dialog').close();this.editor();this.hud();
  }
  stopBuilding(){this.setBuilding(false);}
  accept(next:Universe){
    if(!this.bridge.applyPlayer(next.player))return;
    if(this.universe?.currentPlanet.id===next.currentPlanet.id&&this.universe.currentPlanet.revision>next.currentPlanet.revision)return;
    const changed=this.universe?.currentPlanet.id!==next.currentPlanet.id;
    this.universe=next;this.syncing=true;this.bridge.universe(next);
    if(changed){this.setBuilding(false);this.clearDraft();}
    if(this.building&&(!next.currentPlanet.mine||next.player.flight.mode==='space'))this.setBuilding(false);
    const key=next.currentPlanet.id+':'+next.currentPlanet.revision;
    if(this.painted!==key){
      this.painted=key;this.bridge.canvas.dataset.placedAssetKit=SHARED_ASSET_VERSION;this.bridge.canvas.dataset.placedAssetKinds=next.currentPlanet.objects.map(o=>o.kind).join(',');for(const child of [...this.layer.children])disposeGeometry(child);this.objects.clear();
      for(const obj of next.currentPlanet.objects){const group=this.renderObject(obj);group.userData.objectId=obj.id;this.layer.add(group);this.objects.set(obj.id,group);}
      const list=el<HTMLSelectElement>('built-list');list.replaceChildren(new Option('Select a saved object…',''));
      next.currentPlanet.objects.forEach((o,i)=>list.add(new Option(`${objectName(o)} ${i+1}`,o.id)));list.value=this.selected??'';
      this.bridge.obstacles(next.currentPlanet.objects.filter(o=>o.kind!=='structure'&&objectHeight(o)>.6).map(o=>({point:new T.Vector3(...o.position),radius:objectRadius(o),height:objectHeight(o)})));
      if(this.selected&&!next.currentPlanet.objects.some(o=>o.id===this.selected))this.clearDraft();
    }
    this.hud();this.editor();this.starMap();
  }
  private async poll(){
    if(this.pollBusy||this.busy||this.workshop.opened)return;this.pollBusy=true;
    try{this.accept(await this.bridge.read());}catch{this.syncing=false;this.hud();this.editor();}finally{this.pollBusy=false;}
  }
  private async command(route:string,body:unknown){
    if(this.busy||!this.syncing)return false;this.busy=true;this.editor();this.hud();
    try{const next=await this.bridge.write(route,body);this.accept(next);return true;}
    catch(error){if(error instanceof Error&&'status' in error&&error.status===409)this.clearDraft();this.bridge.notice(error instanceof Error?error.message:'Could not save. Please retry.');return false;}
    finally{this.busy=false;this.editor();this.hud();void this.poll();}
  }
  private mark(id:string){this.map.close();el<HTMLDialogElement>('menu-dialog').close();this.bridge.bearing(id);}
  private async claim(){
    if(!this.universe)return;
    if(await this.command('planets/claim',{planetId:this.universe.currentPlanet.id})){this.bridge.notice('This world is yours. Enter Build mode when you are ready.');}
  }
  private parts(hash:string){return this.universe?.currentPlanet.blueprints?.[hash]??this.localParts[hash]??[];}
  private problem(d:Draft){
    const spacing=placementProblem(d.kind,d.position,this.universe?.currentPlanet.objects??[],d.id,d.radius);
    if(spacing||d.kind!=='structure'||!d.position)return spacing;
    return structureFit(this.parts(d.blueprintHash!),d.position,d.rotation).message;
  }
  private renderObject(obj:PlacedObject){
    if(obj.kind!=='structure'){const group=builtObject(obj.kind);this.locate(group,obj.position,obj.rotation);return group;}
    const parts=this.parts(obj.blueprintHash!), fit=structureFit(parts,obj.position,obj.rotation);
    const model=buildBlueprintModel(parts,worldMaterials(),'medium',{foundationDepth:fit.foundationDepth});
    const transform=placedTransform({dir:obj.position,yaw:obj.rotation},fit);
    model.object.position.fromArray(transform.position);model.object.quaternion.fromArray(transform.quaternion);
    model.object.userData.disposeOwned=()=>model.dispose();
    return model.object;
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
    this.ghost=this.renderObject(this.draft as PlacedObject);
    this.ghost.userData.noPracticalLights=true;
    const invalid=this.problem(this.draft);
    this.ghost.traverse(o=>{if(o instanceof T.Mesh){const original=Array.isArray(o.material)?o.material:[o.material];o.userData.ghostOriginal=original;o.material=new T.MeshBasicMaterial({color:invalid?'#c87055':'#c8df9b',transparent:true,opacity:.45,depthWrite:false});o.castShadow=false;}});
    const ghost=this.ghost, dispose=ghost.userData.disposeOwned;ghost.userData.disposeOwned=()=>{ghost.traverse(o=>{if(o instanceof T.Mesh&&o.userData.ghostOriginal){(o.material as T.Material).dispose();o.material=o.userData.ghostOriginal.length===1?o.userData.ghostOriginal[0]:o.userData.ghostOriginal;delete o.userData.ghostOriginal;}});delete ghost.userData.disposeOwned;if(dispose)dispose();else disposeGeometry(ghost);};
    this.bridge.scene.add(this.ghost);
  }
  private async save(){
    const d=this.draft;if(!d?.position||!this.universe)return;
    const route=d.version?'objects/update':'objects/create';
    const body={planetId:this.universe.currentPlanet.id,objectId:d.id,position:d.position,rotation:d.rotation,...(d.version?{expectedVersion:d.version}:{kind:d.kind,...(d.blueprintHash?{blueprintHash:d.blueprintHash}:{})})};
    if(await this.command(route,body)){this.clearDraft();this.editor();this.bridge.notice('Saved. Everyone visiting can see your change.');}
  }
  private async remove(){const d=this.draft;if(!d?.version||!this.universe)return;if(await this.command('objects/delete',{planetId:this.universe.currentPlanet.id,objectId:d.id,expectedVersion:d.version})){this.clearDraft();this.editor();this.bridge.notice('Removed from your planet.');}}
  private editor(){
    const d=this.draft;el('object-tools').hidden=!d;
    el('build-instruction').textContent=this.busy?'Saving your change…':!this.syncing?'Connection lost. Building is paused.':d?(this.placing?'Tap an open spot on the planet, then save.':'Object selected. Move, rotate or remove it.'):'Choose something to add, or tap an existing object.';
    el('build-selection').textContent=d?objectName(d):'Sunseed building kit';
    const problem=d?.position?this.problem(d):null;
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
    el('planet-card').dataset.revision=String(p.revision);if(u.player.flight.mode==='ground')el('location-chip').textContent=p.name.toUpperCase();
    el('planet-type').textContent=p.kind==='hub'?'SHARED HARBOUR':p.mine?'YOUR LITTLE WORLD':p.claimed?'A NEIGHBOUR’S WORLD':'AN UNWRITTEN WORLD';
    el('planet-description').textContent=p.kind==='hub'?'Meet the neighbours, or find a place of your own.':p.mine?'Only you can build here. Everyone is welcome to visit.':p.claimed?'Take a look around. This visit is read-only.':'A blank planet, waiting for someone’s first idea.';
    el('planet-count').textContent=p.kind==='hub'?'Public place':`${p.objectCount} / ${MAX_OBJECTS} objects`;
    el('scene-sync').textContent=this.busy?'Saving…':this.syncing?'Live · saved changes sync':'Offline · retrying';
    el<HTMLButtonElement>('claim-planet').hidden=p.kind==='hub'||p.claimed||!!u.ownedPlanetId;
    el<HTMLButtonElement>('claim-planet').disabled=this.busy||!this.syncing;
    el<HTMLButtonElement>('build-mode').hidden=!p.mine;el('build-mode').textContent=this.building?'Building…':'Build on my planet';
    el<HTMLButtonElement>('build-mode').disabled=this.busy||!this.syncing;
    el<HTMLButtonElement>('open-workshop').hidden=!p.mine||u.player.flight.mode!=='ground';el<HTMLButtonElement>('open-workshop').disabled=this.busy||!this.syncing;
    el('delivery-toggle').hidden=p.kind!=='hub';
    el('my-planet').hidden=!u.ownedPlanetId||u.ownedPlanetId===p.id;
    el('ownership-note').hidden=!(p.kind==='garden'&&!p.claimed&&u.ownedPlanetId);
  }
  private starMap(){
    const u=this.universe!;const key=JSON.stringify(u.planets.map(p=>[p.id,p.claimed,p.mine,p.objectCount]))+u.currentPlanet.id;
    if(key===this.cards)return;this.cards=key;el('planet-list').replaceChildren();
    const priority=(p:Universe['planets'][number])=>p.mine?0:p.kind==='hub'?1:!p.claimed?2:3;
    const filter=el<HTMLSelectElement>('region-select').value;
    const origin=u.player.flight.mode==='space'?u.player.flight.position:u.currentPlanet.center;
    const ordered=u.planets.filter(p=>filter==='all'||regionFor(p.slot).id===filter).sort((a,b)=>priority(a)-priority(b)||spaceDistance(a.center,origin)-spaceDistance(b.center,origin));
    el('survey-summary').textContent=`${u.planets.length} surveyed worlds · ${REGIONS.length} star regions`;
    el('region-description').textContent=REGIONS.find(r=>r.id===filter)?.description??'Nearby homes and distant crossings. Select a region to plan your route.';
    for(const [index,p] of ordered.entries()){
      const card=document.createElement('article');card.className='planet-option';card.dataset.planetId=p.id;
      const orb=document.createElement('div');orb.className='map-orb';orb.style.setProperty('--orb',p.kind==='hub'?'#d8b783':p.mine?'#91b499':p.claimed?'#9bb9c0':'#cdd4bc');orb.style.rotate=`${index*27}deg`;orb.textContent=p.kind==='hub'?'⌂':p.claimed?'✦':'·';
      const info=document.createElement('div'),tag=document.createElement('small'),name=document.createElement('h3'),detail=document.createElement('p');
      tag.textContent=p.kind==='hub'?'Shared':p.mine?'My planet':p.claimed?'Neighbour · read only':'Blank · unclaimed';name.textContent=p.name;detail.textContent=`${regionFor(p.slot).name} · ${Math.round(spaceDistance(p.center,origin))} m away · ${p.kind==='hub'?'Public starport':p.objectCount+' saved objects'}`;
      const button=document.createElement('button');button.className='quiet visit-planet';button.textContent='Mark bearing ◇';button.onclick=()=>this.mark(p.id);
      info.append(tag,name,detail);card.append(orb,info,button);el('planet-list').append(card);
    }
  }
}
