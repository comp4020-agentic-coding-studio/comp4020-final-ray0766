import {DatabaseSync} from 'node:sqlite';
import {copyFileSync,existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {hash,health} from './sqlite-check.mjs';
// Caller must stop the application writer first. The stopped database becomes this release's restore point:
// metadata.json, which restore.mjs reads, names it from here on, and the preflight's record stays beside it as
// metadata-preflight.json. probe.mjs integrates a copy, and only its passing, hash-matched result replaces the
// main file. Nothing is deleted: the displaced main file and its WAL/SHM stay in the release directory.
export function cutover(main,dir){
 const point=dir+'/at-stop.sqlite';
 if(existsSync(point)||!existsSync(dir+'/metadata.json'))throw Error('Cutover needs this release\'s preflight record and no earlier cutover point');
 const live=new DatabaseSync(main);live.exec('PRAGMA busy_timeout=10000');live.prepare('VACUUM INTO ?').run(point);live.close();
 const copy=new DatabaseSync(point,{readOnly:true}),stopped=health(copy);copy.close();
 if(stopped.integrity.join()!=='ok'||stopped.foreignKeys!==0)throw Error('The stopped database backup is not healthy');
 const sha256=hash(readFileSync(point)),record=JSON.parse(readFileSync(dir+'/metadata.json','utf8'));
 copyFileSync(dir+'/metadata.json',dir+'/metadata-preflight.json');
 writeFileSync(dir+'/metadata.json.next',JSON.stringify({...record,backup:point,schema:stopped.schema,sha256}),{mode:0o600});renameSync(dir+'/metadata.json.next',dir+'/metadata.json');
 const probe=spawnSync(process.execPath,['--max-old-space-size=80',fileURLToPath(new URL('./probe.mjs',import.meta.url)),point],{encoding:'utf8'});
 if(probe.status!==0)throw Error('The probe failed on the stopped database, which stays in place: '+String(probe.stderr).split('\n').filter(l=>/^[A-Za-z]*Error:/.test(l)).slice(-2).join(' '));
 const result=JSON.parse(readFileSync(point+'.probe-result.json','utf8')),integrated=point+'.integrated.sqlite';
 if(result.status!=='passed'||result.sourceSha256!==sha256||hash(readFileSync(integrated))!==result.integratedSha256)throw Error('The probe result does not match the stopped database');
 const displaced=dir+'/displaced';mkdirSync(displaced,{recursive:true,mode:0o700});
 for(const suffix of ['','-wal','-shm'])if(existsSync(main+suffix))renameSync(main+suffix,displaced+'/main.sqlite'+suffix);
 copyFileSync(integrated,main+'.cutover-ready');renameSync(main+'.cutover-ready',main);
 const swapped=new DatabaseSync(main,{readOnly:true}),now=health(swapped);swapped.close();
 if(hash(readFileSync(main))!==result.integratedSha256||now.integrity.join()!=='ok'||now.foreignKeys!==0||now.schema!==result.to)throw Error('The swapped database does not match the verified copy');
 return {status:'integrated',restorePoint:point,restoreSha256:sha256,from:result.from,to:result.to,players:result.players,playersRead:result.playersRead,tool:result.tool,integratedSha256:result.integratedSha256,displaced};
}
// cutover.mjs runs this file detached on the machine and reads the result file, as Fly's exec gives up after a minute.
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [main,dir]=process.argv.slice(2),result=cutover(main,dir);writeFileSync(dir+'/cutover-result.json',JSON.stringify(result),{mode:0o600});console.log(JSON.stringify(result));}
