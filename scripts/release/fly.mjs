import {spawnSync} from 'node:child_process';
// Shared by cutover.mjs and settle.mjs. Every wait here is bounded by real elapsed time, and every request has its
// own timeout: Fly's proxy held each health request for about 35 s while no server listened (run 38439968624).
export const APP='comp4020-final-ray0766',SERVER=['node','src/server/index.ts'];
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function run(cmd,args,timeout){const p=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:8*1024*1024,timeout});if(p.error)throw Error(cmd+' failed: '+p.error.message);if(p.status!==0)throw Error(cmd+' failed: '+p.stderr.slice(-2500));return p.stdout;}
export function machine(){const machines=JSON.parse(run('flyctl',['machine','list','-a',APP,'--json']));if(machines.length!==1)throw Error('Expected exactly one existing app machine');return machines[0];}
/** Fly records an image by tag and digest (`...:release-x@sha256:...`) even when an update named only the tag (run
 * 38459447827), so two references name the same image when their tags match and, where both carry one, their digests. */
export function sameImage(a,b){const [tagA,digestA]=String(a).split('@'),[tagB,digestB]=String(b).split('@');return tagA===tagB&&(!digestA||!digestB||digestA===digestB);}
export function allocationProblem(config){return config.guest?.memory_mb!==256||config.guest?.cpus!==1||config.guest?.cpu_kind!=='shared'||config.mounts?.length!==1?'Unexpected machine allocation':null;}
// Fly omits a zero exit status and empty output, and drops a command it will not run without saying so, so every
// remote step prints something and an empty answer counts as a step that did not run.
export function remote(id){
 const command=line=>{const result=JSON.parse(run('flyctl',['machine','exec',id,line,'-a',APP,'--json','--timeout','50'],70_000));if(Number(result.exit_code??result.exitCode??0)!==0)throw Error('Remote operation failed: '+(result.stderr??'').split('\n').filter(l=>/^[A-Za-z]*Error:/.test(l)).slice(-2).join(' '));if(result.stdout!==undefined&&typeof result.stdout!=='string')throw Error('Invalid remote stdout');const out=result.stdout??'';if(!out.trim())throw Error('Fly returned nothing for a remote step, so it did not run');return out;};
 return {command,exec:code=>command('node --input-type=module -e "await import(\'data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'\')"')};
}
/** The machine's configuration as Fly reports it after an update, compared with what the update meant to set:
 * `machine update --machine-config` merges into the current configuration, so a field it does not name keeps
 * whatever an earlier update set (the init command stayed `sleep infinity` in run 38439968624). */
export function expectConfig(want){
 const {config}=machine(),cmd=config.init?.cmd??null,problems=[];
 if(!sameImage(config.image,want.image))problems.push(`image ${config.image} instead of ${want.image}`);
 if(JSON.stringify(cmd)!==JSON.stringify(want.cmd))problems.push(`command ${JSON.stringify(cmd)} instead of ${JSON.stringify(want.cmd)}`);
 const allocation=allocationProblem(config);if(allocation)problems.push(allocation);
 if(want.mounts&&JSON.stringify(config.mounts)!==JSON.stringify(want.mounts))problems.push('volume mounts changed');
 if(problems.length)throw Error('The machine configuration is not what the update set: '+problems.join('; '));
 return config;
}
/** One health request, given up after `timeout` ms; null when nothing answered in time. */
export async function health(site,timeout=10_000){try{const response=await globalThis.fetch(site+'/healthz',{signal:globalThis.AbortSignal.timeout(timeout)});return response.ok?await response.json():null;}catch{return null;}}
/** Polls until the server reports the integrated world or `until` (epoch ms) passes. */
export async function waitIntegrated(site,until){let last=null;while(Date.now()<until){last=await health(site,Math.max(1000,Math.min(10_000,until-Date.now())));if(last?.profile==='integrated')return last;await sleep(Math.min(3000,Math.max(0,until-Date.now())));}return last;}
