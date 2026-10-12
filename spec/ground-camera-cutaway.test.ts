import {describe,expect,it} from 'vitest';
import {Vector3} from 'three';
import type {GroundCameraCutawayPose} from '../src/client/ground-camera-cutaway.ts';
import {GroundCameraCutawayRig} from '../src/client/ground-camera-cutaway.ts';
import {classifyCutawayFrame,replayCutawayShort} from './ground-camera-cutaway-replay.ts';
import {nearArmCapture,UPPER_BODY_CONTRACT} from './ground-camera-near-arm-replay.ts';

const metadata=()=>({strategy:'cutaway',cutawayRequired:true,opticalDistance:2,probeRadius:.2,eyeClear:true,framingLimited:false} as GroundCameraCutawayPose);
const occluded=()=>({sequence:1,distance:3,opticalGap:1,issues:[{kind:'optical line blocked',value:1,limit:1e-7}]});
describe('isolated B physical framing with an explicit render obligation',()=>{
  it('keeps the original captured controls and strict new short-path contract',()=>{
    expect(nearArmCapture.sourceSha256).toBe('a333562627794d09fcdb1548598bbd4fa991dd04ea4849cb13880cf375ea97f4');
    expect(nearArmCapture.frames).toHaveLength(527);
    expect(UPPER_BODY_CONTRACT.maximumArmExcess).toBe(.25);expect(UPPER_BODY_CONTRACT.minimumProjectionDepth).toBe(.12);
  });
  it('preserves a raw optical failure as pending rendering, never a verified clear view',()=>{
    const row=occluded(),before=JSON.stringify(row),result=classifyCutawayFrame(row,metadata());
    expect(result.hardIssues).toEqual([]);expect(result.pendingRender).toBe(true);expect(result.renderVerified).toBe(false);
    expect(row.issues[0].kind).toBe('optical line blocked');expect(JSON.stringify(row)).toBe(before);
  });
  it('never exempts physical contact, framing failure or a dishonest optical flag',()=>{
    const row=occluded();row.issues.push({kind:'camera sphere occupies geometry',value:.02,limit:1e-7},{kind:'reported framing limited',value:1,limit:0});
    const pose=metadata();pose.cutawayRequired=false;pose.framingLimited=true;
    const kinds=classifyCutawayFrame(row,pose).hardIssues.map(x=>x.kind);
    expect(kinds).toContain('camera sphere occupies geometry');expect(kinds).toContain('reported framing limited');
    expect(kinds).toContain('cutaway flag differs from independently measured LOS');
  });
  it('does not use a later instant/reduced-motion hint to reset an established view',()=>{
    const base={feet:new Vector3(0,21.6,0),up:new Vector3(0,1,0),heading:new Vector3(0,0,-1),pitch:0,portrait:false,radius:21.6,dt:1/60,probe:(a:Vector3,b:Vector3)=>a.distanceTo(b)};
    const ordinary=new GroundCameraCutawayRig(),hinted=new GroundCameraCutawayRig();ordinary.update(base);hinted.update(base);
    const changed={...base,heading:new Vector3(1,0,0)},a=ordinary.update(changed),b=hinted.update({...changed,instant:true});
    expect(b.heading.distanceTo(a.heading)).toBeLessThan(1e-10);expect(b.position.distanceTo(a.position)).toBeLessThan(1e-10);
    expect(b.direction.distanceTo(a.direction)).toBeLessThan(1e-10);expect(b.heading.angleTo(base.heading)).toBeLessThan(.4);
  });
  it('keeps finite normalized output when optional projection or direction inputs are invalid',()=>{
    const rig=new GroundCameraCutawayRig(),base={feet:new Vector3(0,21.6,0),up:new Vector3(0,1,0),heading:new Vector3(0,0,-1),pitch:0,portrait:false,radius:21.6,dt:1/60,probe:(a:Vector3,b:Vector3)=>a.distanceTo(b)};
    const before=rig.update(base),after=rig.update({...base,up:new Vector3(NaN,0,0),heading:new Vector3(Infinity,0,0),fov:NaN,aspect:0});
    for(const v of [after.position,after.target,after.direction,after.up,after.heading])expect(v.toArray().every(Number.isFinite)).toBe(true);
    expect(after.up.distanceTo(before.up)).toBeLessThan(1e-10);expect(after.heading.distanceTo(before.heading)).toBeLessThan(1e-10);
    expect(after.direction.length()).toBeCloseTo(1,10);expect(after.framingLimited).toBe(false);
  });
  it.each([false,true])('keeps every physical/mesh/yaw/3D contract across 527 frames, portrait=%s',portrait=>{
    const result=replayCutawayShort(new GroundCameraCutawayRig(),new GroundCameraCutawayRig(),portrait);
    expect(result.frames).toBe(527);expect(result.hardViolatingFrames,JSON.stringify(result)).toBe(0);
    expect(result.raw.armOverQuarterFrames).toBe(0);expect(result.renderVerified).toBe(false);
    expect(result.pendingRenderFrames).toBe(result.raw.counts['optical line blocked']??0);
  },60000);
});
