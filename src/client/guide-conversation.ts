interface Quota {enabled:boolean;remaining:number;resetAt:number|null;budgetRemainingUsd:number;reason:string|null;model:string}
export function createGuideConversation(options:{language:()=> 'en'|'zh';answer:(text:string)=>void;changed:()=>void}){
 let quota:Quota|null=null,pending=false,refreshing=false,nextRefresh=0,revision=0,controller:AbortController|null=null,note='',mode:'ai'|'partial'|'empty'='empty',lastLanguage=options.language();
 const el=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById('world-guide-'+id)! as E;
 const notify=()=>{revision++;if(el('form')?.isConnected)options.changed();};
 const local=()=>{el<HTMLDetailsElement>('help').open=true;el('help').scrollIntoView?.({block:'nearest'});};
 async function refresh(){if(refreshing)return;refreshing=true;nextRefresh=Date.now()+15000;try{const r=await fetch('/api/guide/status',{cache:'no-store'});if(!r.ok)throw Error(r.status===401?'session':'unavailable');const q=await r.json();if(typeof q.enabled!=='boolean'||!Number.isFinite(q.remaining))throw Error('unavailable');quota=q;if(['offline','session'].includes(note))note='';}catch(error){quota=null;if(!pending)note=error instanceof Error&&error.message==='session'?'session':'offline';}finally{refreshing=false;notify();}}
 function cancel(){const active=controller;controller=null;active?.abort();if(pending){pending=false;note='cancelled';mode='partial';notify();void refresh();}}
 async function ask(){
  const q=el<HTMLInputElement>('question').value.trim();if(pending)return;
  if(!q||q.length>500){note='invalid_question';notify();return;}
  if(!quota?.enabled||quota.remaining<1){note=quota?.reason??(quota?'hourly':'unavailable');notify();return;}
  pending=true;note='replying';mode='ai';const abort=controller=new AbortController();let text='',finished=false;options.answer('');notify();
  try{
   const r=await fetch('/api/guide/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,language:options.language(),requestId:crypto.randomUUID()}),signal:abort.signal});
   if(controller!==abort)return;
   if(!r.ok){const e=await r.json();if(e.quota)quota=e.quota;note=e.code??(r.status===401?'session':'unavailable');throw Error('unavailable');}
   if(!r.body)throw Error('unavailable');const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
   while(true){const n=await reader.read();if(controller!==abort){await reader.cancel();return;}if(n.done)break;buffer+=decoder.decode(n.value,{stream:true});let at:number;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line)continue;const e=JSON.parse(line);if(e.quota)quota=e.quota;if(e.type==='delta'){text+=e.text;options.answer(text);notify();}else if(e.type==='done'){finished=true;note='complete';}else if(e.type==='error'){note=e.code;throw Error('unavailable');}}}
   if(!finished)throw Error('unavailable');
  }catch{if(controller!==abort)return;if(note==='replying')note='unavailable';mode=text?'partial':'empty';}
  finally{if(controller===abort){controller=null;pending=false;notify();void refresh();}}
 }
 function paint(){
  const zh=options.language()==='zh',enabled=!!quota?.enabled;
  el('chat-title').textContent=zh?'与芽芽聊天 · DeepSeek':'Chat with Sprout · DeepSeek';
  el('help-title').textContent=zh?'固定玩法帮助与地面路线':'Fixed help & ground directions';
  el('question-label').textContent=zh?'你的问题（最多 500 字符）':'Your question (up to 500 characters)';
  el<HTMLButtonElement>('ask').disabled=pending||!enabled||quota!.remaining<1;el('ask').textContent=pending?(zh?'回复中…':'Replying…'):(zh?'发送给 DeepSeek':'Send to DeepSeek');
  el('ai-status').textContent=zh?'点击发送后，仅当前问题和公开玩法说明会传给 DeepSeek；不发送历史对话、存档或账号信息。AI 可能出错，不能操作游戏。':'Send shares only this question and public game instructions with DeepSeek, not chat history, saves or account information. AI can be wrong and cannot operate the game.';
  const restore=quota?.resetAt?new Date(quota.resetAt).toLocaleTimeString(zh?'zh-CN':'en',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):null;
  el('ai-quota').textContent=quota&&quota.reason!=='disabled'?(zh?`滚动 60 分钟剩余 ${quota.remaining}/8 次${restore?'；最早恢复 '+restore:''}。上游调用失败或停止也计次。本轮预算余量约 $${quota.budgetRemainingUsd.toFixed(4)}。`:`${quota.remaining}/8 left per rolling 60 minutes${restore?'; next slot '+restore:''}. Upstream failures or Stop also count. Trial budget left ≈ $${quota.budgetRemainingUsd.toFixed(4)}.`):'';
  const notes:Record<string,[string,string]>={
   replying:['Waiting for DeepSeek…','正在等待 DeepSeek…'],complete:['DeepSeek reply · verify important details.','DeepSeek 回复 · 请核实重要信息。'],
   cancelled:['Stopped. Any partial reply is incomplete; an upstream attempt still counts.','已停止。回复片段并不完整；已发起的上游请求仍计次。'],
   duplicate:['Already submitted; no second AI call was made.','已提交过，没有再次调用 AI。'],
   hourly:['Hourly limit reached. No new question was sent. Fixed help is separate below.','已达小时限额，新问题未发送。下方可单独查看固定帮助。'],
   budget:['Trial budget cannot reserve another call. No new question was sent.','本轮剩余预算不足以预留下一次调用，新问题未发送。'],
   trial_ended:['The AI trial ended at 00:00 on 1 Jan 2027 (Sydney, UTC+11).','AI 试用于悉尼时间 2027 年 1 月 1 日 00:00（UTC+11）结束。'],
   budget_review:['Budget review is required before more calls.','需先复核预算，才能继续调用。'],
   busy:['DeepSeek chat is busy. No call was sent; try again later.','聊天服务繁忙，未发起调用；请稍后重试。'],
   disabled:['DeepSeek is not enabled on this server. Your question has not been sent. Fixed help is separate below.','此服务器尚未启用 DeepSeek，你的问题未发送。下方可单独查看固定帮助。'],
   session:['Your visit could not be verified. Reload to reconnect before sending.','无法验证当前访客身份，请刷新重连后再发送。'],
   offline:['Cannot check AI availability. Reconnect and refresh status; your question is kept.','无法确认 AI 状态。请重连并刷新状态；输入仍保留。'],
   invalid_question:['Enter a question of 1–500 characters.','请输入 1–500 字符的问题。'],
   unavailable:['DeepSeek did not complete a reply. Your input is kept; any partial reply is incomplete. Retry explicitly.','DeepSeek 未完成回复。输入已保留；已有片段不完整。请主动重试。']};
  const reason=pending?'replying':quota?.reason??note;
  el('ai-result').textContent=(notes[reason]??(reason?notes.unavailable:quota?['Ready. Each submitted question goes to DeepSeek.','就绪。每次提交的问题均由 DeepSeek 回复。']:['Checking AI availability…','正在检查 AI 状态…']))[zh?1:0];
  el<HTMLButtonElement>('ai-stop').hidden=!pending;el('ai-stop').textContent=zh?'停止回复':'Stop reply';el('local').textContent=zh?'查看固定帮助（不调用 AI）':'Open fixed help (no AI call)';el('refresh').textContent=zh?'刷新 AI 状态':'Refresh AI status';el('ai-answer').dataset.replyMode=mode;
 }
 el('ai-stop').onclick=cancel;el('local').onclick=local;el('refresh').onclick=()=>void refresh();
 return{get revision(){return revision;},get enabled(){return !!quota?.enabled;},get pending(){return pending;},ask,local,cancel,refresh,paint,reset(){cancel();note='';mode='empty';options.answer('');notify();},tick(visible:boolean){if(options.language()!==lastLanguage){lastLanguage=options.language();cancel();}if(visible&&Date.now()>nextRefresh)void refresh();}};
}
