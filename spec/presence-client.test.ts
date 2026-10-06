// @vitest-environment jsdom
import { afterEach,beforeEach,expect,it } from 'vitest';
import { Scene,Vector3 } from 'three';
import { GroundPresence } from '../src/client/presence.ts';
import { setGroundWorld } from '../src/client/terrain.ts';
import type { PresenceSnapshot } from '../src/shared/presence.ts';
import { PRESENCE_TTL } from '../src/shared/presence.ts';
import { normalize,SPAWN } from '../src/shared/world.ts';
const snapshot=(planetId='garden',radius=12):PresenceSnapshot=>({planetId,selfId:'visitor',visitors:[{id:'owner',position:SPAWN,facing:normalize([0,SPAWN[2],-SPAWN[1]]),character:'fern',radius}],nearbyCount:1,ttlMs:PRESENCE_TTL});
let scene:Scene,canvas:HTMLCanvasElement,presence:GroundPresence;
beforeEach(()=>{document.body.innerHTML='<p id="presence-summary"></p><canvas></canvas>';scene=new Scene();canvas=document.querySelector('canvas')!;presence=new GroundPresence(scene,canvas);setGroundWorld(false);});
afterEach(()=>{presence.clear();setGroundWorld(true);});
it('invalidates in-flight replies on disconnect, travel, and return to the same planet',()=>{
  const old=presence.ticket('garden');presence.receive(snapshot(),1000,old);presence.frame(1100,.016,new Vector3(...SPAWN),false);
  expect(canvas.dataset.visibleVisitors).toBe('1');expect(canvas.dataset.detailedVisitors).toBe('1');
  const disconnected=presence.ticket('garden');presence.clear();
  expect(scene.children).toHaveLength(0);expect(canvas.dataset.presencePlanet).toBeUndefined();
  for(const key of ['visitors','nearbyVisitors','visibleVisitors','detailedVisitors'])expect(canvas.dataset[key]).toBe('0');
  expect(presence.receive(snapshot(),1200,disconnected)).toBe(false);
  expect(presence.receive(snapshot('other'),1300,presence.ticket('other'))).toBe(true);
  presence.clear();expect(presence.receive(snapshot(),1400,presence.ticket('garden'))).toBe(true);
  expect(presence.receive(snapshot(),1500,disconnected)).toBe(false);
  expect(canvas.dataset.presencePlanet).toBe('garden');
});
it('keeps newer presence on out-of-order replies and rejects a mismatched planet',()=>{
  presence.receive(snapshot(),1000);
  const older=presence.ticket('garden'),newer=presence.ticket('garden');
  expect(presence.receive(snapshot('garden',10),1100,newer)).toBe(true);
  expect(presence.receive(snapshot('garden',12),1200,older)).toBe(false);
  expect(presence.receive(snapshot('other'),1300,presence.ticket('garden'))).toBe(false);
  presence.frame(1400,.016,new Vector3(...SPAWN),true);
  expect(scene.children[0].position.length()).toBeCloseTo(10.02,6);
});
it('expires both rendered visitors and diagnostic counts then accepts a fresh reconnect',()=>{
  presence.receive(snapshot(),1000);presence.frame(1100,.016,new Vector3(...SPAWN),false);
  const expired=presence.ticket('garden');presence.frame(1001+PRESENCE_TTL,.016,new Vector3(...SPAWN),false);
  expect(scene.children).toHaveLength(0);expect(canvas.dataset.visibleVisitors).toBe('0');expect(canvas.dataset.detailedVisitors).toBe('0');
  expect(presence.receive(snapshot(),7200,expired)).toBe(false);
  expect(presence.receive(snapshot(),7300,presence.ticket('garden'))).toBe(true);expect(canvas.dataset.visitors).toBe('1');
});
