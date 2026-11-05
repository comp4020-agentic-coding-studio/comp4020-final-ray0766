// @vitest-environment jsdom
import {expect,it} from 'vitest';
import * as T from 'three';
import {PhotoMode} from '../src/client/photo-mode.ts';

it('keeps fixed indoor photos at their existing angle while outdoor photos can orbit',()=>{
  const mode=Object.create(PhotoMode.prototype),camera=new T.OrthographicCamera(-5,5,5,-5,.1,100);
  camera.position.set(5,7,9);camera.lookAt(0,0,0);
  const start=camera.position.clone(),rotation=camera.quaternion.clone();
  Object.assign(mode,{current:{camera,target:new T.Vector3(),fixedAngle:true},basePosition:start.clone(),zoom:1});
  mode.orbit(.5,.2);expect(camera.position.equals(start)).toBe(true);expect(camera.quaternion.equals(rotation)).toBe(true);
  mode.current.fixedAngle=false;mode.orbit(.5,.2);expect(camera.position.distanceTo(start)).toBeGreaterThan(1);
});
