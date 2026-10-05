import { randomUUID } from 'node:crypto';
import { distance, normalize,validPosition } from '../shared/world.ts';
import type { PlayerState,Vec3 } from '../shared/world.ts';
import { MAX_NEIGHBOURS,MAX_PRESENCE,PRESENCE_TTL } from '../shared/presence.ts';
import type { PresenceSnapshot,Visitor } from '../shared/presence.ts';
import { RequestError } from './errors.ts';
interface Entry {publicId:string;planetId:string;facing:Vec3;seenAt:number}
/** Ephemeral presence has no account rights and never changes a player save. */
export function presenceStore(state:(id:string)=>PlayerState){
  const entries=new Map<string,Entry>();
  const sweep=(now:number)=>{for(const[id,e]of entries)if(now-e.seenAt>=PRESENCE_TTL)entries.delete(id);};
  return{
    leave(id:string){entries.delete(id);},
    heartbeat(id:string,body:Record<string,unknown>,now=Date.now()):PresenceSnapshot{
      sweep(now);
      if(Object.keys(body).some(k=>!['planetId','facing'].includes(k))||!validPosition(body.facing))throw new RequestError(400,'Send only the current planet and a finite unit facing direction.');
      const self=state(id);
      if(self.flight.mode!=='ground'||body.planetId!==self.planetId){entries.delete(id);throw new RequestError(409,'Your surface visit has changed.');}
      const radial=body.facing.reduce((n,v,i)=>n+v*self.position[i],0);
      if(Math.abs(radial)>.35)throw new RequestError(400,'Facing must follow the planet surface.');
      const facing=normalize(body.facing.map((v,i)=>v-radial*self.position[i]) as Vec3);
      if(!entries.has(id)&&entries.size>=MAX_PRESENCE)throw new RequestError(429,'This local presence service is full. Try again shortly.');
      const entry={publicId:entries.get(id)?.publicId??randomUUID(),planetId:self.planetId,facing,seenAt:now};entries.set(id,entry);
      const nearby:Visitor[]=[];
      for(const[other,e]of entries){
        if(other===id||e.planetId!==self.planetId)continue;
        // Re-read authoritative saves: no client position or exposed session hash.
        const p=state(other);if(p.planetId!==self.planetId||p.flight.mode!=='ground'){entries.delete(other);continue;}
        nearby.push({id:e.publicId,position:p.position,facing:e.facing,character:p.character});
      }
      nearby.sort((a,b)=>distance(a.position,self.position)-distance(b.position,self.position)||a.id.localeCompare(b.id));
      return{planetId:self.planetId,selfId:entry.publicId,visitors:nearby.slice(0,MAX_NEIGHBOURS),nearbyCount:nearby.length,ttlMs:PRESENCE_TTL};
    },
  };
}
