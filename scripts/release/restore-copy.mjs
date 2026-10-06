import {DatabaseSync} from 'node:sqlite';
import {copyFileSync,readFileSync,renameSync,rmSync} from 'node:fs';
import {hash,health} from './sqlite-check.mjs';
// Caller must stop the application writer first. Never reuse an old SQLite
// connection after this swap. Keep both the original backup and displaced data.
export function restoreCopy(target,backup,sha256){
 if(target===backup||hash(readFileSync(backup))!==sha256)throw Error('Backup path/hash mismatch');
 const source=new DatabaseSync(backup,{readOnly:true}),h=health(source);source.close();if(h.integrity.join()!=='ok'||h.foreignKeys!==0)throw Error('Backup is not healthy');
 const displaced=target+'.before-restore-'+Date.now()+'.sqlite';const current=new DatabaseSync(target);current.exec('PRAGMA busy_timeout=10000');current.prepare('VACUUM INTO ?').run(displaced);current.close();
 const ready=target+'.restore-ready';copyFileSync(backup,ready);rmSync(target+'-wal',{force:true});rmSync(target+'-shm',{force:true});renameSync(ready,target);
 const restored=new DatabaseSync(target,{readOnly:true}),actual=health(restored);restored.close();if(JSON.stringify(actual)!==JSON.stringify(h))throw Error('Restore verification failed');return{status:'restored',schema:h.schema,displaced};
}
