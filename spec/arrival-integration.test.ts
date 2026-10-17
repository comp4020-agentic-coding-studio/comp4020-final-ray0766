import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../src/server/store.ts';
import type {ArrivalWork} from '../src/server/arrival-homes.ts';
import type {HeavyKind} from '../src/server/heavy-work.ts';
import type {HomeGenerationInputs} from '../src/server/home.ts';
import {generateHomeManifest} from '../src/shared/home-generation.ts';
import {groundFlight} from '../src/shared/flight.ts';
import {SPAWN} from '../src/shared/world.ts';
import {searchStationSites} from '../src/server/station-site.ts';
import type {PlanetView} from '../src/shared/planets.ts';
import type {Vec3} from '../src/shared/world.ts';

const stores:ReturnType<typeof openStore>[]=[],dirs:string[]=[];
const open=(path=':memory:',integratedWorld=true)=>{const s=openStore(path,{integratedWorld});stores.push(s);return s;};
const tick=async(ms=0)=>{await vi.advanceTimersByTimeAsync(ms);for(let i=0;i<8;i++)await Promise.resolve();};
function controlled(){
  const jobs:{kind:HeavyKind;input:unknown;resolve:(value:unknown)=>void;reject:(error:Error)=>void}[]=[];
  const work:ArrivalWork={run<T>(kind:HeavyKind,_key:string,input:unknown){return new Promise<T>((resolve,reject)=>jobs.push({kind,input,resolve:value=>resolve(value as T),reject}));}};
  return{jobs,work};
}
const personal=(s:ReturnType<typeof openStore>,id:string)=>Object.fromEntries(['players','ground_states','home_locations','player_ships','visits'].map(table=>[table,s.db.prepare(`SELECT * FROM ${table} WHERE ${table==='players'?'id':'player_id'}=? ORDER BY rowid`).all(id)]));
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(100_000);vi.spyOn(console,'warn').mockImplementation(()=>{});});
afterEach(()=>{for(const s of stores.splice(0))if(s.db.isOpen)s.close();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});vi.restoreAllMocks();vi.useRealTimers();});

it('returns a persisted Hub identity without awaiting a home job and leaves pre-existing identities unenrolled',async()=>{
  const s=open(),control=controlled();s.useHeavyWork(control.work);
  s.db.prepare("INSERT INTO players(id,character,quest,position,moved_at,revision) VALUES('old','fern','carrying',?,1,7)").run(JSON.stringify(SPAWN));
  s.state('old');const before=personal(s,'old');
  const arrival=s.createArrival('new');expect(arrival).toMatchObject({planetId:'hub',quest:'available',arrival:{version:1,homePreparation:'pending',homePlanetId:null},flight:{mode:'ground'}});
  expect(arrival.position).toEqual(SPAWN);expect(control.jobs).toHaveLength(0);
  expect(s.universe('new').ownedPlanetId).toBeNull();expect(s.createArrival('new').planetId).toBe('hub');
  s.createArrival('old');s.universe('old');expect(s.state('old').arrival).toBeUndefined();expect(personal(s,'old')).toEqual(before);
  expect(()=>s.retryArrivalHome('old',{})).toThrow('Only a new arrival');
  expect(()=>s.retryArrivalHome('new',{playerId:'old'})).toThrow('Unexpected arrival');
  s.retryArrivalHome('new',{});s.retryArrivalHome('new',{});await tick();expect(control.jobs).toHaveLength(1);
  control.jobs[0].reject(new Error('worker unavailable'));await tick();expect(s.state('new').arrival?.homePreparation).toBe('retry');
  expect(s.universe('new').ownedPlanetId).toBeNull();expect(personal(s,'old')).toEqual(before);
});

it('commits one home without touching a saved journey, then recovers only its failed station after restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'arrival-integrated-'));dirs.push(dir);const path=join(dir,'isolated.sqlite');
  const s=open(path),control=controlled();s.useHeavyWork(control.work);s.createArrival('new');await tick();
  const job=control.jobs[0];expect(job.kind).toBe('home');
  const input=job.input as HomeGenerationInputs;
  // Deterministic generator is exercised once in this isolated test, never in the HTTP request.
  const manifest=generateHomeManifest(input.radius,input.seed,input.environment??undefined);
  const flight={...groundFlight(),mode:'space' as const,journey:5,sequence:19,position:[900,200,700] as Vec3,speed:7,yaw:.4};
  s.db.prepare("UPDATE players SET flight=?,flight_at=12345,quest='carrying',character='sky',revision=23 WHERE id='new'").run(JSON.stringify(flight));
  const before=personal(s,'new');job.resolve(manifest);await tick();
  expect(control.jobs[1].kind).toBe('station');expect(s.state('new').arrival?.homePreparation).toBe('preparing');
  expect(personal(s,'new')).toEqual(before);
  const home=s.universe('new').ownedPlanetId!;expect(home).toBeTruthy();
  const saved=s.db.prepare('SELECT document,hash FROM home_manifests WHERE planet_id=?').get(home);
  const history=s.db.prepare('SELECT * FROM history_events WHERE planet_id=? ORDER BY seq').all(home);
  control.jobs[1].reject(new Error('station worker failed'));await tick();expect(s.state('new').arrival?.homePreparation).toBe('retry');
  s.close();const reopened=open(path),again=controlled();reopened.useHeavyWork(again.work);await tick(3000);
  expect(again.jobs).toHaveLength(1);expect(again.jobs[0].kind).toBe('station');
  const station=again.jobs[0].input as {planet:PlanetView;occupants:Vec3[]};
  again.jobs[0].resolve(searchStationSites(station.planet,station.occupants,1));await tick();
  expect(reopened.state('new').arrival).toEqual({version:1,homePreparation:'ready',homePlanetId:home});
  expect(personal(reopened,'new')).toEqual(before);
  expect(reopened.db.prepare('SELECT document,hash FROM home_manifests WHERE planet_id=?').get(home)).toEqual(saved);
  expect(reopened.db.prepare('SELECT * FROM history_events WHERE planet_id=? ORDER BY seq').all(home).slice(0,history.length)).toEqual(history);
  expect(reopened.db.prepare('SELECT count(*) AS n FROM home_interiors WHERE planet_id=?').get(home)!.n).toBe(1);
  expect(reopened.db.prepare("SELECT count(*) AS n FROM planets WHERE owner_id='new'").get()!.n).toBe(1);
},20_000);

