import {DatabaseSync} from 'node:sqlite';
import {copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {openStore} from '../../src/server/store.ts';
import {fingerprint,health,hash} from './sqlite-check.mjs';
const original=process.argv[2],normal=original+'.upgrade-probe',failure=original+'.rollback-probe';
// Called on a private copy, never on the authoritative DB or sole backup.
const base=new DatabaseSync(original,{readOnly:true}),initial=health(base),before=fingerprint(base);base.close();
assert.deepEqual(initial.integrity,['ok']);assert.equal(initial.foreignKeys,0);
copyFileSync(original,normal);let s=openStore(normal);assert.equal(health(s.db).schema,9);assert.deepEqual(fingerprint(s.db,before),before);assert.deepEqual(health(s.db).integrity,['ok']);assert.equal(health(s.db).foreignKeys,0);
if(initial.schema<9)assert.equal(s.db.prepare('SELECT count(*) n FROM planets WHERE environment IS NOT NULL').get().n,0);
if(initial.schema<8){assert.equal(s.db.prepare('SELECT count(*) n FROM history_events').get().n,0);assert.equal(s.db.prepare('SELECT count(*) n FROM history_heads WHERE seq!=0').get().n,0);}
const first=fingerprint(s.db);s.close();s=openStore(normal);assert.deepEqual(fingerprint(s.db),first);s.close();
let rollback='not needed for schema 9';
if(initial.schema<9){copyFileSync(original,failure);let db=new DatabaseSync(failure);db.exec('CREATE TABLE ground_states_v9 (deliberate_obstruction INTEGER)');const obstructed=fingerprint(db),definitions=db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all();db.close();
 assert.throws(()=>openStore(failure),/ground_states_v9/);db=new DatabaseSync(failure);assert.equal(health(db).schema,initial.schema);assert.deepEqual(fingerprint(db),obstructed);assert.deepEqual(db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all(),definitions);db.exec('DROP TABLE ground_states_v9');db.close();s=openStore(failure);assert.deepEqual(fingerprint(s.db,before),before);s.close();rollback='injected late migration failure rolled back all earlier DDL/rows; retry passed';}
const report={status:'passed',from:initial.schema,to:9,sourceSha256:hash(readFileSync(original)),preservedTables:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.rows])),reopen:'identical',rollback,legacyEnvironment:initial.schema<9?'all null':'existing environments retained',integrity:'ok',foreignKeys:0};
writeFileSync(original+'.probe-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
