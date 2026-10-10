import { localizedOption, setAttribute, setHTML, setText, translate } from './i18n.ts';
import * as T from 'three';
import { BlueprintEditor } from './blueprint-editor.ts';
import { encodeBlueprint } from '../shared/blueprint-codec.ts';
import { industrialCabin, homeCottage, cornerLane, padStall } from '../assets/claude-geometry/blueprint/samples.ts';
import { partTransform } from '../shared/blueprint-model.ts';
import type { Blueprint, PartPlacement, Rot } from '../shared/blueprint-model.ts';
import { isDoorPartId, isOpenDoorPartId, isPartId, isWideDoorPartId, isWideEntryPartId, PART_IDS, PART_INFO, PARTS, partBlurb } from '../shared/blueprint-parts.ts';
import type { PartId } from '../shared/blueprint-parts.ts';
import { STOREY } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { WorkshopView, PartTemplates, partIcon } from './blueprint-view.ts';
import { WIDE_DOOR } from '../shared/wide-door.ts';
import type { Stage } from '../assets/claude-geometry/shell/stage.ts';
import type { LibraryEntry } from '../shared/blueprints.ts';
import './workshop.css';
import { villagePartDiagnostic, villagePartLabel } from './part-labels.ts';
import { createPresentationStage } from './presentation-stage.ts';
import { samplePublicWorkshopPlans } from '../shared/sample-public-village.ts';
import {beginSceneLoading,yieldSceneFrame} from './loading-state.ts';