it('preserves a later manual claim instead of applying a stale background suggestion',async()=>{
  const s=open(),control=controlled();s.useHeavyWork(control.work);s.createArrival('new');await tick();
  const target=String(s.db.prepare("SELECT planet_id FROM home_preparations WHERE player_id='new'").get()!.planet_id);
  const other=s.universe('new').planets.find(p=>p.kind==='garden'&&p.id!==target&&!p.claimed)!.id;
  s.claim('new',other);const before=personal(s,'new');
  // No generated manifest is needed: ownership re-check rejects the stale result first.
  control.jobs[0].resolve({});await tick();
  expect(s.universe('new').ownedPlanetId).toBe(other);expect(personal(s,'new')).toEqual(before);
  expect(s.db.prepare('SELECT owner_id FROM planets WHERE id=?').get(target)!.owner_id).toBeNull();
  expect(s.db.prepare('SELECT count(*) AS n FROM home_manifests WHERE planet_id=?').get(target)!.n).toBe(0);
  expect(()=>s.retryArrivalHome('new',{})).toThrow('chose a home manually');
});

it('rolls back all home writes on an injected failure and retries without a partial claim',async()=>{
  const s=open(),control=controlled();s.useHeavyWork(control.work);s.createArrival('new');await tick();
  const job=control.jobs[0],input=job.input as HomeGenerationInputs;
  const manifest=generateHomeManifest(input.radius,input.seed,input.environment??undefined);
  const before=personal(s,'new'),target=String(s.db.prepare("SELECT planet_id FROM home_preparations WHERE player_id='new'").get()!.planet_id);
  s.db.exec("CREATE TRIGGER arrival_fail BEFORE INSERT ON history_events BEGIN SELECT RAISE(ABORT,'injected home write failure'); END");
  job.resolve(manifest);await tick();expect(s.state('new').arrival?.homePreparation).toBe('retry');
  expect(s.db.isTransaction).toBe(false);expect(s.universe('new').ownedPlanetId).toBeNull();expect(personal(s,'new')).toEqual(before);
  for(const table of ['planet_objects','home_interiors','home_manifests','history_events'])expect(s.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE planet_id=?`).get(target)!.n).toBe(0);
  expect(s.library('new')).toEqual([]);s.db.exec('DROP TRIGGER arrival_fail');
  s.retryArrivalHome('new',{});await tick(3000);expect(control.jobs[1].kind).toBe('home');
  control.jobs[1].resolve(manifest);await tick();
  expect(s.universe('new').ownedPlanetId).toBe(target);expect(s.db.prepare('SELECT count(*) AS n FROM home_interiors WHERE planet_id=?').get(target)!.n).toBe(1);
},20_000);

it('backs up schema 16 consistently before adding the task table without enrolling or rewriting old saves',()=>{
  const dir=mkdtempSync(join(tmpdir(),'arrival-migration-'));dirs.push(dir);const path=join(dir,'old.sqlite'),s=open(path);
  s.db.prepare("INSERT INTO players(id,position,moved_at,revision) VALUES('old',?,17,9)").run(JSON.stringify(SPAWN));
  s.db.exec('DROP TABLE home_preparations;PRAGMA user_version=16');
  const before=s.db.prepare("SELECT * FROM players WHERE id='old'").get();s.close();
  const upgraded=open(path);expect(upgraded.db.prepare('PRAGMA user_version').get()!.user_version).toBe(17);
  expect(upgraded.migrationBackup).toContain('.v16-');expect(existsSync(upgraded.migrationBackup!)).toBe(true);
  expect(statSync(upgraded.migrationBackup!).mode&0o777).toBe(0o600);
  const backup=new DatabaseSync(upgraded.migrationBackup!,{readOnly:true});
  try{expect(backup.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');expect(backup.prepare('PRAGMA user_version').get()!.user_version).toBe(16);expect(backup.prepare("SELECT * FROM players WHERE id='old'").get()).toEqual(before);}finally{backup.close();}
  expect(upgraded.db.prepare("SELECT * FROM players WHERE id='old'").get()).toEqual(before);
  expect(upgraded.db.prepare('SELECT count(*) AS n FROM home_preparations').get()!.n).toBe(0);
});
