import {Vector3} from 'three';
import type {PerspectiveCamera} from 'three';
import {firstCollision} from '../shared/flight.ts';
import type {FlightState,SpaceBody} from '../shared/flight.ts';
import type {FlightOrbit} from './flight-controls.ts';
import {RADIUS} from '../shared/world.ts';
export function clipFlightEye(position:Vector3,eye:Vector3,bodies:SpaceBody[]){
 const hit=firstCollision(position.toArray(),eye.toArray(),bodies,RADIUS+2.65);
 return hit===null?eye.clone():position.clone().lerp(eye,Math.max(0,hit-.005));
}
/** World-oriented orbit: following the ship's position never recentres its view yaw. */
export function flightCameraPose(f:FlightState,orbit:FlightOrbit,bodies:SpaceBody[]){
 const target=new Vector3(...f.position),c=Math.cos(orbit.elevation),offset=new Vector3(-Math.sin(orbit.yaw)*c,Math.sin(orbit.elevation),Math.cos(orbit.yaw)*c).multiplyScalar(orbit.distance);
 return {position:clipFlightEye(target,target.clone().add(offset),bodies),target,up:new Vector3(0,1,0)};
}
/** A real bearing even when a destination is behind the camera or off-screen. */
export function flightIndicator(camera:PerspectiveCamera,position:Vector3){
 const local=position.clone().applyMatrix4(camera.matrixWorldInverse),projected=position.clone().project(camera),behind=local.z>=0;
 // Keep bearing arrows in the unobscured view above the navigation dock.
 const top=.5,bottom=camera.aspect<.9?.18:.2;
 const visible=!behind&&Math.abs(projected.x)<=.82&&projected.y<=top&&projected.y>=-bottom&&projected.z<1;
 let x=behind?-projected.x:projected.x,y=behind?-projected.y:projected.y;
 if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)+Math.abs(y)<1e-5){x=0;y=behind?-1:0;}
 if(!visible){const scale=Math.max(Math.abs(x)/.82,y>=0?y/top:-y/bottom,1e-6);x/=scale;y/=scale;}
 return {x,y,visible,behind,angle:Math.atan2(x,y)*180/Math.PI};
}
