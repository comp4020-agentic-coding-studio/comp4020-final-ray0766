import type { BlueprintId } from '../core/ids.ts';
import type { Blueprint, PartPlacement, Rot } from './model.ts';
import type { PartId } from './parts/catalogue.ts';

// Hand-written reference layouts. They exercise every part and rule, feed the
// unit tests and the parts gallery, and are never shown as user work.

class Sketch {
  parts: PartPlacement[] = [];
  add(part: PartId, x: number, level: number, z: number, rot: Rot = 0) {
    this.parts.push({ n: this.parts.length + 1, part, x, level, z, rot });
    return this;
  }
}

/**
 * Two-storey survey post on a 3×2 footprint (x 2–4): door and windows on both
 * storeys, a cantilevered grated balcony with railings reached by a
 * free-standing stair one cell clear of the west wall (a stair may not run
 * along a facade: the facade's sills, hoods and conduits would cut into it),
 * a parapet roof with a plant unit and a lean-to slope with a gutter.
 */
export function surveyPost(): Blueprint {
  const s = new Sketch();
  // Ground floor slab, and grating under the stair at x = 0.
  for (let x = 2; x <= 4; x++) for (let z = 1; z <= 2; z++) s.add('floor.deck', x, 0, z);
  s.add('floor.grate', 0, 0, 1).add('floor.grate', 0, 0, 2);
  // Ground floor walls: front (z = 3 line), back, sides.
  s.add('wall.window', 2, 0, 2, 0).add('wall.door', 3, 0, 2, 0).add('wall.louvre', 4, 0, 2, 0);
  s.add('wall.corrugated', 2, 0, 1, 2).add('wall.corrugated', 3, 0, 1, 2).add('wall.corrugated', 4, 0, 1, 2);
  s.add('wall.solid', 2, 0, 1, 3).add('wall.window', 2, 0, 2, 3);
  s.add('wall.solid', 4, 0, 1, 1).add('wall.solid', 4, 0, 2, 1);
  s.add('structure.column', 2, 0, 1, 2).add('structure.column', 4, 0, 1, 1).add('structure.column', 2, 0, 2, 3).add('structure.column', 4, 0, 2, 0);
  // The stair climbs towards +Z onto the balcony; a post at its top corner carries the balcony's west end.
  s.add('stair.straight', 0, 0, 1, 2);
  s.add('structure.column', 0, 0, 2, 0);
  // Upper floor, and a grated balcony cantilevered along the whole front.
  for (let x = 2; x <= 4; x++) for (let z = 1; z <= 2; z++) s.add('floor.deck', x, 1, z);
  for (let x = 0; x <= 4; x++) s.add('floor.grate', x, 1, 3);
  // Upper walls.
  s.add('wall.window', 2, 1, 2, 0).add('wall.window', 3, 1, 2, 0).add('wall.door', 4, 1, 2, 0);
  s.add('wall.solid', 2, 1, 1, 2).add('wall.window', 3, 1, 1, 2).add('wall.solid', 4, 1, 1, 2);
  s.add('wall.solid', 2, 1, 1, 3).add('wall.solid', 2, 1, 2, 3);
  s.add('wall.window', 4, 1, 1, 1).add('wall.solid', 4, 1, 2, 1);
  s.add('structure.column', 2, 1, 1, 2).add('structure.column', 4, 1, 1, 1).add('structure.column', 2, 1, 2, 3).add('structure.column', 4, 1, 2, 0);
  // Balcony railings: the front, both ends, and the drop beside the stairwell. The stair's top exit stays open.
  for (let x = 0; x <= 4; x++) s.add('rail.guard', x, 1, 3, 0);
  s.add('rail.guard', 4, 1, 3, 1).add('rail.guard', 0, 1, 3, 3).add('rail.guard', 1, 1, 3, 2);
  // Roof: parapet deck over the west two bays, lean-to slope over the east bay.
  for (let x = 2; x <= 3; x++) for (let z = 1; z <= 2; z++) s.add('roof.deck', x, 2, z);
  s.add('roof.slope', 4, 2, 1, 1).add('roof.slope', 4, 2, 2, 1);
  s.add('roof.parapet', 2, 2, 2, 0).add('roof.parapet', 3, 2, 2, 0);
  s.add('roof.parapet', 2, 2, 1, 2).add('roof.parapet', 3, 2, 1, 2);
  s.add('roof.parapet', 2, 2, 1, 3).add('roof.parapet', 2, 2, 2, 3);
  s.add('roof.parapet', 3, 2, 1, 1).add('roof.parapet', 3, 2, 2, 1);
  s.add('roof.plant', 2, 2, 1, 0);
  return { id: '6f1a3c52-8d0e-4b7a-9c21-3e5f7a9b0d14' as BlueprintId, name: 'Survey post', parts: s.parts, groups: [{ name: 'Balcony', members: s.parts.filter(p => p.part === 'rail.guard' || (p.part === 'floor.grate' && p.level === 1)).map(p => p.n) }] };
}

