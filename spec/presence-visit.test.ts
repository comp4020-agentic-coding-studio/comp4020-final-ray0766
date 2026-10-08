import { expect, it, vi } from 'vitest';
import { PresenceVisitGate } from '../src/client/presence-visit.ts';

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
