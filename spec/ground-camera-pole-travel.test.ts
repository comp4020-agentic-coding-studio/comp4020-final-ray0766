import {describe,expect,it} from 'vitest';
import {GroundCameraRig} from '../src/client/ground-camera.ts';
import {poleTravel,replayPoleTravel,travelInputs} from './ground-camera-travel-replay.ts';

describe('sampled north-to-south camera travel',()=>{
  it('preserves the atomic samples while explicitly interpolating rather than claiming per-render capture',()=>{
    expect(poleTravel.sourceSha256).toBe('418837996472fb4f49d42d0def781f2c6167b9dc82fad2c424543d9890dc55d3');
    expect(poleTravel.samples).toHaveLength(1778);expect(poleTravel.observedVisibility).toEqual({samples:1778,playerVisibleFalse:0,framingLimited:1695,opacityMinimum:1,opacityMaximum:1});
    let count=0;for(const {input} of travelInputs(true)){expect(input.dt).toBeLessThanOrEqual(1/60+1e-12);expect(input.up.length()).toBeCloseTo(1,9);count++;}
    expect(count).toBeGreaterThan(11000);
  });
  it.each([false,true])('follows the whole globe path with a safe, readable camera, portrait=%s',portrait=>{
    const result=replayPoleTravel(new GroundCameraRig(),new GroundCameraRig(),portrait);
    expect(result.violatingFrames,JSON.stringify(result)).toBe(0);
  },180000);
});
