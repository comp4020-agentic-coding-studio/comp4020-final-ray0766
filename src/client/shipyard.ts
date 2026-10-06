import * as T from 'three';
import { Stage } from '../assets/claude-geometry/shell/stage.ts';
import { createShipModel } from '../assets/claude-geometry/ship/factory.ts';
import type { ShipHandle } from '../assets/claude-geometry/ship/factory.ts';
import { cloneDesign, decodeShipDesign, encodeShipDesign, fromStarter, normalizeRegistration, PAINT_ZONES, STARTERS } from '../assets/claude-geometry/ship/design.ts';
import type { ShipDesign } from '../assets/claude-geometry/ship/design.ts';
import { CATEGORIES, PART_IDS } from '../assets/claude-geometry/ship/spec.ts';
import { PAINT_CHOICES, GLOW_CHOICES } from '../assets/claude-geometry/style/tokens.ts';
import { defaultShip } from '../shared/ships.ts';
import type { SavedShip } from '../shared/ships.ts';
import { textureFormat } from './resource-policy.ts';
import './shipyard.css';
interface Bridge { read:()=>Promise<SavedShip>; save:(body:unknown)=>Promise<SavedShip>; allowed:()=>boolean }
export class Shipyard {
  private dialog = document.createElement('dialog');
  private stage:Stage|null=null;
  private model:ShipHandle|null=null;
  private saved=defaultShip();
  private draft:ShipDesign=cloneDesign(this.saved.design);
  private busy=false;
  private dirty=false;
  constructor(private bridge:Bridge){
    this.dialog.id='shipyard';this.dialog.setAttribute('aria-labelledby','shipyard-title');
    this.dialog.innerHTML=`<header><div><small>PERSONAL / SHIP WORKSHOP</small><h2 id="shipyard-title">Your ship</h2></div><button id="sy-close">Done ×</button></header><div class="sy-body"><section><div id="sy-stage"></div><p>Drag to orbit · pinch or scroll to zoom</p><button id="sy-frame">Frame ship</button></section><aside><fieldset id="sy-fields"><label>Start from<select id="sy-starter"><option value="">Current design</option></select></label><label>Name<input id="sy-name" maxlength="40" autocomplete="off"></label><label>Registration<input id="sy-registration" maxlength="10" autocomplete="off"></label><div id="sy-parts"></div><div id="sy-paint"></div><label>Engine glow<select id="sy-glow"></select></label></fieldset><p class="sy-note">One current ship, saved to this browser’s private visit. The same design is used on the surface and in flight.</p><button id="sy-reload">Reload saved design</button></aside></div><footer><span id="sy-status" role="status" aria-live="polite"></span><button id="sy-save">Save & use ship</button></footer>`;
    document.body.append(this.dialog);
    const label=(id:string,title:string,values:readonly string[],container:string)=>{const l=document.createElement('label');l.textContent=title;const select=document.createElement('select');select.id='sy-'+id;for(const v of values)select.add(new Option(v.replaceAll('-',' '),v));l.append(select);this.get(container).append(l);};
    for(const category of CATEGORIES)label(category,category,PART_IDS[category],'parts');
    for(const zone of PAINT_ZONES)label(zone,zone+' paint',PAINT_CHOICES,'paint');
    for(const glow of GLOW_CHOICES)this.get<HTMLSelectElement>('glow').add(new Option(glow,glow));
    STARTERS.forEach((s,i)=>this.get<HTMLSelectElement>('starter').add(new Option(s.name,String(i))));
    this.get('fields').addEventListener('input',()=>{this.dirty=true;this.status('Unsaved changes.');});
    this.get('fields').addEventListener('change',()=>{this.dirty=true;if(this.readDraft())this.render();});
    this.get<HTMLSelectElement>('starter').onchange=()=>{const value=this.get<HTMLSelectElement>('starter').value;if(value==='')return;this.draft=fromStarter(Number(value));this.fill();this.dirty=true;this.render();this.status('Starter selected · save to use it.');};
    this.get('save').onclick=()=>void this.save();this.get('reload').onclick=()=>{if(this.discard())void this.load();};
    this.get('close').onclick=()=>this.close();this.get('frame').onclick=()=>this.frame();
    this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    window.addEventListener('beforeunload',e=>{if(this.dialog.open&&this.dirty)e.preventDefault();});
  }
  private get<E extends HTMLElement=HTMLElement>(id:string){return this.dialog.querySelector('#sy-'+id) as E;}
  private status(message:string){this.get('status').textContent=message;}
  private lock(value:boolean){this.busy=value;this.get<HTMLFieldSetElement>('fields').disabled=value;for(const id of ['save','reload','close'])this.get<HTMLButtonElement>(id).disabled=value;}
  private discard(){return !this.dirty||window.confirm('Discard the unsaved ship changes?');}
  private fill(){
    for(const [key,value] of Object.entries({...this.draft.parts,...this.draft.paint,name:this.draft.name,registration:this.draft.registration??'',glow:this.draft.glow}))this.get<HTMLInputElement|HTMLSelectElement>(key).value=value;
    this.get<HTMLSelectElement>('starter').value='';
  }
  private readDraft(){
    const document=JSON.parse(encodeShipDesign(this.draft));
    for(const key of CATEGORIES)document.parts[key]=this.get<HTMLSelectElement>(key).value;
    for(const key of PAINT_ZONES)document.paint[key]=this.get<HTMLSelectElement>(key).value;
    document.name=this.get<HTMLInputElement>('name').value.trim();document.glow=this.get<HTMLSelectElement>('glow').value;
    const registration=normalizeRegistration(this.get<HTMLInputElement>('registration').value);
    if(registration)document.registration=registration;else delete document.registration;
    const decoded=decodeShipDesign(document);if(!decoded.ok){this.status(decoded.errors.join(' '));return false;}
    this.draft=decoded.value;return true;
  }
  private render(){
    if(!this.stage)return;
    const replacement=createShipModel(this.draft,this.stage.library,'medium');
    this.model?.dispose();this.model=replacement;this.stage.scene.add(replacement.object);this.frame();
    this.stage.renderer.domElement.dataset.shipDesign=encodeShipDesign(this.draft);
  }
  private frame(){if(this.model)this.stage?.frameBox(this.model.bounds,{direction:new T.Vector3(5,3,-6),topInset:0,bottomInset:0,margin:1.25});}
  private async load(){
    this.lock(true);this.status('Loading your saved ship…');
    try{this.saved=await this.bridge.read();this.draft=cloneDesign(this.saved.design);this.fill();this.render();this.dirty=false;this.status(this.saved.version?'Saved design loaded.':'Courier starter · save your changes to use them.');}
    catch(e){this.status(e instanceof Error?e.message:'Could not load your ship.');}
    finally{this.lock(false);}
  }
  async open(){
    if(this.dialog.open||!this.bridge.allowed())return;
    this.dialog.showModal();document.body.classList.add('shipyard-open');
    try{this.stage=new Stage({container:this.get('stage'),lod:'medium',mood:'hangar',scans:true,textures:textureFormat(),environment:'procedural',backdrop:false,fog:null,fov:44});
      this.stage.renderer.domElement.setAttribute('aria-label','Ship 3D preview');this.stage.start();await this.load();
    }catch(e){this.status(e instanceof Error?e.message:'Could not open ship preview.');}
  }
  private async save(){
    if(this.busy||!this.readDraft())return;
    if(!this.bridge.allowed()){this.status('Land and reconnect before changing your ship.');return;}
    this.lock(true);this.status('Saving ship…');
    try{this.saved=await this.bridge.save({document:encodeShipDesign(this.draft),version:this.saved.version});this.draft=cloneDesign(this.saved.design);this.fill();this.render();this.dirty=false;this.status('Saved · ready on the surface and in flight.');}
    catch(e){this.status((e instanceof Error?e.message:'Save failed.')+' Your changes remain here.');}
    finally{this.lock(false);}
  }
  private close(){
    if(this.busy||!this.discard())return;
    this.model?.dispose();this.model=null;const renderer=this.stage?.renderer;this.stage?.dispose();renderer?.forceContextLoss();this.stage=null;
    this.dialog.close();document.body.classList.remove('shipyard-open');
  }
}
