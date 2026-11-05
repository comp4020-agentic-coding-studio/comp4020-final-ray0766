import type {DatabaseSync} from 'node:sqlite';
import {appearanceKey,validAppearance,type Appearance,type SavedAppearance} from '../shared/appearance.ts';
import type {Character} from '../shared/world.ts';
import {RequestError} from './errors.ts';
export function migrateAppearances(db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS player_appearances(player_id TEXT PRIMARY KEY REFERENCES players(id),revision INTEGER NOT NULL CHECK(revision>0),options TEXT NOT NULL CHECK(json_valid(options))); CREATE TABLE IF NOT EXISTS appearance_onboarding(player_id TEXT PRIMARY KEY REFERENCES players(id),completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)));`);}
export function appearanceStore(db:DatabaseSync){
 function read(id:string):SavedAppearance|undefined{const row=db.prepare('SELECT revision,options FROM player_appearances WHERE player_id=?').get(id);return row?{revision:Number(row.revision),options:{...JSON.parse(String(row.options)),model:'sample'} as Appearance}:undefined;}
 const required=(id:string)=>db.prepare('SELECT completed FROM appearance_onboarding WHERE player_id=?').get(id)?.completed===0;
 return{read,required,enroll(id:string){db.prepare('INSERT INTO appearance_onboarding(player_id,completed) VALUES(?,0)').run(id);},requireComplete(id:string){if(required(id))throw new RequestError(409,'Create and save your traveller before exploring.');},save(id:string,body:Record<string,unknown>){
  if(Object.keys(body).some(k=>!['expectedRevision','appearance'].includes(k))||!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<0||!validAppearance(body.appearance))throw new RequestError(400,'Choose only the available appearance options and send the saved revision.');
  const options=body.appearance;
  db.exec('BEGIN IMMEDIATE');try{
   const current=read(id);
   if(current&&appearanceKey(current.options)===appearanceKey(options)&&!required(id)){db.exec('COMMIT');return;}
   if((current?.revision??0)!==body.expectedRevision)throw new RequestError(409,'Your appearance changed in another tab. Reload the saved look before trying again.');
   db.prepare('INSERT INTO player_appearances(player_id,revision,options) VALUES(?,?,?) ON CONFLICT(player_id) DO UPDATE SET revision=excluded.revision,options=excluded.options').run(id,(current?.revision??0)+1,JSON.stringify(options));
   db.prepare('UPDATE appearance_onboarding SET completed=1 WHERE player_id=?').run(id);
   db.prepare('UPDATE players SET character=?,revision=revision+1 WHERE id=?').run(options.coat,id);db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 },coat(id:string,coat:Character){
  db.exec('BEGIN IMMEDIATE');try{const current=read(id);if(current)db.prepare('UPDATE player_appearances SET revision=revision+1,options=? WHERE player_id=?').run(JSON.stringify({...current.options,coat}),id);db.prepare('UPDATE players SET character=?,revision=revision+1 WHERE id=?').run(coat,id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 }};
}
