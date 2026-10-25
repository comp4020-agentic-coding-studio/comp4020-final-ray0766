import * as T from 'three';

/** Camera fitting in room-local coordinates; all room geometry stays in metres. */
export function fitHomeCamera(camera: T.OrthographicCamera, width: number, depth: number, height: number, aspect: number, phone: boolean) {
  camera.position.set(width * .88, Math.max(width, depth) * 1.18, depth * 1.45);
  camera.lookAt(0, height * .31, 0);
  camera.updateMatrixWorld(true);
  const extent = new T.Box3();
  for (const x of [-width / 2 - .25, width / 2 + .25]) for (const z of [-depth / 2 - .3, depth / 2 + .3]) for (const y of [-.25, height]) {
    extent.expandByPoint(new T.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  }
  // Reserve the lower portion for controls. Fit the room, never scale the avatar.
  const occupied = phone ? .71 : .83;
  const span = Math.max((extent.max.y - extent.min.y) / occupied, (extent.max.x - extent.min.x) / (aspect * .91));
  const centerY = (extent.min.y + extent.max.y) / 2 - span * (phone ? .045 : .015);
  camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
  camera.top = centerY + span / 2; camera.bottom = centerY - span / 2;
  camera.updateProjectionMatrix();
}
