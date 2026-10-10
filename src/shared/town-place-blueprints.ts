import type { Blueprint, PartPlacement, Rot } from './blueprint-model.ts';
import type { BlueprintId } from '../assets/claude-geometry/core/ids.ts';
import { districtWorkshopWithEntryStep } from './district-layout.ts';

/** Authored places made from the player's metre grid and ordinary catalogue.
 * No scales, private geometry, special supports or per-house lights. */
class PlaceSketch {
  parts: PartPlacement[] = [];
  add(part: PartPlacement['part'], x: number, z: number, rot: Rot = 0, level = 0) {
    this.parts.push({ n: this.parts.length + 1, part, x, z, rot, level });
    return this;
  }
  finish(id: string, name: string): Blueprint {
    return { id: id as BlueprintId, name, parts: this.parts, groups: [] };
  }
}

/** A three-by-three postal room with an exterior stair, a full-width upper
 * delivery gallery, and an offset pitched roof bay. Both floors have open
 * entrances. The original workshop stair and its ground entry remain intact. */
export function townPostHouse(): Blueprint {
  const blueprint = districtWorkshopWithEntryStep();
  blueprint.id = '6177e154-332d-4d16-bb46-b90100000001' as BlueprintId;
  blueprint.name = 'Town · stair postal house';
  blueprint.parts = blueprint.parts.filter(p => p.part !== 'light.wall' && p.part !== 'sign.cup');
  for (const p of blueprint.parts) {
    if (p.part === 'wall.door') p.part = 'wall.door.open';
    if (p.z === 1 && p.rot === 2 && (p.part.startsWith('wall.') || p.part === 'roof.parapet')) p.z = 0;
    if (p.part === 'structure.column' && p.z === 1 && ((p.x === 2 && p.rot === 2) || (p.x === 4 && p.rot === 1))) p.z = 0;
    if (p.part === 'furniture.sideboard') p.z = 0;
  }
  let next = Math.max(...blueprint.parts.map(p => p.n)) + 1;
  const add = (part: PartPlacement['part'], x: number, z: number, rot: Rot = 0, level = 0) =>
    blueprint.parts.push({ n: next++, part, x, z, rot, level });
  for (const level of [0, 1]) {
    for (const x of [2, 3, 4]) add('floor.deck', x, 0, 0, level);
    add('wall.solid', 2, 0, 3, level);
    add('wall.window', 4, 0, 1, level);
    // Carry the new centre bay on an actual post at both storeys.
    add('structure.column', 2, 1, 0, level);
  }
  add('roof.deck', 2, 0, 0, 2); add('roof.deck', 3, 0, 0, 2);
  add('roof.slope', 4, 0, 1, 2);
  add('roof.parapet', 2, 0, 3, 2); add('roof.parapet', 3, 0, 1, 2);
  add('sign.mail', 2, 2, 0);
  blueprint.parts.forEach((p, index) => { p.n = index + 1; });
  blueprint.groups = [
    { name: 'Postal rooms', members: blueprint.parts.filter(p => p.x >= 2 && p.z <= 2 && p.level <= 1).map(p => p.n) },
    { name: 'Exterior stair and gallery', members: blueprint.parts.filter(p => p.x < 2 || p.z === 3).map(p => p.n) },
    { name: 'Offset roof', members: blueprint.parts.filter(p => p.level === 2).map(p => p.n) },
  ];
  return blueprint;
}

/** A low five-bay working shed: an enclosed end wall, a continuous open front
 * and two separate entry steps. The front is a working colonnade rather than
 * five miniature house doors; cargo stays against the back wall. */
