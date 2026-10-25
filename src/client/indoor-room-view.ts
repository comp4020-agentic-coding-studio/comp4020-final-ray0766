import * as T from 'three';
import {fitHomeCamera} from './room-camera.ts';
import {createVillageDrawing} from './village-drawing.ts';
import type {FollowRoom} from './indoor-follow-room.ts';

/** The existing home-room projection, applied to the real walk-in room frame. */
export function fitIndoorRoom(camera:T.OrthographicCamera,room:FollowRoom,aspect:number,phone:boolean){
  camera.up.set(0,1,0);camera.zoom=1;
  fitHomeCamera(camera,room.width,room.depth,room.height,aspect,phone);
  camera.position.applyQuaternion(room.rotation).add(room.origin);camera.quaternion.premultiply(room.rotation);camera.up.applyQuaternion(room.rotation);camera.updateMatrixWorld(true);
}
export function indoorRoomPlanes(room:FollowRoom){
  const matrix=new T.Matrix4().compose(room.origin,room.rotation,new T.Vector3(1,1,1));
  // Bound the room and roof without cutting an avatar near the doorway.
  // The camera-facing shell is handled separately from characters and floor.
  return [new T.Plane(new T.Vector3(1,0,0),room.width/2+.25),new T.Plane(new T.Vector3(-1,0,0),room.width/2+.35),
    new T.Plane(new T.Vector3(0,1,0),.25),new T.Plane(new T.Vector3(0,-1,0),room.height-.12),
    new T.Plane(new T.Vector3(0,0,1),room.depth/2+.25),new T.Plane(new T.Vector3(0,0,-1),room.depth/2+.35)].map(plane=>plane.applyMatrix4(matrix));
}
/** Intersect the camera-facing half-space with the space above the floor.
 * Applied only to building materials: the floor and independent actors remain whole. */
export function indoorShellPlanes(room:FollowRoom,viewer?:T.Vector3){
  const matrix=new T.Matrix4().compose(room.origin,room.rotation,new T.Vector3(1,1,1));
  const facing=new T.Vector3(-room.width*.88,0,-room.depth*1.45).normalize();
  const localViewer=viewer?.clone().sub(room.origin).applyQuaternion(room.rotation.clone().invert());
  const cut=localViewer?Math.min(Math.min(room.width,room.depth)*.12,-facing.dot(localViewer)-.45):Math.min(room.width,room.depth)*.12;
  return [new T.Plane(facing,cut),new T.Plane(new T.Vector3(0,-1,0),.22)].map(plane=>plane.applyMatrix4(matrix));
}
export class IndoorRoomView {
  readonly camera=new T.OrthographicCamera(-5,5,5,-5,.05,200);
  room:FollowRoom|null=null;
  private viewer:T.Vector3|undefined;
  private drawing:ReturnType<typeof createVillageDrawing>|null=null;
  private restores:Array<()=>void>=[];
  private materials=new Map<T.Material,T.Material>();
  private shell:Array<T.Mesh>=[];
  private releaseShell(){for(const material of this.materials.values())material.dispose();this.materials.clear();this.shell=[];}
  private shellMaterial(source:T.Material,planes:T.Plane[]){
    let material=this.materials.get(source);
    if(!material){material=source.clone();material.onBeforeCompile=(shader,renderer)=>source.onBeforeCompile(shader,renderer);material.customProgramCacheKey=()=>source.customProgramCacheKey()+'|fixed-room-shell';material.clipIntersection=true;material.clipShadows=true;this.materials.set(source,material);}
    material.clippingPlanes=planes;return material;
  }
  constructor(private renderer:T.WebGLRenderer,private scene:T.Scene){}
  update(room:FollowRoom|null,viewer?:T.Vector3){
    this.viewer=viewer?.clone();
    if(room?.id!==this.room?.id)this.releaseShell();
    this.room=room;
    if(!room){this.drawing?.dispose();this.drawing=null;return;}
    fitIndoorRoom(this.camera,room,innerWidth/innerHeight,innerWidth<700);
    this.drawing??=createVillageDrawing(this.renderer,this.scene,this.camera);
  }
  private prepare=()=>{
    if(!this.room)return;
    const planes=this.renderer.clippingPlanes,fog=this.scene.fog,sky=this.scene.getObjectByName('cloud-sky'),skyVisible=sky?.visible;
    if(!this.shell.length)this.scene.traverse(node=>{if(!(node instanceof T.Mesh))return;for(let parent:T.Object3D|null=node;parent;parent=parent.parent){if(parent.userData.objectId===this.room!.id||parent.name==='home-physical-door'){this.shell.push(node);break;}}});
    const local=this.renderer.localClippingEnabled,shellPlanes=indoorShellPlanes(this.room,this.viewer),materials=this.shell.map(mesh=>({mesh,material:mesh.material}));
    for(const {mesh,material} of materials)mesh.material=Array.isArray(material)?material.map(source=>this.shellMaterial(source,shellPlanes)):this.shellMaterial(material,shellPlanes);
    this.renderer.localClippingEnabled=true;this.renderer.clippingPlanes=indoorRoomPlanes(this.room);this.scene.fog=null;if(sky)sky.visible=false;
    this.restores.push(()=>{for(const {mesh,material} of materials)mesh.material=material;this.renderer.localClippingEnabled=local;this.renderer.clippingPlanes=planes;this.scene.fog=fog;if(sky)sky.visible=!!skyVisible;});
  };
  private finish=()=>{this.restores.pop()?.();};
  render(){if(!this.room)return;this.prepare();try{this.drawing?.render();}finally{this.finish();}}
  photo(width:number,height:number){
    const room=this.room!;const camera=this.camera.clone();fitIndoorRoom(camera,room,width/height,false);
    return {scene:this.scene,camera,target:room.origin.clone().add(new T.Vector3(0,room.height*.31,0).applyQuaternion(room.rotation)),fixedAngle:true,prepare:this.prepare,finish:this.finish};
  }
}
