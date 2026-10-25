import {expect,it} from 'vitest';
import {Vector3,Quaternion} from 'three';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GroundWorld,FIXED_STEP,JUMP_FLAG,SPRINT_FLAG,HUB_PHYSICS_VERSION} from '../src/shared/physics/world.ts';
import type {GroundPose,MotionStep} from '../src/shared/physics/world.ts';
import {normalize,SPAWN,SPEED,SPRINT_SPEED} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {SurfaceWalker} from '../src/client/motion.ts';
import {openStore} from '../src/server/store.ts';
import {presenceStore} from '../src/server/presence.ts';
import {industrialCabin} from '../src/assets/claude-geometry/blueprint/samples.ts';
import type {PartPlacement} from '../src/shared/blueprint-model.ts';
import {structureFit,structureSize} from '../src/shared/blueprints.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import {anchorQuaternion,localToDir} from '../src/assets/claude-geometry/core/anchor.ts';

function building(parts:PartPlacement[],radius=12,dir:Vec3=normalize([.55,1,.4])){
 const yaw=.73,anchor={dir,yaw},base=structureFit(parts,dir,yaw,fieldOf(null,radius)).baseRadius;
 const inverse=new Quaternion().fromArray(anchorQuaternion(anchor)).invert();
 const world=new GroundWorld({id:'garden',radius,revision:1,blueprints:{kit:parts},objects:[{id:'b',kind:'structure',position:dir,rotation:yaw,version:1,blueprintHash:'kit',...structureSize(parts)}]});
 const at=(x:number,z:number,y=0)=>localToDir(anchor,base,[x,y,z]);
 const local=(p:GroundPose)=>new Vector3(...p.position).multiplyScalar(p.radius).addScaledVector(new Vector3(...dir),-base).applyQuaternion(inverse);
 function walk(p:GroundPose,x:number,z:number,seconds:number,jump=false){for(let i=0;i<seconds/FIXED_STEP;i++){
  const a=new Vector3(...p.position),b=new Vector3(...at(x,z,local(p).y)),d=a.angleTo(b)*p.radius;
  const next=a.lerp(b,Math.min(1,2.5*FIXED_STEP/Math.max(.00001,d))).normalize().toArray() as Vec3;
  p=world.move(p,next,FIXED_STEP,jump&&i===0?JUMP_FLAG:0);expect(world.blocked(p)).toBe(false);
 }return p;}
 return {world,at,local,walk};
}
it('ignores legacy jump presses and held flags at both poles on every radius',()=>{
 for(const radius of [10,11,12,14])for(const position of [[0,1,0],[0,-1,0]] as Vec3[]){
  const w=new GroundWorld({id:radius===14?'hub':'garden',radius,revision:0,objects:[]});let p=w.recover(w.pose(position));const base=p.radius;
  for(let i=0;i<180;i++){p=w.move(p,p.position,FIXED_STEP,i%3?JUMP_FLAG:0);expect(p.radius).toBeCloseTo(base,8);expect(p.grounded).toBe(true);expect(p.verticalSpeed).toBe(0);expect(p.jumpHeld).toBe(false);expect(w.blocked(p)).toBe(false);}
 }
});
it('cannot launch under rotated ceilings at either pole',()=>{
 for(const dir of [[0,1,0],[0,-1,0]] as Vec3[]){const f=building(industrialCabin().parts,12,dir);let p=f.world.recover(f.world.pose(f.at(-.45,0)));const base=p.radius;let max=base;
  for(let i=0;i<100;i++){p=f.world.move(p,p.position,FIXED_STEP,i===0?JUMP_FLAG:0);max=Math.max(max,p.radius);expect(f.world.blocked(p)).toBe(false);}
  expect(max-base).toBeCloseTo(0,7);expect(p.grounded).toBe(true);expect(p.radius).toBeCloseTo(base,6);
 }
});
it('ignores jump while retaining solid walls, stair access and roof walking',()=>{
 const cabin=building(industrialCabin().parts);let p=cabin.world.recover(cabin.world.pose(cabin.at(.4,0)));p=cabin.walk(p,1.8,0,2,true);expect(cabin.local(p).x).toBeLessThan(.85);
 const parts:PartPlacement[]=[...[1,2,3].map((z,i)=>({part:'floor.deck' as const,x:1,z,level:0,rot:0 as const,n:i+1})),{part:'stair.straight',x:1,z:3,level:0,rot:0,n:4},{part:'structure.column',x:1,z:1,level:0,rot:2,n:5},{part:'roof.deck',x:1,z:1,level:1,rot:0,n:6}];
 const f=building(parts);p=f.walk(f.world.pose(f.at(0,1.8)),0,-1.05,4);expect(f.local(p).y).toBeCloseTo(2.2,1);const roof=p.radius;
 let apex=roof;for(let i=0;i<100;i++){p=f.world.move(p,p.position,FIXED_STEP,i===0?JUMP_FLAG:0);apex=Math.max(apex,p.radius);expect(f.world.blocked(p)).toBe(false);}
 expect(apex-roof).toBeCloseTo(0,7);expect(p.radius).toBeCloseTo(roof,6);expect(p.grounded).toBe(true);
 p=f.walk(p,0,1.8,4);expect(f.local(p).y).toBeLessThan(.2);
});
it('keeps sprint in the tangent plane, caps diagonal speed and returns to the walk limit on release',()=>{
 const w=new SurfaceWalker([0,1,0]);for(let i=0;i<2400;i++){w.step(1,1,FIXED_STEP,SPRINT_SPEED/SPEED);expect(w.velocity.length()).toBeLessThanOrEqual(SPRINT_SPEED+1e-9);expect(w.up.dot(w.north)).toBeCloseTo(0,9);}
 expect(w.velocity.length()).toBeCloseTo(SPRINT_SPEED,6);w.step(0,1,FIXED_STEP);expect(w.velocity.length()).toBeLessThanOrEqual(SPEED+1e-9);
});
it('rejects jump wire flags and old models, while persisting authoritative walking/sprint state',()=>{
 const folder=mkdtempSync(join(tmpdir(),'walk-save-')),path=join(folder,'save.sqlite');let s=openStore(path);
 try{
  s.create('a',0);s.create('b',0);let state=s.state('a');const w=new GroundWorld(s.universe('a').currentPlanet);let p:GroundPose={position:state.position,...state.ground!};
  const target=new Vector3(...p.position).applyAxisAngle(new Vector3(1,0,0),4*FIXED_STEP/p.radius).toArray() as Vec3;
  expect(()=>s.move('a',target,100,'hub',{physicsVersion:HUB_PHYSICS_VERSION,sequence:state.ground!.sequence+1,steps:[[...target,FIXED_STEP,0]]})).toThrow('speed');
  p=w.move(p,target,FIXED_STEP,SPRINT_FLAG);const motion={physicsVersion:HUB_PHYSICS_VERSION,sequence:state.ground!.sequence+1,steps:[[...p.position,FIXED_STEP,SPRINT_FLAG]] as MotionStep[]};state=s.move('a',p.position,100,'hub',motion);
  expect(s.move('a',p.position,100,'hub',motion)).toEqual(state);
  for(const flags of [-1,2,3,4,1.2,null,'jump'])expect(()=>s.move('a',p.position,150,'hub',{physicsVersion:HUB_PHYSICS_VERSION,sequence:state.ground!.sequence+1,steps:[[...p.position,FIXED_STEP,flags]]})).toThrow('Invalid');
  expect(()=>s.move('a',p.position,150,'hub',{physicsVersion:HUB_PHYSICS_VERSION-1,sequence:state.ground!.sequence+1,steps:[[...p.position,FIXED_STEP,JUMP_FLAG]]})).toThrow('Reload');
  expect(state.ground).toMatchObject({verticalSpeed:0,grounded:true,jumpHeld:false});s.close();s=openStore(path);expect(s.state('a')).toEqual(state);
  const presence=presenceStore(s.state),facing=normalize([0,SPAWN[2],-SPAWN[1]]);presence.heartbeat('a',{planetId:'hub',facing},100);expect(presence.heartbeat('b',{planetId:'hub',facing},100).visitors[0]).toMatchObject({radius:state.ground!.radius,grounded:true});
 }finally{s.close();rmSync(folder,{recursive:true,force:true});}
});
it('backs up schema11 and preserves old stored columns before lazy physics recovery',()=>{
 const folder=mkdtempSync(join(tmpdir(),'jump-migration-')),path=join(folder,'save.sqlite');let s=openStore(path);
 try{
  s.create('a',0);s.character('a','fern');s.db.exec('UPDATE ground_states SET physics_version=2;ALTER TABLE ground_states DROP COLUMN jump_held;PRAGMA user_version=11');
  const old=s.db.prepare('SELECT * FROM ground_states').get()!,player=s.db.prepare('SELECT * FROM players').get();s.close();s=openStore(path);
  expect(s.migrationBackup).toContain('.v11-');const raw=s.db.prepare('SELECT * FROM ground_states').get()!;expect(raw).toEqual({...old,jump_held:0});expect(s.db.prepare('SELECT * FROM players').get()).toEqual(player);
  const state=s.state('a');expect(state.character).toBe('fern');expect(state.position).toEqual(SPAWN);expect(state.ground).toMatchObject({physicsVersion:HUB_PHYSICS_VERSION,jumpHeld:false,grounded:true});
  expect(s.db.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');
 }finally{s.close();rmSync(folder,{recursive:true,force:true});}
});
