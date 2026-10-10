import {expect,it} from 'vitest';
import * as T from 'three';
import {arrivalViewScore} from '../src/client/arrival-camera.ts';

it('rejects a broad near facade even when the camera-to-player ray is clear',()=>{
  const camera=new T.PerspectiveCamera(54,1.44,.08,2400),head=new T.Vector3(0,1.35,0),up=new T.Vector3(0,1,0);
  const wall=new T.Mesh(new T.BoxGeometry(3,6,.4),new T.MeshBasicMaterial());wall.position.set(2,2,4);wall.updateMatrixWorld(true);
  const routes=[new T.Vector3(-2,0,-2),new T.Vector3(-3,0,-3)];
  try{
    camera.position.set(0,3.6,7.2);camera.lookAt(0,1.15,-1.1);
    const ray=new T.Raycaster(camera.position,head.clone().sub(camera.position).normalize());
    expect(ray.intersectObject(wall)).toHaveLength(0);
    const cramped=arrivalViewScore(camera,head,up,[wall],routes);
    camera.position.set(-5,3.6,5);camera.lookAt(0,1.15,-1.1);
    const open=arrivalViewScore(camera,head,up,[wall],routes);
    expect(cramped.obstruction).toBeGreaterThan(.35);
    expect(open.obstruction).toBe(0);expect(open.street).toBe(1);
    expect(open.score).toBeGreaterThan(cramped.score+5);
  }finally{wall.geometry.dispose();wall.material.dispose();}
});
