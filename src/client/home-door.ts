import * as T from 'three';
import type { HomeDescriptor } from '../shared/home.ts';
import { HOME_DOOR_LEAF } from '../shared/home-door.ts';

/** An authoritative open/closed leaf. State changes are instantaneous so the
 * rendered solid and both collision worlds never disagree during a swing. */
export function createHomeDoor() {
  const root = new T.Group(), pivot = new T.Group(),leaf=HOME_DOOR_LEAF;
  root.name = 'home-physical-door'; pivot.position.fromArray(leaf.hinge); root.add(pivot);
  const wood = new T.MeshStandardMaterial({ color: '#638a79', roughness: .87 });
  const trim = new T.MeshStandardMaterial({ color: '#dcc38c', roughness: .8 });
  const plaster = new T.MeshStandardMaterial({ color: '#efe3c6', roughness: .92 });
  const box = (parent:T.Group,size: [number, number, number], position: [number, number, number], material: T.Material) => {
    const mesh = new T.Mesh(new T.BoxGeometry(...size), material); mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  box(pivot,[leaf.width,leaf.height,leaf.thickness],[leaf.width/2,leaf.height/2,0],wood);
  // Panels are insets on the solid leaf: no handles or trim outside its proxy.
  box(pivot,[.65,.055,.001],[.4,.3,leaf.thickness/2+.0005],trim);
  box(pivot,[.65,.055,.001],[.4,1.55,leaf.thickness/2+.0005],trim);
  for(const x of [-.45,.45])box(root,[.1,1.9,.22],[x,.95,0],trim);
  box(root,[1,.16,.22],[0,1.96,0],plaster);
  box(root,[.8,.025,.28],[0,.0125,0],trim);
  return {
    root,
    setOpen(open: boolean, _immediate = true) { pivot.rotation.y=open?leaf.openAngle:0;root.userData.open=open;void _immediate; },
    frame(_delta: number, _reducedMotion = false) { void _delta; void _reducedMotion; },
    dispose() { root.removeFromParent(); root.traverse(object => { if (object instanceof T.Mesh) object.geometry.dispose(); }); wood.dispose(); trim.dispose(); plaster.dispose(); },
  };
}
export type HomeDoorView = ReturnType<typeof createHomeDoor>;
export function placeHomeDoor(view: HomeDoorView, home: HomeDescriptor | null | undefined) {
  const frame = home?.door.frame; view.root.visible = !!frame;
  if (!frame || !home) return;
  view.root.position.fromArray(frame.position); view.root.quaternion.fromArray(frame.quaternion);
  view.setOpen(home.interior.doorOpen);
}
