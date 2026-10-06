import { presenceStore } from '../src/server/presence.ts';
import { openStore } from '../src/server/store.ts';
import { encodeBlueprint } from '../src/assets/claude-geometry/blueprint/codec.ts';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MotionStep } from '../src/shared/physics/world.ts';
import { expect,it } from 'vitest';
import { Vector3,Quaternion } from 'three';
import { GroundWorld,groundPose,FIXED_STEP,terrainRadius } from '../src/shared/physics/world.ts';
import type { GroundPose } from '../src/shared/physics/world.ts';
import { industrialCabin } from '../src/assets/claude-geometry/blueprint/samples.ts';
import { anchorQuaternion,localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import { structureFit,structureSize } from '../src/shared/blueprints.ts';
import { normalize } from '../src/shared/world.ts';
import type { Vec3 } from '../src/shared/world.ts';
import type { Blueprint,PartPlacement } from '../src/assets/claude-geometry/blueprint/model.ts';

export function stairParts():PartPlacement[]{const parts:Omit<PartPlacement,'n'>[]=[
  ...[1,2,3].map(z=>({part:'floor.deck' as const,x:1,z,level:0,rot:0 as const})),
  {part:'stair.straight',x:1,z:3,level:0,rot:0},
  {part:'structure.column',x:1,z:1,level:0,rot:2},
  {part:'floor.deck',x:1,z:1,level:1,rot:0},
];return parts.map((p,i)=>({...p,n:i+1}));}
function fixture(parts=industrialCabin().parts,dir:Vec3=normalize([.55,1,.4]),yaw=0){
  const anchor={dir,yaw},base=structureFit(parts,dir,yaw).baseRadius;
  const inverse=new Quaternion().fromArray(anchorQuaternion(anchor)).invert();
  const world=new GroundWorld({id:'p',revision:1,blueprints:{kit:parts},objects:[{id:'o',kind:'structure',position:dir,rotation:yaw,version:1,blueprintHash:'kit',...structureSize(parts)}]});
  const at=(x:number,z:number,y=0)=>localToDir(anchor,base,[x,y,z]);
  const local=(pose:GroundPose)=>new Vector3(...pose.position).multiplyScalar(pose.radius).addScaledVector(new Vector3(...dir),-base).applyQuaternion(inverse);
  function walk(pose:GroundPose,x:number,z:number,seconds=2,onStep?:(pose:GroundPose)=>void){
    for(let i=0;i<seconds/FIXED_STEP;i++){
      const here=local(pose),target=at(x,z,here.y),a=new Vector3(...pose.position),b=new Vector3(...target),d=a.angleTo(b)*pose.radius;
      const next=a.lerp(b,Math.min(1,2.5*FIXED_STEP/Math.max(.00001,d))).normalize().toArray() as Vec3;
      pose=world.move(pose,next,FIXED_STEP);onStep?.(pose);
    }return pose;
  }
  return {world,at,local,walk};
}
it('enters and exits an open door, slides along solid walls; a closed leaf blocks passage',()=>{
  const f=fixture();let p=groundPose(f.at(-.45,1.6));p=f.walk(p,-.45,-.3);expect(f.local(p).z).toBeLessThan(.1);expect(p.grounded).toBe(true);
  p=f.walk(p,.6,-.4);p=f.walk(p,1.5,.3);expect(f.local(p).x).toBeLessThan(.8);expect(f.local(p).z).toBeGreaterThan(-.2);
  p=f.walk(p,-.4,0);p=f.walk(p,-.45,1.8);expect(f.local(p).z).toBeGreaterThan(1.4);
  const closed=fixture(industrialCabin().parts.map(p=>({...p,part:p.part==='wall.door.open'?'wall.door':p.part})));const c=closed.walk(groundPose(closed.at(-.45,1.6)),-.45,-.3);expect(closed.local(c).z).toBeGreaterThan(1);
});
it('climbs eleven bounded risers, stays on the upper floor, descends and falls from an unguarded edge',()=>{
  const f=fixture(stairParts());let p=groundPose(f.at(0,1.8));p=f.walk(p,0,-1.05,4);expect(f.local(p).y).toBeCloseTo(2.2,1);expect(f.local(p).z).toBeLessThan(-.7);expect(p.grounded).toBe(true);
  for(let i=0;i<120;i++)p=f.world.move(p,p.position,FIXED_STEP);expect(f.local(p).y).toBeCloseTo(2.2,1);
  p=f.walk(p,0,1.8,4);expect(f.local(p).y).toBeLessThan(.2);expect(p.grounded).toBe(true);
  p=f.walk(p,0,-1.05,4);p=f.walk(p,.9,-1.05,.4);expect(p.radius-terrainRadius(p.position)).toBeGreaterThan(.1);expect(p.grounded).toBe(false);
  for(let i=0;i<120;i++)p=f.world.move(p,p.position,FIXED_STEP);expect(p.radius).toBeCloseTo(terrainRadius(p.position),4);expect(p.grounded).toBe(true);
});
it('keeps door traversal stable after rotation at both sphere poles; clips camera ceilings',()=>{
  for(const dir of [[0,1,0],[0,-1,0]] as Vec3[]){const f=fixture(undefined,dir,1.7);const p=f.walk(groundPose(f.at(-.45,1.6)),-.45,0);expect(f.local(p).z).toBeLessThan(.2);expect(f.world.blocked(p)).toBe(false);
    const start=new Vector3(...p.position).multiplyScalar(p.radius+1.35),end=start.clone().addScaledVector(new Vector3(...p.position),4);expect(f.world.cameraDistance(start,end)).toBeLessThan(1);
  }
});
it('recovers after support removal and a moved wall without placing a character inside geometry',()=>{
  const f=fixture(stairParts());let p=f.walk(groundPose(f.at(0,1.8)),0,-1.05,4);
  const empty=new GroundWorld({id:'p',revision:2,objects:[]});p=empty.recover(p);expect(p.grounded).toBe(false);for(let i=0;i<120;i++)p=empty.move(p,p.position,FIXED_STEP);expect(p.grounded).toBe(true);
  const cabin=fixture();const trapped=groundPose(cabin.at(1,0));const recovered=cabin.world.recover(trapped);expect(cabin.world.blocked(recovered)).toBe(false);
});

it('server replays bounded paths, persists upper-floor height, fences retries, time, speed and forged fields',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ground-state-')),path=join(dir,'world.sqlite');let s=openStore(path);
  try{
    s.create('owner',0);s.create('visitor',0);const p=s.universe('owner').planets.find(p=>p.kind==='garden')!;s.claim('owner',p.id);s.visit('owner',p.id);
    const bp={...industrialCabin(),id:randomUUID() as Blueprint['id'],name:'Physics stair fixture',parts:stairParts()};
    const entry=s.saveBlueprint('owner',{document:JSON.parse(encodeBlueprint(bp)),expectedVersion:0});
    const anchor=normalize([.55,1,.4]),objectId=randomUUID();s.createObject('owner',{planetId:p.id,objectId,kind:'structure',blueprintHash:entry.hash,position:anchor,rotation:0});
    const f=fixture(bp.parts),start=f.at(0,1.8);s.db.prepare('UPDATE players SET position=?,moved_at=0 WHERE id=?').run(JSON.stringify(start),'owner');let state=s.state('owner'),time=0;
    let batch:MotionStep[]=[];let previous:Parameters<typeof s.move>|undefined;
    function flush(){if(!batch.length)return;const target=batch.at(-1)!.slice(0,3) as Vec3;const motion={sequence:state.ground!.sequence+1,steps:batch};previous=['owner',target,time,p.id,motion];state=s.move(...previous);batch=[];}
    const top=f.walk(groundPose(start),0,-1.05,4,pose=>{time+=FIXED_STEP*1000;batch.push([...pose.position.map(n=>Number(n.toFixed(7))),FIXED_STEP] as MotionStep);if(batch.length===20)flush();});flush();
    expect(state.ground!.radius).toBeCloseTo(top.radius,4);expect(state.ground!.grounded).toBe(true);expect(s.move(...previous!)).toEqual(state);
    const seq=state.ground!.sequence;expect(()=>s.move('owner',state.position,time,p.id,{sequence:seq,steps:[[...state.position,FIXED_STEP]]})).toThrow('newer');
    expect(()=>s.move('owner',state.position,time,p.id,{sequence:seq+1,radius:18,steps:[[...state.position,FIXED_STEP]]})).toThrow('Invalid');
    expect(()=>s.move('owner',state.position,time,p.id,{sequence:seq+1,steps:Array.from({length:28},()=>[...state.position,.05])})).toThrow('server time');
    expect(()=>s.move('owner',normalize([1,0,0]),time+1000,p.id,{sequence:seq+1,steps:[[1,0,0,.05]]})).toThrow('speed');
    s.close();s=openStore(path);expect(s.state('owner')).toEqual(state);
    s.visit('visitor',p.id);const presence=presenceStore(s.state);const face=(id:string)=>new Vector3(0,0,-1).projectOnPlane(new Vector3(...s.state(id).position)).normalize().toArray();presence.heartbeat('owner',{planetId:p.id,facing:face('owner')},time);const seen=presence.heartbeat('visitor',{planetId:p.id,facing:face('visitor')},time);expect(seen.visitors[0].radius).toBe(state.ground!.radius);expect(seen.visitors[0].id).not.toBe('owner');
    expect(()=>s.removeObject('visitor',{planetId:p.id,objectId,expectedVersion:1})).toThrow('Only');
    s.removeObject('owner',{planetId:p.id,objectId,expectedVersion:1});expect(s.state('owner').ground!.grounded).toBe(false);
  }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
it('server rejects a swept path through a wall even when its endpoint is within the time budget',()=>{
  const s=openStore(':memory:');try{
    s.create('owner',0);const p=s.universe('owner').planets.find(p=>p.kind==='garden')!;s.claim('owner',p.id);s.visit('owner',p.id);
    const bp=industrialCabin(),entry=s.saveBlueprint('owner',{document:JSON.parse(encodeBlueprint(bp)),expectedVersion:0}),anchor=normalize([.55,1,.4]);
    s.createObject('owner',{planetId:p.id,objectId:randomUUID(),kind:'structure',blueprintHash:entry.hash,position:anchor,rotation:0});const f=fixture();
    const start=f.at(.5,1.7);s.db.prepare('UPDATE players SET position=?,moved_at=0 WHERE id=?').run(JSON.stringify(start),'owner');s.state('owner');
    expect(()=>s.move('owner',f.at(.5,0),1000,p.id)).toThrow('wall');expect(s.state('owner').position).toEqual(start);
  }finally{s.close();}
});
