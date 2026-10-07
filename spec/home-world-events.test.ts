import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import * as vendorWorld from '../src/assets/claude-geometry/core/world.ts';
import * as vendorCodec from '../src/assets/claude-geometry/timeline/codec.ts';
import { applyEvent, decide, emptyWorld, parseCommand, parseEvent, replay } from '../src/shared/world-events.ts';
import type { Stamp, WorldEvent, WorldState } from '../src/shared/world-events.ts';
import { canonicalEvent, decodeEvent, decodeSnapshot, encodeEvent, encodeSnapshot, stateHash } from '../src/shared/timeline-codec.ts';
import type { PlanetId } from '../src/assets/claude-geometry/core/ids.ts';

const planet='garden-1' as PlanetId;
const objectId='00000000-0000-4000-8000-000000000001';
const commandId='00000000-0000-4000-8000-000000000002';
const beforeHash='a'.repeat(64),afterHash='b'.repeat(64);
const stamp=(seq:number):Stamp=>({eventId:'00000000-0000-4000-8000-000000000003' as Stamp['eventId'],actorId:'owner' as Stamp['actorId'],seq,recordedAt:'2026-10-08T00:00:00.000Z'});
const create={v:1,type:'object.create',planetId:planet,objectId,commandId,spec:{kind:'structure',blueprintHash:beforeHash},anchor:{dir:[0,1,0],yaw:.37}};
const replace={v:1,type:'object.replace',planetId:planet,objectId,commandId,expectedVersion:1,spec:{kind:'structure',blueprintHash:afterHash}};
function record(state:WorldState,raw:unknown):WorldEvent {
  const command=parseCommand(raw);if(!command.ok)throw Error(command.errors.join(';'));
  const decision=decide(state,command.value,stamp(state.seq+1));if(!decision.ok)throw Error(decision.message);
  const result=decodeEvent(encodeEvent(canonicalEvent(decision.event)));if(!result.ok)throw Error(result.errors.join(';'));
  return result.value;
}

it('keeps existing vendor event and snapshot bytes compatible through the host adapter',()=>{
  const initial=emptyWorld(planet),created=record(initial,create),command=vendorWorld.parseCommand(create);
  expect(command.ok).toBe(true);if(!command.ok)return;
  const decision=vendorWorld.decide(initial,command.value,stamp(1));expect(decision.ok).toBe(true);if(!decision.ok)return;
  expect(encodeEvent(created)).toBe(vendorCodec.encodeEvent(vendorCodec.canonicalEvent(decision.event)));
  expect(decodeEvent(vendorCodec.encodeEvent(decision.event))).toEqual(vendorCodec.decodeEvent(encodeEvent(created)));
  const current=applyEvent(initial,created);
  expect(encodeSnapshot(current)).toBe(vendorCodec.encodeSnapshot(current));
  expect(decodeSnapshot(encodeSnapshot(current))).toEqual(vendorCodec.decodeSnapshot(encodeSnapshot(current)));
});

it('parses and replays replacement and inverse history through the host codec without changing identity or anchor',async()=>{
  const initial=emptyWorld(planet),created=record(initial,create),built=applyEvent(initial,created);
  const replaced=record(built,replace),changed=applyEvent(built,replaced);
  expect(replaced).toMatchObject({type:'object.replaced',from:{blueprintHash:beforeHash},spec:{blueprintHash:afterHash}});
  expect(vendorCodec.decodeEvent(encodeEvent(replaced)).ok).toBe(false);
  expect(parseEvent(JSON.parse(encodeEvent(replaced)).event)).toEqual({ok:true,value:replaced});
  expect(changed.objects[objectId]).toMatchObject({id:objectId,version:2,createdSeq:1,updatedSeq:2,anchor:built.objects[objectId].anchor,spec:{blueprintHash:afterHash}});
  expect(built.objects[objectId].spec).toEqual({kind:'structure',blueprintHash:beforeHash});
  const inverse=record(changed,{...replace,expectedVersion:2,spec:{kind:'structure',blueprintHash:beforeHash}});
  const final=applyEvent(changed,inverse);
  expect(replay(initial,[created,replaced,inverse])).toEqual(final);
  expect(final.objects[objectId]).toMatchObject({id:objectId,version:3,anchor:built.objects[objectId].anchor,spec:built.objects[objectId].spec});
  expect(await stateHash(final)).toBe(createHash('sha256').update(encodeSnapshot(final)).digest('hex'));
  expect(decodeSnapshot(encodeSnapshot(final))).toEqual({ok:true,value:final});
});

it('fences invalid replacement commands and rejects gaps during replacement replay',()=>{
  const initial=emptyWorld(planet),created=record(initial,create),built=applyEvent(initial,created);
  expect(parseCommand({...replace,actorId:'forged'}).ok).toBe(false);
  expect(parseCommand({...replace,spec:{kind:'structure',blueprintHash:'invalid'}}).ok).toBe(false);
  const stale=parseCommand({...replace,expectedVersion:2});expect(stale.ok).toBe(true);if(stale.ok)expect(decide(built,stale.value,stamp(2))).toMatchObject({ok:false,code:'stale'});
  const replaced=record(built,replace);
  expect(decodeEvent({...JSON.parse(encodeEvent(replaced)),event:{...replaced,from:{kind:'structure',blueprintHash:'invalid'}}}).ok).toBe(false);
  expect(()=>applyEvent(built,{...replaced,seq:3})).toThrow('Expected event 2');
  expect(()=>applyEvent(built,{...replaced,objectVersion:3})).toThrow('v1');
});
