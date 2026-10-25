import {expect,it} from 'vitest';
import {PerspectiveCamera,Vector3} from 'three';
import {flightCameraPose,clipFlightEye,flightIndicator} from '../src/client/flight-look.ts';
import {defaultFlightOrbit} from '../src/client/flight-controls.ts';
import {groundFlight} from '../src/shared/flight.ts';
const f=()=>({...groundFlight(),mode:'space' as const,position:[0,34,-22] as [number,number,number],yaw:.4,pitch:.1,speed:12});
it('retains world-oriented orbit through ship turns and does not mutate driving state',()=>{
 const state=f(),copy=structuredClone(state),orbit={...defaultFlightOrbit(),yaw:1.7,elevation:.55},a=flightCameraPose(state,orbit,[]);
 for(const yaw of [-3,0,3])for(const pitch of [-1.3,0,1.3])expect(flightCameraPose({...state,yaw,pitch},orbit,[])).toEqual(a);
 expect(state).toEqual(copy);expect(a.up.toArray()).toEqual([0,1,0]);
});
it('follows position while leaving user orbit angles and zoom unchanged',()=>{
 const state=f(),orbit=defaultFlightOrbit(),a=flightCameraPose(state,orbit,[]),b=flightCameraPose({...state,position:[100,134,78]},orbit,[]);
 expect(b.position.clone().sub(a.position).toArray()).toEqual([100,100,100]);expect(b.target.clone().sub(a.target).toArray()).toEqual([100,100,100]);expect(orbit).toEqual(defaultFlightOrbit());
});
it('clips desired and interpolated eyes at actual hulls',()=>{
 const pos=new Vector3(0,0,30),bodies=[{id:'p',center:[0,0,0] as [number,number,number],radius:12}];const eye=clipFlightEye(pos,new Vector3(0,0,0),bodies);expect(eye.z).toBeGreaterThan(14.65);expect(eye.z).toBeLessThan(30);expect(clipFlightEye(pos,new Vector3(0,0,40),bodies).z).toBe(40);
});
it('indicates actual off-screen and behind-camera destinations for both viewport shapes',()=>{
 for(const aspect of [1920/1080,390/844]){const camera=new PerspectiveCamera(58,aspect,.1,18000);camera.updateMatrixWorld();
  expect(flightIndicator(camera,new Vector3(0,0,-800))).toMatchObject({visible:true,behind:false});
  const right=flightIndicator(camera,new Vector3(800,0,-10));expect(right.visible).toBe(false);expect(right.x).toBeCloseTo(.82);
  const behind=flightIndicator(camera,new Vector3(0,0,800));expect(behind.behind).toBe(true);expect(behind.visible).toBe(false);expect(Number.isFinite(behind.y)).toBe(true);expect(behind.y).toBeGreaterThanOrEqual(-.2);expect(behind.y).toBeLessThanOrEqual(.5);
 }
});
it('keeps far saved positions in real perspective coordinates rather than relocating or scaling worlds',()=>{
 const state={...f(),position:[-6.316967616872948,-486.77468039666616,739.6949674917352] as [number,number,number]},orbit=defaultFlightOrbit();const view=flightCameraPose(state,orbit,[]);expect(view.target.toArray()).toEqual(state.position);expect(view.position.distanceTo(view.target)).toBeCloseTo(28);
});
