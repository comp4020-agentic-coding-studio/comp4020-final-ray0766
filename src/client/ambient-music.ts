/** Original slow bell/pad miniature. No samples, downloads or external audio service. */
const KEY='little-worlds:music:v1';
export function musicPreference(raw:string|null){
 try{const p=JSON.parse(raw??'null');if(typeof p?.enabled==='boolean'&&Number.isFinite(p.volume))return{enabled:p.enabled,volume:Math.max(0,Math.min(1,p.volume))};}catch{/* private-mode or damaged preferences use the quiet default */}
 return{enabled:true,volume:.14};
}
export function mountAmbientMusic(){
 if(document.getElementById('ambient-music'))return()=>{};
 let pref=musicPreference((()=>{try{return localStorage.getItem(KEY);}catch{return null;}})()),gesture=false,context:AudioContext|null=null,master:GainNode|null=null,filter:BiquadFilterNode|null=null,timer:ReturnType<typeof setInterval>|null=null,bar=0,next=0,disposed=false,failed=false;
 let queue=Promise.resolve();const voices=new Set<OscillatorNode>();
 const root=document.createElement('section');root.id='ambient-music';root.dataset.i18nVerbatim='';root.innerHTML='<h3></h3><button type="button" id="ambient-music-toggle"></button><label for="ambient-music-volume"></label><input id="ambient-music-volume" type="range" min="0" max="100" step="1"><p role="status" id="ambient-music-status"></p>';
 document.getElementById('presence-summary')?.before(root);
 const toggle=root.querySelector<HTMLButtonElement>('button')!,volume=root.querySelector<HTMLInputElement>('input')!,status=root.querySelector<HTMLParagraphElement>('p')!;
 function paint(){const zh=document.documentElement.lang.startsWith('zh'),playing=timer!==null&&context?.state==='running';root.querySelector('h3')!.textContent=zh?'背景音乐':'Background music';toggle.textContent=zh?(pref.enabled?'音乐：开':'音乐：关'):(pref.enabled?'Music: on':'Music: off');toggle.setAttribute('aria-pressed',String(pref.enabled));root.querySelector('label')!.textContent=(zh?'音量 ':'Volume ')+Math.round(pref.volume*100)+'%';volume.value=String(Math.round(pref.volume*100));status.textContent=failed?(zh?'暂时无法播放。点击音乐开关后可重试。':'Playback unavailable. Use the music switch to retry.'):!pref.enabled?(zh?'已静音':'Muted'):document.hidden?(zh?'后台已暂停':'Paused in background'):playing?(zh?'原创轻音乐 · 循环播放':'Original ambient miniature · looping'):(zh?'首次点击或按键后播放':'Starts after your first click or keypress');root.dataset.musicState=failed?'unavailable':playing?'playing':pref.enabled?'waiting':'off';}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(pref));}catch{/* preference storage is optional */}}
 function stop(){if(timer!==null)clearInterval(timer);timer=null;for(const o of voices){try{o.stop();}catch{/* already ended */}o.disconnect();}voices.clear();}
 function note(midi:number,at:number,duration:number,level:number,type:OscillatorType='sine'){
  if(!context||!filter)return;const osc=context.createOscillator(),gain=context.createGain();osc.type=type;osc.frequency.value=440*2**((midi-69)/12);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.25);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);osc.connect(gain);gain.connect(filter);voices.add(osc);osc.onended=()=>{voices.delete(osc);osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+duration+.05);
 }
 function schedule(){if(!context)return;if(next>context.currentTime+.4)return;next=Math.max(next,context.currentTime+.08);const chords=[[48,55,59,64],[45,52,55,60],[41,48,55,57],[43,50,57,60]],melodies=[[76,79,74],[72,76,71],[69,72,76],[74,71,67]];const i=bar++%4;for(const m of chords[i])note(m,next,6.8,.025,'triangle');melodies[i].forEach((m,j)=>note(m,next+.8+j*2.2,3.2,.075));next+=8;}
 function reconcile(){queue=queue.then(async()=>{if(disposed)return;try{if(pref.enabled&&gesture&&!document.hidden){context??=new AudioContext();if(!master){master=context.createGain();master.gain.value=pref.volume;filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2400;filter.connect(master);master.connect(context.destination);}master.gain.setTargetAtTime(pref.volume,context.currentTime,.12);await context.resume();if(pref.enabled&&!document.hidden&&context.state!=='running')throw Error('Playback needs another gesture');if(!pref.enabled||document.hidden){stop();await context.suspend();}else if(timer===null&&context.state==='running'){next=context.currentTime+.08;schedule();timer=setInterval(schedule,500);}failed=false;}else{stop();if(context?.state==='running')await context.suspend();}}catch{stop();failed=true;}paint();});}
 const unlock=()=>{if(!gesture||failed){gesture=true;reconcile();}};
 toggle.onclick=()=>{pref={...pref,enabled:failed?true:!pref.enabled};failed=false;gesture=true;save();paint();reconcile();};volume.oninput=()=>{pref={...pref,volume:Number(volume.value)/100};save();if(master&&context)master.gain.setTargetAtTime(pref.volume,context.currentTime,.12);paint();};
 document.addEventListener('pointerdown',unlock,{capture:true});document.addEventListener('keydown',unlock,{capture:true});document.addEventListener('visibilitychange',reconcile);
 const language=new MutationObserver(paint);language.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 const dispose=()=>{disposed=true;stop();language.disconnect();document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('keydown',unlock,true);document.removeEventListener('visibilitychange',reconcile);void context?.close().catch(()=>{});root.remove();};
 window.addEventListener('pagehide',()=>{stop();void context?.suspend().catch(()=>{});});window.addEventListener('pageshow',reconcile);paint();return dispose;
}
