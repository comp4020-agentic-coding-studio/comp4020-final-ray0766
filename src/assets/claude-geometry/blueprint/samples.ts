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

/** One of every part, spread out on a single storey for side-by-side inspection. */
export function partsLineup(): Blueprint {
  const s = new Sketch();
  for (let x = 0; x <= 4; x++) for (let z = 0; z <= 1; z++) s.add('floor.deck', x, 0, z);
  s.add('wall.solid', 0, 0, 0, 2).add('wall.door', 1, 0, 0, 2).add('wall.window', 2, 0, 0, 2).add('wall.louvre', 3, 0, 0, 2).add('wall.corrugated', 4, 0, 0, 2);
  return { id: '0b6f3e1d-2a4c-4d8e-8f10-5c7a9e1b3d26' as BlueprintId, name: 'Parts lineup', parts: s.parts, groups: [] };
}
