import * as T from 'three';
import {setHTML,setText} from './i18n.ts';
import './photo-mode.css';

export type PhotoCamera = T.PerspectiveCamera | T.OrthographicCamera;
export interface PhotoView {scene:T.Scene;camera:PhotoCamera;target:T.Vector3;prepare?:(camera:PhotoCamera)=>void}
interface PhotoBridge {
  renderer:T.WebGLRenderer;
  ready():boolean;
  flush():Promise<void>;
  view(mode:'follow'|'overview',width:number,height:number):PhotoView;
  pause(active:boolean):void;
  notice(message:string):void;
}
export function photoDimensions(aspect:number,longEdge:number,maxSide=4096){
  if(!Number.isFinite(aspect)||aspect<=0||![2048,3840].includes(longEdge))throw Error('Choose a photo size.');
  const edge=Math.min(longEdge,maxSide),width=Math.round(aspect>=1?edge:edge*aspect),height=Math.round(aspect>=1?edge/aspect:edge);
  return {width:Math.max(1,width),height:Math.max(1,height)};
}
function resizeCamera(camera:PhotoCamera,aspect:number){
  if(camera instanceof T.PerspectiveCamera)camera.aspect=aspect;
  else {const height=camera.top-camera.bottom,center=(camera.left+camera.right)/2;camera.left=center-height*aspect/2;camera.right=center+height*aspect/2;}
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}

