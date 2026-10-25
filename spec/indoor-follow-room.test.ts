import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { IndoorFollowRooms } from '../src/client/indoor-follow-room.ts';
import { SimpleFollowCameraRig } from '../src/client/simple-follow-camera.ts';
import type { GroundWorld } from '../src/shared/physics/world.ts';
const up=new Vector3(0,1,0),feet=new Vector3(0,60,0);
function world(roof=true): GroundWorld {
  const box=(tag:string,y:number)=>({tag,center:new Vector3(0,y,0),half:new Vector3(2,.08,2),q:new Quaternion(),inverse:new Quaternion(),support:true,objectId:'room'});
  return {baseRadius:60,bodies:[{objectId:'room',dir:up.clone(),broad:4,colliders:[box('floor',59.92),...(roof?[box('pitched roof',62.2)]:[])]}]} as unknown as GroundWorld;
}
it('enters covered floor space and holds the mode briefly across the doorway boundary',()=>{
 const rooms=new IndoorFollowRooms(),w=world();
 expect(rooms.update(w,feet,up,.05)).toBeNull(); rooms.update(w,feet,up,.05);
 expect(rooms.update(w,feet,up,.05)?.id).toBe('room');
 const outside=new Vector3(2.3,60,0);
 for(let i=0;i<4;i++)expect(rooms.update(w,outside,up,.05)?.id).toBe('room');
 expect(rooms.update(w,outside,up,.05)).toBeNull();
});
it('does not classify open ground or an uncovered floor as indoors',()=>{
 const rooms=new IndoorFollowRooms(),w=world(false);
 for(let i=0;i<8;i++)expect(rooms.update(w,feet,up,.05)).toBeNull();
});
it('keeps the near eye within the existing room footprint and restores outdoor distance',()=>{
 const rooms=new IndoorFollowRooms(),w=world(),edge=new Vector3(0,60,1.8);
 let room=null;for(let i=0;i<3;i++)room=rooms.update(w,edge,up,.05);
 expect(room).not.toBeNull();
 const rig=new SimpleFollowCameraRig(),value={feet:edge,up,heading:new Vector3(0,0,-1),pitch:0,portrait:false,radius:60,dt:.05,probe:()=>{throw Error('No visibility probing');}};
 const indoor=rig.update({...value,room});expect(indoor.position.z).toBeLessThanOrEqual(1.9);expect(indoor.position.y).toBeCloseTo(61.65);
 const outdoor=rig.update({...value,room:null});expect(outdoor.position.z-edge.z).toBeCloseTo(7.2);
});
it('clears the room mode when the existing world changes',()=>{
 const rooms=new IndoorFollowRooms(),w=world();for(let i=0;i<3;i++)rooms.update(w,feet,up,.05);
 expect(rooms.update(world(false),feet,up,.05)).toBeNull();
});

it('restores an indoor saved position immediately and excludes disconnected room floors',()=>{
 const rooms=new IndoorFollowRooms(),w=world();const other={...w.bodies[0].colliders[0],center:new Vector3(15,59.92,0)};w.bodies[0].colliders.push(other,{...w.bodies[0].colliders[1],center:new Vector3(15,62.2,0)});
 const room=rooms.update(w,feet,up,.01,true)!;expect(room.id).toBe('room');expect(room.width).toBe(4);expect(room.depth).toBe(4);expect(room.origin.distanceTo(feet)).toBeLessThan(.001);
});
