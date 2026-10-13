import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {APP,SERVER,ensureStarted,expectConfig,health,machine,remote,run,sameImage,serviceFlags,sleep,waitIntegrated} from './fly.mjs';
// Confirms a finished release, or puts the previous one back when a release did not finish. It needs nothing from
// the job that started the release: the deploy job runs it after a failure or cancellation, the release-guard
// workflow runs it again once the whole run has ended (also when the job was cut off at its limit, which runs no
// further step), and an operator can run it by hand. Each run decides from the machine and its volume alone:
//   - a confirmed release (released.json) or a machine that is not on this release's image is left alone;
//   - a stopped database that was recorded (metadata-preflight.json) is restored with the original image (restore.mjs);
//   - otherwise the database was never replaced, and the original image starts again on it.
// usage: node scripts/release/settle.mjs <release id> <release image> [--confirm]
const [tag,image,mode]=process.argv.slice(2),site=process.env.APP_URL;
if(!/^[a-f0-9]{12}-[0-9]+$/.test(tag??'')||!/^[\w./:-]+$/.test(image??'')||!site)throw Error('Use settle.mjs <release id> <release image> [--confirm] with APP_URL set');
const backup='/data/release-backups/'+tag,{id,config}=machine(),{exec}=remote(id);
const read=()=>JSON.parse(exec(`const fs=await import('node:fs');const at=f=>${JSON.stringify(backup)}+'/'+f;console.log(JSON.stringify({released:fs.existsSync(at('released.json')),recorded:fs.existsSync(at('metadata-preflight.json')),original:fs.existsSync(at('machine-config.json'))?JSON.parse(fs.readFileSync(at('machine-config.json'),'utf8')):null}));`));

if(mode==='--confirm'){
 if(!sameImage(config.image,image))throw Error(`The machine runs ${config.image}, not this release's ${image}`);
 const cmd=JSON.stringify(config.init?.cmd??null);if(cmd!=='null'&&cmd!==JSON.stringify(SERVER))throw Error('The machine starts '+cmd+', not the server');
 const answer=await waitIntegrated(site,Date.now()+60_000);if(answer?.profile!=='integrated')throw Error('The server does not report the integrated world: '+JSON.stringify(answer));
 console.log('RELEASE_CONFIRMED '+exec(`const fs=await import('node:fs');const record=${JSON.stringify(JSON.stringify({tag,image}))};fs.writeFileSync(${JSON.stringify(backup+'/released.json')},record,{mode:0o600});console.log(record);`).trim());
 process.exit(0);
}
// Leaving the machine alone is only right while the site answers: a down site this run cannot explain fails loudly.
async function leave(reason){
 const until=Date.now()+60_000;let answer=null;while(Date.now()<until&&!answer?.ok){answer=await health(site,10_000);if(!answer?.ok)await sleep(3000);}
 if(!answer?.ok)throw Error(`SETTLE left the machine alone (${reason}), but the site does not answer; run the release-recovery workflow`);
 console.log(`SETTLE nothing to do: ${reason}`);process.exit(0);
}
if(!sameImage(config.image,image))await leave(`the machine runs ${config.image}, not this release's ${image}`);
// A server that keeps crashing leaves nothing to exec into, so a few failed reads are not a reason to stop.
let state=null;for(let attempt=0;attempt<3&&!state;attempt++){try{state=read();}catch{await sleep(5000);}}
if(state?.released)await leave('this release was confirmed');
// Whatever runs on the release image (a half-started server, a detached cutover) stops before anything is decided.
run('flyctl',['machine','update',id,'-a',APP,'--command','sleep infinity','--autostart=false','--autostop=off','--yes','--skip-health-checks'],120_000);
await ensureStarted(id);
expectConfig({image,cmd:['sleep','infinity']});
state=read();
if(state.recorded){
 const restore=spawnSync(process.execPath,['scripts/release/restore.mjs',tag],{stdio:'inherit',timeout:4*60_000});
 if(restore.status!==0)throw Error('The restore did not finish; run the release-recovery workflow with '+tag);
}else{
 if(!state.original)throw Error('This release recorded no original machine configuration; run the release-recovery workflow with '+tag);
 const saved=join(mkdtempSync(join(tmpdir(),'settle-')),'original-config.json');writeFileSync(saved,JSON.stringify(state.original),{mode:0o600});
 run('flyctl',['machine','update',id,'-a',APP,'--machine-config',saved,'--image',state.original.image,'--command',SERVER.join(' '),...serviceFlags(state.original),'--yes'],120_000);
 await ensureStarted(id);
 expectConfig({image:state.original.image,cmd:SERVER,mounts:state.original.mounts});
}
// The previous release may predate the integrated world, so any healthy answer counts here.
const until=Date.now()+3*60_000;let answer=null;while(Date.now()<until&&!answer?.ok){answer=await health(site,Math.min(10_000,Math.max(1000,until-Date.now())));if(!answer?.ok)await sleep(3000);}
if(!answer?.ok)throw Error('The previous release was put back but did not answer within three minutes; check the site and run the release-recovery workflow with '+tag);
console.log('SETTLE put back '+(state.recorded?'the original image and the stopped database':'the original image')+': '+JSON.stringify(answer));
