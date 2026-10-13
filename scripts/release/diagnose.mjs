import {spawnSync} from 'node:child_process';
// Operator diagnosis of the app machine, dispatched from a branch (release-recovery.yml, job "diagnose"). It prints
// chosen fields only: never the environment, metadata, tokens or request bodies. MODE=start starts the machine once,
// and only when it is configured for EXPECT_IMAGE (the known-good image) with the server command, then waits for it to
// run and asks the site once. MODE=restore-config is the approved minimal recovery described below. Neither writes
// to the volume.
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
if(mode==='probe'){
 // Read-only evidence from the running machine, taken twice 3 s apart: load, memory and pressure stall information,
 // every thread of every node process with its CPU time and kernel wait channel (the main thread's id is the pid),
 // and one /healthz asked from inside the machine. Nothing is changed or restarted.
 if(machines.length!==1)throw Error('Expected exactly one machine');
 const code=`const fs=await import('node:fs');const {execFileSync}=await import('node:child_process');const read=f=>{try{return fs.readFileSync(f,'utf8').trim();}catch{return null;}};
 const sample=()=>{const procs=[];for(const pid of fs.readdirSync('/proc').filter(n=>/^\\d+$/.test(n))){const cmd=(read('/proc/'+pid+'/cmdline')??'').split('\\0').join(' ').trim();if(!/node/.test(cmd))continue;const st=read('/proc/'+pid+'/status')??'';const pick=k=>(new RegExp('^'+k+':\\\\s*(.*)$','m').exec(st)??[])[1];
  const threads=[];for(const tid of fs.readdirSync('/proc/'+pid+'/task')){const t=(read('/proc/'+pid+'/task/'+tid+'/stat')??'').split(') ').pop().split(' ');threads.push({tid:+tid,main:tid===pid,name:read('/proc/'+pid+'/task/'+tid+'/comm'),state:t[0],utime:+t[11],stime:+t[12],wchan:read('/proc/'+pid+'/task/'+tid+'/wchan')});}
  procs.push({pid:+pid,cmd:cmd.slice(0,80),rssKb:pick('VmRSS'),hwmKb:pick('VmHWM'),threads});}
  return {at:new Date().toISOString(),loadavg:read('/proc/loadavg'),mem:(read('/proc/meminfo')??'').split('\\n').filter(l=>/^(MemTotal|MemAvailable|MemFree|Cached|SwapTotal|SwapFree|Dirty|AnonPages)/.test(l)).join('; '),pressure:{cpu:read('/proc/pressure/cpu'),memory:read('/proc/pressure/memory'),io:read('/proc/pressure/io')},procs};};
 const a=sample();await new Promise(r=>setTimeout(r,3000));const b=sample();
 let local='';try{local=execFileSync('node',['-e',"fetch('http://127.0.0.1:8080/healthz',{signal:AbortSignal.timeout(8000)}).then(r=>r.text()).then(t=>console.log('answered '+t)).catch(e=>console.log('no answer: '+e.name))"],{encoding:'utf8',timeout:15000}).trim();}catch(e){local='probe failed: '+e.message.slice(0,80);}
 console.log(JSON.stringify({first:a,second:b,localHealthz:local}));`;
 let out;try{out=JSON.parse(run(['machine','exec',machines[0].id,'node --input-type=module -e "await import(\'data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'\')"','-a',app,'--json','--timeout','50'],80_000));}catch(e){console.log('PROBE exec failed: '+e.message);out=null;}
 if(out){const raw=String(out.stdout??'').trim();console.log('PROBE_RAW '+raw);
  try{const p=JSON.parse(raw),hz=100;console.log('PROBE_SUMMARY '+JSON.stringify({loadavg:[p.first.loadavg,p.second.loadavg],mem:p.second.mem,pressure:p.second.pressure,localHealthz:p.localHealthz,
   threadsBusyIn3s:p.second.procs.flatMap(pr=>pr.threads.map(t=>{const was=p.first.procs.find(x=>x.pid===pr.pid)?.threads.find(x=>x.tid===t.tid);return {pid:pr.pid,tid:t.tid,main:t.main,name:t.name,state:t.state,wchan:t.wchan,cpuSecondsIn3s:was?((t.utime+t.stime)-(was.utime+was.stime))/hz:null,cpuSecondsTotal:(t.utime+t.stime)/hz};})).filter(t=>t.main||t.cpuSecondsIn3s>0.05||t.cpuSecondsTotal>5),
   processes:p.second.procs.map(pr=>({pid:pr.pid,cmd:pr.cmd,rssKb:pr.rssKb,hwmKb:pr.hwmKb,threads:pr.threads.length}))},null,1));}catch(e){console.log('PROBE parse failed: '+e.message);}
  if(out.stderr)console.log('PROBE_STDERR '+redact(out.stderr).slice(0,600));}
}
if(mode==='restore-config'){
 // Approved minimal recovery after run 38465565129: the machine was autostopped by Fly 12 s before the cutover's
 // update, and Fly leaves a stopped machine stopped through any update. Put back the known-good image (exact digest)
 // with the server command and the original start/stop settings as configuration only, check what Fly reports, start
 // once, wait for started, ask the site, and read the database without writing.
 if(machines.length!==1)throw Error('Expected exactly one machine');
 const m=machines[0];
 if(m.state!=='stopped')throw Error('Refusing: the machine is '+m.state+', not stopped as diagnosed');
 if(!/@sha256:[0-9a-f]{64}$/.test(expect))throw Error('Refusing: give the known-good image with its full digest');
 run(['machine','update',m.id,'-a',app,'--image',expect,'--command',server.join(' '),'--autostart=true','--autostop=stop','--skip-start','--yes'],150_000);
 const c=list()[0],services=(c.config?.services??[]).map(s=>({autostart:s.autostart,autostop:s.autostop}));
 console.log('CONFIG '+JSON.stringify({state:c.state,image:c.config?.image,cmd:c.config?.init?.cmd??null,services}));
 if(c.config?.image!==expect&&!(String(c.config?.image).split('@')[1]===expect.split('@')[1]&&sameImage(c.config?.image,expect)))throw Error('Stopping: the image is '+c.config?.image+', not '+expect);
 if(JSON.stringify(c.config?.init?.cmd??null)!==JSON.stringify(server))throw Error('Stopping: the init command is '+JSON.stringify(c.config?.init?.cmd??null));
 if(!services.length||!services.every(s=>s.autostart===true&&(s.autostop==='stop'||s.autostop===true)))throw Error('Stopping: the services start/stop settings are '+JSON.stringify(services));
 console.log('START '+c.id+' from state '+c.state);run(['machine','start',c.id,'-a',app],120_000);
 const until=Date.now()+180_000;let state='';while(Date.now()<until){state=list()[0].state;if(state==='started')break;await new Promise(r=>setTimeout(r,5000));}
 console.log('STATE '+state);if(state!=='started')throw Error('The machine did not reach started within three minutes');
 let ok=false;for(let i=0;i<8&&!ok;i++){const r=await globalThis.fetch(`https://${app}.fly.dev/healthz`,{signal:globalThis.AbortSignal.timeout(20_000)}).catch(()=>null);const body=r?await r.text().catch(()=>''):'';console.log(`HEALTHZ ${r?.status??'no answer'} ${body.slice(0,120)}`);ok=!!r?.ok;if(!ok)await new Promise(res=>setTimeout(res,10_000));}
 const code="const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync('/data/little-post.sqlite',{readOnly:true});const marked=!!db.prepare(\"SELECT 1 FROM sqlite_master WHERE type='table' AND name='integration_config'\").get();console.log(JSON.stringify({schema:db.prepare('PRAGMA user_version').get().user_version,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeys:db.prepare('PRAGMA foreign_key_check').all().length,players:db.prepare('SELECT count(*) n FROM players').get().n,integrated:marked}));db.close();";
 const out=JSON.parse(run(['machine','exec',c.id,'node --input-type=module -e "await import(\'data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'\')"','-a',app,'--json','--timeout','50'],70_000));
 console.log('DATABASE '+String(out.stdout??'').trim()+(out.exit_code?' exit '+out.exit_code:''));
 if(!ok)throw Error('The machine runs the known-good configuration but the site did not answer');
}
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
