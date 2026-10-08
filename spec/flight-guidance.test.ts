import { expect, it } from 'vitest';
import { needsFlightDetour } from '../src/client/flight-guidance.ts';
import { flightStep, groundFlight, spaceDistance } from '../src/shared/flight.ts';
import type { FlightState, SpaceBody } from '../src/shared/flight.ts';
import { safeRadius } from '../src/shared/world-size.ts';

it('warns at an actual 21.6m collision stop and allows a real outward departure',()=>{
  const obstacle:SpaceBody={id:'obstacle',center:[0,0,0],radius:21.6};
  const target:SpaceBody={id:'target',center:[0,0,-90],radius:21.6};
  for(const environment of [null,'terrain']){
    obstacle.environment=environment;
    let flight:FlightState={...groundFlight(),mode:'space',position:[0,0,40],speed:36};
    for(let i=0;i<120;i++)flight=flightStep(flight,{thrust:true,brake:false,turn:0,pitch:0},1/60,[obstacle,target]);
    expect(flight.speed).toBe(0);
    expect(spaceDistance(flight.position,obstacle.center)).toBeCloseTo(safeRadius(obstacle),3);
    expect(needsFlightDetour(flight.position,flight.speed,obstacle,target)).toBe(true);
    // Looking at the arrival world itself must keep the normal landing guidance.
    expect(needsFlightDetour(flight.position,flight.speed,obstacle,obstacle)).toBe(false);
    flight.yaw=Math.PI;
    for(let i=0;i<120;i++)flight=flightStep(flight,{thrust:true,brake:false,turn:0,pitch:0},1/60,[obstacle,target]);
    expect(spaceDistance(flight.position,obstacle.center)).toBeGreaterThan(safeRadius(obstacle)+27);
    expect(needsFlightDetour(flight.position,0,obstacle,target)).toBe(false);
  }
});
