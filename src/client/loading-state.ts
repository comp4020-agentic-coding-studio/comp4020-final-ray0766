import './loading-state.css';

/** Yield a real browser frame, with cancellation even in a hidden tab. Call
 * twice before the first heavy step so the new feedback has been painted. */
export function yieldSceneFrame(signal?:AbortSignal):Promise<void>{
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Loading cancelled.','AbortError'));return;}
    const abort=()=>{cancelAnimationFrame(frame);reject(new DOMException('Loading cancelled.','AbortError'));};
    const frame=requestAnimationFrame(()=>{signal?.removeEventListener('abort',abort);resolve();});
    signal?.addEventListener('abort',abort,{once:true});
  });
}

export interface LoadingTask {title:string;label:string;done?:number;total?:number;error?:string;retry?:()=>void;onCancel?:()=>void}
const tasks=new Map<symbol,LoadingTask>();
const observers=new Set<(task:Readonly<LoadingTask>|null)=>void>();
let embeddedHost:HTMLElement|null=null;
let root:HTMLDialogElement|null=null;
const zh:Record<string,string>={
  'Preparing your flight corridor…':'正在预加载飞行航路…',
  'Preparing your world…':'正在准备你的星球…','Preparing nearby worlds…':'正在准备附近的星球…',
  'Preparing your room…':'正在准备房间…','Opening the workshop…':'正在打开工坊…',
  'Preparing the ground…':'正在准备地面…','Bringing buildings into view…':'正在准备建筑…',
  'Preparing the view…':'正在准备画面…','Preparing the room…':'正在准备房间…',
  'Preparing furniture…':'正在准备家具…','Finishing the view…':'正在完成画面…',
  'Controls return when the view is ready.':'画面准备完成后即可继续操作。',
  'Could not finish loading. Your saved world is unchanged.':'加载未完成，已保存的星球没有改变。','Try again':'重试','Cancel':'取消',
};
export const sceneLoadingLabel=(text:string)=>document.documentElement.lang.startsWith('zh')?zh[text]??text:text;
const label=sceneLoadingLabel;
export const sceneLoadingActive=()=>tasks.size>0;
/** A welcome panel can present the same real counts without a second modal.
 * Loading still blocks world input; controls inside its host remain usable. */
export function embedSceneLoading(host:HTMLElement,observe:(task:Readonly<LoadingTask>|null)=>void){
  if(embeddedHost&&embeddedHost!==host)throw new Error('A loading host is already active.');
  embeddedHost=host;observers.add(observe);paint();
  return ()=>{observers.delete(observe);if(embeddedHost===host)embeddedHost=null;paint();};
}
function paint(){
  if(!root){
    root=document.createElement('dialog');root.className='scene-loading-overlay';root.setAttribute('role','status');root.setAttribute('aria-live','polite');
    root.addEventListener('cancel',event=>{event.preventDefault();[...tasks.values()].at(-1)?.onCancel?.();});
    root.innerHTML='<div class="scene-loading-card"><strong></strong><p class="scene-loading-phase"></p><progress></progress><p class="scene-loading-help"></p><button type="button" class="scene-loading-retry"></button><button type="button" class="scene-loading-cancel"></button></div>';
    document.body.append(root);
    // Release events must reach existing handlers to clear held keys/sticks.
    for(const name of ['pointerdown','click','wheel','keydown'] as const)window.addEventListener(name,event=>{
      if(!tasks.size)return;
      if(event.target instanceof Node&&(root!.contains(event.target)||embeddedHost?.contains(event.target))){
        if(name==='keydown')event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();event.stopImmediatePropagation();
    },{capture:true,passive:false});
  }
  const task=[...tasks.values()].at(-1);root.hidden=!task||!!embeddedHost;document.body.classList.toggle('scene-loading',!!task);
  for(const observe of observers)observe(task?{...task}:null);
  if(embeddedHost){if(root.open)root.close();return;}
  if(!task){if(root.open)root.close();return;}
  if(!root.open)root.showModal();
  root.querySelector('strong')!.textContent=label(task.title);
  root.querySelector('.scene-loading-phase')!.textContent=label(task.error??task.label);
  const progress=root.querySelector('progress')!;progress.hidden=!!task.error;
  if(task.total&&task.done!==undefined){progress.max=task.total;progress.value=task.done;}else progress.removeAttribute('value');
  root.querySelector('.scene-loading-help')!.textContent=label('Controls return when the view is ready.');
  const retry=root.querySelector<HTMLButtonElement>('.scene-loading-retry')!;retry.hidden=!task.retry;retry.textContent=label('Try again');retry.onclick=()=>task.retry?.();
  const cancel=root.querySelector<HTMLButtonElement>('.scene-loading-cancel')!;cancel.hidden=!task.onCancel;cancel.textContent=label('Cancel');cancel.onclick=()=>task.onCancel?.();
}
export function beginSceneLoading(title:string,options:{onCancel?:()=>void}={}){
  const key=Symbol(title),task:LoadingTask={title,label:'Preparing the view…',onCancel:options.onCancel};tasks.set(key,task);
  // A workshop may just have opened its own modal in the browser top layer.
  if(root?.open)root.close();paint();
  let finished=false;
  return {
    update(text:string,done?:number,total?:number){if(finished)return;Object.assign(task,{label:text,done,total,error:undefined,retry:undefined});paint();},
    finish(){if(finished)return;finished=true;tasks.delete(key);paint();},
    fail(message:string,retry:()=>void){if(finished)return;task.error=message;task.retry=retry;paint();},
  };
}
