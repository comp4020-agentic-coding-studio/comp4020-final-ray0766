// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createGuideConversation} from '../src/client/guide-conversation.ts';
const quota={enabled:true,remaining:8,resetAt:null,budgetRemainingUsd:1,reason:null,model:'deepseek-flash'};
function setup(){
 document.body.innerHTML='<details id="world-guide-help"></details>'+['form','question','question-label','chat-title','help-title','ask','ai-status','ai-quota','ai-result','ai-stop','local','refresh','ai-answer'].map(id=>`<${id==='question'?'input':id==='form'?'form':'button'} id="world-guide-${id}"></${id==='question'?'input':id==='form'?'form':'button'}>`).join('');
 const answer=vi.fn((text:string)=>document.getElementById('world-guide-ai-answer')!.textContent=text);
 const chat=createGuideConversation({language:()=> 'en',answer,changed:()=>chat.paint()});
 const question=document.getElementById('world-guide-question') as HTMLInputElement;question.value='Why is the sky blue?';return{chat,answer,question};
}
function stream(){return new Response(['{"type":"delta","text":"A model reply."}',JSON.stringify({type:'done',quota:{...quota,remaining:7}}),''].join('\n'));}
afterEach(()=>{vi.unstubAllGlobals();document.body.innerHTML='';});
it('routes every valid free-form question to AI and keeps fixed help separate',async()=>{
 const fetcher=vi.fn(async(url:string)=>url.endsWith('/status')?Response.json(quota):stream());vi.stubGlobal('fetch',fetcher);const{chat,question,answer}=setup();await chat.refresh();
 for(const text of ['Why is the sky blue?','怎么保存','unknown made-up word']){question.value=text;await chat.ask();expect(answer).toHaveBeenLastCalledWith('A model reply.');}
 expect(fetcher.mock.calls.filter(([u])=>u.endsWith('/ask'))).toHaveLength(3);chat.local();expect((document.getElementById('world-guide-help') as HTMLDetailsElement).open).toBe(true);expect(answer).toHaveBeenLastCalledWith('A model reply.');
});
it.each(['disabled','hourly','budget','trial_ended'])('shows %s without a local substitute or upstream request',async reason=>{
 const fetcher=vi.fn(async()=>Response.json({...quota,enabled:reason==='hourly',remaining:reason==='hourly'?0:8,reason}));vi.stubGlobal('fetch',fetcher);const{chat,answer,question}=setup();await chat.refresh();await chat.ask();expect(answer).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);expect(question.value).toBe('Why is the sky blue?');expect((document.getElementById('world-guide-ask') as HTMLButtonElement).disabled).toBe(true);
});
it('retains incomplete AI text on failure and never replaces it with keyword help',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/status')?Response.json(quota):new Response('{"type":"delta","text":"Partial model text"}\n{"type":"error","code":"interrupted"}\n')));const{chat,answer}=setup();await chat.refresh();await chat.ask();expect(answer).toHaveBeenLastCalledWith('Partial model text');expect(document.getElementById('world-guide-ai-answer')!.dataset.replyMode).toBe('partial');expect(document.getElementById('world-guide-ai-result')!.textContent).toContain('did not complete');
});
it('blocks duplicate sends and ignores a late response after cancellation',async()=>{
 let resolve!:(r:Response)=>void;const askResponse=new Promise<Response>(r=>resolve=r);const fetcher=vi.fn((url:string)=>url.endsWith('/status')?Promise.resolve(Response.json(quota)):askResponse);vi.stubGlobal('fetch',fetcher);const{chat,answer}=setup();await chat.refresh();const first=chat.ask();await chat.ask();chat.cancel();resolve(stream());await first;expect(fetcher.mock.calls.filter(([u])=>u.endsWith('/ask'))).toHaveLength(1);expect(answer).not.toHaveBeenCalledWith('A model reply.');expect(chat.pending).toBe(false);
});
it('keeps invalid input local and recovers from a failed status request explicitly',async()=>{
 const fetcher=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(Response.json(quota));vi.stubGlobal('fetch',fetcher);const{chat,question}=setup();await chat.refresh();expect(document.getElementById('world-guide-ai-result')!.textContent).toContain('Cannot check');await chat.refresh();question.value=' ';await chat.ask();expect(document.getElementById('world-guide-ai-result')!.textContent).toContain('1–500');expect(fetcher).toHaveBeenCalledTimes(2);
});

it('keeps a bounded local message transcript without sending prior messages upstream',async()=>{
 const bodies:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(url.endsWith('/status'))return Response.json(quota);bodies.push(String(init?.body));return stream();}));const{chat,question}=setup();const log=document.createElement('div');log.id='world-guide-messages';document.body.append(log);log.append(document.getElementById('world-guide-ai-answer')!);await chat.refresh();
 for(const q of ['<img src=x onerror=alert(1)>','Second question']){question.value=q;await chat.ask();}
 expect(log.querySelectorAll('.guide-message-user')).toHaveLength(2);expect(log.querySelectorAll('.guide-message-assistant')).toHaveLength(2);expect(log.querySelector('img')).toBeNull();expect(document.querySelectorAll('#world-guide-ai-answer')).toHaveLength(1);expect(JSON.parse(bodies[1]).question).toBe('Second question');expect(bodies[1]).not.toContain('onerror');
});