/**
 * Single-storey relay hut on a 3×2 footprint (x 1–3, z 1–2): door, window and
 * louvre on the front, corrugated back, a parapet roof deck with a plant unit
 * over the west two bays and a lean-to slope with a gutter over the east bay.
 * Small enough (radius 1.95 m, 0.16 m of curvature under its corners) to sit
 * on real terrain next to the landing spot; the terrain demo anchors it.
 */
export function relayHut(): Blueprint {
  const s = new Sketch();
  for (let x = 1; x <= 3; x++) for (let z = 1; z <= 2; z++) s.add('floor.deck', x, 0, z);
  // Front (+Z edge of the z = 2 row), back, sides.
  s.add('wall.window', 1, 0, 2, 0).add('wall.door', 2, 0, 2, 0).add('wall.louvre', 3, 0, 2, 0);
  s.add('wall.corrugated', 1, 0, 1, 2).add('wall.corrugated', 2, 0, 1, 2).add('wall.corrugated', 3, 0, 1, 2);
  s.add('wall.solid', 1, 0, 1, 3).add('wall.window', 1, 0, 2, 3);
  s.add('wall.solid', 3, 0, 1, 1).add('wall.louvre', 3, 0, 2, 1);
  s.add('structure.column', 1, 0, 1, 2).add('structure.column', 3, 0, 1, 1).add('structure.column', 1, 0, 2, 3).add('structure.column', 3, 0, 2, 0);
  // Roof: parapet deck over the west two bays, lean-to slope over the east bay.
  for (let x = 1; x <= 2; x++) for (let z = 1; z <= 2; z++) s.add('roof.deck', x, 1, z);
  s.add('roof.slope', 3, 1, 1, 1).add('roof.slope', 3, 1, 2, 1);
  s.add('roof.parapet', 1, 1, 2, 0).add('roof.parapet', 2, 1, 2, 0);
  s.add('roof.parapet', 1, 1, 1, 2).add('roof.parapet', 2, 1, 1, 2);
  s.add('roof.parapet', 1, 1, 1, 3).add('roof.parapet', 1, 1, 2, 3);
  s.add('roof.parapet', 2, 1, 1, 1).add('roof.parapet', 2, 1, 2, 1);
  s.add('roof.plant', 1, 1, 1, 0);
  return { id: '3c9d2b7e-5a41-4f0c-8e62-1d7b9a4c5e30' as BlueprintId, name: 'Relay hut', parts: s.parts, groups: [] };
}

/**
 * Industrial cabin on a 2×2 footprint (x 1–2, z 1–2): the quality sample for
 * walls, openings, floors and the ceiling. The front door is held open so the
 * room can be seen into and entered; windows on three sides light the room,
 * the roof deck's underside carries the luminaire and cable tray, and a plant
 * unit sits behind the parapet. Built only from parts in the palette.
 */
