import {FLIGHT_ACCEL,FLIGHT_BRAKE,TURN_RATE,spaceDistance,wrapAngle} from '../shared/flight.ts';
import type {FlightState} from '../shared/flight.ts';
/** A response can arrive later than its snapshot was captured. Use receipt as
 * a conservative clock origin so the next snapshot cannot outrun the server's
 * elapsed-time checks when background geometry or the network delays a save. */
export function flightCheckpointDelay(previous:FlightState,next:FlightState,sinceAckMs:number){
 const speed=Math.max(previous.speed,next.speed),distance=spaceDistance(previous.position,next.position);
 const seconds=Math.max(0,speed>0?(distance-.6)/speed:0,
  (next.speed-previous.speed-.75)/FLIGHT_ACCEL,(previous.speed-next.speed-.75)/FLIGHT_BRAKE,
  (Math.abs(wrapAngle(next.yaw-previous.yaw))-.15)/TURN_RATE,(Math.abs(next.pitch-previous.pitch)-.15)/TURN_RATE);
 return Math.min(2000,Math.max(0,Math.ceil(seconds*1000-Math.max(0,sinceAckMs))));
}
