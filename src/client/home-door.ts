import * as T from 'three';
import type { HomeDescriptor } from '../shared/home.ts';

/** A portal door has no moving physics body: its sweep can never push a player. */
export function createHomeDoor() {
  const root = new T.Group(), pivot = new T.Group();
  root.name = 'home-portal-door'; pivot.position.set(-.4, .025, .16); root.add(pivot);
  const wood = new T.MeshStandardMaterial({ color: '#638a79', roughness: .87 });
  const trim = new T.MeshStandardMaterial({ color: '#dcc38c', roughness: .8 });
  const box = (size: [number, number, number], position: [number, number, number], material: T.Material) => {
    const mesh = new T.Mesh(new T.BoxGeometry(...size), material); mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; pivot.add(mesh); return mesh;
  };
  box([.8, 1.82, .055], [.4, .91, 0], wood);
  box([.65, .06, .075], [.4, .3, 0], trim); box([.65, .06, .075], [.4, 1.55, 0], trim);
  box([.04, .13, .11], [.69, .92, .05], trim);
  let target = -Math.PI / 2;
  pivot.rotation.y = target;
  return {
    root,
    setOpen(open: boolean, immediate = false) { target = open ? -Math.PI / 2 : 0; if (immediate) pivot.rotation.y = target; root.userData.open = open; },
    frame(delta: number, reducedMotion = false) { pivot.rotation.y = reducedMotion ? target : T.MathUtils.damp(pivot.rotation.y, target, 15, Math.min(delta, .1)); },
    dispose() { root.removeFromParent(); root.traverse(object => { if (object instanceof T.Mesh) object.geometry.dispose(); }); wood.dispose(); trim.dispose(); },
  };
}
export type HomeDoorView = ReturnType<typeof createHomeDoor>;
export function placeHomeDoor(view: HomeDoorView, home: HomeDescriptor | null | undefined) {
  const frame = home?.door.frame; view.root.visible = !!frame;
  if (!frame || !home) return;
  view.root.position.fromArray(frame.position); view.root.quaternion.fromArray(frame.quaternion);
  view.setOpen(home.interior.doorOpen);
}