export function industrialCabin(): Blueprint {
  const s = new Sketch();
  for (let x = 1; x <= 2; x++) for (let z = 1; z <= 2; z++) s.add('floor.deck', x, 0, z);
  s.add('wall.door.open', 1, 0, 2, 0).add('wall.window', 2, 0, 2, 0);
  s.add('wall.solid', 1, 0, 1, 2).add('wall.window', 2, 0, 1, 2);
  s.add('wall.window', 1, 0, 1, 3).add('wall.solid', 1, 0, 2, 3);
  s.add('wall.solid', 2, 0, 1, 1).add('wall.window', 2, 0, 2, 1);
  s.add('structure.column', 1, 0, 1, 2).add('structure.column', 2, 0, 1, 1).add('structure.column', 1, 0, 2, 3).add('structure.column', 2, 0, 2, 0);
  for (let x = 1; x <= 2; x++) for (let z = 1; z <= 2; z++) s.add('roof.deck', x, 1, z);
  s.add('roof.parapet', 1, 1, 2, 0).add('roof.parapet', 2, 1, 2, 0);
  s.add('roof.parapet', 1, 1, 1, 2).add('roof.parapet', 2, 1, 1, 2);
  s.add('roof.parapet', 1, 1, 1, 3).add('roof.parapet', 1, 1, 2, 3);
  s.add('roof.parapet', 2, 1, 1, 1).add('roof.parapet', 2, 1, 2, 1);
  s.add('roof.plant', 2, 1, 1, 0);
  return { id: '8b2e6f10-4c7d-4a93-b5e1-0d9c2a7f6e48' as BlueprintId, name: 'Industrial cabin', parts: s.parts, groups: [] };
}

/**
 * Short street with a landing pad (5×5 cells): a two-lane service road along
 * z = 0–1 (2 m), a footway with its slot drain on the kerb side, precast kerbs
 * between them, two street lights reaching over the road, a lagged pipe rack
 * behind the footway, and a 2×2 pad of four tiles turned around one vertex.
 */
export function streetAndPad(): Blueprint {
  const s = new Sketch();
  for (let x = 0; x <= 4; x++) s.add('street.road', x, 0, 0, 0).add('street.road', x, 0, 1, 2);
  for (let x = 0; x <= 4; x++) s.add('street.paving', x, 0, 2, 2);
  for (let x = 0; x <= 4; x++) s.add('street.kerb', x, 0, 2, 2);
  s.add('service.light', 0, 0, 2, 2).add('service.light', 4, 0, 2, 2);
  for (let x = 3; x <= 4; x++) for (let z = 3; z <= 4; z++) s.add('street.paving', x, 0, z, 2);
  s.add('street.pipes', 3, 0, 2, 0).add('street.pipes', 4, 0, 2, 0);
  // Pad quarters around the vertex between cells (1–2, 3–4).
  s.add('pad.quarter', 2, 0, 4, 0).add('pad.quarter', 1, 0, 4, 3).add('pad.quarter', 2, 0, 3, 1).add('pad.quarter', 1, 0, 3, 2);
  return { id: 'd41c7a9e-2b58-4f06-9a3d-6e1b8c0f5a27' as BlueprintId, name: 'Street and pad', parts: s.parts, groups: [] };
}

/**
 * Cottage on a 5×5 plot for the village sample (docs/VILLAGE.md): a 2×2
 * house with its door held open onto a two-row footway, windows on every
 * side, corner posts and a gable roof of four slope panels back to back; a
 * fenced plank terrace beside it behind a hedge; a lantern post at the
 * corner and a kerb along the front edge, where a street blueprint's lane
 * (streetAndPad) continues. Every part is one players have, so it obeys
 * the same rules as their buildings in either look.
 */
