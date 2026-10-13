import {spawnSync} from 'node:child_process';
import {appendFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {APP,SERVER,allocationProblem,expectConfig,machine,remote,run,sleep,waitIntegrated} from './fly.mjs';
// Runs in the deploy job after preflight.mjs, with the image the job built but has not deployed. Production refuses
// an unintegrated database, so before the first integrated release the live one is integrated while no app process
// runs: the machine switches to the new image without starting its server, cutover-copy.mjs backs up the stopped
// database and swaps in its verified integrated copy, and the server then starts on it. Any failure after the stop
// hands over to settle.mjs, which puts the original image back, with the stopped database once that was recorded.
// When the live database is already integrated this only checks that the Deploy step has time to run.
const tag=(process.env.GITHUB_SHA??'').slice(0,12)+'-'+(process.env.GITHUB_RUN_ID??''),image=process.argv[2],site=process.env.APP_URL,deadline=Number(process.env.JOB_DEADLINE)*1000;
if(!/^[a-f0-9]{12}-[0-9]+$/.test(tag)||!/^[\w./:-]+$/.test(image??'')||!site||!Number.isFinite(deadline))throw Error('Run from the deploy job with the built image, APP_URL and JOB_DEADLINE');
// Worst cases after the stop, each cut off by real elapsed time. The job is cancelled at its limit, and a cancelled
// job runs nothing more, so the stop happens only while all of them, a full rollback and the remaining steps fit.
// Measured: the cutover took about 30 s on the Fly machine (run 38439968624) and the probe alone 371 s at a
// sixteenth of a core locally; the new server answered after 25 s at a quarter core and 121 s at a sixteenth;
// the recovery workflow's restore took 63 s (run 38443752761).
const POLL=4*60_000,START=2*60_000,HEALTH=3*60_000,SETTLE=4*60_000,AFTER=90_000,DEPLOY=6*60_000;
const left=()=>deadline-Date.now(),output=(key,value)=>{if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);};
const backup='/data/release-backups/'+tag,local=mkdtempSync(join(tmpdir(),'cutover-'));
const {id,config}=machine(),allocation=allocationProblem(config);if(allocation)throw Error(allocation);
const {command,exec}=remote(id);
const live=JSON.parse(exec(`const {DatabaseSync}=await import('node:sqlite');const fs=await import('node:fs');const db=new DatabaseSync('/data/little-post.sqlite',{readOnly:true});const marked=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='integration_config'").get()&&Number(db.prepare('SELECT version FROM integration_config WHERE id=1').get()?.version??0)>=1;db.close();console.log(JSON.stringify({marked,preflight:fs.existsSync(${JSON.stringify(backup+'/metadata.json')})}));`));
if(!live.preflight)throw Error('This release has no preflight backup');
if(live.marked){
 if(left()<DEPLOY+SETTLE)throw Error(`Only ${Math.round(left()/1000)} s are left in the deploy job, too few to deploy and still put the previous release back; nothing was changed`);
 output('ran','false');console.log('CUTOVER not needed: the live database is already integrated');process.exit(0);
}
const needed=POLL+START+HEALTH+SETTLE+AFTER;
const saved=join(local,'original-config.json');writeFileSync(saved,JSON.stringify(config),{mode:0o600});
// Fly's registry can answer 404 for an image pushed seconds earlier (run 38438023060: "failed to get manifest" six
// seconds after the push; Fly staff on community.fly.io describe this race and a retry after about a minute). The
// machine is unchanged when that happens, so only that error is retried, and only while the whole cutover still fits.
for(let attempt=1;;attempt++){
 if(left()<needed)throw Error(`Only ${Math.round(left()/1000)} s are left in the deploy job and a cutover with its rollback needs ${needed/1000} s; nothing was stopped`);
 try{run('flyctl',['machine','update',id,'-a',APP,'--machine-config',saved,'--image',image,'--command','sleep infinity','--autostart=false','--autostop=off','--yes','--skip-health-checks'],START);break;}
 catch(error){if(attempt>=10||!/failed to get manifest|MANIFEST_UNKNOWN/.test(error.message))throw error;console.log(`IMAGE_NOT_READY attempt ${attempt}; the machine is unchanged, retrying in 20 s`);await sleep(20_000);}
}
output('ran','true');
const stopped=Date.now();let pinned=image;
try{
 // Fly answers with the tag and the digest it resolved (tag@sha256:...). From here on the release is that exact image:
 // the server starts from it and every later check compares the digest too, not only the tag.
 pinned=expectConfig({image,cmd:['sleep','infinity'],mounts:config.mounts}).image;console.log('RELEASE_IMAGE '+pinned);
 // Fly's exec gives up on a request after about a minute (HTTP 408), so the cutover runs detached and is polled.
 const pid=exec(`const fs=await import('node:fs');const {spawn}=await import('node:child_process');for(const f of ['at-stop.sqlite','cutover.exit','cutover-result.json'])if(fs.existsSync(${JSON.stringify(backup)}+'/'+f))throw Error('A cutover already ran for this release: '+f);for(const pid of fs.readdirSync('/proc').filter(n=>/^\\d+$/.test(n))){let cmd='';try{cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');}catch{}if(cmd.includes('src/server/index.ts'))throw Error('Application writer is still running');}const child=spawn('sh',['-c','node /app/scripts/release/cutover-copy.mjs /data/little-post.sqlite '+${JSON.stringify(backup)}+' > '+${JSON.stringify(backup+'/cutover.log')}+' 2>&1; echo $? > '+${JSON.stringify(backup+'/cutover.exit')}],{detached:true,stdio:'ignore'});child.unref();console.log(child.pid);`).trim();
 if(!/^\d+$/.test(pid))throw Error('The detached cutover did not start');
 const pollUntil=Math.min(stopped+POLL,deadline-(START+HEALTH+SETTLE+AFTER));let state='running';
 while(state==='running'&&Date.now()<pollUntil){await sleep(Math.min(10_000,Math.max(0,pollUntil-Date.now())));state=command(`sh -c "cat ${backup}/cutover.exit 2>/dev/null || (test -d /proc/${pid} && echo running) || echo gone"`).trim();}
 if(state!=='0')throw Error('The cutover '+(state==='running'?`was still running after ${Math.round((Date.now()-stopped)/1000)} s`:state==='gone'?'stopped without an exit status':'exited with '+state)+': '+exec(`const fs=await import('node:fs');console.log(JSON.stringify(fs.existsSync(${JSON.stringify(backup+'/cutover.log')})?fs.readFileSync(${JSON.stringify(backup+'/cutover.log')},'utf8').split('\\n').filter(l=>/^[A-Za-z]*Error:/.test(l)).slice(-2).join(' '):'no log'))`).trim());
 const result=JSON.parse(exec(`console.log((await import('node:fs')).readFileSync(${JSON.stringify(backup+'/cutover-result.json')},'utf8'))`));
 if(result.status!=='integrated')throw Error('The cutover did not report an integrated database');
 // The result file is only a claim: check the files themselves before anything starts on them.
 const proof=JSON.parse(exec(`const {DatabaseSync}=await import('node:sqlite');const fs=await import('node:fs');const {createHash}=await import('node:crypto');const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');const db=new DatabaseSync('/data/little-post.sqlite',{readOnly:true});const marked=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='integration_config'").get()&&Number(db.prepare('SELECT version FROM integration_config WHERE id=1').get()?.version??0)>=1;const out={marked,schema:db.prepare('PRAGMA user_version').get().user_version,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeys:db.prepare('PRAGMA foreign_key_check').all().length};db.close();const meta=JSON.parse(fs.readFileSync(${JSON.stringify(backup+'/metadata.json')},'utf8'));console.log(JSON.stringify({...out,main:sha('/data/little-post.sqlite'),restorePoint:meta.backup,restoreSha256:meta.sha256,restoreFile:sha(meta.backup)}));`));
 if(!proof.marked||proof.schema!==result.to||proof.integrity!=='ok'||proof.foreignKeys!==0||proof.main!==result.integratedSha256||proof.restorePoint!==backup+'/at-stop.sqlite'||proof.restorePoint!==result.restorePoint||proof.restoreSha256!==result.restoreSha256||proof.restoreFile!==result.restoreSha256)throw Error('The live files do not match the cutover result: '+JSON.stringify(proof));
 console.log('CUTOVER '+JSON.stringify(result));
 // The init command is named explicitly: without --command the merged configuration kept `sleep infinity`.
 run('flyctl',['machine','update',id,'-a',APP,'--machine-config',saved,'--image',pinned,'--command',SERVER.join(' '),'--autostart=true','--autostop=stop','--yes'],START);
 expectConfig({image:pinned,cmd:SERVER,mounts:config.mounts});
 const health=await waitIntegrated(site,Math.min(Date.now()+HEALTH,deadline-SETTLE-AFTER));
 if(health?.profile!=='integrated')throw Error('The new server did not report the integrated world in time: '+JSON.stringify(health));
 console.log('CUTOVER_HEALTH '+JSON.stringify({...health,secondsStopped:Math.round((Date.now()-stopped)/1000)}));
}catch(error){
 console.error('Cutover failed: '+error.message);
 // settle.mjs restarts the machine into `sleep infinity` first, which also ends the detached cutover, and only then
 // decides what to put back. It gets the time that is left before the job limit.
 const settle=spawnSync(process.execPath,['scripts/release/settle.mjs',tag,image],{stdio:'inherit',timeout:Math.max(30_000,left()-15_000)});
 if(settle.status!==0)throw Error('Cutover failed and putting the previous release back did not finish; run the release-recovery workflow with '+tag,{cause:error});
 throw Error('Cutover failed; the previous release was put back',{cause:error});
}
