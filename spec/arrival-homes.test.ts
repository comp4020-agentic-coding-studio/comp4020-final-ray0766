import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ArrivalHomes,ArrivalReservationChanged,migrateArrivalHomes} from '../src/server/arrival-homes.ts';
import type {ArrivalHomeHooks,ArrivalWork} from '../src/server/arrival-homes.ts';

const dbs:DatabaseSync[]=[],queues:ArrivalHomes[]=[],dirs:string[]=[];
const work={run:vi.fn()} as unknown as ArrivalWork;
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=async(ms=0)=>{await vi.advanceTimersByTimeAsync(ms);for(let i=0;i<6;i++)await Promise.resolve();};
function database(path=':memory:'){
  const db=new DatabaseSync(path);db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS planets(id TEXT PRIMARY KEY,owner TEXT);
    INSERT OR IGNORE INTO players VALUES('new-a'),('new-b'),('old');
    INSERT OR IGNORE INTO planets VALUES('home-a',NULL),('home-b',NULL);`);
  migrateArrivalHomes(db);dbs.push(db);return db;
}
function hooks(db:DatabaseSync,prepare:ArrivalHomeHooks['prepare']):ArrivalHomeHooks{
  return{owned:id=>String(db.prepare('SELECT id FROM planets WHERE owner=?').get(id)?.id??'')||null,
    ready:(id,p)=>db.prepare('SELECT owner FROM planets WHERE id=?').get(p)?.owner===id,
    reserve:()=>String(db.prepare("SELECT id FROM planets WHERE owner IS NULL AND id NOT IN(SELECT planet_id FROM home_preparations WHERE planet_id IS NOT NULL AND status IN ('pending','preparing','retry')) ORDER BY id LIMIT 1").get()!.id),prepare};
}
const queue=(db:DatabaseSync,h:ArrivalHomeHooks)=>{const q=new ArrivalHomes(db,h);queues.push(q);return q;};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(100_000);vi.spyOn(console,'warn').mockImplementation(()=>{});});
afterEach(()=>{for(const q of queues.splice(0))q.close();for(const db of dbs.splice(0))if(db.isOpen)db.close();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});vi.useRealTimers();vi.restoreAllMocks();});

it('enrolls only explicitly new identities and serializes independent reservations with duplicate retry deduplication',async()=>{
  const db=database(),first=deferred<'ready'>(),calls:string[]=[];
  const h=hooks(db,async(id,p)=>{calls.push(p);if(id==='new-a')await first.promise;db.prepare('UPDATE planets SET owner=? WHERE id=?').run(id,p);return 'ready';});
  const q=queue(db,h);q.use(work);q.enroll('new-a');q.enroll('new-b');
  expect(q.read('old')).toBeUndefined();expect(()=>q.retry('old')).toThrow('Only a new arrival');
  await tick();expect(calls).toEqual(['home-a']);expect(q.read('new-a')?.homePreparation).toBe('preparing');
  q.retry('new-a');q.retry('new-a');await tick();expect(calls).toHaveLength(1);
  first.resolve('ready');await tick(1);expect(calls).toEqual(['home-a','home-b']);
  expect(q.read('new-a')).toEqual({version:1,homePreparation:'ready',homePlanetId:'home-a'});
  expect(q.read('new-b')?.homePlanetId).toBe('home-b');expect(q.read('old')).toBeUndefined();
});
it('keeps failure visible, backs off and does not let explicit retry bypass its cooling-off time',async()=>{
  const db=database();let calls=0;
  const q=queue(db,hooks(db,async(id,p)=>{if(++calls===1)throw new Error('worker failed');db.prepare('UPDATE planets SET owner=? WHERE id=?').run(id,p);return 'ready';}));
  q.use(work);q.enroll('new-a');await tick();expect(q.read('new-a')?.homePreparation).toBe('retry');
  q.retry('new-a');q.retry('new-a');await tick(2999);expect(calls).toBe(1);
  await tick(1);expect(calls).toBe(2);expect(q.read('new-a')?.homePreparation).toBe('ready');
  q.retry('new-a');await tick();expect(calls).toBe(2);
});
it('keeps an interrupted job durable, ignores its late result after close and resumes it after reopen',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'arrival-jobs-'));dirs.push(dir);const path=join(dir,'isolated.sqlite');
  const db=database(path),pending=deferred<'ready'>();let oldWrites=0;
  const old=queue(db,hooks(db,async(_id,_p,_w,active)=>{await pending.promise;if(active())oldWrites++;return 'ready';}));
  old.use(work);old.enroll('new-a');await tick();expect(old.read('new-a')?.homePreparation).toBe('preparing');
  old.close();db.close();pending.resolve('ready');await tick();expect(oldWrites).toBe(0);
  const reopened=database(path),calls=vi.fn(async(id:string,p:string)=>{reopened.prepare('UPDATE planets SET owner=? WHERE id=?').run(id,p);return 'ready' as const;});
  const resumed=queue(reopened,hooks(reopened,calls));resumed.use(work);await tick();
  expect(calls).toHaveBeenCalledTimes(1);expect(resumed.read('new-a')?.homePlanetId).toBe('home-a');
  expect(reopened.prepare('SELECT count(*) AS n FROM home_preparations').get()!.n).toBe(1);
});
it('releases only a changed reservation, leaving the competing owner intact before trying another',async()=>{
  const db=database();let calls=0;
  const q=queue(db,hooks(db,async(id,p)=>{if(++calls===1){db.prepare("UPDATE planets SET owner='old' WHERE id=?").run(p);throw new ArrivalReservationChanged();}db.prepare('UPDATE planets SET owner=? WHERE id=?').run(id,p);return 'ready';}));
  q.use(work);q.enroll('new-a');await tick();
  expect(db.prepare("SELECT owner FROM planets WHERE id='home-a'").get()!.owner).toBe('old');
  expect(db.prepare("SELECT planet_id FROM home_preparations WHERE player_id='new-a'").get()!.planet_id).toBeNull();
  await tick(3000);expect(q.read('new-a')?.homePlanetId).toBe('home-b');
});
it('does not declare ready when the house or its station is still unavailable',async()=>{
  const db=database(),h=hooks(db,async()=> 'ready');h.ready=()=>false;
  const q=queue(db,h);q.use(work);q.enroll('new-a');await tick();expect(q.read('new-a')?.homePreparation).toBe('retry');
});
