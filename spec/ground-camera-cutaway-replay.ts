import type {GroundCameraInput} from '../src/client/ground-camera.ts';
import type {GroundCameraCutawayPose} from '../src/client/ground-camera-cutaway.ts';
import {replayNearArm} from './ground-camera-near-arm-replay.ts';

type Issue={kind:string;value:number;limit:number};
type RawFrame=Record<string,unknown>&{sequence:number;distance:number;opticalGap:number;issues:Issue[]};
type Rig={update(input:GroundCameraInput):GroundCameraCutawayPose};

/** B changes only the rendering obligation. It never turns a raw LOS hit into
 * a clear ray, nor waives a physical/composition failure because a flag is set. */
export function classifyCutawayFrame(row:RawFrame,pose:GroundCameraCutawayPose){
  const hardIssues=row.issues.filter(issue=>issue.kind!=='optical line blocked').map(issue=>({...issue}));
  const blocked=row.opticalGap>1e-7;
  const bad=(kind:string,value:number,limit:number)=>hardIssues.push({kind,value,limit});
  if(pose.strategy!=='cutaway')bad('missing isolated B strategy',1,0);
  if(typeof pose.cutawayRequired!=='boolean'||pose.cutawayRequired!==blocked)bad('cutaway flag differs from independently measured LOS',1,0);
  if(!Number.isFinite(pose.opticalDistance)||Math.abs(row.distance-pose.opticalDistance-row.opticalGap)>1e-7)
    bad('raw optical distance differs from independent query',Math.abs(row.distance-pose.opticalDistance-row.opticalGap),1e-7);
  if(!Number.isFinite(pose.probeRadius)||Math.abs(pose.probeRadius-.2)>1e-12)bad('camera entity radius changed',pose.probeRadius,.2);
  if(pose.eyeClear!==true)bad('camera did not certify its physical endpoint',1,0);
  // The old checker records a true limited flag, while this also rejects a
  // missing/non-boolean flag. Optical-only work belongs in cutawayRequired.
  if(typeof pose.framingLimited!=='boolean')bad('framing limited state missing',1,0);
  return{hardIssues,pendingRender:blocked,rawOpticalGap:row.opticalGap,renderVerified:false as const};
}

/** Uses the unchanged A physical and production-mesh measurements. Only the
 * additional B report classification differs; the full raw A result survives. */
export function replayCutawayShort(rig:Rig,reference:Rig,portrait:boolean,onFrame?:(row:Record<string,unknown>)=>void){
  let lastPose:GroundCameraCutawayPose|undefined;
  const hardCounts:Record<string,number>={},firstHardFailures:Record<string,unknown>[]=[],lastHardFailures:Record<string,unknown>[]=[];
  const firstRenderPending:Record<string,unknown>[]=[];
  let hardViolatingFrames=0,pendingRenderFrames=0;
  const raw=replayNearArm({update(input){lastPose=rig.update(input);return lastPose;}},reference,portrait,frame=>{
    if(!lastPose)throw Error('B frame emitted without a corresponding camera pose');
    const row=frame as RawFrame,classification=classifyCutawayFrame(row,lastPose);
    const classified={...row,...classification,strategy:lastPose.strategy,cutawayRequired:lastPose.cutawayRequired,
      rawOpticalDistance:lastPose.opticalDistance,rawIssues:row.issues};
    if(classification.hardIssues.length){
      hardViolatingFrames++;
      for(const issue of classification.hardIssues)hardCounts[issue.kind]=(hardCounts[issue.kind]??0)+1;
      if(firstHardFailures.length<8)firstHardFailures.push(classified);
      lastHardFailures.push(classified);if(lastHardFailures.length>8)lastHardFailures.shift();
    }
    if(classification.pendingRender){pendingRenderFrames++;if(firstRenderPending.length<4)firstRenderPending.push(classified);}
    onFrame?.(classified);
  });
  return{portrait,frames:raw.frames,raw,hardCounts,hardViolatingFrames,pendingRenderFrames,firstHardFailures,lastHardFailures,firstRenderPending,
    physicalAndFramingPassed:hardViolatingFrames===0,
    renderVerified:false as const,
    status:hardViolatingFrames?'physical-or-framing-failed':pendingRenderFrames?'physical-and-framing-pass-render-pending':'physical-and-framing-pass-no-recorded-LOS-obligation',
    scope:'Independent 527-frame physics and actual reconstructed upper-body mesh only. No renderer, cutaway object selection, pixels or live game have been validated.'};
}
