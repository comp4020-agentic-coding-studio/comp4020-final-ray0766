import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
it('restores a verified closed database and retains the displaced newer data',async()=>{
 const {restoreCopy}=await import('../scripts/release/restore-copy.mjs');const dir=mkdtempSync(join(tmpdir(),'restore-check-')),target=join(dir,'live.sqlite'),backup=join(dir,'backup.sqlite');
 try{let db=new DatabaseSync(target);db.exec("CREATE TABLE saved(value TEXT);INSERT INTO saved VALUES('original');PRAGMA user_version=4;");db.prepare('VACUUM INTO ?').run(backup);db.exec("UPDATE saved SET value='newer';PRAGMA user_version=9;");db.close();const sha=createHash('sha256').update(readFileSync(backup)).digest('hex');expect(()=>restoreCopy(target,backup,'wrong')).toThrow('mismatch');const result=restoreCopy(target,backup,sha);expect(result.schema).toBe(4);db=new DatabaseSync(target);expect(db.prepare('SELECT value FROM saved').get()!.value).toBe('original');db.close();db=new DatabaseSync(result.displaced);expect(db.prepare('SELECT value FROM saved').get()!.value).toBe('newer');db.close();expect(createHash('sha256').update(readFileSync(backup)).digest('hex')).toBe(sha);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
