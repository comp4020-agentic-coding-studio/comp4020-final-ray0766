import * as T from 'three';
import type { HomeDescriptor } from '../shared/home.ts';
import type { HomeDoorPartId } from '../shared/home-door.ts';
import { isWideDoor } from '../shared/wide-door.ts';
import { buildPart } from '../shared/blueprint-parts.ts';
import { disposeObject3D } from '../assets/claude-geometry/core/dispose.ts';
import { worldMaterials } from './shared-assets.ts';

/** Choose geometry from the authoritative saved part. Acknowledged endpoints
 * switch together with physics; old homes keep the original sliding leaves. */
export function createHomeDoor(partId:HomeDoorPartId='wall.door.open') {
  const root=new T.Group();root.name='home-physical-door';
  let closed:T.Group,open:T.Group,wide:boolean|undefined,disposed=false,value=true;
  const setOpen=(next:boolean,_immediate=true)=>{value=next;closed.visible=!next;open.visible=next;root.userData.open=next;void _immediate;};
  const setPart=(part:HomeDoorPartId='wall.door.open')=>{
    if(disposed)return;const next=isWideDoor(part);if(next===wide)return;
    if(closed){closed.removeFromParent();disposeObject3D(closed);}
    if(open){open.removeFromParent();disposeObject3D(open);}
    closed=buildPart(next?'wall.door-wide':'wall.door',worldMaterials()).group;
    open=buildPart(next?'wall.door-wide.open':'wall.door.open',worldMaterials()).group;
    closed.name='home-door-closed';open.name='home-door-open';root.add(closed,open);wide=next;root.userData.partId=part;setOpen(value);
  };
  setPart(partId);
  return {root,setOpen,setPart,
    frame(_delta:number,_reducedMotion=false){void _delta;void _reducedMotion;},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();disposeObject3D(closed);disposeObject3D(open);},
  };
}
export type HomeDoorView=ReturnType<typeof createHomeDoor>;
export function placeHomeDoor(view:HomeDoorView,home:HomeDescriptor|null|undefined){
  const frame=home?.door.frame;view.root.visible=!!frame;
  if(!frame||!home)return;
  view.setPart(home.door.partId);view.root.position.fromArray(frame.position);view.root.quaternion.fromArray(frame.quaternion);view.setOpen(home.interior.doorOpen);
}
