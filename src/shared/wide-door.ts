/** Host-owned, metre-scale door. The original 45 catalogue entries stay intact.
 * +Z is outside. Its first edge keeps the original grid anchor; the second
 * edge extends along local +X. Both leaves turn into the two supporting cells.
 * No handle or high-LOD ornament projects into the stated clear opening. */
export const WIDE_DOOR = {
  width: 2, centerX: .5, span: 2, height: 2.04, frameDepth: .14, jamb: .3,
  hingeX: .7, leafWidth: .698, leafThickness: .016,
  foot: .024, top: 1.9, headHeight: .14, thresholdHeight: .02,
  clearOpenWidth: 1.384,
} as const;
export type WideDoorVector = [number, number, number];
export interface WideDoorBox {
  tag: string; center: WideDoorVector; half: WideDoorVector;
  yaw?: number; support?: boolean;
}
export const WIDE_DOOR_IDS = ['wall.door-wide', 'wall.door-wide.open'] as const;
export type WideDoorId = typeof WIDE_DOOR_IDS[number];
export const isWideDoor = (id: string): id is WideDoorId =>
  id === 'wall.door-wide' || id === 'wall.door-wide.open';

const box = (tag: string, center: WideDoorVector, size: WideDoorVector, support = false): WideDoorBox =>
  ({ tag, center, half: size.map(value => value / 2) as WideDoorVector, support });

export function wideDoorFrame(): WideDoorBox[] {
  const d = WIDE_DOOR;
  return [
    ...[-1, 1].map(side => box('wide door jamb', [d.centerX+side * (d.width-d.jamb)/2, d.height/2, 0], [d.jamb, d.height, d.frameDepth])),
    box('wide door lintel', [d.centerX, d.height-d.headHeight/2, 0], [d.width-2*d.jamb, d.headHeight, d.frameDepth]),
    box('wide door threshold', [d.centerX, d.thresholdHeight/2, 0], [d.width, d.thresholdHeight, d.frameDepth], true),
  ];
}

/** Exact leaf OBBs at an acknowledged endpoint, or at an angle for geometry
 * verification. The renderer uses the same transforms at all three LODs. */
export function wideDoorLeavesAt(angle: number): WideDoorBox[] {
  const d = WIDE_DOOR, c = Math.cos(angle), s = Math.sin(angle);
  return [-1, 1].map(side => ({
    tag: 'wide door leaf',
    center: [d.centerX+side * (d.hingeX-d.leafWidth*c/2), (d.foot+d.top)/2, -d.leafWidth*s/2],
    half: [d.leafWidth/2, (d.top-d.foot)/2, d.leafThickness/2],
    yaw: -side * angle,
  }));
}
export const wideDoorLeaves = (open: boolean) => wideDoorLeavesAt(open ? Math.PI/2 : 0);

/** Conservative continuous quarter-disc bounds, not just endpoint unions.
 * The small corner allowance covers the rotating leaf's actual thickness. */
export function wideDoorSweepBoxes(): WideDoorBox[] {
  const d = WIDE_DOOR, reach = Math.hypot(d.leafWidth, d.leafThickness/2);
  const outer = d.hingeX+d.leafThickness/2, inner = d.hingeX-reach;
  return [-1, 1].map(side => box('wide door travel',
    [d.centerX+side*(outer+inner)/2, (d.foot+d.top)/2, (-reach+d.leafThickness/2)/2],
    [outer-inner, d.top-d.foot, reach+d.leafThickness/2]));
}

export const wideDoorEnvelope = {
  min: [-.5, 0, -Math.hypot(WIDE_DOOR.leafWidth, WIDE_DOOR.leafThickness/2)] as WideDoorVector,
  max: [1.5, WIDE_DOOR.height, WIDE_DOOR.frameDepth/2] as WideDoorVector,
};
