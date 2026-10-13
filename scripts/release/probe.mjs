import {DatabaseSync} from 'node:sqlite';
import {copyFileSync,existsSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {basename,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {fingerprint,health,hash} from './sqlite-check.mjs';
// Called on a private copy, never on the authoritative DB or sole backup: the preflight runs it on a copy of the
// live backup while the old server keeps serving, and the cutover runs it on the stopped database, swapping in
// <copy>.integrated.sqlite only after it passes. Production refuses to start on an unintegrated database, so
// one goes through the operator tool first; an integrated one is opened exactly as production opens it.
const original=process.argv[2],integrated=original+'.integrated.sqlite',report=integrated+'.report.json';
const scratch=['.direct-probe','.verify-probe','.rollback-probe'].map(suffix=>original+suffix);
for(const path of [integrated,report,...scratch])if(existsSync(path))throw Error('Probe output already exists: '+path);
const sourceSha256=hash(readFileSync(original));
const base=new DatabaseSync(original,{readOnly:true}),initial=health(base),before=fingerprint(base);
const marked=!!base.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='integration_config'").get()&&Number(base.prepare('SELECT version FROM integration_config WHERE id=1').get()?.version??0)>=1;
const players=base.prepare('SELECT id,character,quest,deliveries,planet_id FROM players ORDER BY rowid').all();base.close();
assert.deepEqual(initial.integrity,['ok']);assert.equal(initial.foreignKeys,0);
// The operator tool runs before this process loads the server, so the two never hold memory at once.
let tool='not needed: already integrated';
if(marked)copyFileSync(original,integrated);
else{
 const run=spawnSync(process.execPath,[fileURLToPath(new URL('../integration-migrate-copy.ts',import.meta.url)),'--source',original,'--destination',integrated,'--report',report,'--apply'],{encoding:'utf8',env:{...process.env,NODE_OPTIONS:'--max-old-space-size=80'}});
 if(run.status!==0)throw Error('Integration tool '+(run.status===2?'found risks':'failed')+': '+String(run.stderr).split('\n').filter(l=>/Error/.test(l)).slice(-2).join(' '));
 const r=JSON.parse(readFileSync(report,'utf8'));
 assert.equal(r.status,'applied-to-isolated-copy');assert.equal(r.preview.risks.length,0);
 assert.ok(r.sourceUnchanged&&r.restoreMatchesAllOriginalTables&&r.reopenEqual&&r.savedPoseReadsStable);
 assert.ok(Object.values(r.comparison).every(t=>t.protectedEqual&&t.allowedChanges));
 tool={changed:Object.fromEntries(Object.entries(r.comparison).filter(([,t])=>t.changedRows).map(([name,t])=>[name,t.changedRows+' rows: '+t.changedColumns.join(',')])),newTables:r.newTables.length};
}
assert.ok(!existsSync(integrated+'-wal'),'The integrated copy must be complete without a WAL file');
const integratedSha256=hash(readFileSync(integrated));
const {openStore}=await import('../../src/server/store.ts');
const empty=openStore(':memory:'),target=health(empty.db).schema;empty.close();
let directStart='not applicable: already integrated';
if(!marked){
 const [direct]=scratch;copyFileSync(original,direct);
 assert.throws(()=>openStore(direct,{integratedWorld:true}),/explicit backed-up integration migration/);
 const db=new DatabaseSync(direct,{readOnly:true});assert.deepEqual(fingerprint(db,before),before);db.close();
 directStart='refused before any write';
}
// Open a copy of the result the way src/server/index.ts does, then read every player's first state.
const verify=scratch[1];copyFileSync(integrated,verify);
let s=openStore(verify,{integratedWorld:true});const after=health(s.db);
assert.equal(after.schema,target);assert.deepEqual(after.integrity,['ok']);assert.equal(after.foreignKeys,0);assert.ok(s.integratedWorld);
let identityKept=0;
for(const p of players){
 s.state(String(p.id));s.universe(String(p.id));
 const now=s.db.prepare('SELECT character,quest,deliveries,planet_id FROM players WHERE id=?').get(p.id);
 assert.deepEqual({...now},{character:p.character,quest:p.quest,deliveries:p.deliveries,planet_id:p.planet_id},'Player identity changed on first read');identityKept++;
}
const read=fingerprint(s.db);s.close();s=openStore(verify,{integratedWorld:true});assert.deepEqual(fingerprint(s.db),read);s.close();
let rollback='not needed from schema '+initial.schema;
if(initial.schema<9){
 const failure=scratch[2];copyFileSync(original,failure);let db=new DatabaseSync(failure);db.exec('CREATE TABLE ground_states_v9 (deliberate_obstruction INTEGER)');const obstructed=fingerprint(db),definitions=db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all();db.close();
 assert.throws(()=>openStore(failure),/ground_states_v9/);db=new DatabaseSync(failure);assert.equal(health(db).schema,initial.schema);assert.deepEqual(fingerprint(db),obstructed);assert.deepEqual(db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all(),definitions);db.exec('DROP TABLE ground_states_v9');db.close();
 s=openStore(failure);assert.equal(health(s.db).schema,target);s.close();rollback='injected late migration failure rolled back all earlier DDL/rows; retry passed';
}
assert.equal(hash(readFileSync(original)),sourceSha256,'The probe changed its source');
// Scratch copies and the backups openStore made of them go; the integrated copy and the tool's report stay.
for(const path of scratch)for(const name of readdirSync(dirname(path)))if(name===basename(path)||name.startsWith(basename(path)+'-')||name.startsWith(basename(path)+'.v'))rmSync(join(dirname(path),name));
const result={status:'passed',from:initial.schema,to:target,sourceSha256,integratedSha256,integration:marked?'already integrated':'applied by scripts/integration-migrate-copy.ts',tool,directStart,players:players.length,playersRead:identityKept,preservedTables:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.rows])),reopen:'identical',rollback,integrity:'ok',foreignKeys:0};
writeFileSync(original+'.probe-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
