import {readFileSync} from 'node:fs';
import {PerspectiveCamera,Quaternion,Vector3} from 'three';
import type {GroundCameraInput,GroundCameraPose} from '../src/client/ground-camera.ts';
import {surfaceTangent} from '../src/client/terrain.ts';
import {GroundWorld} from '../src/shared/physics/world.ts';
import {cameraEyePenetration} from './ground-camera-safety.ts';

type State=[number,number,number,number,number,number,number,number,number,number,number];
export const poleTravel=JSON.parse(readFileSync(new URL('./fixtures/ground-camera-pole-south-controls-r5.json',import.meta.url),'utf8')) as {
 sourceSha256:string;states:State[];samples:[number,number,number][];
 observedVisibility:{samples:number;playerVisibleFalse:number;framingLimited:number;opacityMinimum:number;opacityMaximum:number};
};
const unit=(s:State)=>new Vector3(s[0],s[1],s[2]).normalize();
const heading=(s:State,up:Vector3)=>new Vector3(s[4],s[5],s[6]).projectOnPlane(up).normalize();
export function* travelInputs(portrait:boolean){
  const first=poleTravel.states[poleTravel.samples[0][2]],normal=unit(first);
  yield{sampleIndex:0,alpha:0,time:0,input:{feet:normal.clone().multiplyScalar(first[3]),up:new Vector3(first[8],first[9],first[10]).normalize(),heading:surfaceTangent(normal,heading(first,normal)),pitch:first[7],portrait,radius:21.6,dt:0}};
  for(let i=1;i<poleTravel.samples.length;i++){
    const left=poleTravel.states[poleTravel.samples[i-1][2]],right=poleTravel.states[poleTravel.samples[i][2]];
    const leftUp=unit(left),rightUp=unit(right),full=new Quaternion().setFromUnitVectors(leftUp,rightUp);
    const leftHeading=heading(left,leftUp),rightHeading=heading(right,rightUp),transported=leftHeading.clone().applyQuaternion(full);
    const yaw=Math.atan2(rightUp.dot(new Vector3().crossVectors(transported,rightHeading)),transported.dot(rightHeading));
    const duration=(poleTravel.samples[i][1]-poleTravel.samples[i-1][1])/1000,steps=Math.ceil(duration*60),dt=duration/steps;
    for(let j=1;j<=steps;j++){
      const alpha=j/steps,turn=new Quaternion().slerp(full,alpha),up=leftUp.clone().applyQuaternion(turn).normalize();
      const viewHeading=leftHeading.clone().applyQuaternion(turn).applyAxisAngle(up,yaw*alpha).projectOnPlane(up).normalize();
      const radius=left[3]+(right[3]-left[3])*alpha;
      yield{sampleIndex:i,alpha,time:(poleTravel.samples[i-1][1]-poleTravel.samples[0][1])/1000+duration*alpha,
        input:{feet:up.clone().multiplyScalar(radius),up,heading:surfaceTangent(up,viewHeading),pitch:left[7]+(right[7]-left[7])*alpha,portrait,radius:21.6,dt}};
    }
  }
}

