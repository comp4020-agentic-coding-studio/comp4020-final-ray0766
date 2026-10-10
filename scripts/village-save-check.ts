import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../src/server/store.ts';
import { integrationTableDigest } from '../src/server/integration-migration.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';
import { distance } from '../src/shared/world.ts';

// Rehearse the ordinary versioned recovery on a new disposable copy. Never open
// the source writable, create an identity, or migrate owner building content.
const args=process.argv.slice(2),arg=(key:string)=>args[args.indexOf(key)+1];
if(!['--source','--destination','--report'].every(key=>args.includes(key)))throw Error('Use --source <backup> --destination <new copy> --report <new JSON>.');
const source=resolve(arg('--source')),destination=resolve(arg('--destination')),report=resolve(arg('--report'));
if(new Set([source,destination,report]).size!==3||existsSync(destination)||existsSync(report))throw Error('Use separate, new destination and report paths.');
if(existsSync(source+'-wal'))throw Error('Use a standalone SQLite backup, not a database with a WAL.');
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fileHash=()=>createHash('sha256').update(readFileSync(source)).digest('hex');
const initialHash=fileHash(),probe=new DatabaseSync(source,{readOnly:true});
const tablesBefore=integrationTableDigest(probe),playerRows=probe.prepare('SELECT * FROM players ORDER BY rowid').all();probe.close();
mkdirSync(dirname(destination),{recursive:true});copyFileSync(source,destination,constants.COPYFILE_EXCL);
let store=openStore(destination,{integratedWorld:true});
if(JSON.stringify(integrationTableDigest(store.db))!==JSON.stringify(tablesBefore))throw Error('Startup changed saved content before recovery.');
const protectedPlayer=(row:Record<string,unknown>)=>Object.fromEntries(Object.entries(row).filter(([key])=>!['position','revision'].includes(key)));
const worlds=new Map<string,GroundWorld>(),recoveries:{player:string;planet:string;metres:number;clear:boolean}[]=[];
for(const row of playerRows){
  const id=String(row.id),state=store.state(id);if(!state.ground)continue;
  let world=worlds.get(state.planetId);if(!world){world=new GroundWorld(store.universe(id).currentPlanet);worlds.set(state.planetId,world);}
  const pose={position:state.position,...state.ground};
  const metres=distance(JSON.parse(String(row.position)),state.position,state.worldRadius);
  const clear=!world.blocked(pose)&&pose.radius>=world.radius(pose.position)-.025;
  if(metres>.00001||!clear)recoveries.push({player:digest(id).slice(0,16),planet:digest(state.planetId).slice(0,16),metres,clear});
}
const tablesAfter=integrationTableDigest(store.db),currentPlayers=store.db.prepare('SELECT * FROM players ORDER BY rowid').all();
const protectedTables=Object.keys(tablesBefore).filter(name=>!['players','ground_states'].includes(name));
const protectedEqual=protectedTables.every(name=>JSON.stringify(tablesBefore[name])===JSON.stringify(tablesAfter[name]))&&digest(playerRows.map(protectedPlayer))===digest(currentPlayers.map(protectedPlayer));
const stable=JSON.stringify(tablesAfter);for(const row of playerRows)store.state(String(row.id));
const repeatStable=stable===JSON.stringify(integrationTableDigest(store.db));store.close();
store=openStore(destination,{integratedWorld:true});const reopenStable=stable===JSON.stringify(integrationTableDigest(store.db));store.close();
const result={status:protectedEqual&&repeatStable&&reopenStable&&recoveries.every(r=>r.clear)?'passed':'failed',sourceUnchanged:initialHash===fileHash(),protectedEqual,repeatStable,reopenStable,players:playerRows.length,recoveries,tablesBefore,tablesAfter,notes:['Only derived ground state and the player position/revision fence may change on the disposable copy.','The original database remains unchanged. Existing labels, groups, ownership, ships, quests, buildings and history are compared exactly.','Original saved geometry is reinterpreted by the new physics version; displaced feet are reported, never hidden.']};
mkdirSync(dirname(report),{recursive:true});writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,sourceUnchanged:result.sourceUnchanged,protectedEqual,repeatStable,reopenStable,players:result.players,recoveredPositions:recoveries.length,maxDisplacementMetres:Math.max(0,...recoveries.map(r=>r.metres)),report}));
if(result.status!=='passed'||!result.sourceUnchanged)process.exitCode=1;
