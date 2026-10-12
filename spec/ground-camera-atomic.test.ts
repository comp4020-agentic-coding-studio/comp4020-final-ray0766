import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {PerspectiveCamera,Vector3} from 'three';
import {GroundCameraRig} from '../src/client/ground-camera.ts';
import {surfaceTangent} from '../src/client/terrain.ts';
import {GroundWorld} from '../src/shared/physics/world.ts';
import {cameraEyePenetration} from './ground-camera-safety.ts';

type ControlState=[number,number,number,number,number,number,number,number,number,number,number];
type Frame=[number,number,number];
type View=ReturnType<GroundCameraRig['update']>;
const capture=JSON.parse(readFileSync(new URL('./fixtures/ground-camera-backside-controls-r4.json',import.meta.url),'utf8')) as {
  sourceSha256:string;states:ControlState[];frames:Frame[];failureFrameSequences:number[][];
};
const world=new GroundWorld({id:'hub',radius:21.6,revision:0,objects:[],blueprints:{}});

function replay(portrait:boolean){
  const rig=new GroundCameraRig(),reference=new GroundCameraRig();
  const camera=new PerspectiveCamera(portrait?62:54,portrait?390/844:1440/1000,.08,2400);
  const failures:{seq:number;kind:string;value:number;limit:number}[]=[];
  const bad=(seq:number,kind:string,value:number,limit:number)=>failures.push({seq,kind,value,limit});
  let previous:View|undefined,previousTime=0,minDistance=Infinity,maxAutomaticTurn=0,automaticSweepFrames=0;
  let maxFeatureNdc=0,maxDirectionError=0,legacyTubeFailures=0;
  for(const [index,[seq,time,stateIndex]] of capture.frames.entries()){
    const s=capture.states[stateIndex],normal=new Vector3(s[0],s[1],s[2]);
    const input={feet:normal.clone().multiplyScalar(s[3]),up:new Vector3(s[8],s[9],s[10]),
      heading:surfaceTangent(normal,new Vector3(s[4],s[5],s[6])),pitch:s[7],portrait,radius:21.6,
      dt:index?Math.min((time-previousTime)/1000,.05):0};
    const saved=JSON.stringify(input);
    const view=rig.update({...input,probe:(a,b,r)=>world.cameraDistance(a,b,r)});
    const intended=reference.update({...input,probe:(a,b)=>a.distanceTo(b)});
    if(JSON.stringify(input)!==saved)bad(seq,'mutated input',1,0);
    const headingError=view.heading.distanceTo(intended.heading),pitchError=Math.abs(view.pitch-intended.pitch);
    if(headingError>1e-8)bad(seq,'control heading',headingError,1e-8);
    if(pitchError>1e-9)bad(seq,'control pitch',pitchError,1e-9);
    for(const vector of [view.position,view.direction,view.target,view.up,view.heading]){
      if(!vector.toArray().every(Number.isFinite))bad(seq,'nonfinite pose',1,0);
    }
    const aimError=view.target.clone().sub(view.position).normalize().distanceTo(view.direction);
    maxDirectionError=Math.max(maxDirectionError,aimError);
    if(aimError>1e-8)bad(seq,'final eye/target/direction disagree',aimError,1e-8);
    const anchor=input.feet.clone().addScaledVector(input.up,1.15);
    const anchorLength=anchor.distanceTo(view.position),clearance=world.cameraDistance(anchor,view.position,0);
    // The virtual boom requires optical LOS; the camera remains a .2m solid
    // sphere. Count the old thick-boom rejection separately, never as a pass.
    if(clearance<anchorLength-1e-7)bad(seq,'optical anchor line blocked',anchorLength-clearance,1e-7);
    if(world.cameraDistance(anchor,view.position,.2)<anchorLength-1e-7)legacyTubeFailures++;
    const occupancy=cameraEyePenetration(world,view.position,.2);
    if(occupancy.depth>1e-7)bad(seq,'camera sphere occupies geometry',occupancy.depth,1e-7);
    minDistance=Math.min(minDistance,anchorLength);
    camera.position.copy(view.position);camera.up.copy(view.up);camera.lookAt(view.target);camera.updateMatrixWorld(true);
    for(const height of [.95,1.45]){
      const point=input.feet.clone().addScaledVector(input.up,height),ndc=point.clone().project(camera);
      const depth=point.clone().sub(view.position).dot(view.direction);
      maxFeatureNdc=Math.max(maxFeatureNdc,Math.abs(ndc.x),Math.abs(ndc.y));
      if(depth<=.08)bad(seq,`feature ${height} behind near plane`,depth,.08);
      if(Math.abs(ndc.x)>=.95)bad(seq,`feature ${height} horizontal crop`,Math.abs(ndc.x),.95);
      if(Math.abs(ndc.y)>=.95)bad(seq,`feature ${height} vertical crop`,Math.abs(ndc.y),.95);
      if(Math.abs(ndc.z)>=1)bad(seq,`feature ${height} depth clip`,Math.abs(ndc.z),1);
    }
    if(previous){
      // The camera entity keeps its swept volume even though the optical
      // anchor line is no longer treated as a thick physical rod. Automatic
      // yaw budgets remain separate from deliberate control changes.
      const sweepLength=previous.position.distanceTo(view.position),safe=world.cameraDistance(previous.position,view.position,.2);
      if(safe<sweepLength-1e-7)bad(seq,'camera sphere sweep penetration',sweepLength-safe,1e-7);
      const automatic=Math.abs(previous.avoidanceYaw)>.002||Math.abs(view.avoidanceYaw)>.002
        ||previous.avoidanceTargetYaw!==0||view.avoidanceTargetYaw!==0;
      if(automatic){
        automaticSweepFrames++;
        const turn=previous.direction.angleTo(view.direction);
        const controlTurn=previous.heading.angleTo(view.heading)+previous.up.angleTo(view.up)+Math.abs(previous.pitch-view.pitch);
        const extraTurn=Math.max(0,turn-controlTurn),limit=4*input.dt+1e-6;
        maxAutomaticTurn=Math.max(maxAutomaticTurn,extraTurn);
        if(extraTurn>limit)bad(seq,'unrequested automatic turn',extraTurn,limit);
      }
    }
    previous=view;previousTime=time;
  }
  return{frames:capture.frames.length,firstSeq:capture.frames[0][0],lastSeq:capture.frames.at(-1)![0],
    minDistance,maxFeatureNdc,maxAutomaticTurn,maxDirectionError,automaticSweepFrames,legacyTubeFailures,
    final:{distance:previous!.distance,avoidanceYaw:previous!.avoidanceYaw,targetYaw:previous!.avoidanceTargetYaw,framingLimited:previous!.framingLimited},
    failureCount:failures.length,firstFailures:failures.slice(0,8),lastFailures:failures.slice(-8)};
}

describe('complete atomic backside approach and return',()=>{
  it('retains all 1799 consecutive public control frames and both observed failure transitions',()=>{
    expect(capture.sourceSha256).toBe('3e7d3e1f2492f49cfea86488b83dbd616f1af1309c0360d6aa75591add75f1ab');
    expect(capture.frames).toHaveLength(1799);expect(capture.failureFrameSequences).toEqual([[166,167],[1678,1679]]);
    for(let i=1;i<capture.frames.length;i++){
      expect(capture.frames[i][0]).toBe(capture.frames[i-1][0]+1);
      expect(capture.frames[i][1]).toBeGreaterThan(capture.frames[i-1][1]);
    }
  });
  // Portrait reuses the recorded desktop controls as a numerical projection
  // regression; it is not relabelled as a real touch-session capture.
  it.each([false,true])('keeps intermediate views safe/readable without automatic flips, portrait=%s',portrait=>{
    const result=replay(portrait);
    expect(result.automaticSweepFrames).toBeGreaterThan(100);
    expect(result.failureCount,JSON.stringify(result)).toBe(0);
  },30000);
});
