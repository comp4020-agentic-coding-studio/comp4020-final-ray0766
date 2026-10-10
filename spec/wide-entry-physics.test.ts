import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { anchorQuaternion, localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import { PART_COLLIDERS } from '../src/shared/physics/parts.ts';
import type { PartBox } from '../src/shared/physics/parts.ts';
import { GroundWorld, FIXED_STEP, STEP_HEIGHT } from '../src/shared/physics/world.ts';
import type { GroundPose } from '../src/shared/physics/world.ts';
import { layoutErrors, groundCells, footprintCells, partTransform, pivotOf } from '../src/shared/blueprint-model.ts';
import type { PartPlacement } from '../src/shared/blueprint-model.ts';
import { structureGroundFootprint } from '../src/shared/blueprint-ground-footprint.ts';
import { structureFit, structureSize } from '../src/shared/blueprints.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { townEntrancePoints } from '../src/shared/public-town-layout.ts';
import type { Vec3 } from '../src/shared/world.ts';

const parts:PartPlacement[]=[
 {n:1,part:'floor.deck',x:1,z:1,level:0,rot:0},{n:2,part:'floor.deck',x:2,z:1,level:0,rot:0},
 {n:3,part:'step.entry-wide',x:1,z:2,level:0,rot:0},{n:4,part:'wall.door-wide.open',x:1,z:1,level:0,rot:0},
];
const rotated=(turns:number)=>parts.map(p=>{let x=p.x,z=p.z;for(let n=0;n<turns;n++)[x,z]=[z,4-x];return{...p,x,z,rot:((p.rot+turns)%4) as PartPlacement['rot']};});
it('samples both step cells for ordinary terrain fit while retaining only the two real floor foundations',()=>{
 for(let rot=0;rot<4;rot++){
  const p=rotated(rot),pivot=pivotOf(p),step=p.find(v=>v.part==='step.entry-wide')!,t=partTransform(step,pivot),samples=structureGroundFootprint(p).samples;
  expect(layoutErrors(p)).toEqual([]);expect(footprintCells(p)).toHaveLength(4);expect(groundCells(p)).toHaveLength(2);
  for(const x of [0,1]){const expected=[t.position[0]+Math.cos(t.yaw)*x,t.position[2]-Math.sin(t.yaw)*x];expect(samples.some(s=>Math.hypot(s[0]-expected[0],s[1]-expected[1])<1e-8)).toBe(true);}
  const position:Vec3=[0,-1,0],object={id:'new-entry',kind:'structure' as const,position,rotation:.63,version:1,blueprintHash:'new-entry',...structureSize(p)};
  const world=new GroundWorld({id:'wide-entry-fit',radius:21.6,revision:0,objects:[object],blueprints:{'new-entry':p}});
  expect(structureFit(p,position,.63,fieldOf(null,21.6)).problem).toBeNull();
  expect(world.bodies[0].colliders.filter(c=>c.tag==='foundation')).toHaveLength(2);
  expect(world.bodies[0].colliders.filter(c=>c.tag==='wide entry tread'&&c.support)).toHaveLength(4);
 }
});

// Exposed-riser solver calibration: deliberately lifts this isolated fixture
// 0.6 m so all four steps are exercised. It is not a placed-town approval.
function exposed(radius:number,dir:Vec3,yaw:number){
 const world=new GroundWorld({id:'wide-entry-solver-calibration',radius,revision:0,objects:[]}),q=new Quaternion().fromArray(anchorQuaternion({dir,yaw})),base=radius+.6;
 const point=(x:number,y:number,z:number)=>new Vector3(x,y,z).applyQuaternion(q).addScaledVector(new Vector3(...dir),base);
 const at=(x:number,z:number)=>point(x,0,z).normalize().toArray() as Vec3;
 const shapes:PartBox[]=[...PART_COLLIDERS['step.entry-wide'](),{tag:'test back floor',center:[.5,-.08,-1],half:[1,.08,.5],support:true}];
 world.radius=()=>radius;
 world.bodies.push({objectId:'calibration',dir:new Vector3(...dir),broad:4,colliders:shapes.map(s=>({objectId:'calibration',center:point(...s.center),half:new Vector3(...s.half),q:q.clone(),inverse:q.clone().invert(),support:!!s.support,tag:s.tag}))});
 return{world,at};
}
it('walks all four continuous risers up and down across centre and diagonal approaches, including poles',()=>{
 for(const radius of [10,21.6])for(const dir of [[0,1,0],[0,-1,0]] as Vec3[])for(const yaw of [0,.73])for(const side of [-.3,0,.3]){
  const{world,at}=exposed(radius,dir,yaw),start=at(.5+side,.8),target=at(.5,-1.1);
  let pose:GroundPose={position:start,radius:world.radius(start),verticalSpeed:0,grounded:true,jumpHeld:false};const visited=new Set<string>();
  for(const end of [target,start]){
   let gap=Infinity;
   for(let n=0;n<180;n++){
    const from=new Vector3(...pose.position),goal=new Vector3(...end);gap=from.angleTo(goal)*radius;if(gap<.02)break;
    const old=pose,next=from.lerp(goal,Math.min(1,3*FIXED_STEP/gap)).normalize().toArray() as Vec3;
    pose=world.move(pose,next,FIXED_STEP);expect(world.blocked(pose)).toBe(false);expect(pose.radius-old.radius).toBeLessThanOrEqual(STEP_HEIGHT+.01);
    visited.add(world.support(pose.position,pose.radius+.01).tag);
   }
   expect(gap).toBeLessThan(.02);expect(pose.grounded).toBe(true);
  }
  expect(visited.has('wide entry tread')).toBe(true);expect(visited.has('test back floor')).toBe(true);
 }
 expect(PART_COLLIDERS['step.entry']().filter(c=>!c.support)).toHaveLength(8);
 expect(PART_COLLIDERS['step.entry-wide']().every(c=>c.support)).toBe(true);
});

it('extracts one approach at the physical centre of a wide step for all four grid rotations',()=>{
 for(let rot=0;rot<4;rot++){
  const p=rotated(rot),position:Vec3=[0,-1,0],rotation=.73,base=structureFit(p,position,rotation,fieldOf(null,21.6)).baseRadius,t=partTransform(p[2],pivotOf(p));
  const object={id:'new-entry',kind:'structure' as const,position,rotation,version:1,blueprintHash:'new-entry',...structureSize(p)};
  const entries=townEntrancePoints({radius:21.6,environment:'',objects:[object],blueprints:{'new-entry':p}});
  const expected=localToDir({dir:position,yaw:rotation},base,[t.position[0]+Math.cos(t.yaw)*.5+Math.sin(t.yaw)*1.06,0,t.position[2]-Math.sin(t.yaw)*.5+Math.cos(t.yaw)*1.06]);
  expect(entries).toHaveLength(1);expect(new Vector3(...entries[0].point).distanceTo(new Vector3(...expected))).toBeLessThan(1e-12);
 }
});
