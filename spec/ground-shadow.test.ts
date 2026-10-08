import {expect,it} from 'vitest';
import * as T from 'three';
import {configureGroundLighting,configureHomeLighting,fitGroundSunShadowDepth} from '../src/client/presentation.ts';
import {fieldOf} from '../src/shared/terrain.ts';
import {DISTRICT_ENVIRONMENT} from '../src/shared/district-layout.ts';
import {SPAWN} from '../src/shared/world.ts';
import type {Vec3} from '../src/shared/world.ts';
import {HOME_ROOM} from '../src/shared/home.ts';

it('keeps ground targets and nearby casters inside the existing shadow frustum without changing the key direction',()=>{
 const field=fieldOf(DISTRICT_ENVIRONMENT,21.6);
 for(const direction of [SPAWN,[0,1,0],[0,-1,0],[.3,.95,.1],[-.35,.9,.35],[1,0,0]] as Vec3[]){
  const radial=new T.Vector3(...direction).normalize(),dir=radial.toArray() as Vec3;
  const up=new T.Vector3(...field.normalAt(dir));
  const scene=new T.Scene(),fill=new T.AmbientLight(),sun=new T.DirectionalLight();scene.add(fill,sun,sun.target);
  configureGroundLighting('home',scene,fill,sun,21.6);
  // Use the real terrain surface as the target, not the planet centre.
  const target=radial.clone().multiplyScalar(10+field.heightAt(dir));sun.target.position.copy(target);
  sun.position.copy(target).addScaledVector(up,65).add(new T.Vector3(-55,0,45).projectOnPlane(up));
  const beforeDirection=sun.position.clone().sub(target).normalize(),near=sun.shadow.camera.near,far=sun.shadow.camera.far;
  fitGroundSunShadowDepth(sun);scene.updateMatrixWorld(true);sun.shadow.updateMatrices(sun);
  expect(sun.target.position.toArray()).toEqual(target.toArray());
  expect(sun.position.clone().sub(target).normalize().distanceTo(beforeDirection)).toBeLessThan(1e-12);
  expect([sun.shadow.camera.near,sun.shadow.camera.far]).toEqual([near,far]);
  expect(target.clone().project(sun.shadow.camera).length()).toBeLessThan(1e-12);
  const right=new T.Vector3(1,0,0).projectOnPlane(up).normalize();
  if(right.lengthSq()<.1)right.set(0,0,1).projectOnPlane(up).normalize();
  const forward=new T.Vector3().crossVectors(up,right);
  // A 22 m local neighbourhood and a 6 m tall building both remain in range.
  for(const x of [-11,11])for(const z of [-11,11])for(const y of [-1,6]){
   const point=target.clone().addScaledVector(right,x).addScaledVector(forward,z).addScaledVector(up,y).project(sun.shadow.camera);
   expect(Math.max(...point.toArray().map(Math.abs))).toBeLessThan(1);
  }
  sun.shadow.dispose();
 }
});

it('retains interior shadow coverage and reveals side-cast shadows under the existing room light budget',()=>{
 const scene=new T.Scene(),fill=new T.HemisphereLight(),sun=new T.DirectionalLight();scene.add(fill,sun,sun.target);
 configureHomeLighting(scene,fill,sun,HOME_ROOM.width,HOME_ROOM.depth,HOME_ROOM.height);scene.updateMatrixWorld(true);sun.shadow.updateMatrices(sun);
 const view=new T.Vector3(HOME_ROOM.width*.88,0,HOME_ROOM.depth*1.45).normalize(),key=sun.position.clone().setY(0).normalize();
 expect(view.angleTo(key)*180/Math.PI).toBeGreaterThan(30);
 for(const x of [-HOME_ROOM.width/2,HOME_ROOM.width/2])for(const y of [0,HOME_ROOM.height])for(const z of [-HOME_ROOM.depth/2,HOME_ROOM.depth/2]){
  const point=new T.Vector3(x,y,z).project(sun.shadow.camera);expect(Math.max(...point.toArray().map(Math.abs))).toBeLessThan(1);
 }
 expect(scene.children.filter(child=>child instanceof T.Light)).toHaveLength(2);
 expect(sun.shadow.mapSize.toArray()).toEqual([1024,1024]);sun.shadow.dispose();
});
