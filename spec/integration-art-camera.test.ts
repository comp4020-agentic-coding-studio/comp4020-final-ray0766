import {expect,it} from 'vitest';
import * as T from 'three';
import {HomeInterior,fitHomeCamera} from '../src/client/home-interior.ts';
import {HOME_ROOM} from '../src/shared/home.ts';

it.each([[2048,1440],[1440,2048],[4096,2160]])('returns an independent complete-room photo camera at %i × %i without altering the walking view',(width,height)=>{
 const camera=new T.OrthographicCamera(-1,1,1,-1,.05,100),scene=new T.Scene();
 fitHomeCamera(camera,HOME_ROOM.width,HOME_ROOM.depth,HOME_ROOM.height,390/844,true);camera.zoom=1.65;camera.updateProjectionMatrix();
 const before=camera.toJSON(),view=Object.assign(Object.create(HomeInterior.prototype),{camera,scene,home:null,cameraOffset:new T.Vector3()}) as HomeInterior;
 const photo=view.getPhotoView(width,height);
 expect(photo.camera).not.toBe(camera);expect(photo.scene).toBe(scene);expect(camera.toJSON()).toEqual(before);
 for(const x of [-HOME_ROOM.width/2,HOME_ROOM.width/2])for(const y of [0,HOME_ROOM.height])for(const z of [-HOME_ROOM.depth/2,HOME_ROOM.depth/2]){
  const point=new T.Vector3(x,y,z).project(photo.camera);expect(Math.abs(point.x)).toBeLessThan(.95);expect(Math.abs(point.y)).toBeLessThan(.95);
 }
 photo.camera.position.multiplyScalar(1.2);photo.camera.zoom=1.5;expect(camera.toJSON()).toEqual(before);
});
