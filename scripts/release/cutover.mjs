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
function command(line){const result=JSON.parse(run('flyctl',['machine','exec',id,line,'-a',app,'--json','--timeout','120']));if(Number(result.exit_code??result.exitCode??0)!==0)throw Error('Remote operation failed: '+(result.stderr??'').split('\n').filter(l=>/^[A-Za-z]*Error:/.test(l)).slice(-2).join(' '));if(result.stdout!==undefined&&typeof result.stdout!=='string')throw Error('Invalid remote stdout');const out=result.stdout??'';if(!out.trim())throw Error('Fly returned nothing for a remote step, so it did not run');return out;}
const exec=code=>command('node --input-type=module -e "await import(\'data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'\')"');
const live=JSON.parse(exec(`const {DatabaseSync}=await import('node:sqlite');const fs=await import('node:fs');const db=new DatabaseSync('/data/little-post.sqlite',{readOnly:true});const marked=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='integration_config'").get()&&Number(db.prepare('SELECT version FROM integration_config WHERE id=1').get()?.version??0)>=1;db.close();console.log(JSON.stringify({marked,preflight:fs.existsSync(${JSON.stringify(backup+'/metadata.json')})}));`));
if(live.marked){console.log('CUTOVER not needed: the live database is already integrated');process.exit(0);}
if(!live.preflight)throw Error('This release has no preflight backup');
const saved=join(local,'original-config.json');writeFileSync(saved,JSON.stringify(config),{mode:0o600});
const start=img=>run('flyctl',['machine','update',id,'-a',app,'--machine-config',saved,'--image',img,'--yes']);
// Fly's registry can answer 404 for an image pushed seconds earlier (run 38438023060: "failed to get manifest" six
// seconds after the push; Fly staff on community.fly.io describe this race and a retry after about a minute). The
// machine is unchanged when that happens, so only that error is retried, for up to three minutes.
for(let attempt=1;;attempt++){
 try{run('flyctl',['machine','update',id,'-a',app,'--machine-config',saved,'--image',image,'--command','sleep infinity','--autostart=false','--autostop=off','--yes','--skip-health-checks']);break;}
 catch(error){if(attempt>=10||!/failed to get manifest|MANIFEST_UNKNOWN/.test(error.message))throw error;console.log(`IMAGE_NOT_READY attempt ${attempt}; the machine is unchanged, retrying in 20 s`);await new Promise(r=>setTimeout(r,20_000));}
}
let swapped=false,pid='';
try{
 // Fly's exec gives up on a request after about a minute (HTTP 408), and on a throttled shared CPU the probe alone
 // took 68 s at a quarter core and 371 s at a sixteenth locally. So the cutover runs detached and is polled.
 pid=exec(`const fs=await import('node:fs');const {spawn}=await import('node:child_process');for(const f of ['at-stop.sqlite','cutover.exit','cutover-result.json'])if(fs.existsSync(${JSON.stringify(backup)}+'/'+f))throw Error('A cutover already ran for this release: '+f);for(const pid of fs.readdirSync('/proc').filter(n=>/^\\d+$/.test(n))){let cmd='';try{cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');}catch{}if(cmd.includes('src/server/index.ts'))throw Error('Application writer is still running');}const child=spawn('sh',['-c','node /app/scripts/release/cutover-copy.mjs /data/little-post.sqlite '+${JSON.stringify(backup)}+' > '+${JSON.stringify(backup+'/cutover.log')}+' 2>&1; echo $? > '+${JSON.stringify(backup+'/cutover.exit')}],{detached:true,stdio:'ignore'});child.unref();console.log(child.pid);`).trim();
 if(!/^\d+$/.test(pid))throw Error('The detached cutover did not start');
 let state='running';const began=Date.now();
 while(state==='running'&&Date.now()-began<10*60_000){await new Promise(r=>setTimeout(r,10_000));state=command(`sh -c "cat ${backup}/cutover.exit 2>/dev/null || (test -d /proc/${pid} && echo running) || echo gone"`).trim();}
 if(state!=='0')throw Error('The cutover '+(state==='running'?'was still running after ten minutes':state==='gone'?'stopped without an exit status':'exited with '+state)+': '+exec(`const fs=await import('node:fs');console.log(JSON.stringify(fs.existsSync(${JSON.stringify(backup+'/cutover.log')})?fs.readFileSync(${JSON.stringify(backup+'/cutover.log')},'utf8').split('\\n').filter(l=>/^[A-Za-z]*Error:/.test(l)).slice(-2).join(' '):'no log'))`).trim());
 const result=JSON.parse(exec(`console.log((await import('node:fs')).readFileSync(${JSON.stringify(backup+'/cutover-result.json')},'utf8'))`));
 if(result.status!=='integrated')throw Error('The cutover did not report an integrated database');
 // The result file is only a claim: check the files themselves before anything starts on them.
 const proof=JSON.parse(exec(`const {DatabaseSync}=await import('node:sqlite');const fs=await import('node:fs');const {createHash}=await import('node:crypto');const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');const db=new DatabaseSync('/data/little-post.sqlite',{readOnly:true});const marked=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='integration_config'").get()&&Number(db.prepare('SELECT version FROM integration_config WHERE id=1').get()?.version??0)>=1;const out={marked,schema:db.prepare('PRAGMA user_version').get().user_version,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeys:db.prepare('PRAGMA foreign_key_check').all().length};db.close();const meta=JSON.parse(fs.readFileSync(${JSON.stringify(backup+'/metadata.json')},'utf8'));console.log(JSON.stringify({...out,main:sha('/data/little-post.sqlite'),restorePoint:meta.backup,restoreSha256:meta.sha256,restoreFile:sha(meta.backup)}));`));
 if(!proof.marked||proof.schema!==result.to||proof.integrity!=='ok'||proof.foreignKeys!==0||proof.main!==result.integratedSha256||proof.restorePoint!==backup+'/at-stop.sqlite'||proof.restorePoint!==result.restorePoint||proof.restoreSha256!==result.restoreSha256||proof.restoreFile!==result.restoreSha256)throw Error('The live files do not match the cutover result: '+JSON.stringify(proof));
 swapped=true;console.log('CUTOVER '+JSON.stringify(result));
 start(image);
 // The new server took 25 s to answer at a quarter core and 121 s at a sixteenth locally; wait up to five minutes.
 let health=null;for(let i=0;i<100&&health?.profile!=='integrated';i++){try{health=await (await globalThis.fetch(site+'/healthz')).json();}catch{/* starting */}if(health?.profile!=='integrated')await new Promise(r=>setTimeout(r,3000));}
 if(health?.profile!=='integrated')throw Error('The new server did not report the integrated world: '+JSON.stringify(health));
 console.log('CUTOVER_HEALTH '+JSON.stringify(health));
}catch(error){
 console.error('Cutover failed: '+error.message);
 // Stop the detached cutover and everything it started before deciding what to put back, so it cannot swap afterwards.
 if(pid)try{command(`sh -c "kill -9 -${pid} 2>/dev/null; echo stopped"`);}catch{/* the restore restarts the machine anyway */}
 // Until the swap the machine runs `sleep infinity` and can say whether the stopped database was recorded;
 // after it, the stopped database is the recorded restore point and the new server may not be running at all.
 let recorded=swapped;if(!swapped)try{recorded=exec(`console.log((await import('node:fs')).existsSync(${JSON.stringify(backup+'/metadata-preflight.json')}))`).trim()==='true';}catch{throw Error('Cutover failed and the machine cannot be inspected; run the release-recovery workflow with '+tag,{cause:error});}
 if(recorded){const restore=spawnSync(process.execPath,['scripts/release/restore.mjs',tag],{stdio:'inherit'});if(restore.status!==0)throw Error('Cutover failed and the automatic restore failed; run the release-recovery workflow with '+tag,{cause:error});}
 else start(config.image);
 throw Error('Cutover failed; the original image'+(recorded?' and the stopped database were':' was')+' put back',{cause:error});
}
