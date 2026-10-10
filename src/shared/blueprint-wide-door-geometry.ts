import type { Kit } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { WIDE_DOOR, wideDoorFrame } from './wide-door.ts';
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

/** A real bevel on both sill edges prevents an animated toe catching the
 * square stone corner. The 50 mm crown stays at the original 20 mm support
 * height; its two sloping edges finish 20 mm inside the 140 mm frame depth.
 * The full 2 m width and original conservative support box are unchanged.
 * Emit the same closed convex stone at every LOD. */
function thresholdGeometry() {
  const d = WIDE_DOOR, halfDepth = d.frameDepth / 2 - .02;
  const profile = [[-halfDepth, 0], [-halfDepth / 2, d.thresholdHeight],
    [halfDepth / 2, d.thresholdHeight], [halfDepth, 0]];
  const ends = [-1, 1].map(side => profile.map(([z, y]) => new Vector3(d.centerX + side * d.width / 2, y, z)));
  const positions: number[] = [], centre = new Vector3(d.centerX, d.thresholdHeight / 2, 0);
  const triangle = (a: Vector3, b: Vector3, c: Vector3) => {
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.dot(a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(centre)) < 0) [b, c] = [c, b];
    positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  };
  for (const end of ends) for (let i = 1; i < profile.length - 1; i++) triangle(end[0], end[i], end[i + 1]);
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length;
    triangle(ends[0][i], ends[1][i], ends[1][j]);
    triangle(ends[0][i], ends[1][j], ends[0][j]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Original host geometry, sharing the kit's timber/cream material vocabulary.
 * Complete door leaves remain at low LOD, so distance never changes clearance. */
function wideDoor(k: Kit, open: boolean) {
  const { b } = k, d = WIDE_DOOR;
  for (const frame of wideDoorFrame()) {
    if (frame.support) { b.geometry(k.m('tread'), thresholdGeometry()); continue; }
    if (frame.tag !== 'wide door jamb') {
      b.box(k.m(frame.support ? 'tread' : 'post'),
        frame.half.map(value => value*2) as [number, number, number], { position: frame.center }, 0);
      continue;
    }
    // A real timber border around recessed cream infill. A cream face laid
    // on a complete wood block would be coplanar and flicker in the renderer.
    const x = frame.center[0], stile = .03;
    for (const side of [-1, 1]) b.box(k.m('post'), [stile, d.height, d.frameDepth],
      { position: [x + side*(d.jamb-stile)/2, d.height/2, 0] }, 0);
    b.box(k.m('post'), [d.jamb-2*stile, .22, d.frameDepth], { position: [x, .11, 0] }, 0);
    b.box(k.m('post'), [d.jamb-2*stile, .10, d.frameDepth], { position: [x, 1.99, 0] }, 0);
    b.box(k.m('skin'), [d.jamb-2*stile, 1.72, d.frameDepth-.002], { position: [x, 1.08, 0] }, 0);
  }
  for (const side of [-1, 1]) b.within({position: [d.centerX+side*d.hingeX, 0, 0], rotation: [0, open ? -side*Math.PI/2 : 0, 0]}, () => {
    const cx = -side*d.leafWidth/2, cy = (d.foot+d.top)/2, h = d.top-d.foot;
    // Opaque cream backing with real timber rails on both faces. Every detail
    // remains inside the same 16 mm leaf OBB used by physics and reservations.
    b.box(k.m('marking'), [d.leafWidth, h, .008], {position: [cx, cy, 0]}, 0);
    const stile = .018;
    for (const x of [cx-d.leafWidth/2+stile/2, cx+d.leafWidth/2-stile/2])
      b.box(k.m('post'), [stile, h, d.leafThickness], {position: [x, cy, 0]}, 0);
    for (const y of [d.foot+.014, .58, 1.13, 1.66, d.top-.014])
      b.box(k.m('post'), [d.leafWidth, .028, d.leafThickness], {position: [cx, y, 0]}, 0);
    if (!k.low) b.box(k.m('post'), [.012, h, d.leafThickness], {position: [cx, cy, 0]}, 0);
    // Flush inset pulls, no projecting handle that steals opening width.
    for (const z of [-.0045, .0045]) b.box(k.m('steel'), [.024, .07, .001],
      {position: [-side*(d.leafWidth-.047), .94, z]}, 0);
  });
}
export const wideDoorClosed = (k: Kit) => wideDoor(k, false);
export const wideDoorOpen = (k: Kit) => wideDoor(k, true);
