import * as T from 'three';
import { BlueprintEditor } from '../assets/claude-geometry/blueprint/editor.ts';
import { encodeBlueprint } from '../assets/claude-geometry/blueprint/codec.ts';
import { industrialCabin } from '../assets/claude-geometry/blueprint/samples.ts';
import { partTransform } from '../assets/claude-geometry/blueprint/model.ts';
import type { Blueprint, Rot } from '../assets/claude-geometry/blueprint/model.ts';
import { PART_IDS, PARTS } from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import type { PartId } from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import { STOREY } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { WorkshopView } from '../assets/claude-geometry/blueprint/view/workshop-view.ts';
import { PartTemplates } from '../assets/claude-geometry/blueprint/view/templates.ts';
import { Stage } from '../assets/claude-geometry/shell/stage.ts';
import type { LibraryEntry } from '../shared/blueprints.ts';
import './workshop.css';
import { textureFormat } from './resource-policy.ts';

export interface WorkshopBridge {
  read: () => Promise<LibraryEntry[]>;
  save: (body: unknown) => Promise<LibraryEntry>;
  place: (entry: LibraryEntry) => void;
  allowed: () => boolean;
}
// This adapter owns UI/lifecycle and server transport. All snapping, groups,
// undo, support checks, picking and geometry remain Claude's committed editor.
export class Workshop {
  private dialog = document.createElement('dialog');
  private editor = new BlueprintEditor();
  private stage: Stage | null = null;
  private view: WorkshopView | null = null;
  private templates: PartTemplates | null = null;
  private entries: LibraryEntry[] = [];
  private saved: LibraryEntry | null = null;
  private level = 0;
  private busy = false;
  private pointer: {x:number;y:number} | null = null;
  private unload = (e: BeforeUnloadEvent) => { if (this.opened && this.unsaved) e.preventDefault(); };
  constructor(private bridge: WorkshopBridge) {
    this.dialog.id = 'workshop'; this.dialog.setAttribute('aria-labelledby', 'workshop-title');
    this.dialog.innerHTML = `
      <header class="ws-head"><div><small>MY PLANET / ASSEMBLY BAY</small><h2 id="workshop-title">Workshop</h2></div><button id="ws-close" aria-label="Close workshop">Done ×</button></header>
      <div class="ws-bar"><label>Name <input id="ws-name" maxlength="60" autocomplete="off" value=""></label><div class="ws-actions"><button id="ws-save">Save blueprint</button><button id="ws-place">Place on planet ↗</button></div></div>
      <div class="ws-body"><section class="ws-view" aria-label="Blueprint preview"><div class="ws-camera"><label>Level <select id="ws-level"><option value="0">L1 · ground</option><option value="1">L2 · upper</option><option value="2">L3 · top</option></select></label><button id="ws-frame">Frame model</button><button id="ws-inside">Look inside</button></div><div id="ws-stage"></div><p class="ws-hint">Drag to orbit · pinch or scroll to zoom · tap to add or select</p></section>
      <aside class="ws-panel"><fieldset id="ws-fields"><div class="ws-row"><button id="ws-new">New</button><button id="ws-cabin">Cabin starter</button><button id="ws-copy">Save as copy</button></div>
      <label>Tool <select id="ws-tool"><option value="select">Select / inspect</option></select></label>
      <div class="ws-row"><label>Column <select id="ws-x"></select></label><label>Row <select id="ws-z"></select></label><label>Turn <select id="ws-rot"><option value="0">0°</option><option value="1">90°</option><option value="2">180°</option><option value="3">270°</option></select></label></div>
      <button id="ws-add">Add at cell</button><small>Walls snap to the chosen cell edge. Upper parts need support.</small>
      <div class="ws-row"><button id="ws-undo">Undo</button><button id="ws-redo">Redo</button><button id="ws-remove">Remove</button><button id="ws-rotate">Rotate</button></div>
      <details><summary id="ws-parts-title">Parts & groups</summary><label>Parts (multiple selection)<select id="ws-parts" multiple size="5"></select></label><div class="ws-row"><button id="ws-all">Select all</button><button id="ws-clear">Deselect</button><button id="ws-up">Level up</button><button id="ws-down">Level down</button></div><div class="ws-row"><button id="ws-left">←</button><button id="ws-forward">↑</button><button id="ws-back">↓</button><button id="ws-right">→</button></div><label>Group name <input id="ws-group-name" maxlength="40" placeholder="e.g. Cabin shell"></label><div class="ws-row"><button id="ws-group">Group selection</button><button id="ws-ungroup">Ungroup</button></div><p id="ws-groups"></p></details>
      <details open><summary>My saved blueprints</summary><select id="ws-library" aria-label="Saved blueprints"></select><button id="ws-load">Open saved blueprint</button><p class="ws-private">Names and groups stay in your private library. Visitors see placed geometry.</p></details></fieldset></aside></div>
      <footer class="ws-footer"><span id="ws-status" role="status" aria-live="polite">Ready.</span><span id="ws-count"></span></footer>`;
    document.body.append(this.dialog);
    const tool=this.get<HTMLSelectElement>('tool');
    for(const id of PART_IDS) tool.add(new Option(PARTS[id].label,id));
    for(const id of ['x','z']) for(let n=0;n<5;n++)this.get<HTMLSelectElement>(id).add(new Option(String(n+1),String(n)));
    this.on('close',()=>this.close());
    this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    this.on('save',()=>void this.save());this.on('place',()=>this.place());
    this.on('new',()=>{if(!this.discard())return;this.saved=null;this.editor.reset();this.editor.rename('Untitled structure');this.changed();this.frame();});
    this.on('cabin',()=>{if(this.discard())this.starter();});
    this.on('copy',()=>{const bp=this.editor.toBlueprint();bp.id=crypto.randomUUID() as Blueprint['id'];this.saved=null;this.editor.load(bp);this.changed();void this.save();});
    this.on('load',()=>{if(!this.discard())return;const e=this.entries.find(e=>e.blueprint.id===this.get<HTMLSelectElement>('library').value);if(e)this.load(e);});
    this.get<HTMLInputElement>('name').oninput=()=>this.editor.rename(this.get<HTMLInputElement>('name').value);
    this.get<HTMLSelectElement>('level').onchange=()=>{this.level=Number(this.get<HTMLSelectElement>('level').value);this.view?.setLevel(this.level);this.frame();};
    tool.onchange=()=>{this.view?.setGhost(null);this.changed();};
    this.on('frame',()=>this.frame());this.on('inside',()=>this.inside());this.on('add',()=>this.addAtCell());
    this.on('undo',()=>this.result(this.editor.undo()));this.on('redo',()=>this.result(this.editor.redo()));
    this.on('remove',()=>this.result(this.editor.remove()));this.on('rotate',()=>this.result(this.editor.rotateSelection()));
    this.on('all',()=>this.editor.selectAll(this.editor.parts.map(p=>p.n)));this.on('clear',()=>this.editor.select(null));
    for(const [id,x,z,l] of [['up',0,0,1],['down',0,0,-1],['left',-1,0,0],['right',1,0,0],['forward',0,-1,0],['back',0,1,0]] as const)this.on(id,()=>this.result(this.editor.moveSelection(x,z,l)));
    this.get<HTMLSelectElement>('parts').onchange=()=>this.editor.selectAll([...this.get<HTMLSelectElement>('parts').selectedOptions].map(o=>Number(o.value)));
    this.on('group',()=>this.result(this.editor.group(this.get<HTMLInputElement>('group-name').value||undefined)));
    this.on('ungroup',()=>this.result(this.editor.ungroup()));
    this.editor.onChange(()=>this.changed());
    window.addEventListener('beforeunload',this.unload);
  }
  get opened(){return this.dialog.open;}
  private get<E extends HTMLElement=HTMLElement>(id:string){return this.dialog.querySelector(`#ws-${id}`) as E;}
  private on(id:string,fn:()=>void){this.get(id).onclick=()=>{if(!this.busy)fn();};}
  private get unsaved(){return this.editor.dirty||(!this.saved&&this.editor.parts.length>0);}
  private discard(){return !this.unsaved||window.confirm('Discard the unsaved blueprint changes?');}
  private status(text:string){this.get('status').textContent=text;}
  private result(result:{message:string}){this.status(result.message);}
  async open(){
    if(this.opened||!this.bridge.allowed())return;
    this.dialog.showModal();document.body.classList.add('workshop-open');
    this.busy=true;this.changed();this.status('Opening your saved library…');
    try{
      this.stage=new Stage({container:this.get('stage'),lod:'medium',mood:'hangar',scans:true,textures:textureFormat(),environment:'procedural',ambientOcclusion:false,backdrop:false,fog:null,background:'#151e24',fov:44});
      this.templates=new PartTemplates(this.stage.library);this.view=new WorkshopView(this.stage,this.editor,this.templates);
      const canvas=this.stage.renderer.domElement;canvas.setAttribute('aria-label','Workshop 3D preview');
      const pressed=new Set<number>();let pinched=false;
      canvas.addEventListener('pointerdown',e=>{pressed.add(e.pointerId);if(pressed.size>1){pinched=true;this.pointer=null;}else{pinched=false;this.pointer={x:e.clientX,y:e.clientY};}});
      canvas.addEventListener('pointercancel',e=>{pressed.delete(e.pointerId);this.pointer=null;});
      canvas.addEventListener('touchend',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
      canvas.addEventListener('pointermove',e=>{if(this.busy||e.buttons)return;const d=this.draftAt(e.clientX,e.clientY);this.view?.setGhost(d,d?!this.editor.placeProblem(d):true);});
      canvas.addEventListener('pointerleave',()=>this.view?.setGhost(null));
      canvas.addEventListener('pointerup',e=>{pressed.delete(e.pointerId);const p=this.pointer;this.pointer=null;if(this.busy||pinched||!p||Math.hypot(p.x-e.clientX,p.y-e.clientY)>7)return;
        if(this.get<HTMLSelectElement>('tool').value==='select')this.editor.select(this.view!.pickPart(e.clientX,e.clientY),e.shiftKey);
        else{const d=this.draftAt(e.clientX,e.clientY);if(d)this.result(this.editor.add(d));}
      });
      this.stage.onFrame(()=>{if(this.stage){canvas.dataset.practical=JSON.stringify(this.stage.practical.stats());canvas.dataset.resources=JSON.stringify(this.stage.stats());canvas.dataset.textureFormat=this.stage.library.textureFormat;}});
      this.stage.start();this.entries=await this.bridge.read();this.libraryOptions();
      if(this.entries.length)this.load(this.entries[0]);else this.starter();
      this.status(this.entries.length?'Library loaded from the server.':'Start with this cabin, or create a new blueprint.');
    }catch(error){this.status(error instanceof Error?error.message:'Workshop unavailable. Close and retry.');}
    finally{this.busy=false;this.changed();this.frame();}
  }
  close(force=false){
    if(this.busy||(!force&&!this.discard()))return;
    this.dialog.close();document.body.classList.remove('workshop-open');
    this.view?.dispose();this.templates?.dispose();this.stage?.dispose();this.stage?.renderer.forceContextLoss();this.view=null;this.templates=null;this.stage=null;
    this.saved=null;this.editor.reset();
  }
  private starter(){const bp=industrialCabin();bp.id=crypto.randomUUID() as Blueprint['id'];this.saved=null;this.editor.load(bp);this.level=0;this.get<HTMLSelectElement>('level').value='0';this.view?.setLevel(0);this.changed();this.frame();}
  private load(entry:LibraryEntry){this.saved=entry;this.editor.load(entry.blueprint);this.level=0;this.get<HTMLSelectElement>('level').value='0';this.view?.setLevel(0);this.changed();this.frame();this.status('Saved blueprint opened.');}
  private libraryOptions(){const select=this.get<HTMLSelectElement>('library');select.replaceChildren(...this.entries.map(e=>new Option(e.blueprint.name,e.blueprint.id)));if(this.saved)select.value=this.saved.blueprint.id;}
  private async save(){
    const problem=this.editor.saveProblem();if(problem){this.status(problem);return;}
    this.busy=true;this.changed();this.status('Saving blueprint…');
    try{
      const entry=await this.bridge.save({document:JSON.parse(encodeBlueprint(this.editor.toBlueprint())),expectedVersion:this.saved?.version??0});
      this.saved=entry;this.editor.markSaved();const index=this.entries.findIndex(e=>e.blueprint.id===entry.blueprint.id);if(index<0)this.entries.push(entry);else this.entries[index]=entry;
      this.libraryOptions();this.status('Saved to your server library. Ready to place.');
    }catch(error){this.status(error instanceof Error?error.message:'Save failed. Your draft is still open.');}
    finally{this.busy=false;this.changed();}
  }
  private place(){if(!this.saved||this.unsaved||!this.bridge.allowed())return;const entry=this.saved;this.close(true);this.bridge.place(entry);}
  private draftAt(x:number,y:number){const part=this.get<HTMLSelectElement>('tool').value;if(part==='select')return null;const point=this.view?.pointToGrid(x,y);return point?this.view!.slotAt(part as PartId,point.gx,point.gz,Number(this.get<HTMLSelectElement>('rot').value) as Rot,false):null;}
  private addAtCell(){const part=this.get<HTMLSelectElement>('tool').value;if(part==='select'){this.status('Choose a part tool first.');return;}
    this.result(this.editor.add({part:part as PartId,x:Number(this.get<HTMLSelectElement>('x').value),z:Number(this.get<HTMLSelectElement>('z').value),level:this.level,rot:Number(this.get<HTMLSelectElement>('rot').value) as Rot}));}
  private frame(){
    if(!this.stage||!this.templates)return;
    const box=this.view?.bounds()??new T.Box3();
    if(box.isEmpty())box.set(new T.Vector3(-2.5,-.15,-2.5),new T.Vector3(2.5,STOREY*this.level+.2,2.5));
    // Include the active plane, but keep the actual model centred on narrow screens.
    box.expandByPoint(new T.Vector3(box.getCenter(new T.Vector3()).x,this.level*STOREY,box.getCenter(new T.Vector3()).z));
    this.stage.camera.fov=44;this.stage.camera.updateProjectionMatrix();
    this.stage.resize();
    // Header, tools and footer occupy separate grid rows; none overlay this canvas.
    this.stage.frameBox(box,{direction:new T.Vector3(.8,.55,1),topInset:0,bottomInset:0,minDistance:4,margin:1.1});
  }
  private inside(){
    if(!this.stage||!this.editor.parts.length)return;
    const door=this.editor.parts.find(p=>p.part==='wall.door.open');
    if(!door){this.status('Add an open doorway to use the interior view.');return;}
    this.editor.select(null);
    const t=partTransform(door,{x:2.5,z:2.5}), front=new T.Vector3(Math.sin(t.yaw),0,Math.cos(t.yaw));
    const eye=new T.Vector3(...t.position).add(new T.Vector3(0,1.15,0)).addScaledVector(front,-.18);
    this.stage.camera.fov=74;this.stage.camera.updateProjectionMatrix();
    this.stage.camera.position.copy(eye);this.stage.controls.target.copy(eye).addScaledVector(front,-1.25);this.stage.controls.update();this.stage.renderOnce();
    this.status('Interior view. Drag to look around, or Frame model to return.');
  }
  private changed(){
    if(!this.opened)return;
    this.get<HTMLInputElement>('name').value=this.editor.name;
    this.get<HTMLInputElement>('name').disabled=this.busy;
    this.get<HTMLFieldSetElement>('fields').disabled=this.busy;
    this.get<HTMLButtonElement>('close').disabled=this.busy;
    this.get<HTMLButtonElement>('save').disabled=this.busy||!!this.editor.saveProblem();
    this.get<HTMLButtonElement>('place').disabled=this.busy||this.unsaved||!this.saved;
    this.get<HTMLButtonElement>('undo').disabled=!this.editor.canUndo;this.get<HTMLButtonElement>('redo').disabled=!this.editor.canRedo;
    this.get<HTMLButtonElement>('load').disabled=!this.entries.length;
    this.get('count').textContent=`${this.editor.parts.length} / 120 parts · ${this.unsaved?'Unsaved':'Saved'}`;
    this.get('parts-title').textContent=`Parts & groups (${this.editor.selection.size} selected)`;
    const list=this.get<HTMLSelectElement>('parts');const scroll=list.scrollTop;
    list.replaceChildren(...this.editor.parts.map(p=>{const o=new Option(`#${p.n} ${PARTS[p.part].label} · L${p.level+1}`,String(p.n));o.selected=this.editor.selection.has(p.n);return o;}));list.scrollTop=scroll;
    this.get('groups').textContent=this.editor.groups.map(g=>`${g.name} (${g.members.length})`).join(' · ');
  }
}
