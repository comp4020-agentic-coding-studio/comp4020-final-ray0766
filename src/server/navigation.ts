import type { DatabaseSync } from 'node:sqlite';
import type { planetStore } from './planets.ts';
import { RequestError } from './errors.ts';
import { RADIUS } from '../shared/world.ts';
import { bodyRadius, safeRadius, landingRadius } from '../shared/world-size.ts';
import type { Vec3 } from '../shared/world.ts';
import { canBoard, portPoint } from '../shared/ports.ts';
import { bearing, firstCollision, groundFlight, LAND_SPEED, MAX_FLIGHT_SPEED, FLIGHT_ACCEL, FLIGHT_BRAKE, TURN_RATE, planetCenter, spaceDistance, validSpacePosition, wrapAngle, flightBounds, withinFlightBoundary } from '../shared/flight.ts';
import type { FlightState } from '../shared/flight.ts';
interface FlightRow {flight:string|null;flight_at:number;planet_id:string;position:string}
export function navigationStore(db:DatabaseSync,planets:ReturnType<typeof planetStore>){
  const row=(id:string)=>{const r=db.prepare('SELECT flight,flight_at,planet_id,position FROM players WHERE id=?').get(id) as unknown as FlightRow;if(!r)throw new RequestError(401,'Reload to reconnect your ship.');return r;};
  const read=(r:FlightRow):FlightState=>r.flight?JSON.parse(r.flight):groundFlight();
  const strict=(body:Record<string,unknown>,keys:string[])=>{if(Object.keys(body).some(k=>!keys.includes(k)))throw new RequestError(400,'Unexpected navigation field.');};
  const save=(id:string,f:FlightState,now:number)=>db.prepare('UPDATE players SET flight=?,flight_at=?,revision=revision+1 WHERE id=?').run(JSON.stringify(f),now,id);
  return {
    flight:(id:string)=>read(row(id)),
    takeoff(id:string,body:Record<string,unknown>,now=Date.now()){
      strict(body,['planetId','journey']);const r=row(id),f=read(r);
      if(body.planetId!==r.planet_id||!Number.isSafeInteger(body.journey))throw new RequestError(409,'Your departure point changed. Reconnect first.');
      if(f.mode==='space'&&body.journey===f.journey-1)return;
      if(f.mode!=='ground'||body.journey!==f.journey)throw new RequestError(409,'This departure is no longer current.');
      if(!canBoard(r.planet_id,JSON.parse(r.position),planets.planet(r.planet_id).radius))throw new RequestError(409,'Walk to the starport boarding gate or your parked ship first.');
      const center=planetCenter(planets.planet(r.planet_id).slot),up=portPoint(r.planet_id);
      const position=center.map((v,i)=>v+up[i]*(bodyRadius(planets.planet(r.planet_id))+20)) as Vec3;
      const other=planets.list(id).filter(p=>p.id!==r.planet_id).sort((a,b)=>spaceDistance(position,a.center)-spaceDistance(position,b.center))[0];
      const aim=other?bearing(position,other.center):{yaw:0,pitch:0};
      save(id,{mode:'space',journey:f.journey+1,position,yaw:aim.yaw,pitch:Math.max(-1.3,Math.min(1.3,aim.pitch)),speed:0,sequence:0,targetId:other?.id??null},now);
    },
    checkpoint(id:string,body:Record<string,unknown>,now=Date.now()){
      strict(body,['journey','sequence','position','yaw','pitch','speed','targetId']);const r=row(id),old=read(r);
      if(old.mode!=='space'||body.journey!==old.journey)throw new RequestError(409,'This flight is no longer current. Reconnect.');
      if(!validSpacePosition(body.position)||typeof body.yaw!=='number'||!Number.isFinite(body.yaw)||Math.abs(body.yaw)>Math.PI+.001||typeof body.pitch!=='number'||!Number.isFinite(body.pitch)||Math.abs(body.pitch)>1.301||typeof body.speed!=='number'||!Number.isFinite(body.speed)||body.speed<0||body.speed>MAX_FLIGHT_SPEED+.01||!Number.isSafeInteger(body.sequence))throw new RequestError(400,'Invalid flight checkpoint.');
      if(body.targetId!==null&&typeof body.targetId!=='string')throw new RequestError(400,'Invalid navigation target.');
      if(body.targetId!==null)planets.planet(body.targetId);
      const next:FlightState={mode:'space',journey:old.journey,position:body.position,yaw:body.yaw,pitch:body.pitch,speed:body.speed,sequence:Number(body.sequence),targetId:body.targetId as string|null};
      if(next.sequence===old.sequence&&JSON.stringify(next)===JSON.stringify(old))return;
      if(next.sequence!==old.sequence+1)throw new RequestError(409,'A newer flight checkpoint already exists. Reconnect.');
      const dt=Math.min(2,Math.max(0,now-r.flight_at)/1000);
      const distance=spaceDistance(old.position,next.position);
      const bodies=planets.list(id),bounds=flightBounds(bodies);
      if(!withinFlightBoundary(old.position,next.position,bounds))throw new RequestError(409,'Flight boundary reached. Move inward or choose Autopilot to return.');
      const stoppedAtBoundary=next.speed===0&&Math.abs(spaceDistance(next.position,bounds.center)-Math.max(bounds.radius,spaceDistance(old.position,bounds.center)))<.01;
      const stoppedAtSurface=next.speed===0&&bodies.some(p=>spaceDistance(next.position,p.center)<=safeRadius(p,3.2));
      const speedInvalid=next.speed-old.speed>FLIGHT_ACCEL*dt+.8||(!stoppedAtSurface&&!stoppedAtBoundary&&old.speed-next.speed>FLIGHT_BRAKE*dt+.8);
      if(distance>Math.max(old.speed,next.speed)*dt+.65||speedInvalid||Math.abs(wrapAngle(next.yaw-old.yaw))>TURN_RATE*dt+.16||Math.abs(next.pitch-old.pitch)>TURN_RATE*dt+.16)throw new RequestError(409,'Flight changed too quickly. Returning to the last saved position.');
      if(firstCollision(old.position,next.position,bodies,RADIUS+2.65)!==null)throw new RequestError(409,'Keep your ship outside the planet.');
      save(id,next,now);
    },
    /** The checks a landing must pass, without writing: the planet it would land on, or null when
     * this landing already happened. Lets the server prepare only a planet someone can reach. */
    landingTarget(id:string,body:Record<string,unknown>):string|null{
      strict(body,['planetId','journey']);const r=row(id),f=read(r),p=planets.planet(body.planetId);
      if(body.journey!==f.journey)throw new RequestError(409,'This landing belongs to an earlier flight.');
      if(f.mode==='ground'&&r.planet_id===p.id)return null;
      if(f.mode!=='space')throw new RequestError(409,'Board your ship before travelling.');
      if(spaceDistance(f.position,planetCenter(p.slot))>landingRadius(p)||f.speed>LAND_SPEED)throw new RequestError(409,'Fly closer and slow below 6 before landing.');
      return p.id;
    },
    land(id:string,body:Record<string,unknown>,now=Date.now()){
      const r=row(id),f=read(r),target=this.landingTarget(id,body);if(target===null)return;const p=planets.planet(target);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO visits (player_id,planet_id,position) VALUES (?,?,?) ON CONFLICT(player_id,planet_id) DO UPDATE SET position=excluded.position').run(id,r.planet_id,r.position);
        f.mode='ground';f.speed=0;f.targetId=p.id;
        db.prepare('UPDATE players SET planet_id=?,position=?,moved_at=?,flight=?,flight_at=?,revision=revision+1 WHERE id=?').run(p.id,JSON.stringify(portPoint(p.id)),now,JSON.stringify(f),now,id);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
  };
}
