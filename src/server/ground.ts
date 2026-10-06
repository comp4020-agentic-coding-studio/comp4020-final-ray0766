import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { GroundWorld, MAX_PATH_STEPS } from '../shared/physics/world.ts';
import type { GroundPose, GroundState, GroundMotion, MotionStep } from '../shared/physics/world.ts';
import { distance, normalize, RADIUS, SPEED, validPosition } from '../shared/world.ts';
import type { Vec3 } from '../shared/world.ts';
import type { planetStore } from './planets.ts';
import { RequestError } from './errors.ts';
interface PlayerRow {position:string;planet_id:string;moved_at:number}
interface GroundRow {planet_id:string;position:string;radius:number;vertical_speed:number;grounded:number;sequence:number;scene_revision:number;clock_credit:number;request_hash:string|null}
const view=(r:GroundRow):GroundState=>({radius:r.radius,verticalSpeed:r.vertical_speed,grounded:!!r.grounded,sequence:r.sequence,sceneRevision:r.scene_revision});
const pose=(r:GroundRow):GroundPose=>({position:JSON.parse(r.position),...view(r)});
export function groundStore(db:DatabaseSync,planets:ReturnType<typeof planetStore>){
  const cache=new Map<string,GroundWorld>();
  function world(planetId:string){const p=planets.planet(planetId);let w=cache.get(planetId);if(!w||w.revision!==p.revision){w=new GroundWorld(planets.view('',planetId));cache.delete(planetId);if(cache.size>=16)cache.delete(cache.keys().next().value!);cache.set(planetId,w);}return w;}
  function row(id:string){return db.prepare('SELECT * FROM ground_states WHERE player_id=?').get(id) as unknown as GroundRow|undefined;}
  const player=(id:string)=>db.prepare('SELECT position,planet_id,moved_at FROM players WHERE id=?').get(id) as unknown as PlayerRow;
  function write(id:string,p:GroundPose,sequence:number,revision:number,credit:number,hash:string|null,planetId:string){
    db.prepare(`INSERT INTO ground_states (player_id,planet_id,position,radius,vertical_speed,grounded,sequence,scene_revision,clock_credit,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(player_id) DO UPDATE SET planet_id=excluded.planet_id,position=excluded.position,radius=excluded.radius,vertical_speed=excluded.vertical_speed,grounded=excluded.grounded,sequence=excluded.sequence,scene_revision=excluded.scene_revision,clock_credit=excluded.clock_credit,request_hash=excluded.request_hash`)
      .run(id,planetId,JSON.stringify(p.position),p.radius,p.verticalSpeed,Number(p.grounded),sequence,revision,credit,hash);
  }
  function ensure(id:string):GroundRow{
    const r=player(id),old=row(id),w=world(r.planet_id);
    if(old&&old.planet_id===r.planet_id&&old.scene_revision===w.revision&&old.position===r.position)return old;
    const start=old&&old.planet_id===r.planet_id&&old.position===r.position?pose(old):w.pose(JSON.parse(r.position));
    const safe=w.recover(start),changed=distance(safe.position,JSON.parse(r.position))>.00001;
    db.exec('BEGIN IMMEDIATE');try{
      write(id,safe,(old?.sequence??-1)+1,w.revision,.1,null,r.planet_id);
      if(changed)db.prepare('UPDATE players SET position=?,revision=revision+1 WHERE id=?').run(JSON.stringify(safe.position),id);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return row(id)!;
  }
  return {
    world,
    read(id:string){return view(ensure(id));},
    reset(id:string){db.prepare('DELETE FROM ground_states WHERE player_id=?').run(id);},
    move(id:string,target:Vec3,now:number,motion?:unknown){
      const old=ensure(id),r=player(id),w=world(r.planet_id);let steps:MotionStep[],sequence=old.sequence+1,hash:string|null=null;
      if(motion!==undefined){
        if(!motion||typeof motion!=='object'||Array.isArray(motion)||Object.keys(motion).some(k=>!['sequence','steps'].includes(k)))throw new RequestError(400,'Invalid ground motion.');
        const m=motion as GroundMotion;
        if(!Number.isSafeInteger(m.sequence)||!Array.isArray(m.steps)||!m.steps.length||m.steps.length>MAX_PATH_STEPS)throw new RequestError(400,'Send a bounded movement path and sequence.');
        for(const s of m.steps)if(!Array.isArray(s)||s.length!==4||!validPosition(s.slice(0,3))||typeof s[3]!=='number'||!Number.isFinite(s[3])||s[3]<=0||s[3]>.050001)throw new RequestError(400,'Invalid movement sample.');
        hash=createHash('sha256').update(JSON.stringify({target,motion})).digest('hex');
        if(m.sequence===old.sequence&&hash===old.request_hash)return;
        if(m.sequence!==old.sequence+1)throw new RequestError(409,'A newer ground position exists. Reconnect to your saved position.');
        steps=m.steps;sequence=m.sequence;
        if(distance(normalize(steps.at(-1)!.slice(0,3) as Vec3),target)>.0001)throw new RequestError(400,'The movement path must end at the saved position.');
      }else{
        // Compatibility for old clients: sweep their straight checkpoint path.
        // It cannot jump through walls or select a different floor by sending height.
        const from=JSON.parse(old.position) as Vec3,d=distance(from,target),n=Math.max(1,Math.ceil(d/.035));
        if(d>SPEED*Math.min(2,Math.max(0,now-r.moved_at)/1000)+.35)throw new RequestError(409,'You moved too far while disconnected.');
        steps=Array.from({length:n},(_,i)=>{const p=normalize(from.map((v,k)=>v+(target[k]-v)*(i+1)/n) as Vec3);return [...p,Math.max(.001,d/SPEED/n)] as MotionStep;});
      }
      const elapsed=Math.max(0,(now-r.moved_at)/1000),available=Math.min(2,old.clock_credit+elapsed),spent=steps.reduce((n,s)=>n+s[3],0);
      if(spent>available+.001)throw new RequestError(409,'Movement ran ahead of server time. Reconnect to your saved position.');
      let current=pose(old);
      for(const s of steps){
        const next=normalize(s.slice(0,3) as Vec3);
        if(distance(current.position,next)*current.radius/RADIUS>SPEED*s[3]+.002)throw new RequestError(409,'Ground movement exceeded the walking speed.');
        const resolved=w.move(current,next,s[3]);
        if(distance(resolved.position,next)>.006)throw new RequestError(409,'A wall or an unsupported step blocks this path. Reconnect to your saved position.');
        current=resolved;
      }
      db.exec('BEGIN IMMEDIATE');try{
        write(id,current,sequence,w.revision,Math.max(0,available-spent),hash,r.planet_id);
        db.prepare('UPDATE players SET position=?,moved_at=?,revision=revision+1 WHERE id=?').run(JSON.stringify(current.position),now,id);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
  };
}
