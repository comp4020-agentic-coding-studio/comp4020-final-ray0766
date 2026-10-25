import { randomUUID } from 'node:crypto';
import { distance, normalize,validPosition } from '../shared/world.ts';
import type { PlayerState,Vec3 } from '../shared/world.ts';
import { MAX_NEIGHBOURS,MAX_PRESENCE,PRESENCE_TTL } from '../shared/presence.ts';
import type { PresenceSnapshot,Visitor } from '../shared/presence.ts';
import { RequestError } from './errors.ts';
interface Entry {publicId:string;planetId:string;scope:string;facing:Vec3;seenAt:number}
/** Ephemeral presence has no account rights; positions come from validated saves. */
export function presenceStore(state:(id:string)=>PlayerState){
  const entries=new Map<string,Entry>();
  const sweep=(now:number)=>{for(const[id,e]of entries)if(now-e.seenAt>=PRESENCE_TTL)entries.delete(id);};
  return{
    leave(id:string){entries.delete(id);},
    heartbeat(id:string,body:Record<string,unknown>,now=Date.now()):PresenceSnapshot{
      sweep(now);
      if(Object.keys(body).some(k=>!['planetId','facing','scope','visitEpoch'].includes(k))||!validPosition(body.facing))throw new RequestError(400,'Send only the current planet and a finite unit facing direction.');
      const self=state(id);
      if(self.flight.mode!=='ground'){entries.delete(id);throw new RequestError(409,'Your surface visit has changed.');}
      // A delayed request from the previous planet must not erase a newer visit.
      if(body.planetId!==self.planetId)throw new RequestError(409,'Your surface visit has changed.');
      const inside=self.location?.kind==='interior'?self.location:null,scope=inside?'home:'+inside.buildingId:'exterior';
      if(self.location&&(body.scope!==scope||body.visitEpoch!==self.location.visitEpoch))throw new RequestError(409,'Your home presence scope changed.');
      const radial=inside?body.facing[1]:body.facing.reduce((n,v,i)=>n+v*self.position[i],0);
      if(Math.abs(radial)>.35)throw new RequestError(400,'Facing must follow the planet surface.');
      const facing=inside?normalize([body.facing[0],0,body.facing[2]]):normalize(body.facing.map((v,i)=>v-radial*self.position[i]) as Vec3);
      if(!entries.has(id)&&entries.size>=MAX_PRESENCE)throw new RequestError(429,'This local presence service is full. Try again shortly.');
      const entry={publicId:entries.get(id)?.publicId??randomUUID(),planetId:self.planetId,scope,facing,seenAt:now};entries.set(id,entry);
      const nearby:Visitor[]=[];
      for(const[other,e]of entries){
        if(other===id||e.planetId!==self.planetId||e.scope!==scope)continue;
        // Re-read authoritative saves: no client position or exposed session hash.
        const p=state(other),otherScope=p.location?.kind==='interior'?'home:'+p.location.buildingId:'exterior';if(p.planetId!==self.planetId||p.flight.mode!=='ground'||otherScope!==scope){entries.delete(other);continue;}
        nearby.push({id:e.publicId,position:p.location?.kind==='interior'?p.location.position:p.position,facing:e.facing,character:p.character,...(p.appearance?{appearance:p.appearance}:{}),...(p.ground?{radius:p.ground.radius,grounded:p.ground.grounded}:{})});
      }
      const metric=(p:Vec3)=>inside?Math.hypot(...p.map((v,i)=>v-inside.position[i])):distance(p,self.position);
      nearby.sort((a,b)=>metric(a.position)-metric(b.position)||a.id.localeCompare(b.id));
      return{...(self.location?{scope,visitEpoch:self.location.visitEpoch}:{}),planetId:self.planetId,selfId:entry.publicId,visitors:nearby.slice(0,MAX_NEIGHBOURS),nearbyCount:nearby.length,ttlMs:PRESENCE_TTL};
    },
  };
}
