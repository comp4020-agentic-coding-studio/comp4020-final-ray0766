import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Runs in the deploy job after preflight.mjs, with the image the job built but has not deployed. Production refuses
// an unintegrated database, so before the first integrated release the live one is integrated while no app process
// runs: the machine switches to the new image without starting its server, cutover-copy.mjs backs up the stopped
// database and swaps in its verified integrated copy, and the server then starts on it. A failure after the stop puts
// the original image back, together with the stopped database once that was recorded (restore.mjs).
const app='comp4020-final-ray0766',tag=(process.env.GITHUB_SHA??'').slice(0,12)+'-'+(process.env.GITHUB_RUN_ID??''),image=process.argv[2],site=process.env.APP_URL;
if(!/^[a-f0-9]{12}-[0-9]+$/.test(tag)||!/^[\w./:-]+$/.test(image??'')||!site)throw Error('Run from the deploy job with the built image and APP_URL');
const backup='/data/release-backups/'+tag,local=mkdtempSync(join(tmpdir(),'cutover-'));
function run(cmd,args){const p=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:8*1024*1024});if(p.status!==0)throw Error(cmd+' failed: '+p.stderr.slice(-2500));return p.stdout;}
const machines=JSON.parse(run('flyctl',['machine','list','-a',app,'--json']));if(machines.length!==1)throw Error('Expected exactly one existing app machine');const {id,config}=machines[0];
if(config.guest?.memory_mb!==256||config.guest?.cpus!==1||config.guest?.cpu_kind!=='shared'||config.mounts?.length!==1)throw Error('Unexpected machine allocation');
function exec(code){const command='node --input-type=module -e "await import(\'data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'\')"';const result=JSON.parse(run('flyctl',['machine','exec',id,command,'-a',app,'--json','--timeout','120']));if(Number(result.exit_code??result.exitCode??0)!==0)throw Error('Remote operation failed: '+(result.stderr??'').split('\n').filter(l=>/^[A-Za-z]*Error:/.test(l)).slice(-2).join(' '));if(result.stdout!==undefined&&typeof result.stdout!=='string')throw Error('Invalid remote stdout');return result.stdout??'';}
const live=JSON.parse(exec(`const {DatabaseSync}=await import('node:sqlite');const fs=await import('node:fs');const db=new DatabaseSync('/data/little-post.sqlite',{readOnly:true});const marked=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='integration_config'").get()&&Number(db.prepare('SELECT version FROM integration_config WHERE id=1').get()?.version??0)>=1;db.close();console.log(JSON.stringify({marked,preflight:JSON.parse(fs.readFileSync(${JSON.stringify(backup+'/probe-result.json')},'utf8')).status}));`));
if(live.marked){console.log('CUTOVER not needed: the live database is already integrated');process.exit(0);}
if(live.preflight!=='passed')throw Error('This release has no passing preflight probe');
const saved=join(local,'original-config.json');writeFileSync(saved,JSON.stringify(config),{mode:0o600});
const start=img=>run('flyctl',['machine','update',id,'-a',app,'--machine-config',saved,'--image',img,'--yes']);
run('flyctl',['machine','update',id,'-a',app,'--machine-config',saved,'--image',image,'--command','sleep infinity','--autostart=false','--autostop=off','--yes','--skip-health-checks']);
let swapped=false;
try{
 const result=exec(`const fs=await import('node:fs');for(const pid of fs.readdirSync('/proc').filter(n=>/^\\d+$/.test(n))){let cmd='';try{cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');}catch{}if(cmd.includes('src/server/index.ts'))throw Error('Application writer is still running');}const {cutover}=await import('file:///app/scripts/release/cutover-copy.mjs');console.log(JSON.stringify(cutover('/data/little-post.sqlite',${JSON.stringify(backup)})));`);
 swapped=true;console.log('CUTOVER '+result.trim());
 start(image);
 let health=null;for(let i=0;i<40&&health?.profile!=='integrated';i++){try{health=await (await globalThis.fetch(site+'/healthz')).json();}catch{/* starting */}if(health?.profile!=='integrated')await new Promise(r=>setTimeout(r,3000));}
 if(health?.profile!=='integrated')throw Error('The new server did not report the integrated world: '+JSON.stringify(health));
 console.log('CUTOVER_HEALTH '+JSON.stringify(health));
}catch(error){
 console.error('Cutover failed: '+error.message);
 // Until the swap the machine runs `sleep infinity` and can say whether the stopped database was recorded;
 // after it, the stopped database is the recorded restore point and the new server may not be running at all.
 let recorded=swapped;if(!swapped)try{recorded=exec(`console.log((await import('node:fs')).existsSync(${JSON.stringify(backup+'/metadata-preflight.json')}))`).trim()==='true';}catch{throw Error('Cutover failed and the machine cannot be inspected; run the release-recovery workflow with '+tag,{cause:error});}
 if(recorded){const restore=spawnSync(process.execPath,['scripts/release/restore.mjs',tag],{stdio:'inherit'});if(restore.status!==0)throw Error('Cutover failed and the automatic restore failed; run the release-recovery workflow with '+tag,{cause:error});}
 else start(config.image);
 throw Error('Cutover failed; the original image'+(recorded?' and the stopped database were':' was')+' put back',{cause:error});
}
