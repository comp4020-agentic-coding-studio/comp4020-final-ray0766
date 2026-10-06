import * as T from 'three';
import { Stage } from '../assets/claude-geometry/shell/stage.ts';
import { STYLES,defaultEnvironment,decodeEnvironment,encodeEnvironment } from '../assets/claude-geometry/terrain/env.ts';
import type { TerrainStyle } from '../assets/claude-geometry/terrain/env.ts';
import { checkTerrainChange,describeConflicts } from '../assets/claude-geometry/terrain/policy.ts';
import { fieldOf,terrainObjects } from '../shared/terrain.ts';
import type { Universe } from '../shared/planets.ts';
import { planetPreview } from './planet-preview.ts';
import { textureFormat } from './resource-policy.ts';
import './terrain-workshop.css';
interface Bridge {read:()=>Promise<Universe>;save:(body:unknown)=>Promise<Universe>;allowed:()=>boolean}
export class TerrainWorkshop{
 private dialog=document.createElement('dialog');private stage:Stage|null=null;private model:ReturnType<typeof planetPreview>|null=null;private saved:Universe|null=null;private draft='';private busy=false;private dirty=false;private valid=false;
 constructor(private bridge:Bridge){
  this.dialog.id='terrain-workshop';this.dialog.setAttribute('aria-labelledby','tw-title');this.dialog.innerHTML=`<header><div><small>MY PLANET / TERRAIN PREVIEW</small><h2 id="tw-title">Shape the ground</h2></div><button id="tw-close">Done ×</button></header><div class="tw-body"><section><div id="tw-stage"></div><p>Drag to orbit · pinch or scroll to zoom</p></section><aside><label>Style<select id="tw-style"></select></label><label>Seed<input id="tw-seed" type="number" min="0" max="4294967295" step="1"></label><button id="tw-preview">Preview terrain</button><button id="tw-reload">Reload saved terrain</button><p id="tw-current"></p><p>Apply changes only this planet. Existing buildings must stay dry and supported. The landing area stays clear. Applying replaces the terrain and re-seats buildings; there is no terrain undo.</p><p id="tw-check" role="status"></p></aside></div><footer><span id="tw-status" role="status" aria-live="polite"></span><button id="tw-apply">Apply to my planet</button></footer>`;document.body.append(this.dialog);
  for(const style of STYLES)this.get<HTMLSelectElement>('style').add(new Option(style[0].toUpperCase()+style.slice(1),style));
  this.get('preview').onclick=()=>this.preview();this.get('apply').onclick=()=>void this.apply();this.get('reload').onclick=()=>{if(!this.dirty||confirm('Discard the unapplied terrain preview?'))void this.load();};
  this.get('style').onchange=()=>this.preview();this.get('seed').oninput=()=>{this.dirty=true;this.get('close').textContent='Discard preview ×';this.get<HTMLButtonElement>('apply').disabled=true;this.status('Seed changed · preview before applying.');};
  this.get('close').onclick=()=>this.close();this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
 }
 private get<E extends HTMLElement=HTMLElement>(id:string){return this.dialog.querySelector('#tw-'+id) as E;}
 private status(s:string){this.get('status').textContent=s;}
 private lock(value:boolean){this.busy=value;for(const id of ['style','seed','preview','reload','close','apply'])this.get<HTMLInputElement>(id).disabled=value;}
 private preview(){
  if(!this.saved||!this.stage||this.busy)return;const seed=Number(this.get<HTMLInputElement>('seed').value),style=this.get<HTMLSelectElement>('style').value as TerrainStyle;
  if(!this.get<HTMLInputElement>('seed').value.trim()||!Number.isInteger(seed)||seed<0||seed>4294967295){this.get<HTMLButtonElement>('apply').disabled=true;this.status('Choose a whole-number seed from 0 to 4294967295.');return;}
  const stored=this.saved.currentPlanet.environment?decodeEnvironment(this.saved.currentPlanet.environment):null;this.draft=stored?.ok&&stored.value.style===style&&stored.value.seed===seed?encodeEnvironment(stored.value):encodeEnvironment(defaultEnvironment(style,seed));this.dirty=this.draft!==this.saved.currentPlanet.environment;
  const p=this.saved.currentPlanet,field=fieldOf(this.draft),check=checkTerrainChange(field,terrainObjects(p.objects,p.blueprints),fieldOf(p.environment));
  const next=planetPreview(this.draft,p.objects,p.blueprints??{},this.stage.library);this.model?.dispose();this.model=next;this.stage.scene.add(next.object);this.stage.frameBox(new T.Box3(new T.Vector3(-12,-12,-12),new T.Vector3(12,14,12)),{direction:new T.Vector3(1,1.4,1),topInset:0,bottomInset:0});
  this.get('close').textContent=this.dirty?'Discard preview ×':'Done ×';this.valid=check.ok;this.stage.renderer.domElement.dataset.environment=this.draft;this.get('check').textContent=check.ok?'Buildings remain dry and supported.':describeConflicts(check).join('; ');this.get<HTMLButtonElement>('apply').disabled=!check.ok||!this.dirty;this.status(this.dirty?'Preview only · live planet unchanged.':'This is your saved terrain.');
 }
 private async load(){
  this.lock(true);this.status('Loading your planet…');
  try{const u=await this.bridge.read();if(!u.currentPlanet.mine||u.player.flight.mode!=='ground')throw Error('Land on your own planet to edit terrain.');this.saved=u;const r=u.currentPlanet.environment?decodeEnvironment(u.currentPlanet.environment):null,env=r?.ok?r.value:defaultEnvironment('temperate');this.get<HTMLSelectElement>('style').value=env.style;this.get<HTMLInputElement>('seed').value=String(env.seed);this.get('current').textContent=u.currentPlanet.environment?'Saved terrain is preserved until you apply.':'Current terrain: original landscape. It stays unchanged until you apply.';this.lock(false);this.preview();}
  catch(e){this.status(e instanceof Error?e.message:'Could not load terrain.');this.lock(false);this.get<HTMLButtonElement>('apply').disabled=true;}
 }
 async open(){if(this.dialog.open||!this.bridge.allowed())return;this.dialog.showModal();document.body.classList.add('terrain-workshop-open');try{this.stage=new Stage({container:this.get('stage'),lod:'medium',mood:'dusk',scans:true,textures:textureFormat(),environment:'procedural',backdrop:false,fog:null,fov:44});this.stage.start();await this.load();}catch(e){this.status(e instanceof Error?e.message:'Could not create preview.');}}
 private async apply(){
  if(this.busy||!this.saved||!this.draft||!this.valid||!this.dirty||!this.bridge.allowed())return;if(!window.confirm('Apply this terrain to your planet? Existing buildings will re-seat on the new ground. This replaces the current terrain and cannot be undone here.'))return;this.lock(true);this.status('Checking buildings and saving terrain…');
  try{this.saved=await this.bridge.save({planetId:this.saved.currentPlanet.id,environment:this.draft,expectedRevision:this.saved.currentPlanet.revision});this.dirty=false;this.get('close').textContent='Done ×';this.status('Terrain saved · ground and flight views updated.');this.get('current').textContent='Saved terrain applied.';}
  catch(e){this.status(e instanceof Error?e.message:'Could not save terrain.');}
  finally{this.lock(false);this.get<HTMLButtonElement>('apply').disabled=!this.dirty||!this.valid;}
 }
 private close(){if(this.busy)return;this.model?.dispose();this.model=null;const renderer=this.stage?.renderer;this.stage?.dispose();renderer?.forceContextLoss();this.stage=null;this.dialog.close();document.body.classList.remove('terrain-workshop-open');}
}