export function townLongWorkshop(): Blueprint {
  const s = new PlaceSketch();
  for (let x = 0; x < 5; x++) for (let z = 0; z < 2; z++) {
    s.add('floor.deck', x, z);
    s.add('roof.slope', x, z, z === 0 ? 2 : 0, 1);
  }
  for (let x = 0; x < 5; x++) s.add(x === 2 ? 'wall.window' : 'wall.corrugated', x, 0, 2);
  for (const z of [0, 1]) s.add('wall.solid', 0, z, 3).add(z === 0 ? 'wall.solid' : 'wall.window', 4, z, 1);
  // Six distinct posts carry the five open front beams.
  s.add('structure.column', 0, 1, 3);
  for (let x = 0; x < 5; x++) s.add('structure.column', x, 1).add('structure.beam', x, 1);
  s.add('structure.column', 0, 0, 2).add('structure.column', 4, 0, 1);
  s.add('step.entry', 1, 2).add('step.entry', 3, 2);
  s.add('storage.crates', 0, 0, 2).add('furniture.sideboard', 2, 0, 2).add('storage.barrel', 4, 0, 2);
  for (const z of [0, 1]) {
    const rot: Rot = z === 0 ? 2 : 0;
    s.add(z === 0 ? 'roof.verge.right' : 'roof.verge.left', 0, z, rot, 1);
    s.add(z === 0 ? 'roof.verge.left' : 'roof.verge.right', 4, z, rot, 1);
  }
  const blueprint = s.finish('6177e154-332d-4d16-bb46-b90100000002', 'Town · open working shed');
  blueprint.groups = [
    { name: 'Working bays', members: s.parts.filter(p => p.level === 0 && p.z === 0).map(p => p.n) },
    { name: 'Open colonnade', members: s.parts.filter(p => p.level === 0 && p.z >= 1).map(p => p.n) },
    { name: 'Long gable', members: s.parts.filter(p => p.level === 1).map(p => p.n) },
  ];
  return blueprint;
}

/** A two-cell-deep rear dwelling and two shallow side wings frame a real
 * three-by-two shared court. The main door sits at the back of that court,
 * and separate wing doors turn inward. The court remains open to the sky and
 * to the street: its six paving cells do not count as building roof coverage. */
export function townSharedCourt(): Blueprint {
  const s = new PlaceSketch();
  const enclosed = (x: number, z: number) => x >= 0 && x < 5 && z >= 0 && z < 4 && (z < 2 || x === 0 || x === 4);
  const door = (x: number, z: number, rot: Rot) => (x === 2 && z === 1 && rot === 0)
    || (x === 0 && z === 2 && rot === 1) || (x === 4 && z === 3 && rot === 3);
  for (let x = 0; x < 5; x++) for (let z = 0; z < 4; z++) {
    s.add(enclosed(x, z) ? 'floor.deck' : 'street.paving', x, z);
    if (!enclosed(x, z)) continue;
    s.add('roof.deck', x, z, 0, 1);
    for (const [rot, dx, dz] of [[0, 0, 1], [1, 1, 0], [2, 0, -1], [3, -1, 0]] as [Rot, number, number][]) {
      if (!enclosed(x + dx, z + dz)) {
        s.add(door(x, z, rot) ? 'wall.door.open' : (x + z + rot) % 3 === 0 ? 'wall.window' : 'wall.solid', x, z, rot);
        // Continuous, ordinary flat roof edging also outlines the six-cell
        // opening, so the court reads correctly from a globe overview.
        s.add('roof.parapet', x, z, rot, 1);
      }
    }
  }
  for (const [x, z, rot] of [[0, 0, 2], [4, 0, 1], [0, 3, 3], [4, 3, 0], [0, 1, 0], [4, 1, 3]] as [number, number, Rot][]) s.add('structure.column', x, z, rot);
  s.add('step.entry', 2, 4);
  // A single low planting edge leaves the centre and all three doors clear.
  s.add('garden.pot', 1, 3, 3);
  const blueprint = s.finish('6177e154-332d-4d16-bb46-b90100000003', 'Town · three-sided shared court');
  blueprint.groups = [
    { name: 'Rear dwelling', members: s.parts.filter(p => p.z < 2).map(p => p.n) },
    { name: 'Inward-facing wings', members: s.parts.filter(p => p.z >= 2 && (p.x === 0 || p.x === 4)).map(p => p.n) },
    { name: 'Open shared court', members: s.parts.filter(p => p.z >= 2 && p.x > 0 && p.x < 4).map(p => p.n) },
  ];
  return blueprint;
}

/** A harbour endpoint with a closed lower store and a genuinely open upper
 * lookout. The inherited exterior stair reaches that gallery. Its eight-cell
 * hipped canopy and uncovered side terrace change the silhouette and space,
 * not merely the postal house's sign, rotation or colour. */
