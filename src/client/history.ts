import * as T from 'three';
import { Stage } from '../assets/claude-geometry/shell/stage.ts';
import { decodeEvent, decodeSnapshot } from '../assets/claude-geometry/timeline/codec.ts';
import type { WorldState } from '../assets/claude-geometry/core/world.ts';
import { legacyHeightField } from '../assets/claude-geometry/core/ground.ts';
import { buildBlueprintModel } from '../assets/claude-geometry/blueprint/model3d.ts';
import { placedTransform } from '../assets/claude-geometry/blueprint/placement.ts';
import { structureFit } from '../shared/blueprints.ts';
import { builtObject, disposeGeometry } from './build-art.ts';
import { textureFormat } from './resource-policy.ts';
import type { HistoryPage, HistorySnapshot } from '../shared/history.ts';
import { HISTORY_PAGE } from '../shared/history.ts';
import './history.css';
interface Bridge { page:(id:string,after:number)=>Promise<HistoryPage>; snapshot:(id:string,seq?:number)=>Promise<HistorySnapshot> }
export class PrivateHistory {
 private dialog=document.createElement('dialog');private stage:Stage|null=null;private layer=new T.Group();private release:(()=>void)[]=[];
 private planet='';private sequence=0;private head=0;private after=0;private ticket=0;private busy=false;private timer:ReturnType<typeof setInterval>|null=null;
 constructor(private bridge:Bridge){
  this.dialog.id='history';this.dialog.setAttribute('aria-labelledby','hy-title');this.dialog.innerHTML=`<header><div><small>OWNER ONLY / READ-ONLY REPLAY</small><h2 id="hy-title">My building history</h2></div><button id="hy-close">Return to live world ×</button></header><div class="hy-body"><div id="hy-stage"></div><aside><p id="hy-baseline"></p><p id="hy-summary"></p><label for="hy-sequence">Recorded change</label><input id="hy-sequence" type="range" min="0" max="0" value="0"><div class="hy-controls"><button id="hy-previous">←</button><button id="hy-play">Play</button><button id="hy-next">→</button><button id="hy-start">Baseline</button><button id="hy-latest">Latest</button></div><label for="hy-events">Events</label><select id="hy-events" size="7"></select><div class="hy-controls"><button id="hy-older">Older events</button><button id="hy-newer">Newer events</button></div><p>Drag to orbit · pinch or scroll to zoom. This preview cannot change the live world.</p></aside></div><footer><span id="hy-status" role="status" aria-live="polite"></span></footer>`;document.body.append(this.dialog);
  this.get('close').onclick=()=>this.close();this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
  this.get<HTMLInputElement>('sequence').oninput=()=>{this.stop();void this.seek(Number(this.get<HTMLInputElement>('sequence').value));};
  this.get<HTMLSelectElement>('events').onchange=()=>{this.stop();void this.seek(Number(this.get<HTMLSelectElement>('events').value));};
  this.get('previous').onclick=()=>{this.stop();void this.seek(Math.max(0,this.sequence-1));};this.get('next').onclick=()=>{this.stop();void this.seek(Math.min(this.head,this.sequence+1));};
  this.get('start').onclick=()=>{this.stop();void this.seek(0);};this.get('latest').onclick=()=>{this.stop();void this.seek(this.head);};
  this.get('older').onclick=()=>void this.events(Math.max(0,this.after-HISTORY_PAGE));this.get('newer').onclick=()=>void this.events(this.after+HISTORY_PAGE);
  this.get('play').onclick=()=>{if(this.timer){this.stop();return;}this.get('play').textContent='Pause';this.timer=setInterval(()=>{if(this.busy)return;if(this.sequence>=this.head){this.stop();return;}void this.seek(this.sequence+1);},850);};
 }
 private get<E extends HTMLElement=HTMLElement>(id:string){return this.dialog.querySelector('#hy-'+id) as E;}
 private status(text:string){this.get('status').textContent=text;}
 private stop(){if(this.timer)clearInterval(this.timer);this.timer=null;this.get('play').textContent='Play';}
 private clear(){for(const release of this.release)release();this.release=[];this.layer.clear();}
 private render(state:WorldState,snapshot:HistorySnapshot){
  if(!this.stage)return;this.clear();
  const field=legacyHeightField(),geometry=new T.IcosahedronGeometry(10,4),a=geometry.attributes.position;
  for(let i=0;i<a.count;i++){const p=new T.Vector3().fromBufferAttribute(a,i).normalize();a.setXYZ(i,...p.multiplyScalar(10+field.heightAt(p.toArray() as [number,number,number])).toArray() as [number,number,number]);}geometry.computeVertexNormals();
  const material=new T.MeshStandardMaterial({color:'#696f66',roughness:.96});const globe=new T.Mesh(geometry,material);this.layer.add(globe);this.release.push(()=>{geometry.dispose();material.dispose();});
  for(const o of Object.values(state.objects)){
   let object:T.Object3D;
   if(o.spec.kind==='structure'){
    const parts=snapshot.blueprints[o.spec.blueprintHash];if(!parts)throw Error('Historical blueprint is missing.');const fit=structureFit(parts,o.anchor.dir,o.anchor.yaw);const model=buildBlueprintModel(parts,this.stage.library,'medium',{foundationDepth:fit.foundationDepth});object=model.object;const transform=placedTransform(o.anchor,fit);object.position.fromArray(transform.position);object.quaternion.fromArray(transform.quaternion);this.release.push(()=>model.dispose());
   }else{object=builtObject(o.spec.prop);const normal=new T.Vector3(...o.anchor.dir);object.position.copy(normal).multiplyScalar(10+field.heightAt(o.anchor.dir)+.015);object.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),normal);object.rotateY(o.anchor.yaw);this.release.push(()=>disposeGeometry(object));}
   this.layer.add(object);
  }
  this.stage.renderer.domElement.dataset.sequence=String(state.seq);this.stage.renderer.domElement.dataset.objectCount=String(Object.keys(state.objects).length);this.stage.renderer.domElement.dataset.stateHash=snapshot.hash;
 }
 private async events(after:number){
  try{const result=await this.bridge.page(this.planet,after);if(!this.dialog.open)return;this.after=result.after;this.head=result.head;this.get('title').textContent=result.planetName+' · history';this.get('baseline').textContent='Baseline: existing world imported '+new Date(result.baselineAt).toLocaleString()+'. Earlier actions were not recorded.';
   this.get<HTMLInputElement>('sequence').max=String(this.head);const list=this.get<HTMLSelectElement>('events');list.replaceChildren();
   for(const raw of result.events){const r=decodeEvent(raw);if(!r.ok)throw Error('Invalid history event.');const e=r.value;list.add(new Option(`${e.seq} · ${e.type.replace('object.','')} · ${new Date(e.recordedAt).toLocaleTimeString()}`,String(e.seq)));}
   this.get<HTMLButtonElement>('older').disabled=after===0;this.get<HTMLButtonElement>('newer').disabled=result.next>=result.head;
  }catch(e){this.status(e instanceof Error?e.message:'Could not load history.');}
 }
 private async seek(seq?:number){
  const ticket=++this.ticket;this.busy=true;this.status('Loading read-only snapshot…');
  try{const snapshot=await this.bridge.snapshot(this.planet,seq);if(ticket!==this.ticket||!this.dialog.open)return;const r=decodeSnapshot(snapshot.document);if(!r.ok)throw Error('Invalid historical snapshot.');this.render(r.value,snapshot);this.sequence=r.value.seq;this.head=snapshot.head;this.get<HTMLInputElement>('sequence').value=String(this.sequence);this.get('summary').textContent=`${this.sequence===0?'Imported baseline':'Change '+this.sequence} / ${this.head} · ${Object.keys(r.value.objects).length} objects`;this.status('History preview · live world unchanged');}
  catch(e){if(ticket===this.ticket){this.stop();this.status(e instanceof Error?e.message:'Could not load snapshot.');}}
  finally{if(ticket===this.ticket)this.busy=false;}
 }
 async open(planet:string){
  if(this.dialog.open)return;this.planet=planet;this.dialog.showModal();document.body.classList.add('history-open');
  try{this.stage=new Stage({container:this.get('stage'),lod:'medium',mood:'dusk',scans:true,textures:textureFormat(),environment:'procedural',backdrop:false,fog:null,fov:44});this.layer=new T.Group();this.stage.scene.add(this.layer);this.stage.start();const page=await this.bridge.page(planet,0);await this.events(Math.max(0,page.head-HISTORY_PAGE));await this.seek();this.stage.frameBox(new T.Box3(new T.Vector3(-12,-12,-12),new T.Vector3(12,15,12)),{direction:new T.Vector3(1,1.6,1),topInset:0,bottomInset:0});}
  catch(e){this.status(e instanceof Error?e.message:'Could not open history.');}
 }
 private close(){this.stop();this.ticket++;this.clear();const renderer=this.stage?.renderer;this.stage?.dispose();renderer?.forceContextLoss();this.stage=null;this.dialog.close();document.body.classList.remove('history-open');}
}