export function villageCottage(): Blueprint {
  const s = new Sketch();
  for (let x = 1; x <= 4; x++) for (let z = 1; z <= 2; z++) s.add('floor.deck', x, 0, z);
  s.add('wall.door.open', 1, 0, 2, 0).add('wall.window', 2, 0, 2, 0);
  s.add('wall.solid', 1, 0, 1, 2).add('wall.window', 2, 0, 1, 2);
  s.add('wall.window', 1, 0, 1, 3).add('wall.solid', 1, 0, 2, 3);
  s.add('wall.solid', 2, 0, 1, 1).add('wall.window', 2, 0, 2, 1);
  s.add('structure.column', 1, 0, 1, 2).add('structure.column', 2, 0, 1, 1).add('structure.column', 1, 0, 2, 3).add('structure.column', 2, 0, 2, 0);
  // Gable roof: the back row drains to −Z, the front row to the street.
  s.add('roof.slope', 1, 1, 1, 2).add('roof.slope', 2, 1, 1, 2).add('roof.slope', 1, 1, 2, 0).add('roof.slope', 2, 1, 2, 0);
  // Terrace: fenced at the side and back, a hedge along half its front.
  s.add('rail.guard', 4, 0, 1, 1).add('rail.guard', 4, 0, 2, 1).add('rail.guard', 3, 0, 1, 2).add('rail.guard', 4, 0, 1, 2);
  s.add('street.pipes', 4, 0, 3, 2);
  // Footway in front, kerbed along the plot's front edge, with a lantern post at the corner.
  for (let x = 0; x <= 4; x++) s.add('street.paving', x, 0, 3).add('street.paving', x, 0, 4);
  for (let x = 0; x <= 4; x++) s.add('street.kerb', x, 0, 4, 0);
  s.add('service.light', 0, 0, 4, 0);
  return { id: 'a7d3e5c1-6b2f-4e80-9c14-3f5a8d2b7e60' as BlueprintId, name: 'Village cottage', parts: s.parts, groups: [] };
}

/** One of every part, spread out on a single storey for side-by-side inspection. */
export function partsLineup(): Blueprint {
  const s = new Sketch();
  for (let x = 0; x <= 4; x++) for (let z = 0; z <= 1; z++) s.add('floor.deck', x, 0, z);
  s.add('wall.solid', 0, 0, 0, 2).add('wall.door', 1, 0, 0, 2).add('wall.window', 2, 0, 0, 2).add('wall.louvre', 3, 0, 0, 2).add('wall.corrugated', 4, 0, 0, 2);
  return { id: '0b6f3e1d-2a4c-4d8e-8f10-5c7a9e1b3d26' as BlueprintId, name: 'Parts lineup', parts: s.parts, groups: [] };
}

/**
 * Lived-in cottage (round 8, docs/WORKSHOP.md): an L-shaped house of eight
 * cells round a small courtyard, built only from catalogue parts a player
 * has. Its roof closes with a hip at the outer corner, a valley at the inner
 * one and verge boards on the four gable ends; inside, a dining corner, a
 * sideboard, a shelf, crates and pots, wall lanterns inside and by the front
 * door; outside, entrance steps down to the ground, a flower bed, a bench and
 * a tree in the courtyard.
 */
export function homeCottage(): Blueprint {
  const s = new Sketch();
  const house: [number, number][] = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]];
  for (const [x, z] of house) s.add('floor.deck', x, 0, z);
  // Walls round the L; the front door opens north onto the steps, the back door east into the courtyard.
  s.add('wall.window', 0, 0, 0, 3).add('wall.solid', 0, 0, 1, 3).add('wall.window', 0, 0, 2, 3);
  s.add('wall.solid', 0, 0, 0, 2).add('wall.window', 1, 0, 0, 2).add('wall.solid', 2, 0, 0, 2);
  s.add('wall.window', 2, 0, 0, 1).add('wall.solid', 2, 0, 1, 1);
  s.add('wall.solid', 0, 0, 2, 0).add('wall.door.open', 1, 0, 2, 0);
  s.add('wall.door', 2, 0, 1, 0).add('wall.window', 1, 0, 2, 1);
  // Posts on the six corners of the L, the inner one included.
  s.add('structure.column', 0, 0, 0, 2).add('structure.column', 2, 0, 0, 1).add('structure.column', 2, 0, 1, 0);
  s.add('structure.column', 1, 0, 1, 0).add('structure.column', 1, 0, 2, 0).add('structure.column', 0, 0, 2, 3);
  // Roof: a hip on the outer corner, a valley on the inner one, runs between, verges on the gable ends.
  s.add('roof.slope.hip', 0, 1, 0, 2).add('roof.slope', 1, 1, 0, 2).add('roof.slope', 2, 1, 0, 2);
  s.add('roof.slope', 0, 1, 1, 3).add('roof.slope.valley', 1, 1, 1, 0).add('roof.slope', 2, 1, 1, 0);
  s.add('roof.slope', 0, 1, 2, 3).add('roof.slope', 1, 1, 2, 1);
  s.add('roof.verge.left', 2, 1, 0, 2).add('roof.verge.right', 2, 1, 1, 0).add('roof.verge.right', 0, 1, 2, 3).add('roof.verge.left', 1, 1, 2, 1);
  // Inside: shelf and crates on the south wall, a sideboard under the south window, a dining corner by the west wall.
  s.add('furniture.shelf', 0, 0, 0, 2).add('furniture.sideboard', 1, 0, 0, 2).add('storage.crates', 2, 0, 0, 2);
  s.add('furniture.table', 0, 0, 1).add('furniture.chair', 0, 0, 1, 0).add('furniture.chair', 0, 0, 1, 2).add('light.wall', 0, 0, 1, 3);
  s.add('light.wall', 2, 0, 1, 1).add('garden.pot', 0, 0, 2, 3).add('garden.pot', 1, 0, 2, 1);
  // Outside: steps from the front door down to the ground, a lantern beside it.
  s.add('step.entry', 1, 0, 3, 0).add('light.wall', 0, 0, 3, 2);
  // Courtyard: paving, a flower bed against the east wall, a tree, a bench.
  for (const [x, z] of [[2, 2], [3, 0], [3, 1], [3, 2]] as [number, number][]) s.add('street.paving', x, 0, z);
  s.add('garden.bed', 3, 0, 1).add('garden.tree', 3, 0, 2).add('furniture.bench', 3, 0, 0, 1);
  // A plain hanging sign on the east wall over the bed, for the house's name once signs carry text.
  s.add('sign.blank', 3, 0, 1, 3);
  return { id: '5e2a9c71-4d3b-4f08-a6e2-91c7d0b4f318' as BlueprintId, name: 'Lived-in cottage', parts: s.parts, groups: [] };
}

