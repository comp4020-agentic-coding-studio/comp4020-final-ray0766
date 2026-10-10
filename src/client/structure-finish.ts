import { Group, Mesh } from 'three';
import type { PartPlacement } from '../assets/claude-geometry/blueprint/model.ts';
import { edgeKey, pivotOf, rotDir, slotsOf, vertexKey } from '../assets/claude-geometry/blueprint/model.ts';
import { PARTS } from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import { libraryMaterials, SLAB, STOREY, WALL_H, WALL_T } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { KOSHI, TOP_BAND } from '../assets/claude-geometry/blueprint/parts/village/walls.ts';
import { disposeObject3D } from '../assets/claude-geometry/core/dispose.ts';
import { PartBuilder } from '../assets/claude-geometry/style/geometry.ts';
import type { StyleLibrary } from '../assets/claude-geometry/style/materials.ts';
import { worldMaterials } from './shared-assets.ts';

export const STRUCTURE_FINISH_VERSION = 3;
/** Additional reach beyond an existing slab/frieze/post face, never a floor surface. */
export const STRUCTURE_FINISH_MAX_PROJECTION = .02;
export interface FinishSegment {
  kind: 'slab-edge' | 'existing-eave' | 'existing-wall-joint';
  axis: 'x' | 'z';
  from: number; to: number; line: number; y: number;
  material: 'concrete' | 'post';
}

const cell = (x: number, z: number, level: number) => `${x},${z},${level}`;
const FLOOR_PARTS = new Set(['floor.deck', 'floor.grate', 'roof.deck']);

function edgeVertices(p: PartPlacement): [number, number][] {
  const [dx, dz] = rotDir(p.rot);
  return dz ? [[p.x, p.z + (dz > 0 ? 1 : 0)], [p.x + 1, p.z + (dz > 0 ? 1 : 0)]]
    : [[p.x + (dx > 0 ? 1 : 0), p.z], [p.x + (dx > 0 ? 1 : 0), p.z + 1]];
}

/** Only cover the join of two existing exterior end posts, not their open ends or corners. */
function wallJoints(parts: readonly PartPlacement[], pivot: { x: number; z: number }, occupied: ReadonlySet<string>,
  outside: ReadonlyMap<number, ReadonlySet<string>>, protectedEdges: ReadonlySet<string>, clearanceEdges: ReadonlySet<string>, protectedVertices: ReadonlySet<string>) {
  const ends = new Map<string, { x: number; z: number; walls: PartPlacement[] }>();
  for (const p of parts) {
    // Other wall profiles carry openings, shutters, battens or door casings.
    if (p.part !== 'wall.solid' || !occupied.has(cell(p.x, p.z, p.level))) continue;
    const [dx, dz] = rotDir(p.rot);
    if (!outside.get(p.level)?.has(cell(p.x + dx, p.z + dz, p.level)) || clearanceEdges.has(edgeKey(p.x, p.z, p.rot, p.level))) continue;
    for (const [x, z] of edgeVertices(p)) {
      const key = vertexKey(x, z, p.level), end = ends.get(key) ?? { x, z, walls: [] };
      end.walls.push(p); ends.set(key, end);
    }
  }
  const result: FinishSegment[] = [];
  for (const [key, { x, z, walls }] of ends) {
    if (walls.length !== 2 || protectedVertices.has(key)) continue;
    const [a, b] = walls;
    if (a.rot !== b.rot) continue;
    const ownEdges = new Set(walls.map(p => edgeKey(p.x, p.z, p.rot, p.level)));
    if (ownEdges.size !== 2) continue;
    // The other two edges at this vertex must be free of corners, guards,
    // explicit trim, beams, entry/stair approaches and their clearance rules.
    const incident = [edgeKey(x - 1, z - 1, 0, a.level), edgeKey(x, z - 1, 0, a.level),
      edgeKey(x - 1, z - 1, 1, a.level), edgeKey(x - 1, z, 1, a.level)];
    if (incident.some(edge => !ownEdges.has(edge) && protectedEdges.has(edge))) continue;
    const [dx, dz] = rotDir(a.rot), axis = dz ? 'x' : 'z';
    const along = axis === 'x' ? x - pivot.x : z - pivot.z;
    // Village timberOutside() has two 50 mm end posts, 15 mm proud of the plaster.
    // A 40 mm cover sits on those posts, extending their face by only 14 mm.
    const line = axis === 'x' ? z - pivot.z + dz * (WALL_T / 2 + .022)
      : x - pivot.x + dx * (WALL_T / 2 + .022);
    result.push({ kind: 'existing-wall-joint', axis, from: along - .02, to: along + .02, line,
      y: a.level * STOREY + (KOSHI + WALL_H - TOP_BAND) / 2, material: 'post' });
  }
  return result;
}

