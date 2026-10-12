import {readFileSync} from 'node:fs';
import {Mesh,Object3D,PerspectiveCamera,Quaternion,Vector3} from 'three';
import type {GroundCameraInput,GroundCameraPose} from '../src/client/ground-camera.ts';
import {courier} from '../src/client/character.ts';
import {surfaceOrientation,surfaceTangent} from '../src/client/terrain.ts';
import {GroundWorld} from '../src/shared/physics/world.ts';
import {cameraEyePenetration} from './ground-camera-safety.ts';

type State=[number,number,number,number,number,number,number,number,number,number,number,number,number,number];
export const nearArmCapture=JSON.parse(readFileSync(new URL('./fixtures/ground-camera-near-arm-controls-r6.json',import.meta.url),'utf8')) as {
  sourceSha256:string;projection:{fov:number;aspect:number;near:number};states:State[];frames:[number,number,number][];
  observed:{frames:number;firstSequence:number;lastSequence:number;minArm:number;playerInvisibleFrames:number;oldFramingLimitedFrames:number};
};
// Fixed before running the repaired camera. These are independent acceptance
// measurements, not values read from the camera's claimed framing flags/hull.
export const UPPER_BODY_CONTRACT={margin:.95,maximumViewportSpan:.75,minimumAnchorDistance:1.25,minimumProjectionDepth:.12,
  cylinder:{bottom:.65,top:1.71,radius:.60,minimumClearance:.55},maximumPitchCorrection:.30,
  automaticTurnRate:3,maximumAvoidanceYaw:Math.PI/2,bodyRadius:.2,opticalRadius:0,maximumArmExcess:.25} as const;

