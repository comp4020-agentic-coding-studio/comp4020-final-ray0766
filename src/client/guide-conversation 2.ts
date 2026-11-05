import {localGuideAnswer} from './guide-interaction.ts';
interface Quota {enabled:boolean;remaining:number;resetAt:number|null;budgetRemainingUsd:number;reason:string|null;model:string}
export function createGuideConversation(options:{language:()=> 'en'|'zh';answer:(text:string)=>void;changed:()=>void}){
 let quota:Quota|null=null,pending=false,refreshing=false,nextRefresh=0,revision=0,controller:AbortController|null=null,note='',mode:'fixed'|'ai'|'partial'='fixed',lastLanguage=options.language();
 const el=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById('world-guide-'+id)! as E;
 const notify=()=>{revision++;if(el('form')?.isConnected)options.changed();};
 const local=()=>{cancel();mode='fixed';options.answer(localGuideAnswer(el<HTMLInputElement>('question').value.trim(),options.language()));notify();};
 async function refresh(){if(refreshing)return;refreshing=true;nextRefresh=Date.now()+15000;try{const r=await fetch('/api/guide/status',{cache:'no-store'});if(r.ok){const q=await r.json();if(typeof q.enabled==='boolean'&&Number.isFinite(q.remaining))quota=q;}}catch{/* Offline fixed help remains available. */}finally{refreshing=false;notify();}}
 function cancel(){controller?.abort();controller=null;if(pending){pending=false;note='cancelled';mode='partial';notify();void refresh();}}
 async function ask(){
  const q=el<HTMLInputElement>('question').value.trim();if(!q||q.length>500||pending)return;
  if(!quota?.enabled||quota.remaining<1){local();return;}
  pending=true;note='replying';mode='ai';const abort=controller=new AbortController();let text='',finished=false;options.answer('…');notify();
  try{
   const r=await fetch('/api/guide/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,language:options.language(),requestId:crypto.randomUUID()}),signal:abort.signal});
   if(!r.ok){const e=await r.json();if(e.quota)quota=e.quota;note=e.code??'unavailable';throw Error('unavailable');}
   if(!r.body)throw Error('unavailable');const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
   while(true){const n=await reader.read();if(n.done)break;buffer+=decoder.decode(n.value,{stream:true});let at:number;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line)continue;const e=JSON.parse(line);if(e.quota)quota=e.quota;if(e.type==='delta'){text+=e.text;options.answer(text);notify();}else if(e.type==='done'){finished=true;note='complete';}else if(e.type==='error'){note=e.code;throw Error('unavailable');}}}
   if(!finished)throw Error('unavailable');
  }catch{if(abort.signal.aborted){note='cancelled';mode='partial';}else{if(note==='replying')note='unavailable';mode='fixed';options.answer(localGuideAnswer(q,options.language()));}}
  finally{if(controller===abort){controller=null;pending=false;notify();void refresh();}}
 }
 function paint(){
  const zh=options.language()==='zh',enabled=!!quota?.enabled,limited=!!quota&&!!quota.reason&&quota.reason!=='disabled';
  el('question-label').textContent=enabled?(zh?'向 DeepSeek 询问玩法':'Ask DeepSeek about the game'):(zh?'询问玩法（固定帮助）':'Ask about the game (fixed help)');
  el<HTMLButtonElement>('ask').disabled=pending||!!quota&&quota.remaining<1;el('ask').textContent=pending?(zh?'回复中…':'Replying…'):enabled?(zh?'询问 AI':'Ask AI'):(zh?'询问':'Ask');
  el('ai-status').textContent=enabled||limited?(zh?'真实 AI：点击“询问 AI”仅发送当前问题及公开玩法说明给 DeepSeek，不发送聊天历史或存档。AI 可能出错，不能操作游戏。':'Real AI: Ask AI sends only this question and public game instructions to DeepSeek, not chat history or saves. AI can be wrong and cannot operate the game.'):(zh?'真实 AI 当前不可用。固定帮助在本机运行，不发送问题。':'Real AI is currently unavailable. Fixed help runs locally without sending questions.');
  const restore=quota?.resetAt?new Date(quota.resetAt).toLocaleTimeString(zh?'zh-CN':'en',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):null;
  el('ai-quota').textContent=quota?(zh?`滚动 60 分钟剩余 ${quota.remaining}/8 次${restore?'；最早恢复 '+restore:''}。上游调用失败或停止也计次。本轮预算余量约 $${quota.budgetRemainingUsd.toFixed(4)}。`:`${quota.remaining}/8 left per rolling 60 minutes${restore?'; next slot '+restore:''}. Upstream failures or Stop also count. Trial budget left ≈ $${quota.budgetRemainingUsd.toFixed(4)}.`):'';
  const notes:Record<string,[string,string]>={replying:['Replying…','正在回复…'],complete:['AI answer · check important details against fixed help.','AI 回答 · 重要操作请对照固定帮助。'],cancelled:['Stopped; any partial answer is incomplete. An upstream attempt still counts.','已停止；已有片段并不完整。已发起的上游请求仍计次。'],duplicate:['Already submitted; no second AI call was made.','已提交过，没有再次调用 AI。'],hourly:['Hourly limit reached. Fixed help is available.','已达小时限额，仍可使用固定帮助。'],budget:['Trial budget cannot reserve another call. AI is stopped; fixed help remains available.','本轮剩余预算不足以预留下一次调用，AI 已停止；固定帮助仍可用。'],trial_ended:['The local AI trial ended at 00:00 on 1 Jan 2027 (Sydney, UTC+11). Fixed help remains available.','本地 AI 试用于悉尼时间 2027 年 1 月 1 日 00:00（UTC+11）结束，固定帮助仍可用。'],budget_review:['Budget review required before more AI calls.','需先复核预算，才能继续 AI 调用。'],busy:['Guide is busy. No call was sent; try later or use fixed help.','向导繁忙，尚未发起调用；稍后再试或使用固定帮助。']};
  el('ai-result').textContent=(notes[quota?.reason&&quota.reason!=='disabled'&&note!=='replying'?quota.reason:note]??(note?['AI unavailable; showing fixed help. This is not an AI reply.','AI 暂不可用，当前显示固定帮助，并非 AI 回答。']:['Fixed help','固定帮助']))[zh?1:0];
  el<HTMLButtonElement>('ai-stop').hidden=!pending;el('ai-stop').textContent=zh?'停止回复':'Stop reply';el('local').textContent=zh?'使用固定帮助':'Use fixed help';el('answer').dataset.replyMode=mode;
 }
 el('ai-stop').onclick=cancel;el('local').onclick=local;
 return{get revision(){return revision;},get enabled(){return !!quota?.enabled;},get pending(){return pending;},ask,local,cancel,refresh,paint,reset(){cancel();note='';mode='fixed';notify();},tick(visible:boolean){if(options.language()!==lastLanguage){lastLanguage=options.language();cancel();}if(visible&&Date.now()>nextRefresh)void refresh();}};
}
