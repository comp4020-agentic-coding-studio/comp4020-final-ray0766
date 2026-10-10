import {expect,it} from 'vitest';
import {Vector3,Quaternion} from 'three';
import {randomUUID} from 'node:crypto';
import {GroundWorld,PHYSICS_VERSION,FIXED_STEP} from '../src/shared/physics/world.ts';
import type {GroundPose,MotionStep} from '../src/shared/physics/world.ts';
import {normalize} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {industrialCabin} from '../src/assets/claude-geometry/blueprint/samples.ts';
import {localToDir,anchorQuaternion} from '../src/assets/claude-geometry/core/anchor.ts';
import {structureFit,structureSize} from '../src/shared/blueprints.ts';
import {encodeBlueprint} from '../src/assets/claude-geometry/blueprint/codec.ts';
import {openStore} from '../src/server/store.ts';

function fixture(kind:'door'|'closed-door'|'stairs'='door'){
 const stairs=kind==='stairs',blueprint=industrialCabin();
 if(stairs)blueprint.parts=[...[1,2,3].map(z=>({n:z,part:'floor.deck' as const,x:1,z,level:0,rot:0 as const})),{n:4,part:'stair.straight',x:1,z:3,level:0,rot:0},{n:5,part:'structure.column',x:1,z:1,level:0,rot:2},{n:6,part:'floor.deck',x:1,z:1,level:1,rot:0}];
 if(kind==='closed-door')blueprint.parts=blueprint.parts.map(p=>({...p,part:p.part==='wall.door.open'?'wall.door':p.part}));
 const position=normalize([stairs?-.55:.55,1,.4]),rotation=stairs?0:Math.PI/2,anchor={dir:position,yaw:rotation},base=structureFit(blueprint.parts,position,rotation).baseRadius,inverse=new Quaternion().fromArray(anchorQuaternion(anchor)).invert();
 const object={id:'door',kind:'structure' as const,position,rotation,version:1,blueprintHash:'kit',...structureSize(blueprint.parts)};
 const world=new GroundWorld({id:'planet',revision:1,objects:[object],blueprints:{kit:blueprint.parts}});
 const at=(x:number,z:number,y=0)=>localToDir(anchor,base,[x,y,z]);
 const local=(p:GroundPose)=>new Vector3(...p.position).multiplyScalar(p.radius).addScaledVector(new Vector3(...position),-base).applyQuaternion(inverse);
 const [x,y,z]=stairs?[-.08,.2034572315974914,1.3112787721240373]:[-.6035958465613444,.0026608865571455254,.6240106527764611];
 const start=at(x,z,y),pose:GroundPose={position:start,radius:Math.hypot(base+y,x,z),verticalSpeed:0,grounded:true};
 function next(p:GroundPose,step:number){const a=new Vector3(...p.position),b=new Vector3(...at(stairs?0:-.58,stairs?-1.04:1.6,local(p).y)),distance=a.angleTo(b)*p.radius;return a.lerp(b,Math.min(1,step/Math.max(distance,.000001))).normalize().toArray() as Vec3;}
 return {blueprint,object,world,at,local,pose,next};
}
it('redirects a low-speed diagonal exit clear of the open leaf while stepping onto the threshold',()=>{
 const f=fixture();
 for(const step of [.012,.016,.020]){
  let pose=f.pose;const start=f.local(pose);expect(f.world.blocked(pose)).toBe(false);
  for(let i=0;i<150;i++){pose=f.world.move(pose,f.next(pose,step),FIXED_STEP);expect(f.world.blocked(pose)).toBe(false);}
  expect(f.local(pose).z-start.z).toBeGreaterThan(.9);expect(f.local(pose).z).toBeCloseTo(1.6,2);expect(pose.grounded).toBe(true);
 }
});
it('does not turn the bounded outward redirection into passage through a closed door',()=>{
 const f=fixture('closed-door');let pose=f.pose;
 for(let i=0;i<150;i++)pose=f.world.move(pose,f.next(pose,.016),FIXED_STEP);
 expect(f.local(pose).z).toBeLessThan(.85);expect(f.world.blocked(pose)).toBe(false);
});
it.each(['door','stairs'] as const)('replays the low-speed %s path on the server and preserves its authoritative saved height',kind=>{
 const f=fixture(kind),store=openStore(':memory:');try{
  store.create('owner',0);const planet=store.universe('owner').planets.find(p=>p.kind==='garden')!;store.claim('owner',planet.id);store.visit('owner',planet.id);
  const entry=store.saveBlueprint('owner',{document:JSON.parse(encodeBlueprint(f.blueprint)),expectedVersion:0});store.createObject('owner',{planetId:planet.id,objectId:randomUUID(),kind:'structure',blueprintHash:entry.hash,position:f.object.position,rotation:f.object.rotation});
  // Test-only in-memory setup. Production browser evidence uses real keys/touch.
  store.db.prepare('UPDATE players SET position=?,moved_at=0 WHERE id=?').run(JSON.stringify(f.pose.position),'owner');let state=store.state('owner'),pose:GroundPose={position:state.position,...state.ground!},time=0,batch:MotionStep[]=[];
  const flush=()=>{if(!batch.length)return;state=store.move('owner',batch.at(-1)!.slice(0,3) as Vec3,time,planet.id,{physicsVersion:PHYSICS_VERSION,sequence:state.ground!.sequence+1,steps:batch});expect(state.ground!.radius).toBeCloseTo(pose.radius,4);expect(new Vector3(...state.position).distanceTo(new Vector3(...pose.position))).toBeLessThan(.00001);batch=[];};
  for(let i=0;i<240;i++){pose=f.world.move(pose,f.next(pose,.016),FIXED_STEP);time+=FIXED_STEP*1000;batch.push([...pose.position.map(v=>Number(v.toFixed(7))),FIXED_STEP] as MotionStep);if(batch.length===20)flush();}flush();
  if(kind==='door')expect(f.local(pose).z).toBeGreaterThan(1.5);else expect(f.local(pose).y).toBeCloseTo(2.2,1);expect(state.ground!.grounded).toBe(true);
 }finally{store.close();}
});

it('slides off the existing stair rail corner at small steps without exceeding input distance or penetrating a solid',()=>{
 const f=fixture('stairs');
 for(const step of [.012,.025]){let pose=f.pose;expect(f.world.blocked(pose)).toBe(false);
  for(let i=0;i<400;i++){const old=pose;pose=f.world.move(pose,f.next(pose,step),FIXED_STEP);expect(f.world.blocked(pose)).toBe(false);expect(new Vector3(...old.position).angleTo(new Vector3(...pose.position))*old.radius).toBeLessThanOrEqual(step+.0001);}
  expect(f.local(pose).y).toBeCloseTo(2.2,1);expect(f.local(pose).z).toBeCloseTo(-1.04,2);
 }
});