type Rig={update:(input:GroundCameraInput)=>GroundCameraPose};
type View=GroundCameraPose;
export function* nearArmInputs(portrait:boolean){
  let previousTime=0;
  for(const [index,[sequence,time,stateIndex]] of nearArmCapture.frames.entries()){
    const s=nearArmCapture.states[stateIndex],normal=new Vector3(s[0],s[1],s[2]);
    yield{sequence,time,index,normal,facing:new Vector3(s[11],s[12],s[13]),input:{feet:normal.clone().multiplyScalar(s[3]),
      up:new Vector3(s[8],s[9],s[10]),heading:surfaceTangent(normal,new Vector3(s[4],s[5],s[6])),pitch:s[7],
      portrait,radius:21.6,fov:portrait?62:nearArmCapture.projection.fov,aspect:portrait?390/844:nearArmCapture.projection.aspect,
      dt:index?Math.min((time-previousTime)/1000,.05):0}};
    previousTime=time;
  }
}
function upperMeshes(actor:ReturnType<typeof courier>){
  const torso=actor.head.parent;if(!torso)throw Error('Courier torso missing');
  const all:{mesh:Mesh;head:boolean}[]=[];
  actor.head.traverse(o=>{if(o instanceof Mesh)all.push({mesh:o,head:true});});
  for(const child of torso.children){
    if(child===actor.head)continue;
    if(child instanceof Mesh)child.traverse(o=>{if(o instanceof Mesh)all.push({mesh:o,head:false});});
    else for(const shoulder of child.children)if(shoulder instanceof Mesh)all.push({mesh:shoulder,head:false});
  }
  if(!all.some(x=>x.mesh===actor.parcel)||all.filter(x=>x.head).length<5)throw Error('Actual courier selection changed');
  return all;
}
function shown(mesh:Object3D){for(let p:Object3D|null=mesh;p;p=p.parent)if(!p.visible)return false;return true;}
function cylinderClearance(eye:Vector3,feet:Vector3,up:Vector3){
  const relative=eye.clone().sub(feet),height=relative.dot(up),radial=relative.addScaledVector(up,-height).length();
  const {bottom,top,radius}=UPPER_BODY_CONTRACT.cylinder;
  return Math.hypot(Math.max(0,radial-radius),Math.max(bottom-height,0,height-top));
}
function avatarPair(){return [false,true].map(carry=>{const actor=courier('clay');actor.parcel.visible=carry;return{carry,actor,meshes:upperMeshes(actor)};});}
function projectActors(actors:ReturnType<typeof avatarPair>,step:ReturnType<typeof nearArmInputs> extends Generator<infer T>?T:never,
  speed:number,camera:PerspectiveCamera,view:View){
  const bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minDepth:Infinity,minZ:Infinity,maxZ:-Infinity};
  const head={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
  let vertices=0;const point=new Vector3(),projected=new Vector3();
  for(const {actor,meshes} of actors){
    // Same model/root transform as main.ts. Gait is numerically reconstructed
    // from recorded feet motion; the capture contains no per-bone animation.
    actor.root.position.copy(step.input.feet).addScaledVector(step.normal,.018);
    actor.root.quaternion.copy(surfaceOrientation(step.normal,step.facing));
    actor.animate(step.time/1000,speed,false,0,true);actor.root.updateMatrixWorld(true);
    for(const {mesh,head:isHead} of meshes){
      if(!shown(mesh))continue;const attribute=mesh.geometry.getAttribute('position');
      for(let i=0;i<attribute.count;i++){
        point.fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld);projected.copy(point).project(camera);
        const depth=point.clone().sub(view.position).dot(view.direction);vertices++;
        bounds.minX=Math.min(bounds.minX,projected.x);bounds.maxX=Math.max(bounds.maxX,projected.x);
        bounds.minY=Math.min(bounds.minY,projected.y);bounds.maxY=Math.max(bounds.maxY,projected.y);
        bounds.minZ=Math.min(bounds.minZ,projected.z);bounds.maxZ=Math.max(bounds.maxZ,projected.z);bounds.minDepth=Math.min(bounds.minDepth,depth);
        if(isHead){head.minX=Math.min(head.minX,projected.x);head.maxX=Math.max(head.maxX,projected.x);head.minY=Math.min(head.minY,projected.y);head.maxY=Math.max(head.maxY,projected.y);}
      }
    }
  }
  return{bounds,head,vertices,spanX:(bounds.maxX-bounds.minX)/2,spanY:(bounds.maxY-bounds.minY)/2};
}
let world:GroundWorld|undefined;
export function replayNearArm(rig:Rig,reference:Rig,portrait:boolean,onFrame?:(row:Record<string,unknown>)=>void){
  world??=new GroundWorld({id:'hub',radius:21.6,revision:0,objects:[],blueprints:{}});
  const physics=world,actors=avatarPair(),camera=new PerspectiveCamera(portrait?62:54,portrait?390/844:1.44,.08,2400);
  const counts:Record<string,number>={},firstFailures:Record<string,unknown>[]=[],lastFailures:Record<string,unknown>[]=[];
  let previous:View|undefined,previousFeet:Vector3|undefined,frames=0,violatingFrames=0,legacyTubeFailures=0,armOverQuarterFrames=0;
  let minDistance=Infinity,minCylinderClearance=Infinity,maxSpanX=0,maxSpanY=0,maxExtraTurn=0,maxPitchCorrection=0,maxAvoidanceYaw=0;
  for(const step of nearArmInputs(portrait)){
    const {input,sequence}=step,saved=JSON.stringify(input),view=rig.update({...input,probe:(a,b,r)=>physics.cameraDistance(a,b,r)});
    const intended=reference.update({...input,probe:(a,b)=>a.distanceTo(b)}),issues:{kind:string;value:number;limit:number}[]=[];
    const bad=(kind:string,value:number,limit:number)=>{counts[kind]=(counts[kind]??0)+1;issues.push({kind,value,limit});};
    if(JSON.stringify(input)!==saved)bad('mutated controls',1,0);
    const headingError=view.heading.distanceTo(intended.heading),pitchError=Math.abs(view.pitch-intended.pitch);
    if(headingError>1e-8)bad('control heading',headingError,1e-8);if(pitchError>1e-9)bad('control pitch',pitchError,1e-9);
    for(const v of [view.position,view.target,view.direction,view.up,view.heading])if(!v.toArray().every(Number.isFinite))bad('nonfinite pose',1,0);
    const anchor=input.feet.clone().addScaledVector(input.up,1.15),length=anchor.distanceTo(view.position),clearance=cylinderClearance(view.position,input.feet,input.up);
    minDistance=Math.min(minDistance,length);minCylinderClearance=Math.min(minCylinderClearance,clearance);
    if(length<UPPER_BODY_CONTRACT.minimumAnchorDistance-1e-7)bad('minimum observation distance',length,UPPER_BODY_CONTRACT.minimumAnchorDistance);
    if(clearance<UPPER_BODY_CONTRACT.cylinder.minimumClearance-1e-7)bad('camera too close to upper-body envelope',clearance,UPPER_BODY_CONTRACT.cylinder.minimumClearance);
    if(length>view.desiredDistance+UPPER_BODY_CONTRACT.maximumArmExcess)bad('arm exceeds nominal plus 0.25m',length-view.desiredDistance,UPPER_BODY_CONTRACT.maximumArmExcess);
    if(length>view.desiredDistance+.25+1e-7)armOverQuarterFrames++;
    const opticalGap=length-physics.cameraDistance(anchor,view.position,0),legacyTubeGap=length-physics.cameraDistance(anchor,view.position,.2);
    if(opticalGap>1e-7)bad('optical line blocked',opticalGap,1e-7);if(legacyTubeGap>1e-7)legacyTubeFailures++;
    const occupancy=cameraEyePenetration(physics,view.position,.2);if(occupancy.depth>1e-7)bad('camera sphere occupies geometry',occupancy.depth,1e-7);
    camera.position.copy(view.position);camera.up.copy(view.up);camera.lookAt(view.target);camera.updateMatrixWorld(true);
    const speed=previousFeet&&input.dt>0?previousFeet.distanceTo(input.feet)/input.dt:0;
    const projection=projectActors(actors,step,speed,camera,view),b=projection.bounds;
    maxSpanX=Math.max(maxSpanX,projection.spanX);maxSpanY=Math.max(maxSpanY,projection.spanY);
    if(b.minDepth<=Math.max(camera.near,UPPER_BODY_CONTRACT.minimumProjectionDepth))bad('upper-body observation depth',b.minDepth,Math.max(camera.near,UPPER_BODY_CONTRACT.minimumProjectionDepth));
    if(Math.max(Math.abs(b.minX),Math.abs(b.maxX))>.95+1e-7)bad('actual upper-body horizontal crop',Math.max(Math.abs(b.minX),Math.abs(b.maxX)),.95);
    if(Math.max(Math.abs(b.minY),Math.abs(b.maxY))>.95+1e-7)bad('actual upper-body vertical crop',Math.max(Math.abs(b.minY),Math.abs(b.maxY)),.95);
    if(b.minZ<=-1||b.maxZ>=1)bad('upper-body depth clip',Math.max(Math.abs(b.minZ),Math.abs(b.maxZ)),1);
    if(projection.spanX>.75+1e-7)bad('upper-body viewport width',projection.spanX,.75);
    if(projection.spanY>.75+1e-7)bad('upper-body viewport height',projection.spanY,.75);
    const nominalElevation=Math.asin(Math.max(-1,Math.min(1,intended.direction.dot(input.up)))),elevation=Math.asin(Math.max(-1,Math.min(1,view.direction.dot(input.up))));
    const pitchCorrection=Math.abs(elevation-nominalElevation);maxPitchCorrection=Math.max(maxPitchCorrection,pitchCorrection);
    if(pitchCorrection>.30+1e-7)bad('visual pitch correction',pitchCorrection,.30);
    if(nominalElevation<=0&&elevation>1e-7)bad('automatic look above horizon',elevation,0);
    let sweepGap=0,extraTurn=0;
    if(previous){
      sweepGap=previous.position.distanceTo(view.position)-physics.cameraDistance(previous.position,view.position,.2);
      if(sweepGap>1e-7)bad('camera sphere sweep blocked',sweepGap,1e-7);
      const transport=new Quaternion().setFromUnitVectors(previous.up,input.up),priorLook=previous.direction.clone().applyQuaternion(transport),priorHeading=previous.heading.clone().applyQuaternion(transport);
      extraTurn=Math.max(0,priorLook.angleTo(view.direction)-priorHeading.angleTo(view.heading)-Math.abs(previous.pitch-view.pitch));maxExtraTurn=Math.max(maxExtraTurn,extraTurn);
      if(extraTurn>3*input.dt+1e-6)bad('unrequested automatic 3D turn',extraTurn,3*input.dt+1e-6);
    }
    const visualHeading=view.direction.clone().projectOnPlane(input.up).normalize();
    const actualAvoidanceYaw=Math.atan2(input.up.dot(new Vector3().crossVectors(view.heading,visualHeading)),view.heading.dot(visualHeading));
    maxAvoidanceYaw=Math.max(maxAvoidanceYaw,Math.abs(actualAvoidanceYaw));
    if(Math.abs(actualAvoidanceYaw)>UPPER_BODY_CONTRACT.maximumAvoidanceYaw+1e-6)bad('actual visual yaw exceeds finite avoidance',Math.abs(actualAvoidanceYaw),UPPER_BODY_CONTRACT.maximumAvoidanceYaw);
    if(view.framingLimited)bad('reported framing limited',1,0);
    const row={sequence,time:step.time,frame:frames,eye:view.position.toArray(),feet:input.feet.toArray(),distance:length,desiredDistance:view.desiredDistance,
      cylinderClearance:clearance,projection,opticalGap,legacyTubeGap,occupancy,sweepGap,pitchCorrection,extraTurn,actualAvoidanceYaw,framingLimited:view.framingLimited,issues};
    if(issues.length){violatingFrames++;if(firstFailures.length<8)firstFailures.push(row);lastFailures.push(row);if(lastFailures.length>8)lastFailures.shift();}
    onFrame?.(row);previous=view;previousFeet=input.feet.clone();frames++;
  }
  return{portrait,frames,counts,violatingFrames,legacyTubeFailures,armOverQuarterFrames,minDistance,minCylinderClearance,maxSpanX,maxSpanY,maxExtraTurn,maxPitchCorrection,maxAvoidanceYaw,firstFailures,lastFailures,
    animationScope:'Actual production upper-body mesh vertices, both bare and carried parcel; animation reconstructed from public feet speed/time, not captured per-bone phase.'};
}