/**
 * Corner lane and courtyard (round 8, docs/WORKSHOP.md): a two-lane lane
 * turning a corner round a small kerbed courtyard. The centre line turns on
 * the lane corner piece, the outer cell of the bend has no marking, and a
 * kerb corner closes the two kerb runs where they meet. In the courtyard a
 * café pavilion on posts and beams under a gable roof with verge boards, a
 * table with two chairs, a bench facing the lane, a flower bed and a pot.
 */
export function cornerLane(): Blueprint {
  const s = new Sketch();
  // East arm: two rows, centre line on the z = 3 line.
  for (const x of [2, 3]) s.add('street.road', x, 0, 2, 0).add('street.road', x, 0, 3, 2);
  // South arm: two columns, centre line on the x = 1 line.
  for (const z of [0, 1]) s.add('street.road', 0, 0, z, 1).add('street.road', 1, 0, z, 3);
  // The bend: the line turns in (1, 2), the outer cell (0, 3) is plain.
  s.add('street.road.corner', 1, 0, 2, 3).add('street.road', 1, 0, 3, 2).add('street.road', 0, 0, 2, 1).add('street.road.plain', 0, 0, 3, 0);
  // Courtyard paving, kerbed along both lane arms, the kerbs turning round its corner.
  for (const x of [2, 3]) for (const z of [0, 1]) s.add('street.paving', x, 0, z);
  s.add('street.kerb.corner', 2, 0, 1, 3).add('street.kerb', 3, 0, 1, 0).add('street.kerb', 2, 0, 0, 3);
  // Pavilion over (3, 0)–(3, 1): six posts, six beams, a gable roof with verges on both ends.
  s.add('structure.column', 3, 0, 0, 2).add('structure.column', 3, 0, 0, 1).add('structure.column', 3, 0, 1, 2);
  s.add('structure.column', 3, 0, 1, 1).add('structure.column', 3, 0, 1, 3).add('structure.column', 3, 0, 1, 0);
  s.add('structure.beam', 3, 0, 0, 2).add('structure.beam', 3, 0, 0, 3).add('structure.beam', 3, 0, 0, 1);
  s.add('structure.beam', 3, 0, 1, 3).add('structure.beam', 3, 0, 1, 1).add('structure.beam', 3, 0, 1, 0);
  s.add('roof.slope', 3, 1, 0, 2).add('roof.slope', 3, 1, 1, 0);
  s.add('roof.verge.left', 3, 1, 0, 2).add('roof.verge.right', 3, 1, 0, 2).add('roof.verge.left', 3, 1, 1, 0).add('roof.verge.right', 3, 1, 1, 0);
  // Under it a table with two chairs and a bench facing the lane; a flower bed and a pot beside.
  s.add('furniture.table', 3, 0, 0).add('furniture.chair', 3, 0, 0, 1).add('furniture.chair', 3, 0, 0, 3);
  s.add('furniture.bench', 3, 0, 1, 0);
  s.add('garden.bed', 2, 0, 0).add('garden.pot', 2, 0, 1, 1);
  return { id: '8c41f2d6-7a9e-4b35-b0d8-2e6f9a1c5b74' as BlueprintId, name: 'Corner lane and courtyard', parts: s.parts, groups: [] };
}

