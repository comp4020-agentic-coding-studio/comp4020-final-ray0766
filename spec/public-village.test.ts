import {expect,it} from 'vitest';
import {Vector3,Quaternion} from 'three';
import {readFileSync} from 'node:fs';
import {PUBLIC_BLUEPRINTS,PUBLIC_HASHES,PUBLIC_FIELD,HUB_OBJECTS,HUB_LOTS,PUBLIC_WALKS} from '../src/shared/public-village.ts';
import {layoutErrors} from '../src/assets/claude-geometry/blueprint/model.ts';
import {blueprintHash,decodeBlueprint} from '../src/assets/claude-geometry/blueprint/codec.ts';
import {structureFit,MAX_STRUCTURES} from '../src/shared/blueprints.ts';
import {MAX_OBJECTS,placementProblem} from '../src/shared/planets.ts';
import {GroundWorld,FIXED_STEP,JUMP_FLAG,HUB_PHYSICS_VERSION,PHYSICS_VERSION} from '../src/shared/physics/world.ts';
import type {GroundPose} from '../src/shared/physics/world.ts';
import {localToDir,anchorQuaternion} from '../src/assets/claude-geometry/core/anchor.ts';
import type {Vec3} from '../src/shared/world.ts';
import {openStore} from '../src/server/store.ts';
const world=()=>new GroundWorld({id:'hub',radius:14,revision:0,objects:[]});
function walk(w:GroundWorld,p:GroundPose,target:Vec3){for(let i=0;i<1200;i++){const a=new Vector3(...p.position),b=new Vector3(...target),d=a.angleTo(b)*14;if(d<.025)return p;p=w.move(p,a.lerp(b,Math.min(1,.045/d)).normalize().toArray() as Vec3,FIXED_STEP);expect(w.blocked(p)).toBe(false);}throw Error('Unreachable public waypoint '+target);}
it('uses legal player blueprints, authentic content hashes, ordinary placement and unchanged capacity limits',async()=>{
 expect(HUB_LOTS.length).toBeLessThanOrEqual(MAX_STRUCTURES);expect(HUB_OBJECTS.length).toBeLessThanOrEqual(MAX_OBJECTS);
 for(const [i,b]of PUBLIC_BLUEPRINTS.entries()){expect(layoutErrors(b.parts)).toEqual([]);expect(await blueprintHash(b)).toBe(PUBLIC_HASHES[i]);const decoded=decodeBlueprint(readFileSync(`public/examples/village/${['garden','loft','port'][i]}.json`,'utf8'));expect(decoded.ok).toBe(true);if(decoded.ok)expect(decoded.value.parts).toEqual(b.parts);}
 for(const o of HUB_OBJECTS){expect(o.rotation).toBeGreaterThanOrEqual(0);expect(o.rotation).toBeLessThan(Math.PI*2);expect(placementProblem(o.kind,o.position,HUB_OBJECTS,o.id,o.radius,14)).toBeNull();}
 for(const l of HUB_LOTS)expect(structureFit(l.blueprint.parts,l.object.position,l.object.rotation,PUBLIC_FIELD).problem).toBeNull();
});
it('walks all delivery/boarding bearings through the central alley with shared colliders',()=>{
 const w=world();for(const road of PUBLIC_WALKS){let p=w.recover(w.pose(road[0]));for(const end of road.slice(1))p=walk(w,p,end);}
});
it('enters all sixteen rooms through real open-door parts and keeps ceiling jumps safe',()=>{
 const w=world();for(const {object:o,blueprint:b}of HUB_LOTS){const anchor={dir:o.position,yaw:o.rotation},fit=structureFit(b.parts,o.position,o.rotation,PUBLIC_FIELD),at=(x:number,z:number)=>localToDir(anchor,fit.baseRadius,[x,0,z]),q=new Quaternion().fromArray(anchorQuaternion(anchor)).invert();
  for(const x of [-2,1]){let p=w.recover(w.pose(at(0,2.6)));p=walk(w,p,at(0,1));p=walk(w,p,at(x,1));p=walk(w,p,at(x,-1));let high=p.radius;for(let i=0;i<100;i++){p=w.move(p,p.position,FIXED_STEP,i===0?JUMP_FLAG:0);expect(w.blocked(p)).toBe(false);high=Math.max(high,p.radius);}expect(p.grounded).toBe(true);expect(high-p.radius).toBeLessThan(.8);const local=new Vector3(...p.position).multiplyScalar(p.radius).addScaledVector(new Vector3(...o.position),-fit.baseRadius).applyQuaternion(q);expect(local.x).toBeCloseTo(x,1);p=walk(w,p,at(x,1));walk(w,p,at(0,2.6));}
 }
});
it('fences old public batches while leaving existing private ground rows and content unchanged',()=>{
 const s=openStore(':memory:');try{s.create('public',0);s.create('private',0);const garden=s.universe('private').planets.find(p=>p.kind==='garden')!;s.visit('private',garden.id);const privateBefore=s.db.prepare('SELECT * FROM ground_states WHERE player_id=?').get('private');s.db.prepare('UPDATE ground_states SET physics_version=? WHERE player_id=?').run(3,'public');const b=s.state('public');expect(b.ground!.physicsVersion).toBe(HUB_PHYSICS_VERSION);expect(()=>s.move('public',b.position,100,'hub',{sequence:b.ground!.sequence+1,physicsVersion:3,steps:[[...b.position,FIXED_STEP,0]]})).toThrow();s.state('private');expect(s.db.prepare('SELECT * FROM ground_states WHERE player_id=?').get('private')).toEqual(privateBefore);expect(s.db.prepare('PRAGMA user_version').get()!.user_version).toBe(15);}finally{s.close();}
});

it('upgrades a valid private v3 airborne save without changing position, height, velocity or jump latch',()=>{
 const s=openStore(':memory:');try{s.create('p',0);s.visit('p',s.universe('p').planets.find(p=>p.kind==='garden')!.id);s.state('p');s.db.exec("UPDATE ground_states SET physics_version=3,radius=radius+0.5,vertical_speed=2,grounded=0,jump_held=1 WHERE player_id='p'");const before=s.db.prepare("SELECT * FROM ground_states WHERE player_id='p'").get()!;s.state('p');const after=s.db.prepare("SELECT * FROM ground_states WHERE player_id='p'").get()!;for(const k of ['position','radius','vertical_speed','grounded','jump_held','scene_revision','planet_id'])expect(after[k]).toEqual(before[k]);expect(after.physics_version).toBe(PHYSICS_VERSION);expect(after.sequence).toBe(Number(before.sequence)+1);}finally{s.close();}
});