/** A versioned content fingerprint, not random variation. Names/groups stay private. */
function finishSeed(parts: readonly PartPlacement[]) {
  const document = JSON.stringify(parts.map(p => JSON.stringify([p.n, p.part, p.x, p.z, p.level, p.rot])).sort());
  let hash = 2166136261;
  for (let i = 0; i < document.length; i++) hash = Math.imul(hash ^ document.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Flood only empty cells connected to the outside; enclosed holes get no finish. */
function exteriorCells(parts: readonly PartPlacement[], occupied: ReadonlySet<string>, level: number) {
  const atLevel = parts.filter(p => p.level === level);
  const minX = Math.min(...atLevel.map(p => p.x)) - 1, maxX = Math.max(...atLevel.map(p => p.x)) + 1;
  const minZ = Math.min(...atLevel.map(p => p.z)) - 1, maxZ = Math.max(...atLevel.map(p => p.z)) + 1;
  const result = new Set<string>(), queue: [number, number][] = [[minX, minZ]];
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i], key = cell(x, z, level);
    if (x < minX || x > maxX || z < minZ || z > maxZ || occupied.has(key) || result.has(key)) continue;
    result.add(key);
    for (let side = 0; side < 4; side++) { const [dx, dz] = rotDir(side); queue.push([x + dx, z + dz]); }
  }
  return result;
}

function mergeSegments(segments: FinishSegment[]) {
  const groups = new Map<string, FinishSegment[]>();
  for (const segment of segments) {
    const key = JSON.stringify([segment.kind, segment.axis, segment.line, segment.y, segment.material]);
    const group = groups.get(key) ?? []; group.push(segment); groups.set(key, group);
  }
  const result: FinishSegment[] = [];
  for (const key of [...groups.keys()].sort()) {
    for (const segment of groups.get(key)!.sort((a, b) => a.from - b.from)) {
      const prior = result.at(-1);
      if (prior && prior.kind === segment.kind && prior.axis === segment.axis && prior.line === segment.line &&
        prior.y === segment.y && prior.material === segment.material && Math.abs(prior.to - segment.from) < 1e-8) prior.to = segment.to;
      else result.push({ ...segment });
    }
  }
  return result;
}

/**
 * Conservative adjacency finish, in the blueprint's ordinary local frame.
 * No geometry is inferred across an opening, and no roof/support is invented.
 * Pitched corners/verges have different profiles: leave their authored detail alone.
 */
