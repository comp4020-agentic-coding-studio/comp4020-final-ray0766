import {spawnSync} from 'node:child_process';
// Operator diagnosis of the app machine, dispatched from a branch (release-recovery.yml, job "diagnose"). It prints
// chosen fields only: never the environment, metadata, tokens or request bodies. MODE=start starts the machine once,
// and only when it is configured for EXPECT_IMAGE (the known-good image) with the server command, then waits for it to
// run and asks the site once. It never updates the machine's configuration and never touches the volume.
const app='comp4020-final-ray0766',mode=process.env.MODE||'diagnose',expect=process.env.EXPECT_IMAGE||'',server=['node','src/server/index.ts'];
const redact=s=>String(s).replace(/fo1_[A-Za-z0-9_-]+|FlyV1 \S+|Bearer \S+/g,'[redacted]').replace(/^.*(token|secret|password|authorization|cookie).*$/gim,'[line redacted]');
function run(args,timeout=90_000){const p=spawnSync('flyctl',args,{encoding:'utf8',maxBuffer:16*1024*1024,timeout});if(p.error||p.status!==0)throw Error(`flyctl ${args.slice(0,2).join(' ')} failed: `+redact(p.error?.message??p.stderr).slice(-1200));return p.stdout;}
const list=()=>JSON.parse(run(['machine','list','-a',app,'--json']));
const when=t=>t?new Date(typeof t==='number'?t:t).toISOString():null;
const summary=m=>({id:m.id,state:m.state,region:m.region,updated_at:m.updated_at,image:m.config?.image,image_ref:m.image_ref?{repository:m.image_ref.repository,tag:m.image_ref.tag,digest:m.image_ref.digest}:null,
 init:{cmd:m.config?.init?.cmd??null,entrypoint:m.config?.init?.entrypoint??null,exec:m.config?.init?.exec??null},services:(m.config?.services??[]).map(s=>({internal_port:s.internal_port,autostart:s.autostart,autostop:s.autostop})),
 guest:m.config?.guest,restart:m.config?.restart,mounts:(m.config?.mounts??[]).map(v=>({volume:v.volume,path:v.path})),
 events:(m.events??[]).slice(0,25).map(e=>({type:e.type,status:e.status,source:e.source,at:when(e.timestamp),exit:e.request?.exit_event?{exit_code:e.request.exit_event.exit_code,guest_exit_code:e.request.exit_event.guest_exit_code,oom_killed:e.request.exit_event.oom_killed,signal:e.request.exit_event.signal,requested_stop:e.request.exit_event.requested_stop}:undefined}))});
const sameImage=(a,b)=>{const [tagA,digestA]=String(a).split('@'),[tagB,digestB]=String(b).split('@');return tagA===tagB&&(!digestA||!digestB||digestA===digestB);};
const machines=list();console.log('MACHINES '+JSON.stringify(machines.map(summary),null,1));
try{console.log('VOLUMES '+JSON.stringify(JSON.parse(run(['volumes','list','-a',app,'--json'])).map(v=>({id:v.id,state:v.state,size_gb:v.size_gb,region:v.region,attached_machine_id:v.attached_machine_id})),null,1));}catch(e){console.log('VOLUMES unavailable: '+e.message);}
try{console.log('LOGS (last 150 lines, redacted)\n'+redact(run(['logs','-a',app,'--no-tail'],60_000)).trim().split('\n').slice(-150).join('\n'));}catch(e){console.log('LOGS unavailable: '+e.message);}
if(mode==='start'){
 if(machines.length!==1)throw Error('Expected exactly one machine');
 const m=machines[0],cmd=m.config?.init?.cmd??null;
 if(!expect||!sameImage(m.config?.image,expect))throw Error(`Refusing to start: the machine is configured for ${m.config?.image}, not the known-good ${expect||'(none given)'}`);
 if(cmd!==null&&JSON.stringify(cmd)!==JSON.stringify(server))throw Error('Refusing to start: the init command is '+JSON.stringify(cmd)+', not the server');
 if(m.state==='started')console.log('START not needed: the machine is already started');else{console.log('START '+m.id+' from state '+m.state);run(['machine','start',m.id,'-a',app],120_000);}
 const until=Date.now()+180_000;let state='';while(Date.now()<until){state=list()[0].state;if(state==='started')break;await new Promise(r=>setTimeout(r,5000));}
 console.log('STATE '+state);if(state!=='started')throw Error('The machine did not reach started within three minutes');
 for(let i=0;i<6;i++){const r=await globalThis.fetch(`https://${app}.fly.dev/healthz`,{signal:globalThis.AbortSignal.timeout(20_000)}).catch(()=>null);const body=r?await r.text().catch(()=>''):'';console.log(`HEALTHZ ${r?.status??'no answer'} ${body.slice(0,120)}`);if(r?.ok)break;await new Promise(res=>setTimeout(res,10_000));}
}
