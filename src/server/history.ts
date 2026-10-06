import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { applyEvent, decide, parseCommand } from '../assets/claude-geometry/core/world.ts';
import type { ObjectSpec, WorldState } from '../assets/claude-geometry/core/world.ts';
import type { ActorId, EventId, ObjectId, PlanetId } from '../assets/claude-geometry/core/ids.ts';
import { canonicalEvent, decodeEvent, decodeSnapshot, encodeEvent, encodeSnapshot } from '../assets/claude-geometry/timeline/codec.ts';
import { HISTORY_PAGE, HISTORY_PAGE_MAX, HISTORY_SNAPSHOT_EVERY } from '../shared/history.ts';
import type { HistoryPage, HistorySnapshot } from '../shared/history.ts';
import type { PlacedObject } from '../shared/planets.ts';
import { blueprintStore } from './blueprints.ts';
import { RequestError } from './errors.ts';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const bounded=<T>(value:T):T=>{if(Buffer.byteLength(JSON.stringify(value))>1_048_576)throw new RequestError(413,'This history snapshot exceeds the preview size limit.');return value;};
const uuid=(s:string)=>{const h=hash(s);return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
const spec=(o:PlacedObject):ObjectSpec=>o.kind==='structure'?{kind:'structure',blueprintHash:o.blueprintHash!}:{kind:'prop',prop:o.kind};
function checked(state:WorldState){const text=encodeSnapshot(state),r=decodeSnapshot(text);if(!r.ok)throw Error('History snapshot is invalid: '+r.errors.join('; '));return {text,state:r.value};}
export function migrateHistory(db:DatabaseSync){
 db.exec(`CREATE TABLE IF NOT EXISTS history_heads (planet_id TEXT PRIMARY KEY REFERENCES planets(id), seq INTEGER NOT NULL CHECK(seq>=0), document TEXT NOT NULL CHECK(json_valid(document)), baseline_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS history_events (planet_id TEXT NOT NULL REFERENCES planets(id), seq INTEGER NOT NULL CHECK(seq>=1), command_id TEXT NOT NULL, environment TEXT, document TEXT NOT NULL CHECK(json_valid(document)), PRIMARY KEY(planet_id,seq), UNIQUE(planet_id,command_id));
 CREATE TABLE IF NOT EXISTS history_snapshots (planet_id TEXT NOT NULL REFERENCES planets(id), seq INTEGER NOT NULL CHECK(seq>=0), document TEXT NOT NULL CHECK(json_valid(document)), hash TEXT NOT NULL CHECK(length(hash)=64), environment TEXT, PRIMARY KEY(planet_id,seq));
 CREATE TRIGGER IF NOT EXISTS blueprint_contents_no_update BEFORE UPDATE ON blueprint_contents BEGIN SELECT RAISE(ABORT,'Blueprint content is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS blueprint_contents_no_delete BEFORE DELETE ON blueprint_contents BEGIN SELECT RAISE(ABORT,'Blueprint content is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS history_contiguous BEFORE INSERT ON history_events WHEN NEW.seq!=COALESCE((SELECT max(seq) FROM history_events WHERE planet_id=NEW.planet_id),0)+1 BEGIN SELECT RAISE(ABORT,'History must be contiguous'); END;
 CREATE TRIGGER IF NOT EXISTS history_events_no_update BEFORE UPDATE ON history_events BEGIN SELECT RAISE(ABORT,'History events are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS history_events_no_delete BEFORE DELETE ON history_events BEGIN SELECT RAISE(ABORT,'History events are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS history_snapshots_no_update BEFORE UPDATE ON history_snapshots BEGIN SELECT RAISE(ABORT,'History snapshots are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS history_snapshots_no_delete BEFORE DELETE ON history_snapshots BEGIN SELECT RAISE(ABORT,'History snapshots are immutable'); END;`);
 const history=historyStore(db);
 for(const row of db.prepare("SELECT id FROM planets WHERE kind='garden'").all())history.baseline(String(row.id));
}
export function historyStore(db:DatabaseSync){
 const blueprints=blueprintStore(db);
 const head=(planet:string)=>db.prepare('SELECT seq,document,baseline_at FROM history_heads WHERE planet_id=?').get(planet)!;
 const state=(planet:string)=>{const r=decodeSnapshot(head(planet).document);if(!r.ok)throw Error('Unreadable history head.');return r.value;};
 const owns=(owner:string,planet:unknown)=>{if(typeof planet!=='string'||planet.length>80)throw new RequestError(400,'Choose a planet.');const p=db.prepare('SELECT name,kind,owner_id FROM planets WHERE id=?').get(planet);if(!p||p.kind!=='garden'||p.owner_id!==owner)throw new RequestError(403,'Only the planet owner can read its history.');return {id:planet,name:String(p.name)};};
 const integer=(value:unknown,fallback:number,max=Number.MAX_SAFE_INTEGER)=>{if(value===undefined)return fallback;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>max)throw new RequestError(400,'Invalid history range.');return value;};
 const environment=(planet:string)=>db.prepare('SELECT * FROM planets WHERE id=?').get(planet)?.environment??null;
 const snapshot=(planet:string,s:WorldState)=>{const {text}=checked(s);db.prepare('INSERT INTO history_snapshots (planet_id,seq,document,hash,environment) VALUES (?,?,?,?,?)').run(planet,s.seq,text,hash(text),environment(planet));};
 return {
  // Caller owns the migration/creation transaction. Seq 0 is an import, never a fabricated event.
  baseline(planet:string){
   if(head(planet))return;
   const objects:Record<string,WorldState['objects'][string]>={};
   for(const row of db.prepare('SELECT * FROM planet_objects WHERE planet_id=? ORDER BY rowid').all(planet)){
    const o:PlacedObject={id:String(row.id),kind:row.kind as PlacedObject['kind'],position:JSON.parse(String(row.position)),rotation:Number(row.rotation),version:Number(row.version),...(row.blueprint_hash?{blueprintHash:String(row.blueprint_hash)}:{})};
    objects[o.id]={id:o.id as ObjectId,spec:spec(o),anchor:{dir:o.position,yaw:o.rotation},version:o.version,createdSeq:1,updatedSeq:1};
   }
   const s:WorldState={planetId:planet as PlanetId,seq:0,objects,tombstones:{}};const {text,state:canonical}=checked(s);
   db.prepare('INSERT INTO history_heads (planet_id,seq,document,baseline_at) VALUES (?,0,?,?)').run(planet,text,new Date().toISOString());snapshot(planet,canonical);
  },
  // Only called after an accepted authoritative write, inside the SAME SQL transaction.
  append(planet:string,before:PlacedObject|null,after:PlacedObject|null){
   let current=state(planet);const o=after??before!;const verbs=!before?['create']:!after?['delete']:[...(before.position.some((v,i)=>Math.abs(v-after.position[i])>1e-8)?['move']:[]),...(Math.abs(before.rotation-after.rotation)>1e-8?['rotate']:[])];
   for(const verb of verbs){
    const commandId=uuid(JSON.stringify([planet,o.id,verb,before?.version??0]));
    const command={v:1,type:'object.'+verb,planetId:planet,objectId:o.id,commandId,...(verb==='create'?{spec:spec(o),anchor:{dir:o.position,yaw:o.rotation}}:{expectedVersion:current.objects[o.id].version}),...(verb==='move'?{dir:o.position}:{}),...(verb==='rotate'?{yaw:o.rotation}:{})};
    const parsed=parseCommand(command);if(!parsed.ok)throw Error('History command invalid: '+parsed.errors.join('; '));
    const decision=decide(current,parsed.value,{eventId:randomUUID() as EventId,actorId:'owner' as ActorId,seq:current.seq+1,recordedAt:new Date().toISOString()});if(!decision.ok)throw Error('History refused the accepted change: '+decision.message);
    const event=canonicalEvent(decision.event),document=encodeEvent(event);if(!decodeEvent(document).ok)throw Error('History event is unreadable.');
    current=applyEvent(current,event);db.prepare('INSERT INTO history_events (planet_id,seq,command_id,document,environment) VALUES (?,?,?,?,?)').run(planet,event.seq,commandId,document,environment(planet));
    const {text,state:canonical}=checked(current);current=canonical;db.prepare('UPDATE history_heads SET seq=?,document=? WHERE planet_id=?').run(current.seq,text,planet);
    if(current.seq%HISTORY_SNAPSHOT_EVERY===0)snapshot(planet,current);
   }
  },
  page(owner:string,planet:unknown,after?:unknown,limit?:unknown):HistoryPage{
   const p=owns(owner,planet),h=head(p.id),start=integer(after,0),size=integer(limit,HISTORY_PAGE,HISTORY_PAGE_MAX);if(size<1||start>Number(h.seq))throw new RequestError(400,'Invalid history page.');
   const rows=db.prepare('SELECT seq,document FROM history_events WHERE planet_id=? AND seq>? ORDER BY seq LIMIT ?').all(p.id,start,size);
   return bounded({planetId:p.id,planetName:p.name,baselineAt:String(h.baseline_at),head:Number(h.seq),after:start,next:rows.length?Number(rows.at(-1)!.seq):start,events:rows.map(r=>JSON.parse(String(r.document)))});
  },
  snapshot(owner:string,planet:unknown,sequence?:unknown):HistorySnapshot{
   const p=owns(owner,planet),h=head(p.id),seq=integer(sequence,Number(h.seq),Number(h.seq));
   const row=db.prepare('SELECT seq,document FROM history_snapshots WHERE planet_id=? AND seq<=? ORDER BY seq DESC LIMIT 1').get(p.id,seq)!;
   const decoded=decodeSnapshot(row.document);if(!decoded.ok)throw Error('Unreadable history snapshot.');let s=decoded.value;
   for(const r of db.prepare('SELECT document FROM history_events WHERE planet_id=? AND seq>? AND seq<=? ORDER BY seq').all(p.id,s.seq,seq)){const e=decodeEvent(r.document);if(!e.ok)throw Error('Unreadable history event.');s=applyEvent(s,e.value);}
   const document=encodeSnapshot(s);const hashes=[...new Set(Object.values(s.objects).flatMap(o=>o.spec.kind==='structure'?[o.spec.blueprintHash]:[]))];
   const atEnvironment=seq===0?db.prepare('SELECT environment FROM history_snapshots WHERE planet_id=? AND seq=0').get(p.id)?.environment:db.prepare('SELECT environment FROM history_events WHERE planet_id=? AND seq=?').get(p.id,seq)?.environment;
   return bounded({document,hash:hash(document),environment:atEnvironment as string|null,baselineAt:String(h.baseline_at),head:Number(h.seq),blueprints:Object.fromEntries(hashes.map(h=>[h,blueprints.parts(h)]))});
  },
 };
}
