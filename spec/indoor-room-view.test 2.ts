import {expect,it,vi} from 'vitest';
import {BoxGeometry,Mesh,MeshBasicMaterial,Group,OrthographicCamera,Plane,Quaternion,Scene,Vector3} from 'three';
import type {WebGLRenderer} from 'three';
import {fitIndoorRoom,indoorRoomPlanes,indoorShellPlanes,IndoorRoomView} from '../src/client/indoor-room-view.ts';
import type {FollowRoom} from '../src/client/indoor-follow-room.ts';
import {createVillageDrawing} from '../src/client/village-drawing.ts';
vi.mock('../src/client/village-drawing.ts',()=>({createVillageDrawing:vi.fn(()=>({render:vi.fn(),dispose:vi.fn()}))}));
function room(width=8,depth=7):FollowRoom{return{id:'room',origin:new Vector3(25,40,-12),rotation:new Quaternion().setFromAxisAngle(new Vector3(1,2,3).normalize(),1.3),width,depth,height:2.8,constrainEye:e=>e};}
it.each([[5,4,1920,1080],[8.6,7,390,844],[11,5,844,390]])('fits a rotated %s by %s room at %s by %s with the home orthographic projection',(w,d,width,height)=>{
 const r=room(w,d),camera=new OrthographicCamera(-1,1,1,-1,.05,200);fitIndoorRoom(camera,r,width/height,width<700);
 for(const x of [-w/2,w/2])for(const y of [0,r.height])for(const z of [-d/2,d/2]){const p=new Vector3(x,y,z).applyQuaternion(r.rotation).add(r.origin).project(camera);expect(Math.abs(p.x)).toBeLessThan(.95);expect(Math.abs(p.y)).toBeLessThan(.95);}
 const before=camera.toJSON();fitIndoorRoom(camera,r,width/height,width<700);expect(camera.toJSON()).toEqual(before);
});
it('bounds the roof and preserves an avatar at the doorway while cutting only the raised front shell',()=>{
 const r=room(),planes=indoorRoomPlanes(r),visible=(p:Vector3)=>planes.every(plane=>plane.distanceToPoint(p.clone().applyQuaternion(r.rotation).add(r.origin))>=0);
 const at=(p:Vector3)=>p.applyQuaternion(r.rotation).add(r.origin);
 expect(planes.every(p=>p.distanceToPoint(at(new Vector3(0,1.62,0)))>=0)).toBe(true);
 expect(planes.some(p=>p.distanceToPoint(at(new Vector3(0,3,0)))<0)).toBe(true);
 expect(visible(new Vector3(r.width/2-.2,1,0))).toBe(true);
 const shell=indoorShellPlanes(r),cut=(p:Vector3)=>shell.every(plane=>plane.distanceToPoint(at(p.clone()))<0);
 expect(cut(new Vector3(0,1,r.depth/2-.5))).toBe(true);expect(cut(new Vector3(0,.1,r.depth/2-.5))).toBe(false);expect(cut(new Vector3(0,1,-r.depth/2+.5))).toBe(false);
 expect(visible(new Vector3())).toBe(true);
 const viewer=at(new Vector3(-2,0,-2)),front=at(new Vector3(-1.6,1,-1.6));expect(indoorShellPlanes(r,viewer).every(plane=>plane.distanceToPoint(front)<0)).toBe(true);
});
it('restores renderer and scene state even after a failed indoor draw',()=>{
 vi.stubGlobal('innerWidth',1440);vi.stubGlobal('innerHeight',900);
 const original=[new Plane()],scene=new Scene(),sky=new Group();sky.name='cloud-sky';scene.add(sky);
 const building=new Group();building.userData.objectId='room';const source=new MeshBasicMaterial(),wall=new Mesh(new BoxGeometry(),source),actor=new Mesh(new BoxGeometry(),source);building.add(wall);scene.add(building,actor);
 const renderer={clippingPlanes:original,localClippingEnabled:false} as WebGLRenderer,view=new IndoorRoomView(renderer,scene);view.update(room());
 const drawing=vi.mocked(createVillageDrawing).mock.results.at(-1)!.value;drawing.render.mockImplementation(()=>{expect(renderer.clippingPlanes).toHaveLength(6);expect(sky.visible).toBe(false);expect(wall.material).not.toBe(source);expect(actor.material).toBe(source);expect((wall.material as MeshBasicMaterial).clipIntersection).toBe(true);throw Error('draw fixture');});
 expect(()=>view.render()).toThrow('draw fixture');expect(renderer.clippingPlanes).toBe(original);expect(sky.visible).toBe(true);expect(wall.material).toBe(source);expect(actor.material).toBe(source);expect(renderer.localClippingEnabled).toBe(false);
 view.update(null);expect(drawing.dispose).toHaveBeenCalledOnce();vi.unstubAllGlobals();
});