/**
 * Pad-side stall (round 8, docs/WORKSHOP.md): a market stall beside a
 * landing pad, with a boardwalk in front and a ramp for carts down from the
 * pad to the ground. The stall's back and west walls carry hanging signs and
 * wall lanterns; sideboards make its counter; a pyramid roof of four hips
 * stands on its walls and on posts and beams along the open front. Crates
 * and barrels wait on the boardwalk; a lantern post lights the way.
 */
export function padStall(): Blueprint {
  const s = new Sketch();
  // Stall floor, walls on the back (south), west and the back half of the east side.
  for (const x of [0, 1]) for (const z of [0, 1]) s.add('floor.deck', x, 0, z);
  s.add('wall.solid', 0, 0, 0, 2).add('wall.solid', 1, 0, 0, 2).add('wall.solid', 0, 0, 0, 3).add('wall.solid', 0, 0, 1, 3).add('wall.solid', 1, 0, 0, 1);
  // Posts and beams along the open front and the front half of the east side.
  s.add('structure.column', 0, 0, 0, 2).add('structure.column', 1, 0, 0, 1).add('structure.column', 0, 0, 1, 3);
  s.add('structure.column', 0, 0, 1, 0).add('structure.column', 1, 0, 1, 0).add('structure.column', 1, 0, 1, 1);
  s.add('structure.beam', 0, 0, 1, 0).add('structure.beam', 1, 0, 1, 0).add('structure.beam', 1, 0, 1, 1);
  // Pyramid roof: a hip on every cell.
  s.add('roof.slope.hip', 0, 1, 0, 2).add('roof.slope.hip', 1, 1, 0, 1).add('roof.slope.hip', 1, 1, 1, 0).add('roof.slope.hip', 0, 1, 1, 3);
  // Inside: a counter along the front, a shelf and crates on the back wall, lanterns and the post sign.
  s.add('furniture.sideboard', 0, 0, 1, 0).add('furniture.sideboard', 1, 0, 1, 0);
  s.add('furniture.shelf', 0, 0, 0, 2).add('storage.crates', 1, 0, 0, 2);
  s.add('light.wall', 0, 0, 0, 3).add('light.wall', 0, 0, 1, 3).add('sign.mail', 1, 0, 0, 2);
  // Landing pad east of the stall, its cup sign on the stall's east wall.
  s.add('pad.quarter', 3, 0, 1, 0).add('pad.quarter', 2, 0, 1, 3).add('pad.quarter', 3, 0, 0, 1).add('pad.quarter', 2, 0, 0, 2);
  s.add('sign.cup', 2, 0, 0, 3);
  // Boardwalk in front, a railing along the ramp, cargo and a bench; a lantern post at its end.
  for (const x of [0, 1, 2]) for (const z of [2, 3]) s.add('floor.grate', x, 0, z);
  s.add('rail.guard', 2, 0, 2, 1).add('rail.guard', 2, 0, 3, 1);
  s.add('storage.barrel', 0, 0, 2, 3).add('storage.crates', 0, 0, 3, 3).add('storage.barrel', 2, 0, 2, 1);
  s.add('furniture.bench', 1, 0, 3, 0).add('service.light', 2, 0, 3, 0);
  // Ramp down from the pad to the ground for carts.
  s.add('ramp.entry', 3, 0, 2, 0);
  return { id: 'f1b7d3a9-2c6e-4085-9d4a-6b8e0c2f7a13' as BlueprintId, name: 'Pad-side stall', parts: s.parts, groups: [] };
}
