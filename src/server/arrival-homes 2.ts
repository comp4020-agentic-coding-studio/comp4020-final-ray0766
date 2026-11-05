import type {DatabaseSync} from 'node:sqlite';
import type {ArrivalState} from '../shared/world.ts';
import type {HeavyWork} from './heavy-work.ts';
import {RequestError} from './errors.ts';

export const STORE_SCHEMA=17;
export function migrateArrivalHomes(db:DatabaseSync){
  db.exec(`CREATE TABLE IF NOT EXISTS home_preparations (
    player_id TEXT PRIMARY KEY REFERENCES players(id),
    planet_id TEXT UNIQUE REFERENCES planets(id),
    status TEXT NOT NULL CHECK(status IN ('pending','preparing','retry','ready','manual')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
    next_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS home_preparations_due ON home_preparations(status,next_at);`);
}
export type ArrivalWork=Pick<HeavyWork,'run'>;
interface Task {player_id:string;planet_id:string|null;status:'pending'|'preparing'|'retry'|'ready'|'manual';attempts:number;next_at:number}
export interface ArrivalHomeHooks {
  owned:(id:string)=>string|null;
  ready:(id:string,planetId:string)=>boolean;
  reserve:()=>string;
  /** Every asynchronous result must re-check active() before any subsequent write. */
  prepare:(id:string,planetId:string,work:ArrivalWork,active:()=>boolean)=>Promise<'ready'|'manual'>;
}
/** A reserved planet changed while the worker ran. Leave it untouched and try another. */
export class ArrivalReservationChanged extends Error {}

/** Durable enrollment is only written for brand-new integrated identities.
 * One bounded background operation at a time shares the existing preparation worker.
 * The journal stores no token and records no failure request/body in public state. */
export class ArrivalHomes {
  private work:ArrivalWork|null=null;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private running=false;
  private closed=false;
  private generation=0;
  private readonly db:DatabaseSync;
  private readonly hooks:ArrivalHomeHooks;
  constructor(db:DatabaseSync,hooks:ArrivalHomeHooks){this.db=db;this.hooks=hooks;}
  enroll(id:string,now=Date.now()){
    this.db.prepare("INSERT INTO home_preparations(player_id,status,created_at) VALUES(?,'pending',?)").run(id,now);
    this.schedule();
  }
  read(id:string):ArrivalState|undefined {
    const task=this.task(id);if(!task)return;
    const home=this.hooks.owned(id);
    const ready=home&&this.hooks.ready(id,home);
    return {version:1,homePreparation:ready&&(task.status==='ready'||task.status==='manual')?'ready':task.status==='ready'||task.status==='manual'?'retry':task.status,homePlanetId:home};
  }
  retry(id:string,now=Date.now()){
    const task=this.task(id);
    if(!task)throw new RequestError(403,'Only a new arrival can retry its own home preparation.');
    if(task.status==='manual'){
      if(this.read(id)?.homePreparation==='ready')return;
      throw new RequestError(409,'You chose a home manually. Your saved home is preserved; continue from its existing setup.');
    }
    if(task.status==='preparing'||(task.status==='ready'&&this.read(id)?.homePreparation==='ready')||task.next_at>now)return;
    this.db.prepare("UPDATE home_preparations SET status='pending',next_at=? WHERE player_id=?").run(now,id);
    this.schedule();
  }
  use(work:ArrivalWork|null){
    this.work=work;this.generation++;
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    // A committed home stays committed. An interrupted worker/station search is resumed,
    // and prepare() inspects the saved manifest instead of generating it a second time.
    if(work&&!this.closed){
      this.db.prepare("UPDATE home_preparations SET status='pending' WHERE status='preparing'").run();
      this.schedule();
    }
  }
  close(){this.closed=true;this.generation++;if(this.timer)clearTimeout(this.timer);this.timer=null;this.work=null;}
  private task(id:string){return this.db.prepare('SELECT * FROM home_preparations WHERE player_id=?').get(id) as unknown as Task|undefined;}
  private schedule(){
    if(this.closed||!this.work||this.running)return;
    if(this.timer)clearTimeout(this.timer);
    const next=this.db.prepare("SELECT min(next_at) AS due FROM home_preparations WHERE status IN ('pending','retry')").get()?.due;
    if(next===null||next===undefined){this.timer=null;return;}
    this.timer=setTimeout(()=>{this.timer=null;void this.pump();},Math.max(0,Math.min(60_000,Number(next)-Date.now())));
    this.timer.unref();
  }
  private async pump(){
    const work=this.work;if(this.closed||!work||this.running)return;
    const task=this.db.prepare("SELECT * FROM home_preparations WHERE status IN ('pending','retry') AND next_at<=? ORDER BY next_at,created_at,player_id LIMIT 1").get(Date.now()) as unknown as Task|undefined;
    if(!task){this.schedule();return;}
    const generation=this.generation,active=()=>!this.closed&&this.generation===generation;
    this.running=true;
    try{
      this.db.exec('BEGIN IMMEDIATE');
      try{
        const current=this.task(task.player_id)!;
        // The SQL reservation also excludes all other durable jobs, including after restart.
        const planet=current.planet_id??this.hooks.reserve();task.planet_id=planet;
        this.db.prepare("UPDATE home_preparations SET planet_id=?,status='preparing',attempts=attempts+1 WHERE player_id=?").run(planet,task.player_id);
        this.db.exec('COMMIT');
      }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
      const result=await this.hooks.prepare(task.player_id,task.planet_id!,work,active);
      if(!active())return;
      if(result==='ready'&&!this.hooks.ready(task.player_id,task.planet_id!))throw new Error('The home and its station are not ready.');
      this.db.prepare("UPDATE home_preparations SET status=?,next_at=0,planet_id=CASE WHEN ?='manual' THEN NULL ELSE planet_id END WHERE player_id=?").run(result,result,task.player_id);
    }catch(error){
      if(!active())return;
      const attempt=Number(this.task(task.player_id)?.attempts??1),delay=Math.min(60_000,3000*2**Math.min(5,Math.max(0,attempt-1)));
      this.db.prepare("UPDATE home_preparations SET status='retry',next_at=?,planet_id=CASE WHEN ? THEN NULL ELSE planet_id END WHERE player_id=?").run(Date.now()+delay,Number(error instanceof ArrivalReservationChanged),task.player_id);
      // Intentionally no raw worker errors, identity, designs or request bodies in logs/state.
      console.warn('New-arrival home preparation deferred; its durable task will retry.');
    }finally{this.running=false;this.schedule();}
  }
}