export function townHarbourLookout(): Blueprint {
  const blueprint = townPostHouse();
  blueprint.id = '6177e154-332d-4d16-bb46-b90100000004' as BlueprintId;
  blueprint.name = 'Town · harbour lookout';
  blueprint.parts = blueprint.parts.filter(p => p.level !== 2 && p.part !== 'sign.mail'
    && !(p.level === 1 && p.part.startsWith('wall.') && ((p.z === 2 && p.rot === 0) || (p.x === 4 && (p.rot === 1 || p.rot === 2))))
    && !(p.level === 1 && p.part === 'structure.column' && p.x === 4));
  let next = Math.max(...blueprint.parts.map(p => p.n)) + 1;
  const add = (part: PartPlacement['part'], x: number, z: number, rot: Rot = 0, level = 1) =>
    blueprint.parts.push({ n: next++, part, x, z, rot, level });
  // Complete the real post-and-beam frame below the canopy. The outer side
  // terrace has ordinary low guards and stays open to the sky.
  add('structure.column', 2, 2); add('structure.column', 3, 2);
  for (const x of [2, 3]) add('structure.beam', x, 2);
  for (const z of [0, 1, 2]) add('rail.guard', 4, z, 1);
  add('rail.guard', 4, 0, 2);
  for (const x of [2, 3]) for (let z = 0; z <= 3; z++) {
    const corner = z === 0 || z === 3;
    const rot: Rot = z === 0 ? (x === 3 ? 1 : 2) : z === 3 ? (x === 2 ? 3 : 0) : x === 2 ? 3 : 1;
    add(corner ? 'roof.slope.hip' : 'roof.slope', x, z, rot, 2);
  }
  blueprint.parts.forEach((p, index) => { p.n = index + 1; });
  blueprint.groups = [
    { name: 'Harbour store', members: blueprint.parts.filter(p => p.level === 0 && p.x >= 2).map(p => p.n) },
    { name: 'Stair and lookout', members: blueprint.parts.filter(p => p.level === 1 || (p.level === 0 && p.x < 2)).map(p => p.n) },
    { name: 'Hipped canopy', members: blueprint.parts.filter(p => p.level === 2).map(p => p.n) },
  ];
  return blueprint;
}

/** A shallow three-bay front connects two larger buildings without using a
 * scaled house. The open middle bay and its step form the actual arrival. */
export function townStreetGallery():Blueprint {
 const s=new PlaceSketch();
 for(let x=0;x<3;x++){
  s.add('floor.deck',x,0).add('wall.corrugated',x,0,2).add('roof.slope',x,0,0,1);
  s.add('structure.column',x,0).add('structure.beam',x,0);
 }
 s.add('structure.column',0,0,3).add('structure.column',0,0,2).add('structure.column',2,0,1);
 s.add('wall.window',0,0,3).add('wall.window',2,0,1).add('step.entry',1,1);
 s.add('furniture.sideboard',0,0,2).add('storage.crates',2,0,2);
 return s.finish('6177e154-332d-4d16-bb46-b90100000005','Shallow street gallery');
}

/** An inhabited yard boundary with a seat and planting, open towards its
 * neighbouring house. The railing is real ordinary collision, not a label
 * that reclassifies an otherwise empty grass field as a courtyard. */
export function townCourtEdge(doorwayGap=false):Blueprint {
 const s=new PlaceSketch();
 for(let x=0;x<3;x++){
  s.add('street.paving',x,0);
  // The last bay can meet a neighbouring real doorway. Leave that bay
  // physically open while retaining its ordinary paving and other rails.
  if(!doorwayGap||x!==2)s.add('rail.guard',x,0,2);
 }
 for(let z=1;z<3;z++)s.add('street.paving',0,z).add('rail.guard',0,z,3);
 s.add('rail.guard',0,0,3).add('furniture.bench',1,0,2).add('garden.bed',0,2);
 return s.finish('6177e154-332d-4d16-bb46-b90100000006',doorwayGap?'Open doorway garden corner':'Seated garden corner');
}
