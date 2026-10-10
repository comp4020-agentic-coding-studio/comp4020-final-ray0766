import * as T from 'three';
import type { HomeDescriptor } from '../shared/home.ts';
import { buildPart } from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import { disposeObject3D } from '../assets/claude-geometry/core/dispose.ts';
import { worldMaterials } from './shared-assets.ts';

/** The same two source models players use in the workshop. Switching the
 * acknowledged pose is immediate, so visible leaves and physics never diverge. */
export function createHomeDoor() {
  const root=new T.Group();root.name='home-physical-door';
  const closed=buildPart('wall.door',worldMaterials()).group;
  const open=buildPart('wall.door.open',worldMaterials()).group;
  closed.name='home-door-closed';open.name='home-door-open';root.add(closed,open);
  let disposed=false;
  const setOpen=(value:boolean,_immediate=true)=>{closed.visible=!value;open.visible=value;root.userData.open=value;void _immediate;};
  setOpen(true);
  return {root,setOpen,
    frame(_delta:number,_reducedMotion=false){void _delta;void _reducedMotion;},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();disposeObject3D(closed);disposeObject3D(open);},
  };
}
export type HomeDoorView=ReturnType<typeof createHomeDoor>;
export function placeHomeDoor(view:HomeDoorView,home:HomeDescriptor|null|undefined){
  const frame=home?.door.frame;view.root.visible=!!frame;
  if(!frame||!home)return;
  view.root.position.fromArray(frame.position);view.root.quaternion.fromArray(frame.quaternion);view.setOpen(home.interior.doorOpen);
}