export interface WorkshopBridge {
  read: () => Promise<LibraryEntry[]>;
  save: (body: unknown) => Promise<LibraryEntry>;
  place: (entry: LibraryEntry) => void;
  allowed: () => boolean;
}
export interface WorkshopOpenOptions { homeDoorPartNumber?: number }
// This adapter owns UI/lifecycle and server transport. All snapping, groups,
// undo, support checks, picking and geometry remain Claude's committed editor.
export class Workshop {
  private dialog = document.createElement('dialog');
  private editor = new BlueprintEditor();
  private stage: Stage | null = null;
  private view: WorkshopView | null = null;
  private templates: PartTemplates | null = null;
  private icons = new Map<PartId, string>();
  private homeDoorPartNumber: number | undefined;
  private entries: LibraryEntry[] = [];
  private saved: LibraryEntry | null = null;
  private level = 0;
  private busy = false;
  private loading: {controller:AbortController;task:ReturnType<typeof beginSceneLoading>} | null = null;
  private applyToPlaced: ((entry: LibraryEntry) => Promise<void>) | null = null;
  private pointer: {x:number;y:number} | null = null;
  private hover: {x:number;y:number} | null = null;
  private unload = (e: BeforeUnloadEvent) => { if (this.opened && this.unsaved) e.preventDefault(); };
  constructor(private bridge: WorkshopBridge) {
    this.dialog.id = 'workshop'; this.dialog.setAttribute('aria-labelledby', 'workshop-title');
    setHTML(this.dialog, `
      <header class="ws-head"><div><small>MY PLANET / ASSEMBLY BAY</small><h2 id="workshop-title">Workshop</h2></div><button id="ws-close" aria-label="Close workshop">Done ×</button></header>
      <div class="ws-bar"><label>Name <input id="ws-name" maxlength="60" autocomplete="off" value=""></label><div class="ws-actions"><button id="ws-save" aria-describedby="ws-save-state">Save blueprint</button><button id="ws-place" aria-describedby="ws-save-state">Place on planet ↗</button><button id="ws-apply" hidden>Apply to my home</button></div></div>
      <div class="ws-body"><section class="ws-view" aria-label="Blueprint preview"><div class="ws-camera"><label>Level <select id="ws-level"><option value="0">L1 · ground</option><option value="1">L2 · upper</option><option value="2">L3 · top</option></select></label><button id="ws-frame">Frame model</button><button id="ws-inside">Look inside</button></div><div id="ws-stage"></div><p id="ws-hint" class="ws-hint" role="status" aria-live="polite">Drag to orbit · pinch or scroll to zoom · tap to add or select</p></section>
      <aside class="ws-panel"><fieldset id="ws-fields"><div class="ws-row"><button id="ws-new">New</button><button id="ws-cabin">Cabin starter</button><button id="ws-copy">Save as copy</button></div>
      <div class="ws-row"><label>Example <select id="ws-example"><option value="home">Lived-in cottage</option><option value="lane">Corner lane and courtyard</option><option value="stall">Pad-side stall</option></select></label><button id="ws-example-load">Load example</button></div>
      <label>Tool <select id="ws-tool"><option value="select">Select / inspect</option></select></label>
      <div id="ws-part-info" class="ws-part-info" hidden><img id="ws-part-icon" width="64" height="64" alt=""><div><p id="ws-part-blurb"></p><small><span>Dimensions</span> · <span id="ws-part-dimensions" data-i18n-verbatim></span></small><p id="ws-part-rule"></p></div></div>
      <div class="ws-row"><label>Column <select id="ws-x"></select></label><label>Row <select id="ws-z"></select></label><label>Turn <select id="ws-rot"><option value="0">0°</option><option value="1">90°</option><option value="2">180°</option><option value="3">270°</option></select></label></div>
      <div class="ws-row"><button id="ws-add">Add at cell</button><button id="ws-replace-door" aria-describedby="ws-door-note">Replace selected door</button></div><small>Walls snap to the chosen cell edge. Upper parts need support.</small>
      <small id="ws-door-note" hidden>Door tools set the blueprint pose. A bound home uses its Open/Close action during play.</small>
      <div class="ws-row"><button id="ws-undo">Undo</button><button id="ws-redo">Redo</button><button id="ws-remove">Remove</button><button id="ws-rotate">Rotate</button></div>
      <details><summary id="ws-parts-title">Parts & groups</summary><label>Parts (multiple selection)<select id="ws-parts" multiple size="5"></select></label><div class="ws-row"><button id="ws-all">Select all</button><button id="ws-clear">Deselect</button><button id="ws-up">Level up</button><button id="ws-down">Level down</button></div><div class="ws-row"><button id="ws-left">←</button><button id="ws-forward">↑</button><button id="ws-back">↓</button><button id="ws-right">→</button></div><label>Group name <input id="ws-group-name" maxlength="40" placeholder="e.g. Cabin shell"></label><div class="ws-row"><button id="ws-group">Group selection</button><button id="ws-ungroup">Ungroup</button></div><p id="ws-groups" data-i18n-verbatim></p></details>
      <details open><summary>My saved blueprints</summary><select id="ws-library" data-i18n-verbatim aria-label="Saved blueprints"></select><button id="ws-load">Open saved blueprint</button><p class="ws-private">Names and groups stay in your private library. Visitors see placed geometry.</p></details></fieldset></aside></div>
      <footer class="ws-footer"><div class="ws-feedback"><span id="ws-status" role="status" aria-live="polite">Ready.</span><small id="ws-save-state" role="status" aria-live="polite"></small></div><span id="ws-count"></span></footer>`);
    document.body.append(this.dialog);
    const tool=this.get<HTMLSelectElement>('tool');
    for(const id of PART_IDS) tool.add(localizedOption(villagePartLabel(id), id));
    const villagePlans=document.createElement('optgroup');setAttribute(villagePlans,'label','Village plans');
    const samplePlans=samplePublicWorkshopPlans();
    for(const [i,blueprint]of samplePlans.entries())villagePlans.append(localizedOption(blueprint.name,`sample-${i}`));
    this.get<HTMLSelectElement>('example').append(villagePlans);
    for(const id of ['x','z']) for(let n=0;n<5;n++)this.get<HTMLSelectElement>(id).add(localizedOption(String(n+1), String(n)));
    this.on('close',()=>this.close());
    this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    this.dialog.addEventListener('close',()=>{if(!this.opened&&this.loading)this.close(true);});
    this.on('save',()=>void this.save());this.on('place',()=>this.place());
    this.on('apply',()=>void this.applyPlaced());
    this.on('new',()=>{if(!this.discard())return;this.hover=null;this.saved=null;this.editor.reset();this.editor.rename('Untitled structure');this.changed();this.frame();});
    this.on('cabin',()=>{if(this.discard())this.starter();});
    this.on('example-load',()=>{if(!this.discard())return;const key=this.get<HTMLSelectElement>('example').value;const sample=key.startsWith('sample-')?samplePlans[Number(key.slice(7))]:undefined;const bp=sample?structuredClone(sample):(key==='home'?homeCottage:key==='lane'?cornerLane:padStall)();bp.id=crypto.randomUUID() as Blueprint['id'];this.hover=null;this.saved=null;this.editor.load(bp);this.level=0;this.get<HTMLSelectElement>('level').value='0';this.view?.setLevel(0);this.get<HTMLSelectElement>('tool').value='select';this.changed();this.frame();this.status('Example loaded · save your own copy.');});
    this.on('copy',()=>void this.save(true));
    this.on('load',()=>{if(!this.discard())return;const e=this.entries.find(e=>e.blueprint.id===this.get<HTMLSelectElement>('library').value);if(e)this.load(e);});
    this.get<HTMLInputElement>('name').oninput=()=>this.editor.rename(this.get<HTMLInputElement>('name').value);
    this.get<HTMLSelectElement>('level').onchange=()=>{this.level=Number(this.get<HTMLSelectElement>('level').value);this.view?.setLevel(this.level);this.hover=null;this.frame();this.updatePreview();};
    tool.onchange=()=>{this.hover=null;this.changed();};
    for(const id of ['x','z','rot'])this.get<HTMLSelectElement>(id).onchange=()=>{this.hover=null;this.updatePreview();};
    this.on('frame',()=>this.frame());this.on('inside',()=>this.inside());this.on('add',()=>this.addAtCell());
    this.on('replace-door',()=>this.replaceSelectedDoor());
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
  get preparing(){return this.loading!==null;}
  private get<E extends HTMLElement=HTMLElement>(id:string){return this.dialog.querySelector(`#ws-${id}`) as E;}
  private on(id:string,fn:()=>void){this.get(id).onclick=()=>{if(!this.busy)fn();};}
  private get unsaved(){return this.editor.dirty||(!this.saved&&this.editor.parts.length>0);}
  private discard(){return !this.unsaved||window.confirm(translate('Discard the unsaved blueprint changes?'));}
  private status(text:string){setText(this.get('status'), text);}
  private result(result:{message:string;problem?:unknown}){this.status(result.problem?villagePartDiagnostic(result.message):result.message);}
  async open(initial?: Blueprint, applyToPlaced?: (entry: LibraryEntry) => Promise<void>, applyLabel='Apply to my home', options:WorkshopOpenOptions={}){
    if(this.opened||!this.bridge.allowed())return;
    this.applyToPlaced=applyToPlaced??null;
    this.homeDoorPartNumber=options.homeDoorPartNumber;
    setText(this.get('apply'),applyLabel);
    this.get('apply').hidden=!this.applyToPlaced;this.get('place').hidden=!!this.applyToPlaced;
    this.dialog.showModal();document.body.classList.add('workshop-open');
    const loading={controller:new AbortController(),task:beginSceneLoading('Opening the workshop…',{onCancel:()=>this.close(true)})};this.loading=loading;
    const {signal}=loading.controller,current=()=>this.loading===loading&&!signal.aborted&&this.opened;
    const next=async()=>{await yieldSceneFrame(signal);if(!current())throw new DOMException('Loading cancelled.','AbortError');};
    this.busy=true;this.changed();this.status('Opening your saved library…');
    try{
      await next();await next();
      const entries=await this.bridge.read();if(!current())return;
      this.entries=entries;this.libraryOptions();
      if(initial){const existing=this.entries.find(entry=>entry.blueprint.id===initial.id);this.saved=existing??null;this.editor.load(initial);this.changed();}
      else if(this.entries.length)this.load(this.entries[0]);else this.starter();
      loading.task.update('Preparing the view…');await next();
      this.stage=createPresentationStage('workshop',this.get('stage'));
      this.stage.controls.enabled=false;await next();
      this.templates=new PartTemplates(this.stage.library);
      const partTypes=[...new Set(this.editor.parts.map(part=>part.part))];
      for(const [index,part] of partTypes.entries()){
        loading.task.update('Bringing buildings into view…',index,partTypes.length);this.templates.get(part);await next();
      }
      this.view=new WorkshopView(this.stage,this.editor,this.templates);await next();
      const canvas=this.stage.renderer.domElement;setAttribute(canvas, 'aria-label', 'Workshop 3D preview');
      const pressed=new Set<number>();let pinched=false;
      canvas.addEventListener('pointerdown',e=>{pressed.add(e.pointerId);if(pressed.size>1){pinched=true;this.pointer=null;}else{pinched=false;this.pointer={x:e.clientX,y:e.clientY};}});
      canvas.addEventListener('pointercancel',e=>{pressed.delete(e.pointerId);this.pointer=null;});
      canvas.addEventListener('touchend',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
      canvas.addEventListener('pointermove',e=>{if(this.busy||e.buttons)return;this.hover={x:e.clientX,y:e.clientY};this.updatePreview();});
      canvas.addEventListener('pointerleave',()=>{this.hover=null;this.updatePreview();});
      canvas.addEventListener('pointerup',e=>{pressed.delete(e.pointerId);const p=this.pointer;this.pointer=null;if(this.busy||pinched||!p||Math.hypot(p.x-e.clientX,p.y-e.clientY)>7)return;
        if(this.get<HTMLSelectElement>('tool').value==='select')this.editor.select(this.view!.pickPart(e.clientX,e.clientY),e.shiftKey);
        else{this.hover={x:e.clientX,y:e.clientY};const d=this.draftAt(e.clientX,e.clientY);if(d)this.result(this.editor.add(d));this.updatePreview();}
      });
      this.stage.onFrame(()=>{if(this.stage){canvas.dataset.practical=JSON.stringify(this.stage.practical.stats());canvas.dataset.resources=JSON.stringify(this.stage.stats());canvas.dataset.textureFormat=this.stage.library.textureFormat;}});
      this.frame();loading.task.update('Finishing the view…');await next();
      await this.stage.ready();if(!current())return;
      await this.stage.renderer.compileAsync(this.stage.scene,this.stage.camera);if(!current())return;
      await next();this.stage.renderOnce();await next();
      this.stage.controls.enabled=true;this.stage.start();this.busy=false;this.loading=null;this.changed();loading.task.finish();
      this.status(initial?'Edit the parts. Apply to update the same placed structure.':this.entries.length?'Library loaded from the server.':'Start with this cabin, or create a new blueprint.');
    }catch(error){
      if(current()){
        this.releaseView();
        this.status(error instanceof Error?error.message:'Workshop unavailable. Close and retry.');
        loading.task.fail('Could not finish loading. Your saved world is unchanged.',()=>{if(current()){this.close(true);void this.open(initial,applyToPlaced,applyLabel,options);}});
      }else loading.task.finish();
    }
  }
  close(force=false){
    if(this.busy&&!this.loading||(!force&&!this.loading&&!this.discard()))return;
    const loading=this.loading;this.loading=null;loading?.controller.abort();loading?.task.finish();this.busy=false;
    if(this.opened)this.dialog.close();document.body.classList.remove('workshop-open');
    this.releaseView();
  }
  private releaseView(){
    this.view?.dispose();this.templates?.dispose();this.stage?.dispose();this.stage?.renderer.forceContextLoss();this.view=null;this.templates=null;this.stage=null;
    // The source view subscribes to its editor for the view's lifetime. Retire
    // that editor with the disposed view; reusing it would call a dead library.
    this.pointer=null;this.hover=null;this.saved=null;this.editor=new BlueprintEditor();this.editor.onChange(()=>this.changed());
    this.level=0;this.get<HTMLSelectElement>('level').value='0';this.get<HTMLSelectElement>('tool').value='select';
    this.icons.clear();this.get<HTMLImageElement>('part-icon').removeAttribute('src');
    this.homeDoorPartNumber=undefined;
  }
  private starter(){this.hover=null;const bp=industrialCabin();bp.id=crypto.randomUUID() as Blueprint['id'];this.saved=null;this.editor.load(bp);this.level=0;this.get<HTMLSelectElement>('level').value='0';this.view?.setLevel(0);this.changed();this.frame();}
  private load(entry:LibraryEntry){this.hover=null;this.saved=entry;this.editor.load(entry.blueprint);this.level=0;this.get<HTMLSelectElement>('level').value='0';this.view?.setLevel(0);this.changed();this.frame();this.status('Saved blueprint opened.');}
  private libraryOptions(){const select=this.get<HTMLSelectElement>('library');select.replaceChildren(...this.entries.map(e=>localizedOption(e.blueprint.name, e.blueprint.id, false, false, true)));if(this.saved)select.value=this.saved.blueprint.id;}
  private async save(asCopy=false){
    const problem=this.editor.saveProblem();if(problem){this.status(problem);return;}
    const blueprint=this.editor.toBlueprint();if(asCopy)blueprint.id=crypto.randomUUID() as Blueprint['id'];
    this.busy=true;this.changed();this.status('Saving blueprint…');
    try{
      // Keep the current identity, history and saved version until the server
      // accepts a copy. A failed request must leave the original draft intact.
      const entry=await this.bridge.save({document:JSON.parse(encodeBlueprint(blueprint)),expectedVersion:asCopy?0:this.saved?.version??0});
      if(asCopy)this.editor.load(entry.blueprint);
      this.saved=entry;this.editor.markSaved();const index=this.entries.findIndex(e=>e.blueprint.id===entry.blueprint.id);if(index<0)this.entries.push(entry);else this.entries[index]=entry;
      this.libraryOptions();this.status('Saved to your server library. Ready to place.');
    }catch(error){this.status(error instanceof Error?error.message:'Save failed. Your draft is still open.');}
    finally{this.busy=false;this.changed();}
  }
  private place(){if(!this.saved||this.unsaved||!this.bridge.allowed())return;const entry=this.saved;this.close(true);this.bridge.place(entry);}
  private async applyPlaced(){
    if(!this.applyToPlaced||!this.bridge.allowed())return;
    if(this.unsaved||!this.saved)await this.save();
    if(this.unsaved||!this.saved)return;
    this.busy=true;this.changed();
    try{await this.applyToPlaced(this.saved);this.busy=false;this.close(true);}
    catch(error){this.status(error instanceof Error?error.message:'Could not update this structure. Your draft is safe.');}
    finally{this.busy=false;this.changed();}
  }
  private draftAt(x:number,y:number){const part=this.get<HTMLSelectElement>('tool').value;if(part==='select')return null;const point=this.view?.pointToGrid(x,y);return point?this.view!.slotAt(part as PartId,point.gx,point.gz,Number(this.get<HTMLSelectElement>('rot').value) as Rot,false):null;}
  private cellDraft():Omit<PartPlacement,'n'>|null {
    const part=this.get<HTMLSelectElement>('tool').value;
    return part==='select'?null:{part:part as PartId,x:Number(this.get<HTMLSelectElement>('x').value),z:Number(this.get<HTMLSelectElement>('z').value),level:this.level,rot:Number(this.get<HTMLSelectElement>('rot').value) as Rot};
  }
  private updatePreview(){
    const hint=this.get('hint'),part=this.get<HTMLSelectElement>('tool').value;
    const draft=this.busy?null:this.hover?this.draftAt(this.hover.x,this.hover.y):this.cellDraft();
    const problem=draft?this.editor.placeProblem(draft):null;
    this.view?.setGhost(draft,!problem);
    const text=this.busy?'Preview paused while the library is updating.':part==='select'?'Drag to orbit · pinch or scroll to zoom · tap to select':!draft?'Point inside the build grid, or choose a column and row.':problem?`Cannot place: ${villagePartDiagnostic(problem.message)}`:`Ready to add ${villagePartLabel(draft.part)} · L${draft.level+1}, column ${draft.x+1}, row ${draft.z+1}. ${this.hover?'Tap to add.':'Use Add at cell.'}`;
    if(hint.textContent!==text)setText(hint, text);
  }
  private addAtCell(){this.hover=null;const draft=this.cellDraft();if(!draft){this.status('Choose a part tool first.');return;}
    this.result(this.editor.add(draft));this.updatePreview();}
  private selectedDoors(){return this.editor.parts.filter(p=>this.editor.selection.has(p.n)&&isDoorPartId(p.part));}
  private replaceSelectedDoor(){
    const doors=this.selectedDoors(),part=this.get<HTMLSelectElement>('tool').value;
    if(doors.length!==1||!isDoorPartId(part)){this.status('Select one existing door and choose a door tool.');return;}
    if(doors[0].n===this.homeDoorPartNumber&&!isOpenDoorPartId(part)){this.status('Keep the home entrance open in this blueprint. Use Open/Close door during play.');return;}
    this.result(this.editor.replaceDoor(doors[0].n,part));this.updatePreview();
  }
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
    this.updatePreview();
  }
  private inside(){
    if(!this.stage||!this.editor.parts.length)return;
    const door=this.editor.parts.find(p=>isOpenDoorPartId(p.part));
    if(!door){this.status('Add an open doorway to use the interior view.');return;}
    this.editor.select(null);
    const t=partTransform(door,{x:2.5,z:2.5}), front=new T.Vector3(Math.sin(t.yaw),0,Math.cos(t.yaw));
    const eye=new T.Vector3(...t.position).add(new T.Vector3(0,1.15,0)).addScaledVector(front,-.18);
    if(isWideDoorPartId(door.part))eye.addScaledVector(new T.Vector3(Math.cos(t.yaw),0,-Math.sin(t.yaw)),WIDE_DOOR.centerX);
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
    const saveProblem=this.editor.saveProblem();
    this.get<HTMLButtonElement>('save').disabled=this.busy||!!saveProblem;
    this.get<HTMLButtonElement>('apply').disabled=this.busy||!!saveProblem;
    const saveState=this.get('save-state'),saveText=this.busy?'':saveProblem??(this.unsaved?'Save your changes before placing on the planet.':'');
    if(saveState.textContent!==saveText)setText(saveState, saveText);
    this.get<HTMLButtonElement>('place').disabled=this.busy||this.unsaved||!this.saved;
    this.get<HTMLButtonElement>('undo').disabled=!this.editor.canUndo;this.get<HTMLButtonElement>('redo').disabled=!this.editor.canRedo;
    this.get<HTMLButtonElement>('load').disabled=!this.entries.length;
    const selectedDoors=this.selectedDoors(),doorTool=this.get<HTMLSelectElement>('tool').value;
    const boundClosed=selectedDoors.length===1&&selectedDoors[0].n===this.homeDoorPartNumber&&!isOpenDoorPartId(doorTool);
    this.get<HTMLButtonElement>('replace-door').disabled=this.busy||selectedDoors.length!==1||!isDoorPartId(doorTool)||boundClosed;
    this.get('door-note').hidden=!isDoorPartId(doorTool)&&selectedDoors.length===0;
    setText(this.get('door-note'),boundClosed?'Keep the home entrance open in this blueprint. Use Open/Close door during play.':'Door tools set the blueprint pose. A bound home uses its Open/Close action during play.');
    setText(this.get('count'), `${this.editor.parts.length} / 120 parts · ${this.unsaved?'Unsaved':'Saved'}`);
    setText(this.get('parts-title'), `Parts & groups (${this.editor.selection.size} selected)`);
    const list=this.get<HTMLSelectElement>('parts');const scroll=list.scrollTop;
    list.replaceChildren(...this.editor.parts.map(p=>{const o=localizedOption(`#${p.n} ${villagePartLabel(p.part)} · L${p.level+1}`, String(p.n));o.selected=this.editor.selection.has(p.n);return o;}));list.scrollTop=scroll;
    this.updatePreview();
    this.updatePartInfo();
    setText(this.get('groups'), this.editor.groups.map(g=>`${g.name} (${g.members.length})`).join(' · '));
  }
  private updatePartInfo(){
    const part=this.get<HTMLSelectElement>('tool').value,card=this.get('part-info');
    card.hidden=!isPartId(part);if(!isPartId(part))return;
    setText(this.get('part-blurb'),partBlurb(part,'village'));
    setText(this.get('part-rule'),isWideDoorPartId(part)?'Spans two adjacent edges. Both cells need floors. Keep both inward door swings clear.':isWideEntryPartId(part)?'Spans two cells at ground level. Needs floors behind both cells. Keep the foot edges clear.':PARTS[part].mount==='edge'?'Walls snap to the chosen cell edge. Upper parts need support.':'Place within the build grid. Upper parts need support.');
    const envelope=PART_INFO[part].envelope?.village;
    const size=envelope?new T.Vector3(...envelope.max).sub(new T.Vector3(...envelope.min)):this.templates?new T.Box3().setFromObject(this.templates.get(part).group).getSize(new T.Vector3()):null;
    this.get('part-dimensions').textContent=size?`${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`:'';
    if(this.stage&&!this.busy){
      let icon=this.icons.get(part);if(!icon){icon=partIcon(this.stage,part);this.icons.set(part,icon);}
      this.get<HTMLImageElement>('part-icon').src=icon;
    }
  }
}
