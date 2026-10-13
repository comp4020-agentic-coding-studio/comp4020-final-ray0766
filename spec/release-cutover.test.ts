import {it,expect} from 'vitest';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {openStore} from '../src/server/store.ts';
const sha=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
// A stopped, unintegrated main database with two players, and the release directory a preflight left.
function stopped(){
 const dir=mkdtempSync(join(tmpdir(),'cutover-check-')),main=join(dir,'little-post.sqlite'),release=join(dir,'release');mkdirSync(release);
 const store=openStore(main);store.create('cutover-a',0);store.create('cutover-b',0);
 store.claim('cutover-a',store.universe('cutover-a').planets.find(p=>p.kind==='garden')!.id);store.close();
 writeFileSync(join(release,'metadata.json'),JSON.stringify({tag:'preflight',backup:join(release,'before.sqlite'),sha256:'preflight'}));
 return {dir,main,release};
}
// The real scripts run here as they do on the machine: the probe and then the operator tool are separate
// node processes that each load the server, about 4.5 s alone and twice that beside the full suite.
it('swaps in the verified integrated copy and records the stopped database as the restore point',async()=>{
 const {cutover}=await import('../scripts/release/cutover-copy.mjs');const {dir,main,release}=stopped();
 try{
  const before=sha(main),result=cutover(main,release),point=join(release,'at-stop.sqlite');
  expect(result).toMatchObject({status:'integrated',restorePoint:point,players:2,playersRead:2});
  expect(JSON.parse(readFileSync(join(release,'metadata.json'),'utf8'))).toMatchObject({tag:'preflight',backup:point,sha256:sha(point)});
  expect(JSON.parse(readFileSync(join(release,'metadata-preflight.json'),'utf8')).sha256).toBe('preflight');
  expect(sha(join(release,'displaced','main.sqlite'))).toBe(before);
  const store=openStore(main,{integratedWorld:true});
  try{expect(store.integratedWorld).toBe(true);expect(store.db.prepare('SELECT count(*) n FROM planets WHERE owner_id=?').get('cutover-a')!.n).toBe(1);expect(store.state('cutover-b').location).toBeTruthy();}finally{store.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
},30_000);
it('leaves the main database in place when the probe fails, with the stopped copy recorded',async()=>{
 const {cutover}=await import('../scripts/release/cutover-copy.mjs');const {dir,main,release}=stopped();
 try{
  const before=sha(main);writeFileSync(join(release,'at-stop.sqlite.integrated.sqlite'),'left by an earlier attempt');
  expect(()=>cutover(main,release)).toThrow('stays in place');
  expect(sha(main)).toBe(before);expect(existsSync(join(release,'displaced'))).toBe(false);
  expect(JSON.parse(readFileSync(join(release,'metadata.json'),'utf8')).backup).toBe(join(release,'at-stop.sqlite'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
