import { expect, it, vi } from 'vitest';
import { PresenceVisitGate } from '../src/client/presence-visit.ts';
import { presenceStore } from '../src/server/presence.ts';
import { groundFlight } from '../src/shared/flight.ts';
import { normalize, SPAWN } from '../src/shared/world.ts';
import type { PlayerState } from '../src/shared/world.ts';

function deferred<T>() {let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

it('finishes the old home heartbeat and applies the new epoch before presence resumes',async()=>{
  const gate=new PresenceVisitGate(),oldBeat=deferred<void>(),exitAck=deferred<void>();
  let epoch=2;const sent:number[]=[],send=()=>gate.heartbeat(async()=>{sent.push(epoch);await oldBeat.promise;return epoch;});
  const heartbeat=send();await Promise.resolve();
  const change=vi.fn(async()=>{await exitAck.promise;epoch=3;});
  const transition=gate.transition(change);
  expect(await send()).toBeNull();expect(change).not.toHaveBeenCalled();
  oldBeat.resolve();await heartbeat;await Promise.resolve();
  expect(change).toHaveBeenCalledOnce();expect(await send()).toBeNull();
  exitAck.resolve();await transition;
  expect(await send()).toBe(3);expect(sent).toEqual([2,3]);
});

it('does not let a failed heartbeat cancel the visit, and releases the gate after a failed visit',async()=>{
  const gate=new PresenceVisitGate(),beat=deferred<void>();
  const heartbeat=gate.heartbeat(()=>beat.promise),observed=heartbeat.catch(error=>error);
  const change=vi.fn(async()=>{throw new Error('Visit rejected');});
  const transition=gate.transition(change),rejected=expect(transition).rejects.toThrow('Visit rejected');
  beat.reject(new Error('Presence unavailable'));expect(await observed).toBeInstanceOf(Error);
  await rejected;expect(change).toHaveBeenCalledOnce();
  expect(await gate.heartbeat(async()=>'current visit')).toBe('current visit');
});

it.each(['flight/takeoff','flight/land'] as const)('%s drains the old heartbeat and blocks stale presence until the new visit is applied',async route=>{
  const gate=new PresenceVisitGate(),oldAck=deferred<void>(),commandAck=deferred<void>();
  let client:PlayerState={character:'fern',quest:'available',position:SPAWN,deliveries:0,revision:1,planetId:'home',
    flight:{...groundFlight(),mode:route==='flight/takeoff'?'ground':'space'},location:{kind:'exterior',planetId:'home',visitEpoch:4}};
  let authoritative=client;
  const service=presenceStore(()=>authoritative),events:string[]=[];
  const body=()=>({planetId:client.planetId,scope:'exterior',visitEpoch:client.location!.visitEpoch,facing:normalize([0,SPAWN[2],-SPAWN[1]])});
  const staleBody=body(),network=vi.fn(async()=>service.heartbeat('pilot',body()));
  const oldHeartbeat=gate.heartbeat(async()=>{events.push('old sent');await oldAck.promise;events.push('old settled');});
  await Promise.resolve();
  const command=vi.fn(async()=>{
    events.push(route);
    const planetId=route==='flight/takeoff'?'home':'hub';
    authoritative={...client,revision:2,planetId,flight:{...client.flight,mode:route==='flight/takeoff'?'space':'ground'},location:{kind:'exterior',planetId,visitEpoch:5}};
    await commandAck.promise;
    return authoritative;
  });
  const transition=gate.transition(async()=>{const next=await command();events.push('accept');client=next;});
  expect(await gate.heartbeat(network)).toBeNull();expect(command).not.toHaveBeenCalled();
  oldAck.resolve();await oldHeartbeat;await Promise.resolve();
  expect(command).toHaveBeenCalledOnce();expect(events).toEqual(['old sent','old settled',route]);
  // The server has already changed visits while the response is still in flight.
  // Its real fence must reject the old body; the client gate prevents sending it.
  expect(()=>service.heartbeat('pilot',staleBody)).toThrow('changed');
  expect(await gate.heartbeat(network)).toBeNull();expect(network).not.toHaveBeenCalled();
  commandAck.resolve();await transition;
  expect(events.at(-1)).toBe('accept');expect(client).toBe(authoritative);
  expect(await gate.heartbeat(async()=>client)).toBe(authoritative);
  if(client.flight.mode==='ground'){
    expect(await gate.heartbeat(network)).toMatchObject({planetId:'hub',visitEpoch:5});
    expect(network).toHaveBeenCalledOnce();
  }else{
    // The normal producer stops surface heartbeats altogether after takeoff.
    expect(client.flight.mode).toBe('space');expect(network).not.toHaveBeenCalled();
  }
});
