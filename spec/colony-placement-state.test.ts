// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {Group,Vector3} from 'three';
import {Colony} from '../src/client/colony.ts';
import {setGroundWorld} from '../src/client/terrain.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import {normalize,RADIUS,type Vec3} from '../src/shared/world.ts';
import type {PlanetView} from '../src/shared/planets.ts';

afterEach(()=>setGroundWorld(true));
it('places incoming legacy props against their own planet while the old surface remains displayed',()=>{
  const position=normalize([.4,1,.6]),planet={kind:'garden',radius:12,environment:null} as PlanetView;
  const colony=Object.assign(Object.create(Colony.prototype),{universe:{currentPlanet:planet}}) as {locate(group:Group,position:Vec3,rotation:number):void};
  const group=new Group();
  setGroundWorld(true,null,21.6);colony.locate(group,position,.7);
  const expected=RADIUS+fieldOf(null,12).heightAt(position)+.015;
  expect(group.position.length()).toBeCloseTo(expected,10);
  expect(new Vector3(0,1,0).applyQuaternion(group.quaternion).distanceTo(new Vector3(...position))).toBeLessThan(1e-10);
  // Completing or replacing the visible surface cannot change this accepted
  // object's intended transform, including its yaw and old point-height seat.
  const before=group.matrix.compose(group.position,group.quaternion,group.scale).clone();
  setGroundWorld(false,null,10);colony.locate(group,position,.7);
  expect(group.matrix.compose(group.position,group.quaternion,group.scale).elements).toEqual(before.elements);
  planet.kind='hub';planet.radius=14;colony.locate(group,position,0);
  expect(group.position.length()).toBeCloseTo(14.015,10);
});
