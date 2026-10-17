import {embedSceneLoading,sceneLoadingActive,sceneLoadingLabel} from './loading-state.ts';
import type {LoadingTask} from './loading-state.ts';
import './welcome.css';

const words={
  en:{eyebrow:'SUNSEED · LITTLE WORLDS',title:'A little world is waiting.',intro:'A small village, a little kindness, and a home to make your own.',
    modules:'Downloading game modules…',connecting:'Connecting to your saved visit…',preparing:'Preparing the view…',ready:'Your world is ready.',
    readyHelp:'Take your time. You can change the picture quality in Pause at any time.',loadingHelp:'Progress counts the current preparation stage. Some steps have no measurable total.',
    start:'Start exploring',waiting:'Preparing your world…',retry:'Try again',network:'We could not finish loading.',networkHelp:'Check your connection, then retry. Your saved visit will be requested again.',
    graphics:'The 3D view is temporarily unavailable.',graphicsHelp:'Try reloading, enabling browser hardware acceleration, or using another up-to-date browser. Your saved world is unchanged.',
    quality:'Picture quality',count:'completed in this stage',label:'Welcome to Little Worlds'},
  zh:{eyebrow:'SUNSEED · 小小星球',title:'一个小世界，等你来。',intro:'逛逛小村庄，送出一点善意，再把家变成喜欢的模样。',
    modules:'正在下载游戏模块…',connecting:'正在连接已保存的旅程…',preparing:'正在准备画面…',ready:'你的世界准备好了。',
    readyHelp:'慢慢来，随时可在暂停菜单调整画质。',loadingHelp:'进度仅统计当前准备阶段；部分步骤没有可测的总量。',
    start:'开始探索',waiting:'正在准备你的星球…',retry:'重试',network:'加载暂时未完成。',networkHelp:'请检查连接后重试，将重新读取已保存的旅程。',
    graphics:'三维画面暂时不可用。',graphicsHelp:'可尝试重新加载、启用浏览器硬件加速，或使用其他较新的浏览器。已保存的星球没有改变。',
    quality:'画面质量',count:'当前阶段已完成',label:'欢迎来到小小星球'},
};
export type WelcomeStage='modules'|'connecting'|'preparing';
export interface WelcomeOptions {
  /** Called once, after real world readiness (and after Start on a first visit). */
  onStart:()=>void;
  /** Retry the existing request; the panel never makes identity/network writes. */
  onRetry?:()=>void;
  /** Optional quality.ts settings host; its owner retains disposal responsibility. */
  qualityControl?:HTMLElement;
}

/** Owns only the first loading/welcome surface. The renderer owner supplies
 * actual readiness and failures; no hardware guesses or synthetic percentages. */
export function mountWelcome(options:WelcomeOptions){
  const bootNode=document.getElementById('boot-loading');
  const panelNode=document.getElementById('welcome-panel');
  if(!(bootNode instanceof HTMLElement)||!(panelNode instanceof HTMLDialogElement))throw new Error('The static welcome panel is missing.');
  // Explicit aliases preserve the checked types inside the lifecycle callbacks.
  const boot:HTMLElement=bootNode,panel:HTMLDialogElement=panelNode;
  // The same DOM also hosts a real context-loss notice after initial entry.
  boot.hidden=false;
  const get=<T extends HTMLElement=HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
  const start=get<HTMLButtonElement>('welcome-start'),retry=get<HTMLButtonElement>('welcome-retry');
  const phase=get('welcome-stage'),count=get('welcome-count'),progress=get<HTMLProgressElement>('welcome-progress');
  let task:Readonly<LoadingTask>|null=null,stage:WelcomeStage='connecting',worldReady=false,firstVisit=true;
  let error:'network'|'graphics'|null=null,retryAction=options.onRetry,ended=false;
  let releaseLoading:()=>void=()=>{};
  const text=()=>words[document.documentElement.lang.startsWith('zh')?'zh':'en'];
  panel.dataset.i18nVerbatim='';
  if(options.qualityControl){get('welcome-quality').hidden=false;get('welcome-quality').append(options.qualityControl);}
  else get('welcome-quality').hidden=true;
  const available=()=>worldReady&&!sceneLoadingActive()&&!error;
  function leave(){
    if(ended||!available())return;
    ended=true;observer.disconnect();panel.removeEventListener('cancel',preventCancel);panel.close();boot.hidden=true;releaseLoading();options.onStart();
  }
  function paint(){
    if(ended)return;
    const w=text();
    panel.setAttribute('aria-label',w.label);
    for(const node of panel.querySelectorAll<HTMLElement>('[data-welcome-string]')){
      const key=node.dataset.welcomeString as keyof typeof w;if(key in w)node.textContent=w[key];
    }
    const failed=error??(task?.error?'network':null),usable=available();
    panel.dataset.state=failed?'failed':usable?'ready':'loading';
    start.disabled=!usable;start.hidden=!!failed;start.textContent=usable?w.start:w.waiting;
    const failureRetry=task?.error?task.retry:undefined;
    retry.hidden=!failed;retry.textContent=w.retry;retry.disabled=!(failureRetry??retryAction);
    phase.textContent=failed?(error?w[error]:sceneLoadingLabel(task!.error!)):usable?w.ready:task?sceneLoadingLabel(task.label):w[stage];
    progress.setAttribute('aria-label',document.documentElement.lang.startsWith('zh')?'当前准备阶段':'Current preparation stage');
    get('welcome-help').textContent=failed?w[failed==='graphics'?'graphicsHelp':'networkHelp']:usable?w.readyHelp:w.loadingHelp;
    const measured=task?.done!==undefined&&Number.isFinite(task.done)&&task.total!==undefined&&Number.isFinite(task.total)&&task.total>0;
    count.hidden=!measured||!!failed;progress.hidden=!!failed||usable;
    if(measured){const done=Math.max(0,Math.min(task!.total!,task!.done!));progress.max=task!.total!;progress.value=done;count.textContent=`${done} / ${task!.total} · ${w.count}`;}
    else {progress.removeAttribute('value');count.textContent='';}
    // Returning players pass through automatically only after the same real readiness gates.
    if(usable&&!firstVisit)leave();
  }
  const observer=new MutationObserver(paint);observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  panel.addEventListener('cancel',preventCancel);
  function preventCancel(event:Event){event.preventDefault();}
  start.onclick=leave;
  retry.onclick=()=>{
    const run=task?.error?task.retry:retryAction;if(!run)return;
    error=null;worldReady=false;stage='connecting';paint();run();
  };
  // Upgrade the static loading surface into one modal before loading tasks begin.
  if(panel.open)panel.close();panel.showModal();
  releaseLoading=embedSceneLoading(panel,next=>{task=next;paint();});
  paint();
  return {
    stage(next:WelcomeStage){if(ended)return;stage=next;error=null;paint();},
    /** Call only once the actual ground/room/flight view has been committed. */
    ready(settings:{firstVisit:boolean}){if(ended)return;worldReady=true;firstVisit=settings.firstVisit;error=null;paint();},
    /** graphics is for a real renderer/context failure, never a guessed device tier. */
    failed(kind:'network'|'graphics',retryExisting=options.onRetry){if(ended)return;worldReady=false;error=kind;retryAction=retryExisting;paint();},
    dispose(){if(ended)return;ended=true;observer.disconnect();panel.removeEventListener('cancel',preventCancel);panel.close();boot.hidden=true;releaseLoading();},
  };
}