/** A local render of existing geometry. It never writes world or blueprint data. */
export class PhotoMode {
  private root=document.createElement('section');
  private current:PhotoView|null=null;
  private original:{scene:T.Scene;fog:T.Fog|T.FogExp2|null;background:T.Scene['background']}|null=null;
  private priorFocus:HTMLElement|null=null;
  private mode:'follow'|'overview'='overview';
  private drag:{id:number;x:number;y:number}|null=null;
  private saving=false;
  private opening=false;
  private zoom=1;
  private basePosition=new T.Vector3();
  get active(){return this.current!==null;}
  get capturing(){return this.saving;}
  constructor(private bridge:PhotoBridge){
    this.root.id='photo-mode';this.root.hidden=true;this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label','Photo mode');
    setHTML(this.root,`<div class="photo-drag" aria-label="Drag to frame your photo"></div><header><div><span class="eyebrow">LITTLE WORLDS</span><h2>Photo mode</h2></div><button id="photo-close">Back to exploring</button></header><div class="photo-tools"><div class="photo-views"><button id="photo-follow">Current view</button><button id="photo-overview">Whole scene</button><button id="photo-reset">Reset framing</button></div><label>Zoom<input id="photo-zoom" type="range" min="0.65" max="1.7" step="0.01" value="1"></label><div class="photo-export"><select id="photo-size" aria-label="Photo size"><option value="2048">2K photo</option><option value="3840">4K photo</option></select><button id="photo-save" class="primary">Save PNG</button></div><p id="photo-status" role="status">Drag to orbit. Your world stays as you left it.</p></div>`);
    document.body.append(this.root);
    this.get('close').onclick=()=>this.close();this.get('save').onclick=()=>void this.capture();
    this.get('follow').onclick=()=>this.reframe('follow');this.get('overview').onclick=()=>this.reframe('overview');this.get('reset').onclick=()=>this.reframe(this.mode);
    this.get<HTMLInputElement>('zoom').oninput=e=>{this.zoom=Number((e.target as HTMLInputElement).value);this.applyZoom();};
    const drag=this.root.querySelector<HTMLElement>('.photo-drag')!;
    drag.onpointerdown=e=>{if(this.saving)return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};drag.setPointerCapture(e.pointerId);};
    drag.onpointermove=e=>{if(!this.drag||!this.current||this.saving)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag.x=e.clientX;this.drag.y=e.clientY;this.orbit(dx*.005,dy*.004);};
    drag.onpointerup=drag.onpointercancel=()=>{this.drag=null;};
    window.addEventListener('keydown',e=>{
      if(!this.active)return;
      e.stopImmediatePropagation();
      if(e.key==='Escape'){e.preventDefault();this.close();}
      if(e.key==='Tab'){
        const items=[...this.root.querySelectorAll<HTMLElement>('button:not(:disabled),select,input')],i=items.indexOf(document.activeElement as HTMLElement);
        if(e.shiftKey&&i<=0){e.preventDefault();items.at(-1)?.focus();}else if(!e.shiftKey&&i===items.length-1){e.preventDefault();items[0]?.focus();}
      }
    },true);
    window.addEventListener('resize',()=>{if(this.active&&!this.saving)this.reframe(this.mode);});
  }
  private get<E extends HTMLElement=HTMLButtonElement>(id:string){return this.root.querySelector<E>('#photo-'+id)!;}
  async open(){
    if(this.active||this.opening||!this.bridge.ready())return;
    this.opening=true;this.priorFocus=document.activeElement as HTMLElement;
    try{
      this.bridge.pause(true);await this.bridge.flush();
      this.root.hidden=false;document.body.classList.add('photo-mode');this.reframe('overview');this.get('close').focus();
    }catch(error){this.bridge.pause(false);this.bridge.notice(error instanceof Error?error.message:'Could not open photo mode.');}
    finally{this.opening=false;}
  }
  close(){
    if(!this.active||this.saving)return;
    this.restoreScene();this.current=null;this.drag=null;this.root.hidden=true;document.body.classList.remove('photo-mode');this.bridge.pause(false);this.priorFocus?.focus();
  }
  private restoreScene(){if(this.original){this.original.scene.fog=this.original.fog;this.original.scene.background=this.original.background;this.original=null;}}
  private reframe(mode:'follow'|'overview'){
    if(this.saving)return;this.restoreScene();this.mode=mode;
    this.current=this.bridge.view(mode,innerWidth,innerHeight);const {scene,camera}=this.current;
    this.original={scene,fog:scene.fog?.clone()??null,background:scene.background};
    if(!scene.background)scene.background=(scene.fog?.color??this.bridge.renderer.getClearColor(new T.Color())).clone();
    this.basePosition.copy(camera.position);this.zoom=1;this.get<HTMLInputElement>('zoom').value='1';
    this.get('follow').setAttribute('aria-pressed',String(mode==='follow'));this.get('overview').setAttribute('aria-pressed',String(mode==='overview'));
    resizeCamera(camera,innerWidth/innerHeight);setText(this.get('status'),'Drag to orbit. Your world stays as you left it.');
  }
  private orbit(yaw:number,pitch:number){
    const view=this.current;if(!view)return;
    const offset=this.basePosition.clone().sub(view.target),up=view.camera.up.clone().normalize();
    offset.applyAxisAngle(up,-yaw);const right=new T.Vector3().crossVectors(offset,up).normalize();
    const trial=offset.clone().applyAxisAngle(right,-pitch);
    if(Math.abs(trial.clone().normalize().dot(up))<.985)offset.copy(trial);
    this.basePosition.copy(view.target).add(offset);this.applyZoom();
  }
  private applyZoom(){
    const view=this.current;if(!view)return;
    view.camera.position.copy(this.basePosition).sub(view.target).multiplyScalar(view.camera instanceof T.PerspectiveCamera?1/this.zoom:1).add(view.target);
    if(view.camera instanceof T.OrthographicCamera)view.camera.zoom=this.zoom;
    view.camera.lookAt(view.target);view.camera.updateProjectionMatrix();view.camera.updateMatrixWorld(true);
  }
  frame(){
    if(!this.current||this.saving)return;
    this.current.prepare?.(this.current.camera);this.bridge.renderer.render(this.current.scene,this.current.camera);
  }
  async capture(){
    const view=this.current;if(!view||this.saving)return;this.saving=true;
    const renderer=this.bridge.renderer,size=renderer.getSize(new T.Vector2()),ratio=renderer.getPixelRatio(),pixelLimit=Math.min(renderer.capabilities.maxTextureSize,4096);
    const dimensions=photoDimensions(innerWidth/innerHeight,Number(this.get<HTMLSelectElement>('size').value),pixelLimit);
    const factor=Math.min(2,Math.floor(pixelLimit/Math.max(dimensions.width,dimensions.height)));
    const photoCamera=view.camera.clone() as PhotoCamera;resizeCamera(photoCamera,dimensions.width/dimensions.height);
    for(const control of this.root.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select'))control.disabled=true;
    setText(this.get('status'),'Rendering your photo…');
    try{
      renderer.setPixelRatio(factor);renderer.setSize(dimensions.width,dimensions.height,false);view.prepare?.(photoCamera);renderer.render(view.scene,photoCamera);
      const canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;
      const context=canvas.getContext('2d');if(!context)throw Error('Photo export is unavailable.');
      context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(renderer.domElement,0,0,canvas.width,canvas.height);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Photo export failed.')),'image/png'));
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`little-worlds-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      this.root.dataset.lastExport=JSON.stringify({...dimensions,bytes:blob.size,supersampling:factor,source:'local geometry'});
      setText(this.get('status'),'Photo saved. Keep exploring or try another view.');
    }catch(error){setText(this.get('status'),error instanceof Error?error.message:'Photo export failed.');}
    finally{
      renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);resizeCamera(view.camera,innerWidth/innerHeight);this.saving=false;
      for(const control of this.root.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select'))control.disabled=false;
      this.frame();
    }
  }
}
