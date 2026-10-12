import {describe,expect,it} from 'vitest';
import {GroundCameraRig} from '../src/client/ground-camera.ts';
import {nearArmCapture,replayNearArm,UPPER_BODY_CONTRACT} from './ground-camera-near-arm-replay.ts';

describe('actual near-arm failure with readable upper-body framing',()=>{
  it('retains all 527 consecutive public controls without importing successful camera poses',()=>{
    expect(nearArmCapture.sourceSha256).toBe('a333562627794d09fcdb1548598bbd4fa991dd04ea4849cb13880cf375ea97f4');
    expect(nearArmCapture.frames).toHaveLength(527);expect(nearArmCapture.observed.minArm).toBeLessThan(.6);
    expect(nearArmCapture.observed.oldFramingLimitedFrames).toBe(0);
    for(let i=1;i<nearArmCapture.frames.length;i++){expect(nearArmCapture.frames[i][0]).toBe(nearArmCapture.frames[i-1][0]+1);expect(nearArmCapture.frames[i][1]).toBeGreaterThan(nearArmCapture.frames[i-1][1]);}
    expect(UPPER_BODY_CONTRACT.maximumViewportSpan).toBe(.75);expect(UPPER_BODY_CONTRACT.minimumAnchorDistance).toBe(1.25);
    expect(UPPER_BODY_CONTRACT.maximumArmExcess).toBe(.25);expect(UPPER_BODY_CONTRACT.minimumProjectionDepth).toBe(.12);
  });
  it.each([false,true])('keeps actual head/ears/coat/shoulders/pack readable throughout the short path, portrait=%s',portrait=>{
    const result=replayNearArm(new GroundCameraRig(),new GroundCameraRig(),portrait);
    expect(result.frames).toBe(527);expect(result.violatingFrames,JSON.stringify(result)).toBe(0);expect(result.armOverQuarterFrames).toBe(0);
  },60000);
});
