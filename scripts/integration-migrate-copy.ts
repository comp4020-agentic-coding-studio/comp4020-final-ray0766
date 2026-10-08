import { copyFileSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../src/server/store.ts';
import { applyIntegration, integrationTableDigest, previewIntegration } from '../src/server/integration-migration.ts';

// This operator tool never opens its source writable, and never overwrites a destination.
const args=process.argv.slice(2), value=(name:string)=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];};
const source=value('--source'),destination=value('--destination'),reportPath=value('--report');
if(!source||!destination||!reportPath)throw new Error('Use --source <consistent backup> --destination <new copy> --report <json> [--apply].');
if(resolve(source)===resolve(destination)||existsSync(destination))throw new Error('Destination must be a new file, separate from the source.');
if([source,destination,destination+'.restore-probe.sqlite'].some(path=>resolve(path)===resolve(reportPath))||existsSync(reportPath))throw new Error('Report must be a new separate file; it cannot overwrite a database or existing report.');
if(existsSync(source+'-wal'))throw new Error('Source must be a standalone consistent backup without a live WAL.');
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fileHash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHash=fileHash(source),original=new DatabaseSync(source,{readOnly:true});
const originalTables=integrationTableDigest(original);
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
const originalRows=Object.fromEntries(Object.keys(originalTables).map(name=>[name,original.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all()]));
original.close();mkdirSync(dirname(destination),{recursive:true});copyFileSync(source,destination,constants.COPYFILE_EXCL);
let store=openStore(destination);
const preview=previewIntegration(store.db),applyRequested=args.includes('--apply'),applied=applyRequested&&preview.report.canApply;
if(applied)applyIntegration(store.db,preview.report.sourceDigest);
const after=integrationTableDigest(store.db);
const permitted:Record<string,string[]>={planets:['revision','world_radius'],players:['position','revision'],ground_states:['position','radius','sequence','scene_revision','physics_version','clock_credit','request_hash']};
const comparison=Object.fromEntries(Object.entries(originalRows).map(([name,rows])=>{
  const current=store.db.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all(),columns=rows.length?Object.keys(rows[0]):[];
  const changed=new Set<string>();let changedRows=0;
  for(let i=0;i<Math.max(rows.length,current.length);i++){
    if(!rows[i]||!current[i]){changed.add('$rowCount');changedRows++;continue;}
    const different=columns.filter(column=>JSON.stringify(rows[i][column])!==JSON.stringify(current[i][column]));
    if(different.length)changedRows++;for(const column of different)changed.add(column);
  }
  const protectedColumns=columns.filter(column=>!(permitted[name]??[]).includes(column));
  const protectedHash=(values:typeof rows)=>hash(values.map(row=>Object.fromEntries(protectedColumns.map(column=>[column,row[column]]))));
  const metadataInitialization=['integration_config','integration_migrations','planet_radius_epochs'].includes(name)&&rows.length===0;
  return [name,{beforeCount:rows.length,afterCount:current.length,changedRows,changedColumns:[...changed].sort(),metadataInitialization,protectedColumnsSha256Before:protectedHash(rows),protectedColumnsSha256After:protectedHash(current),protectedEqual:metadataInitialization||(rows.length===current.length&&protectedHash(rows)===protectedHash(current)),allowedChanges:metadataInitialization||[...changed].every(column=>(permitted[name]??[]).includes(column))}];
}));
if(Object.values(comparison).some(table=>!table.protectedEqual||!table.allowedChanges))throw new Error('Unexpected business data difference; preserve this copy for review and do not deploy it.');
const migratedGround=store.db.prepare('SELECT player_id FROM ground_states').all().map(row=>String(row.player_id));
store.close();store=openStore(destination,applied?{integratedWorld:true}:{});
const reopened=integrationTableDigest(store.db),reopenEqual=JSON.stringify(after)===JSON.stringify(reopened);
if(!reopenEqual)throw new Error('Opening the migrated database changed audited rows.');
if(applied){for(const id of migratedGround)store.state(id);}
const afterSavedPoseRead=integrationTableDigest(store.db),savedPoseReadsStable=JSON.stringify(reopened)===JSON.stringify(afterSavedPoseRead);
if(!savedPoseReadsStable)throw new Error('Saved poses required unexpected recovery after the explicit migration.');
if(applied){const repeated=previewIntegration(store.db);applyIntegration(store.db,repeated.report.sourceDigest);if(JSON.stringify(afterSavedPoseRead)!==JSON.stringify(integrationTableDigest(store.db)))throw new Error('Repeated migration was not idempotent.');}
store.close();
const restoredPath=destination+'.restore-probe.sqlite';copyFileSync(source,restoredPath,constants.COPYFILE_EXCL);
const restored=new DatabaseSync(restoredPath,{readOnly:true}),restoreTables=integrationTableDigest(restored);restored.close();
const sourceHashAfter=fileHash(source);
const result={status:applied?'applied-to-isolated-copy':applyRequested?'blocked':'dry-run-only',sourceSha256Before:sourceHash,sourceSha256After:sourceHashAfter,sourceUnchanged:sourceHash===sourceHashAfter,restoreMatchesAllOriginalTables:JSON.stringify(originalTables)===JSON.stringify(restoreTables),preview:preview.report,comparison,newTables:Object.keys(after).filter(name=>!originalTables[name]),reopenEqual,savedPoseReadsStable,originalTables,afterTables:after,notes:['The source is read-only; destination was created exclusively.','Only planet revisions, player revision fences and explicitly rebased ground poses may change in original tables.','Original object rows, blueprint labels/groups/content, ships, quests, ownership, visits and immutable history are retained.','Radius epochs describe old snapshot geometry without fabricating or rewriting history events.','Restore requires the old application and untouched source backup; do not merge old and new writable databases.']};
if(!result.sourceUnchanged||!result.restoreMatchesAllOriginalTables)throw new Error('Source or restore integrity check failed.');
mkdirSync(dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,canApply:preview.report.canApply,risks:preview.report.risks.length,originalTables:Object.keys(originalTables).length,changedTables:Object.entries(comparison).filter(([,table])=>table.changedRows).map(([name,table])=>({name,changedRows:table.changedRows,columns:table.changedColumns})),sourceUnchanged:result.sourceUnchanged,reopenEqual,savedPoseReadsStable,report:reportPath}));
if(applyRequested&&!applied)process.exitCode=2;