export function planStructureFinish(parts: readonly PartPlacement[], pivot = pivotOf(parts)): FinishSegment[] {
  if (!parts.length) return [];
  const occupied = new Set<string>(), protectedEdges = new Set<string>(), clearanceEdges = new Set<string>(), protectedVertices = new Set<string>();
  const shapedRoof = new Set<string>();
  for (const p of parts) {
    const def = PARTS[p.part], slots = slotsOf(p);
    if (def.role === 'deck' || def.role === 'slope') occupied.add(cell(p.x, p.z, p.level));
    if (def.role === 'slope' && p.part !== 'roof.slope' || def.trim?.on === 'slope') shapedRoof.add(cell(p.x, p.z, p.level));
    // The slope's own gutter clearance permits its existing frieze facing.
    const clearance = def.role === 'slope' ? [] : slots.keepsClear.map(s => s.key);
    for (const key of [...clearance, ...slots.edgeRules.map(s => s.key), ...(slots.edgesTouched ?? [])]) {
      if (key.startsWith('edge ')) clearanceEdges.add(key);
    }
    for (const key of [...slots.occupies, ...clearance, ...slots.edgeRules.map(s => s.key), ...(slots.edgesTouched ?? [])]) {
      if (key.startsWith('edge ')) protectedEdges.add(key);
      if (key.startsWith('vertex ')) protectedVertices.add(key);
    }
    if (def.role === 'entry' || def.role === 'stair') for (const [x, z] of slots.cells) {
      for (const level of def.role === 'stair' ? [p.level, p.level + 1] : [p.level])
        for (let side = 0; side < 4; side++) {
          const key = edgeKey(x, z, side, level); protectedEdges.add(key); clearanceEdges.add(key);
        }
    }
  }
  const outside = new Map([...new Set(parts.map(p => p.level))].map(level => [level, exteriorCells(parts, occupied, level)]));
  const segments: FinishSegment[] = [];
  const add = (p: PartPlacement, side: number, reach: number, kind: FinishSegment['kind'], y: number, material: FinishSegment['material']) => {
    const [dx, dz] = rotDir(side), axis = dz ? 'x' : 'z';
    const centre = axis === 'x' ? p.x + .5 - pivot.x : p.z + .5 - pivot.z;
    const line = axis === 'x' ? p.z + .5 - pivot.z + dz * reach : p.x + .5 - pivot.x + dx * reach;
    segments.push({ kind, axis, from: centre - .5, to: centre + .5, line, y, material });
  };
  for (const p of parts) {
    if (FLOOR_PARTS.has(p.part)) for (let side = 0; side < 4; side++) {
      const [dx, dz] = rotDir(side);
      if (protectedEdges.has(edgeKey(p.x, p.z, side, p.level)) || !outside.get(p.level)!.has(cell(p.x + dx, p.z + dz, p.level))) continue;
      add(p, side, .505, 'slab-edge', p.level * STOREY - .092, p.part === 'floor.grate' ? 'post' : 'concrete');
    }
    if (p.part === 'roof.slope') {
      const [dx, dz] = rotDir(p.rot);
      const nearCorner = [cell(p.x, p.z, p.level), ...[0, 1, 2, 3].map(side => { const d = rotDir(side); return cell(p.x + d[0], p.z + d[1], p.level); })].some(key => shapedRoof.has(key));
      if (nearCorner || occupied.has(cell(p.x + dx, p.z + dz, p.level)) || protectedEdges.has(edgeKey(p.x, p.z, p.rot, p.level))) continue;
      // Village slopeRoof already has a frieze centred at z .55, depth .1.
      // Its new continuous facing stops at .614: only 14 mm beyond that face.
      add(p, p.rot, .607, 'existing-eave', p.level * STOREY - SLAB + .045, 'post');
    }
  }
  return mergeSegments([...segments, ...wallJoints(parts, pivot, occupied, outside, protectedEdges, clearanceEdges, protectedVertices)]);
}

/** Shared palette, at most two merged meshes. Caller attaches it to the existing model. */
export function buildStructureFinish(parts: readonly PartPlacement[], lib: StyleLibrary = worldMaterials(), options: { pivot?: { x: number; z: number } } = {}) {
  // The frieze dimensions above are specific to the existing village geometry.
  const segments = lib.look === 'village' ? planStructureFinish(parts, options.pivot) : [];
  const builder = new PartBuilder(lib.lod), materials = libraryMaterials(lib);
  for (const s of segments) {
    const length = s.to - s.from, thickness = s.kind === 'slab-edge' ? .02 : .014;
    const height = s.kind === 'slab-edge' ? .06 : s.kind === 'existing-wall-joint' ? WALL_H - TOP_BAND - KOSHI : .022;
    const along = (s.from + s.to) / 2;
    builder.box(materials.get(s.material), s.axis === 'x' ? [length, height, thickness] : [thickness, height, length],
      { position: s.axis === 'x' ? [along, s.y, s.line] : [s.line, s.y, along] }, 0);
  }
  // No ink shell: that would outline every thin strip as another black seam.
  const built = segments.length ? builder.build('structure-finish') : { group: new Group(), triangles: 0, drawCalls: 0 };
  const object = built.group, seed = finishSeed(parts);
  object.name = 'structure:finish';
  object.userData = { decorative: true, collision: false, support: false, finishVersion: STRUCTURE_FINISH_VERSION, finishSeed: seed, maxProjection: STRUCTURE_FINISH_MAX_PROJECTION };
  object.traverse(child => { if (child instanceof Mesh) { child.castShadow = false; child.receiveShadow = true; } });
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; disposeObject3D(object); };
  object.userData.disposeOwned = dispose;
  return { object, segments, seed, version: STRUCTURE_FINISH_VERSION, triangles: built.triangles, drawCalls: built.drawCalls,
    get disposed() { return disposed; }, dispose };
}
