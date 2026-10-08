import type {Universe} from '../shared/planets.ts';
import type {HomeSetupPreview,HomeSetupAddition,HomeSetupConfirm} from '../shared/home-setup.ts';
import {setHTML,setText,localizedOption} from './i18n.ts';

interface SetupBridge {
  preview(planetId:string):Promise<HomeSetupPreview>;
  confirm(body:HomeSetupConfirm):Promise<Universe>;
  ghost(addition:HomeSetupAddition|undefined):void;
  apply(universe:Universe):void;
  notice(message:string):void;
}
/** Owners explicitly choose an existing entrance or preview one new cottage. */
export class HomeSetup {
  private button=document.createElement('button');
  private dialog=document.createElement('dialog');
  private universe:Universe|null=null;
  private plan:HomeSetupPreview|null=null;
  private busy=false;
  constructor(private bridge:SetupBridge){
    this.button.id='home-setup';this.button.hidden=true;setText(this.button,'Set up my home');
    document.getElementById('claim-planet')?.after(this.button);
    this.dialog.id='home-setup-dialog';this.dialog.setAttribute('aria-labelledby','home-setup-title');
    setHTML(this.dialog,`<span class="eyebrow">MAKE YOURSELF AT HOME</span><h2 id="home-setup-title">A room for this planet</h2><p>Your saved buildings stay in place. Choose an existing doorway, or preview one new cottage.</p><div id="home-setup-existing"><label for="home-setup-choice">Existing doorway</label><select id="home-setup-choice"></select><button id="home-setup-bind" class="primary">Use this doorway</button></div><button id="home-setup-preview">Preview a new cottage</button><p id="home-setup-status" role="status"></p><button id="home-setup-add" class="primary" hidden>Build this cottage</button><button id="home-setup-cancel">Cancel</button>`);
    document.body.append(this.dialog);this.button.onclick=()=>void this.open();
    this.get('cancel').onclick=()=>this.close();this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    this.get('preview').onclick=()=>{if(!this.plan?.addition)return;this.dialog.close();this.bridge.ghost(this.plan.addition);this.showPreviewBar();};
    this.get('bind').onclick=()=>void this.confirm('bind');this.get('add').onclick=()=>void this.confirm('add');
  }
  private get<E extends HTMLElement=HTMLButtonElement>(name:string){return this.dialog.querySelector<E>('#home-setup-'+name)!;}
  receive(universe:Universe){
    if(this.plan&&(this.plan.planetId!==universe.currentPlanet.id||this.plan.expectedRevision!==universe.currentPlanet.revision||universe.player.home))this.close();
    this.universe=universe;this.button.hidden=!universe.currentPlanet.mine||!!universe.player.home||!universe.player.location||universe.player.location.kind!=='exterior'||universe.player.flight.mode!=='ground';
  }
  private close(){
    if(this.busy)return;this.dialog.close();this.plan=null;this.bridge.ghost(undefined);document.getElementById('home-setup-preview-bar')?.remove();
  }
  private async open(){
    if(this.busy||!this.universe)return;this.busy=true;
    try{
      this.plan=await this.bridge.preview(this.universe.currentPlanet.id);
      document.querySelector<HTMLDialogElement>('#menu-dialog')?.close();
      const select=this.get<HTMLSelectElement>('choice');select.replaceChildren();
      this.plan.candidates.forEach((candidate,i)=>select.add(localizedOption(`${candidate.buildingName} · ${candidate.partNumber}`,String(i),false,false,true)));
      this.get('existing').hidden=!this.plan.candidates.length;this.get('preview').hidden=!this.plan.addition;
      setText(this.get('status'),this.plan.reason??'One home interior will stay attached to this building.');this.dialog.showModal();
    }catch(error){this.bridge.notice(error instanceof Error?error.message:'Could not preview this home.');}
    finally{this.busy=false;}
  }
  private showPreviewBar(){
    const bar=document.createElement('section');bar.id='home-setup-preview-bar';
    setHTML(bar,'<strong>New cottage preview</strong><p>One ordinary building. Nothing is saved until you confirm.</p><button id="home-setup-confirm-add" class="primary">Build this cottage</button><button id="home-setup-reconsider">Choose another option</button><button id="home-setup-dismiss">Cancel</button>');
    document.body.append(bar);
    bar.querySelector<HTMLButtonElement>('#home-setup-confirm-add')!.onclick=()=>void this.confirm('add');
    bar.querySelector<HTMLButtonElement>('#home-setup-dismiss')!.onclick=()=>this.close();
    bar.querySelector<HTMLButtonElement>('#home-setup-reconsider')!.onclick=()=>{if(this.busy)return;bar.remove();this.bridge.ghost(undefined);this.dialog.showModal();};
  }
  private async confirm(mode:'bind'|'add'){
    const plan=this.plan,location=this.universe?.player.location;if(this.busy||!plan||!location)return;this.busy=true;
    const controls=[...this.dialog.querySelectorAll<HTMLButtonElement>('button'),...document.querySelectorAll<HTMLButtonElement>('#home-setup-preview-bar button')];controls.forEach(button=>button.disabled=true);
    try{
      const candidate=plan.candidates[Number(this.get<HTMLSelectElement>('choice').value)];
      const result=await this.bridge.confirm({planetId:plan.planetId,expectedRevision:plan.expectedRevision,hash:plan.hash,visitEpoch:location.visitEpoch,mode,...(mode==='bind'&&candidate?{buildingId:candidate.buildingId,partNumber:candidate.partNumber}:{})});
      this.busy=false;this.close();this.bridge.apply(result);this.bridge.notice('Your home is ready. Walk to its door to enter.');
    }catch(error){this.bridge.notice(error instanceof Error?error.message:'Could not set up this home.');}
    finally{this.busy=false;controls.forEach(button=>button.disabled=false);}
  }
}
