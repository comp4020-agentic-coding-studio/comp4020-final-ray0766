import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Operator recovery, and the deploy job's rollback of a failed cutover (cutover.mjs). It restores the point the
// release's metadata.json names: the preflight backup, or the stopped database once a cutover recorded it.
const app='comp4020-final-ray0766',tag=process.argv[2];if(!/^[a-f0-9]{12}-[0-9]+$/.test(tag??''))throw Error('Provide the exact recorded backup directory identifier');
const local=mkdtempSync(join(tmpdir(),'crit8-restore-')),backup='/data/release-backups/'+tag;
function run(args){const p=spawnSync('flyctl',args,{encoding:'utf8',maxBuffer:8*1024*1024});if(p.status!==0)throw Error('Fly command failed: '+p.stderr.slice(-2200));return p.stdout;}
// Wakes an auto-stopped machine; a site that is down is the reason to restore, so its failure does not stop it.
await globalThis.fetch((process.env.APP_URL??'https://'+app+'.fly.dev')+'/healthz').catch(()=>{});const machines=JSON.parse(run(['machine','list','-a',app,'--json']));if(machines.length!==1)throw Error('Expected one existing machine');const id=machines[0].id;
function exec(code){const command='node --input-type=module -e "await import(\'data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'\')"';const r=JSON.parse(run(['machine','exec',id,command,'-a',app,'--json','--timeout','120']));if(Number(r.exit_code??r.exitCode??0)!==0)throw Error('Remote recovery failed: '+(r.stderr??'').split('\n').filter(l=>/^[A-Za-z]*Error:/.test(l)).slice(-2).join(' '));if(r.stdout!==undefined&&typeof r.stdout!=='string')throw Error('Invalid remote stdout');const out=r.stdout??'';if(!out.trim())throw Error('Fly returned nothing for a remote step, so it did not run');return out;}
// Stop the current image's server first: a release whose server cannot start is the case to recover from,
// and a machine has to be running before anything can be read from its volume.
run(['machine','update',id,'-a',app,'--command','sleep infinity','--autostart=false','--autostop=off','--yes','--skip-health-checks']);
const record=JSON.parse(exec(`const fs=await import('node:fs');console.log(JSON.stringify({config:JSON.parse(fs.readFileSync('${backup}/machine-config.json','utf8')),metadata:JSON.parse(fs.readFileSync('${backup}/metadata.json','utf8'))}));`));if(record.metadata.machine!==id)throw Error('Backup belongs to a different machine');
const point=record.metadata.backup;if(typeof point!=='string'||!point.startsWith(backup+'/')||point.includes('..'))throw Error('The backup record points outside its directory');
const saved=join(local,'original-config.json');writeFileSync(saved,JSON.stringify(record.config),{mode:0o600});
// No app process runs while its DB and WAL files are swapped. Keep the same VM,
// volume and original image; recovery does not create or resize resources.
run(['machine','update',id,'-a',app,'--machine-config',saved,'--image',record.config.image,'--command','sleep infinity','--autostart=false','--autostop=off','--yes','--skip-health-checks']);
const checker=readFileSync('scripts/release/sqlite-check.mjs','utf8'),restore=readFileSync('scripts/release/restore-copy.mjs','utf8');
const result=exec(`const fs=await import('node:fs');for(const pid of fs.readdirSync('/proc').filter(n=>/^\\d+$/.test(n))){let cmd='';try{cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');}catch{}if(cmd.includes('src/server/index.ts'))throw Error('Application writer is still running');}fs.writeFileSync('${backup}/sqlite-check.mjs',${JSON.stringify(checker)},{mode:0o600});fs.writeFileSync('${backup}/restore-copy.mjs',${JSON.stringify(restore)},{mode:0o600});const {restoreCopy}=await import('file://${backup}/restore-copy.mjs');console.log(JSON.stringify(restoreCopy('/data/little-post.sqlite',${JSON.stringify(point)},'${record.metadata.sha256}')));`);
// The original image restarts only on a confirmed restore; otherwise the machine stays stopped with no writer.
const restored=JSON.parse(result);if(restored.status!=='restored')throw Error('The database was not restored; the machine stays stopped');console.log(JSON.stringify(restored));run(['machine','update',id,'-a',app,'--machine-config',saved,'--image',record.config.image,'--command','node src/server/index.ts','--autostart=true','--autostop=stop','--yes']);console.log('Original image and matched database restored on the same machine. Verify public routes before resuming traffic.');
