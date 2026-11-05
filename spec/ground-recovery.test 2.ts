import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {openStore} from '../src/server/store.ts';
import {GroundWorld,FIXED_STEP,physicsVersionFor} from '../src/shared/physics/world.ts';
import {portPoint} from '../src/shared/ports.ts';
import {distance} from '../src/shared/world.ts';

it('retains a high legacy position on read, falls naturally, and explicitly returns only that character to safe ground',()=>{
 const s=openStore(':memory:');try{
  s.create('a',0);s.create('b',0);s.character('a','fern');let before=s.state('a');const other=s.state('b'),worlds=s.universe('a').planets;
  s.db.prepare('UPDATE ground_states SET radius=radius+4,vertical_speed=3,grounded=0,jump_held=1,physics_version=? WHERE player_id=?').run(physicsVersionFor('hub')-1,'a');
  const legacy=s.state('a');expect(legacy.position).toEqual(before.position);expect(legacy.ground!.radius).toBeGreaterThan(before.ground!.radius+3.9);expect(legacy.ground).toMatchObject({grounded:false,verticalSpeed:0,jumpHeld:false});
  before=s.move('a',legacy.position,100,'hub',{physicsVersion:physicsVersionFor('hub'),sequence:legacy.ground!.sequence+1,steps:[[...legacy.position,FIXED_STEP]]});expect(before.ground!.radius).toBeLessThan(legacy.ground!.radius);expect(before.ground!.grounded).toBe(false);
  const result=s.recoverGround('a',{planetId:'hub',sequence:before.ground!.sequence},200),p=result.player;
  expect(p.ground).toMatchObject({grounded:true,verticalSpeed:0,jumpHeld:false});expect(distance(p.position,portPoint('hub'),p.worldRadius)).toBeLessThan(3.1);expect(p.character).toBe('fern');expect(p.quest).toBe(before.quest);expect(s.state('b')).toEqual(other);expect(result.planets).toEqual(worlds);
  const w=new GroundWorld(result.currentPlanet);expect(w.blocked({position:p.position,...p.ground!})).toBe(false);
  expect(()=>s.recoverGround('a',{planetId:'hub',sequence:before.ground!.sequence},210)).toThrow('saved position changed');
  expect(()=>s.move('a',p.position,220,'hub',{physicsVersion:physicsVersionFor('hub'),sequence:before.ground!.sequence+1,steps:[[...p.position,FIXED_STEP]]})).toThrow('newer ground');
 }finally{s.close();}
});
it('fences recovery by exterior visit, planet and sequence; refuses coordinates, another identity and flight',()=>{
 const s=openStore(':memory:',{integratedWorld:true});try{
  s.create('a',0);let p=s.state('a');const body=()=>({planetId:p.planetId,visitEpoch:p.location!.visitEpoch,sequence:p.ground!.sequence});
  expect(()=>s.recoverGround('a',{...body(),position:portPoint('hub')})).toThrow('Unexpected');
  expect(()=>s.recoverGround('a',{...body(),playerId:'b'})).toThrow('Unexpected');
  expect(()=>s.recoverGround('a',{...body(),planetId:'other'})).toThrow('another planet');
  expect(()=>s.recoverGround('a',{...body(),visitEpoch:p.location!.visitEpoch+1})).toThrow();
  const oldBody=body();p=s.recoverGround('a',oldBody,100).player;expect(p.location!.visitEpoch).toBeGreaterThan(oldBody.visitEpoch);expect(()=>s.recoverGround('a',oldBody)).toThrow();
  s.startTrip('a',{requestId:randomUUID(),targetId:s.universe('a').planets.find(v=>v.id!==p.planetId)!.id,journey:p.flight.journey,visitEpoch:p.location!.visitEpoch});
  expect(()=>s.recoverGround('a',{planetId:p.planetId,sequence:0,visitEpoch:s.state('a').location!.visitEpoch})).toThrow('Land');
 }finally{s.close();}
});

it('does not silently relocate an overlapping legacy pose during the walking-only upgrade',()=>{
 const s=openStore(':memory:');try{
  s.create('a',0);const before=s.state('a'),w=new GroundWorld(s.universe('a').currentPlanet);
  const collider=w.bodies.flatMap(b=>b.colliders).find(c=>!c.support)!;
  const p=collider.center.clone().normalize().toArray() as [number,number,number],radius=collider.center.length()-.8;
  expect(w.blocked({position:p,radius,grounded:true,verticalSpeed:0})).toBe(true);
  s.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(p),'a');
  s.db.prepare('UPDATE ground_states SET position=?,radius=?,grounded=1,physics_version=? WHERE player_id=?').run(JSON.stringify(p),radius,physicsVersionFor('hub')-1,'a');
  const loaded=s.state('a');expect(loaded.position).toEqual(p);expect(loaded.ground!.radius).toBe(radius);expect(loaded.character).toBe(before.character);
  const recovered=s.recoverGround('a',{planetId:'hub',sequence:loaded.ground!.sequence}).player;
  expect(w.blocked({position:recovered.position,...recovered.ground!})).toBe(false);expect(recovered.ground!.grounded).toBe(true);
 }finally{s.close();}
});
