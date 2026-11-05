import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {ShipTrip} from '../shared/ship-trip.ts';
import {portPoint} from '../shared/ports.ts';
import {RequestError} from './errors.ts';
import type {navigationStore} from './navigation.ts';
import type {planetStore} from './planets.ts';
export function migrateTrips(db:DatabaseSync){db.exec('CREATE TABLE IF NOT EXISTS ship_trips (player_id TEXT PRIMARY KEY REFERENCES players(id), document TEXT NOT NULL)');}
export function tripStore(db:DatabaseSync,planets:ReturnType<typeof planetStore>,navigation:ReturnType<typeof navigationStore>){
 const read=(id:string):ShipTrip|null=>{const r=db.prepare('SELECT document FROM ship_trips WHERE player_id=?').get(id);return r?JSON.parse(String(r.document)):null;};
 const save=(id:string,t:ShipTrip)=>{db.prepare('INSERT INTO ship_trips(player_id,document) VALUES(?,?) ON CONFLICT(player_id) DO UPDATE SET document=excluded.document').run(id,JSON.stringify(t));db.prepare('UPDATE players SET revision=revision+1 WHERE id=?').run(id);return t;};
 const transaction=<T>(fn:()=>T)=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 const current=(id:string,body:Record<string,unknown>)=>{const t=read(id);if(!t||t.id!==body.tripId||t.revision!==body.revision)throw new RequestError(409,'Your trip changed. Refresh its destination before trying again.');return t;};
 const strict=(body:Record<string,unknown>,keys:string[])=>{if(Object.keys(body).some(k=>!keys.includes(k)))throw new RequestError(400,'Unexpected trip field.');};
 return {read,current,
 start(id:string,body:Record<string,unknown>,now=Date.now()){
  strict(body,['targetId','journey','requestId']);if(typeof body.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.requestId))throw new RequestError(400,'Include a trip request identifier.');
  const prior=read(id);if(prior?.requestId===body.requestId){if(prior.initialTarget!==body.targetId)throw new RequestError(409,'This request was used for another destination.');return prior;}
  if(prior?.status==='active')throw new RequestError(409,'A trip is already active. Change its destination instead.');
  const target=planets.planet(body.targetId),r=db.prepare('SELECT planet_id FROM players WHERE id=?').get(id),f=navigation.flight(id);
  if(f.journey!==body.journey)throw new RequestError(409,'Your departure changed. Reconnect first.');
  if(f.mode==='ground'&&r!.planet_id===target.id)throw new RequestError(409,'You are already on this planet.');
  return transaction(()=>{if(f.mode==='ground')navigation.takeoff(id,{planetId:r!.planet_id,journey:f.journey},now);const trip:ShipTrip={id:randomUUID(),requestId:body.requestId as string,initialTarget:target.id,originId:String(r!.planet_id),targetId:target.id,journey:navigation.flight(id).journey,revision:1,status:'active'};return save(id,trip);});
 },
 change(id:string,body:Record<string,unknown>){
  strict(body,['tripId','revision','targetId','action']);return transaction(()=>{const t=current(id,body);if(t.status!=='active')throw new RequestError(409,'This trip has already arrived.');if(body.action!=='return'&&body.action!=='retarget')throw new RequestError(400,'Choose a trip action.');const target=planets.planet(body.action==='return'?t.originId:body.targetId);return save(id,{...t,targetId:target.id,revision:t.revision+1});});
 },
 finish(id:string,body:Record<string,unknown>,now=Date.now()){
  strict(body,['tripId','revision']);return transaction(()=>{const t=current(id,body);if(t.status==='arrived')return t;const f=navigation.flight(id);if(f.mode!=='space'||f.journey!==t.journey)throw new RequestError(409,'This flight is no longer current.');
   const r=db.prepare('SELECT planet_id,position FROM players WHERE id=?').get(id)!;planets.planet(t.targetId);
   db.prepare('INSERT INTO visits(player_id,planet_id,position) VALUES(?,?,?) ON CONFLICT(player_id,planet_id) DO UPDATE SET position=excluded.position').run(id,String(r.planet_id),String(r.position));
   f.mode='ground';f.speed=0;f.targetId=t.targetId;
   db.prepare('UPDATE players SET planet_id=?,position=?,moved_at=?,flight=?,flight_at=?,revision=revision+1 WHERE id=?').run(t.targetId,JSON.stringify(portPoint(t.targetId)),now,JSON.stringify(f),now,id);
   db.prepare('DELETE FROM ground_states WHERE player_id=?').run(id);return save(id,{...t,status:'arrived'});
  });
 }
 };
}