type Rig={update:(input:GroundCameraInput)=>GroundCameraPose};
let world:GroundWorld|undefined;
export function replayPoleTravel(rig:Rig,reference:Rig,portrait:boolean,onFrame?:(row:Record<string,unknown>)=>void){
  world??=new GroundWorld({id:'hub',radius:21.6,revision:0,objects:[],blueprints:{}});
  const physics=world,camera=new PerspectiveCamera(portrait?62:54,portrait?390/844:1440/1000,.08,2400);
  const counts:Record<string,number>={},firstFailures:Record<string,unknown>[]=[],lastFailures:Record<string,unknown>[]=[];
  let previous:GroundCameraPose|undefined,frames=0,violatingFrames=0,legacyTubeFailures=0,maxDistance=0,maxOverNominal=0,maxFeatureNdc=0,maxExtraTurn=0;
  let stillEye:Vector3|undefined,stillAnchor:Vector3|undefined,stillSince=0,maxStationaryEyePlayerTravel=0;
  for(const step of travelInputs(portrait)){
    const {input,time,sampleIndex,alpha}=step,saved=JSON.stringify(input);
    const view=rig.update({...input,probe:(a,b,r)=>physics.cameraDistance(a,b,r)}),intended=reference.update({...input,probe:(a,b)=>a.distanceTo(b)});
    const issues:{kind:string;value:number;limit:number}[]=[];
    const bad=(kind:string,value:number,limit:number)=>{counts[kind]=(counts[kind]??0)+1;issues.push({kind,value,limit});};
    if(JSON.stringify(input)!==saved)bad('mutated controls',1,0);
    const headingError=view.heading.distanceTo(intended.heading),pitchError=Math.abs(view.pitch-intended.pitch);
    if(headingError>1e-8)bad('control heading',headingError,1e-8);if(pitchError>1e-9)bad('control pitch',pitchError,1e-9);
    for(const v of [view.position,view.target,view.direction,view.up,view.heading])if(!v.toArray().every(Number.isFinite))bad('nonfinite pose',1,0);
    const anchor=input.feet.clone().addScaledVector(input.up,1.15),length=anchor.distanceTo(view.position);
    maxDistance=Math.max(maxDistance,length);maxOverNominal=Math.max(maxOverNominal,length-view.desiredDistance);
    // Predeclared allowance for a brief moving-anchor/shoulder transient, not
    // permission to leave a fixed eye behind as the player crosses the globe.
    if(length>view.desiredDistance+.5)bad('arm exceeds nominal plus 0.5m',length-view.desiredDistance,.5);
    const optical=physics.cameraDistance(anchor,view.position,0);
    if(optical<length-1e-7)bad('optical line blocked',length-optical,1e-7);
    const legacyTubeGap=length-physics.cameraDistance(anchor,view.position,.2);
    if(legacyTubeGap>1e-7)legacyTubeFailures++;
    const occupancy=cameraEyePenetration(physics,view.position,.2);
    if(occupancy.depth>1e-7)bad('camera sphere occupies geometry',occupancy.depth,1e-7);
    if(view.framingLimited)bad('reported framing limited',1,0);
    camera.position.copy(view.position);camera.up.copy(view.up);camera.lookAt(view.target);camera.updateMatrixWorld(true);
    const projections=[];
    for(const height of [.95,1.45]){
      const point=input.feet.clone().addScaledVector(input.up,height),ndc=point.clone().project(camera),depth=point.clone().sub(view.position).dot(view.direction);
      projections.push({height,ndc:ndc.toArray(),depth});maxFeatureNdc=Math.max(maxFeatureNdc,Math.abs(ndc.x),Math.abs(ndc.y));
      if(depth<=.08)bad('head/chest behind near plane',depth,.08);
      if(Math.abs(ndc.x)>=.95)bad('head/chest horizontal margin',Math.abs(ndc.x),.95);
      if(Math.abs(ndc.y)>=.95)bad('head/chest vertical margin',Math.abs(ndc.y),.95);
      if(Math.abs(ndc.z)>=1)bad('head/chest depth clip',Math.abs(ndc.z),1);
    }
    let sweepGap=0,extraTurn=0;
    if(previous){
      const sweep=previous.position.distanceTo(view.position),safe=physics.cameraDistance(previous.position,view.position,.2);sweepGap=sweep-safe;
      if(sweepGap>1e-7)bad('camera sphere sweep blocked',sweepGap,1e-7);
      const transport=new Quaternion().setFromUnitVectors(previous.up,input.up),priorLook=previous.direction.clone().applyQuaternion(transport),priorHeading=previous.heading.clone().applyQuaternion(transport);
      const controlTurn=priorHeading.angleTo(view.heading)+Math.abs(previous.pitch-view.pitch);
      extraTurn=Math.max(0,priorLook.angleTo(view.direction)-controlTurn);maxExtraTurn=Math.max(maxExtraTurn,extraTurn);
      if(extraTurn>4*input.dt+1e-6)bad('unrequested automatic turn',extraTurn,4*input.dt+1e-6);
    }
    if(!stillEye||view.position.distanceTo(stillEye)>1e-8){stillEye=view.position.clone();stillAnchor=anchor.clone();stillSince=time;}
    const heldTravel=anchor.distanceTo(stillAnchor!);maxStationaryEyePlayerTravel=Math.max(maxStationaryEyePlayerTravel,heldTravel);
    if(time-stillSince>.5&&heldTravel>.25)bad('world eye stuck while player moves',heldTravel,.25);
    if(issues.length){violatingFrames++;const row={time,sampleIndex,alpha,issues};if(firstFailures.length<12)firstFailures.push(row);lastFailures.push(row);if(lastFailures.length>12)lastFailures.shift();}
    onFrame?.({frame:frames,time,sampleIndex,alpha,eye:view.position.toArray(),feet:input.feet.toArray(),heading:view.heading.toArray(),direction:view.direction.toArray(),distance:length,desiredDistance:view.desiredDistance,avoidanceYaw:view.avoidanceYaw,avoidanceTargetYaw:view.avoidanceTargetYaw,framingLimited:view.framingLimited,opticalGap:length-optical,legacyTubeGap,occupancy,sweepGap,extraTurn,projections,issues});
    previous=view;frames++;
  }
  return{portrait,frames,seconds:(poleTravel.samples.at(-1)![1]-poleTravel.samples[0][1])/1000,counts,violatingFrames,legacyTubeFailures,maxDistance,maxOverNominal,maxFeatureNdc,maxExtraTurn,maxStationaryEyePlayerTravel,firstFailures,lastFailures,final:{distance:previous!.distance,avoidanceYaw:previous!.avoidanceYaw,framingLimited:previous!.framingLimited}};
}
