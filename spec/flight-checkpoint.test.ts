// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {flightCheckpointDelay} from '../src/client/flight-checkpoint.ts';
import {SpaceFlight} from '../src/client/flight.ts';
import {flightStep,groundFlight} from '../src/shared/flight.ts';
import type {FlightState} from '../src/shared/flight.ts';
import {openStore} from '../src/server/store.ts';
const input={thrust:true,brake:false,turn:0,pitch:0};
const checkpoint=(f:FlightState)=>{const {mode,...body}=f;void mode;return body;};
function fixture(){
 const s=openStore(':memory:');s.create('pulse',0);const initial:FlightState={...groundFlight(),mode:'space',journey:1,position:[0,50,45],yaw:Math.PI/2,speed:1.4};
 s.db.prepare('UPDATE players SET flight=?,flight_at=0 WHERE id=?').run(JSON.stringify(initial),'pulse');
 return {s,initial};
}
it('reproduces the rejected short pulse and accepts its separate peak without changing server limits',async()=>{
 const {s,initial}=fixture();let peak=initial;
 try{
  for(let i=0;i<18;i++)peak=flightStep(peak,input,1/60,[]);
  let stopped=peak;for(let i=0;i<6;i++)stopped=flightStep(stopped,{...input,thrust:false,brake:true},1/60,[]);
  expect(()=>s.flight('pulse',checkpoint({...stopped,sequence:1}),400)).toThrow('changed too quickly');
  const f=Object.assign(Object.create(SpaceFlight.prototype),{pilot:structuredClone(peak),ack:initial,saving:null,speedPeakPending:null,ackAt:0,bridge:{checkpoint:vi.fn(async body=>s.flight('pulse',body,300)),apply:vi.fn(),online:()=>true,failed:vi.fn()}});
  expect(f.holdSpeedPeak({thrust:false,brake:true})).toBe(true);await f.speedPeakPending;
  expect(f.bridge.failed).not.toHaveBeenCalled();expect(f.ack.speed).toBeCloseTo(5.6);
  expect(f.holdSpeedPeak({thrust:false,brake:true})).toBe(false);
  expect(()=>s.flight('pulse',checkpoint({...stopped,sequence:2}),400)).not.toThrow();
 }finally{s.close();}
});
it('holds an unsaved peak while an earlier checkpoint is still pending',async()=>{
 let release!:()=>void;const prior=new Promise<void>(resolve=>release=resolve),initial={...groundFlight(),mode:'space' as const,speed:1},peak={...initial,speed:5,position:[0,50,45] as [number,number,number]};
 const f=Object.assign(Object.create(SpaceFlight.prototype),{pilot:peak,ack:initial,saving:prior,speedPeakPending:null,ackAt:0,bridge:{online:()=>true,checkpoint:vi.fn(async body=>({flight:{...body,mode:'space'}})),apply:vi.fn(),failed:vi.fn()}});
 expect(f.holdSpeedPeak({thrust:false,brake:true})).toBe(true);expect(f.holdSpeedPeak({thrust:false,brake:true})).toBe(true);expect(f.bridge.checkpoint).not.toHaveBeenCalled();
 f.saving=null;release();await f.speedPeakPending;expect(f.bridge.checkpoint).toHaveBeenCalledTimes(1);expect(f.bridge.checkpoint.mock.calls[0][0].speed).toBe(5);expect(f.holdSpeedPeak({thrust:false,brake:true})).toBe(false);
});
it('does not pause sustained thrust or a deceleration whose peak is acknowledged',()=>{
 const f=Object.assign(Object.create(SpaceFlight.prototype),{pilot:{speed:5},ack:{speed:1},speedPeakPending:null,flush:vi.fn()});
 expect(f.holdSpeedPeak({thrust:true,brake:false})).toBe(false);f.ack.speed=5;expect(f.holdSpeedPeak({thrust:false,brake:true})).toBe(false);expect(f.flush).not.toHaveBeenCalled();
});

it('paces a cruise snapshot after a delayed acknowledgement without loosening server authority',()=>{
 const {s,initial}=fixture();try{
  const old={...initial,speed:36},next={...old,position:[12.6,50,45] as [number,number,number],sequence:1};
  s.db.prepare('UPDATE players SET flight=?,flight_at=0 WHERE id=?').run(JSON.stringify(old),'pulse');
  expect(()=>s.flight('pulse',checkpoint(next),300)).toThrow('changed too quickly');
  const delay=flightCheckpointDelay(old,next,300);expect(delay).toBeGreaterThan(20);expect(delay).toBeLessThan(50);
  expect(()=>s.flight('pulse',checkpoint(next),300+delay)).not.toThrow();
 }finally{s.close();}
});
it('does not delay a valid, already affordable checkpoint',()=>{
 const old={...groundFlight(),speed:12},next={...old,position:[3,0,0] as [number,number,number]};
 expect(flightCheckpointDelay(old,next,350)).toBe(0);expect(flightCheckpointDelay(old,old,0)).toBe(0);
});
