import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeObject3D } from '../assets/claude-geometry/core/dispose.ts';
import { PartBuilder } from '../assets/claude-geometry/style/geometry.ts';
import type { LodTier } from '../assets/claude-geometry/style/lod.ts';
import type { StyleLibrary } from '../assets/claude-geometry/style/materials.ts';
import { writeCover } from '../assets/claude-geometry/blueprint/cover.ts';
import { libraryMaterials, liningCastsNoShadow, makeKit, SLAB } from '../assets/claude-geometry/blueprint/parts/kit.ts';
import { groundCells } from '../assets/claude-geometry/blueprint/model.ts';
import { PLINTH_EMBED } from '../assets/claude-geometry/blueprint/model3d.ts';
import type { BlueprintModel, BlueprintModelOptions } from '../assets/claude-geometry/blueprint/model3d.ts';
import { emitPart, isOpenDoorPartId } from '../shared/blueprint-parts.ts';
import { homeDoorLeaves } from '../shared/home-door.ts';
import type { HomeDoorState } from '../shared/home-door.ts';
import { PART_COLLIDERS } from '../shared/physics/parts.ts';
import { VILLAGE_PART_BOUNDS } from '../shared/physics/village-bounds.ts';
import { placedTransform } from '../assets/claude-geometry/blueprint/placement.ts';
import type { GroundFit } from '../assets/claude-geometry/core/ground.ts';
import type { PlacedObject } from '../shared/planets.ts';
import type { CameraCutawayPart } from './camera-cutaway.ts';
import { partTransform, pivotOf, toVendorParts } from '../shared/blueprint-model.ts';
import type { PartPlacement } from '../shared/blueprint-model.ts';

export const CAMERA_PART_ATTRIBUTE = 'townCameraPart';
export interface CameraBlueprintModelOptions extends BlueprintModelOptions {
  /** A separately drawn home door stays in the identity list. Drawing, cover
   * and foundations still use the original visible-parts list unchanged. */
  identityParts?: readonly PartPlacement[];
}
export type CameraPartCategory = 'protected' | 'wall' | 'roof' | 'deck' | 'beam';
export function cameraPartCategory(part: PartPlacement): CameraPartCategory {
  if (['wall.solid', 'wall.window', 'wall.louvre', 'wall.corrugated'].includes(part.part)) return 'wall';
  if (['roof.slope', 'roof.slope.hip', 'roof.slope.valley', 'roof.verge.left', 'roof.verge.right', 'roof.parapet'].includes(part.part)) return 'roof';
  if (['floor.deck', 'floor.grate', 'roof.deck'].includes(part.part) && part.level > 0) return 'deck';
  if (part.part === 'structure.beam') return 'beam';
  return 'protected';
}
/** Local to one saved object. A slot is derived from stable part.n order, never
 * material, LOD, collider count, or the order in which chunks become ready. */
export function cameraPartSlots(parts: readonly PartPlacement[]) {
  const ordered = [...parts].sort((a, b) => a.n - b.n);
  if (ordered.length >= 65535 || new Set(ordered.map(part => part.n)).size !== ordered.length) throw new Error('Invalid camera part registry.');
  return new Map(ordered.map((part, index) => [part.n, cameraPartCategory(part) === 'protected' ? 0 : index + 1]));
}

/** Host adapter of the pinned ordinary blueprint factory. The public builder
 * flushes after each real part so provenance can be written before its second
 * material merge. No vendor source, primitive, placement or saved part changes. */
export function buildCameraBlueprintModel(parts: readonly PartPlacement[] | { parts: readonly PartPlacement[] }, lib: StyleLibrary, lod: LodTier = lib.lod, options: CameraBlueprintModelOptions = {}): BlueprintModel {
  const list = 'parts' in parts ? parts.parts : parts, begin = performance.now();
  const pivot = options.pivot ?? pivotOf(list), identities = options.identityParts ?? list, slots = cameraPartSlots(identities);
  const byNumber = new Map(identities.map(part => [part.n, part]));
  for (const part of list) {
    const identity = byNumber.get(part.n);
    if (!identity || identity.part !== part.part || identity.x !== part.x || identity.z !== part.z || identity.level !== part.level || identity.rot !== part.rot)
      throw new Error('Camera model part identity does not match the saved blueprint.');
  }
  const builder = new PartBuilder(lod), source = libraryMaterials(lib), kit = makeKit(builder, source);
  const ordered = [...list].sort((a, b) => a.n - b.n), group = new T.Group(); group.name = 'blueprint';
  const buckets = new Map<T.Material, T.BufferGeometry[]>(), emitters: unknown[] = [];
  const temporary: T.BufferGeometry[] = [];
  const flush = (slot: number) => {
    const built = builder.build('camera-blueprint-part'); emitters.push(...built.emitters);
    for (const child of built.group.children) {
      const mesh = child as T.Mesh, geometry = mesh.geometry, material = mesh.material as T.Material;
      geometry.setAttribute(CAMERA_PART_ATTRIBUTE, new T.Uint16BufferAttribute(new Uint16Array(geometry.attributes.position.count).fill(slot), 1));
      const bucket = buckets.get(material) ?? []; bucket.push(geometry); buckets.set(material, bucket); temporary.push(geometry);
    }
    built.group.clear();
  };
  try {
    for (const part of ordered) {
      const transform = partTransform(part, pivot);
      builder.within({ position: transform.position, rotation: [0, transform.yaw, 0] }, () => emitPart(part.part, lib.look, kit));
      flush(slots.get(part.n)!);
    }
    if (options.foundationDepth !== undefined) {
      const depth = Math.max(0, options.foundationDepth) + PLINTH_EMBED;
      for (const [x, z] of groundCells(toVendorParts(list))) builder.box(kit.m('concrete'), [1, depth, 1], { position: [x + .5 - pivot.x, -SLAB - depth / 2, z + .5 - pivot.z] }, 0);
      flush(0);
    }
    let triangles = 0;
    for (const [material, geometries] of buckets) {
      const geometry = mergeGeometries(geometries, false); if (!geometry) throw new Error('Camera blueprint material merge failed.');
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new T.Mesh(geometry, material); mesh.castShadow = builder.settings.shadows && !material.transparent; mesh.receiveShadow = builder.settings.shadows;
      group.add(mesh); triangles += geometry.attributes.position.count / 3;
    }
    if (emitters.length) group.userData.emitters = emitters;
    liningCastsNoShadow(group, source, lod);
    if (lib.look === 'village') { const lamp = source.get('lamp'); group.traverse(node => { if (node instanceof T.Mesh && node.material === lamp) node.castShadow = false; }); }
    if (lib.daylightIndoors) {
      writeCover(group, toVendorParts(list), pivot); const owned = new Set(source.owned());
      group.traverse(node => { if (node instanceof T.Mesh && !owned.has(node.material as T.Material)) node.material = lib.indoor(node.material as T.Material); });
    }
    if (options.sockets !== false) for (const part of ordered) {
      const transform = partTransform(part, pivot), socket = new T.Object3D(); socket.name = `part:${part.n}`; socket.userData = { n: part.n, part: part.part };
      socket.position.set(...transform.position); socket.rotation.y = transform.yaw; group.add(socket);
    }
    const owned = source.owned(); let disposed = false;
    return { object: group, triangles, drawCalls: buckets.size, buildMs: performance.now() - begin, get disposed() { return disposed; }, dispose() {
      if (disposed) return; disposed = true;
      const attached = new Set<T.Material>(); group.traverse(node => { if (node instanceof T.Mesh) (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => attached.add(material)); });
      disposeObject3D(group); for (const material of owned) if (!attached.has(material)) material.dispose();
    } };
  } catch (error) { disposeObject3D(group); for (const material of source.owned()) material.dispose(); throw error; }
  finally { for (const geometry of temporary) geometry.dispose(); }
}

/** Read-only provenance for the exact ordering in GroundWorld.structure. A
 * consumer must validate these expectations against the actual world once;
 * indices alone are not permission to cut a part. */
export function cameraBlueprintRegistry(object: PlacedObject, parts: readonly PartPlacement[], fit: GroundFit, homeDoor?: HomeDoorState): CameraCutawayPart[] {
  const slots = cameraPartSlots(parts), pivot = pivotOf(parts);
  const transform = placedTransform({ dir: object.position, yaw: object.rotation }, fit);
  const anchor = new T.Quaternion().fromArray(transform.quaternion), position = new T.Vector3(...transform.position);
  let colliderIndex = 0;
  return parts.map(part => {
    const local = partTransform(part, pivot), turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), local.yaw);
    const partQ = anchor.clone().multiply(turn), inverse = partQ.clone().invert(), origin = new T.Vector3(...local.position).applyQuaternion(anchor).add(position);
    const bounds = VILLAGE_PART_BOUNDS[part.part], category = cameraPartCategory(part);
    const center = new T.Vector3(...bounds.min).add(new T.Vector3(...bounds.max)).multiplyScalar(.5).applyQuaternion(partQ).add(origin);
    const half = new T.Vector3(...bounds.max).sub(new T.Vector3(...bounds.min)).multiplyScalar(.5);
    const planeUp = new T.Vector3(0, 1, 0).applyQuaternion(partQ), planePoint = origin.clone();
    // Deck origins are their authored top walking plane. Beams use their
    // actual lower face, since their part origin sits on the floor below.
    if (category === 'beam') planePoint.addScaledVector(planeUp, bounds.min[1]);
    const shapes = PART_COLLIDERS[part.part](), firstCollider = colliderIndex;
    const expectations = (boxes: ReturnType<typeof homeDoorLeaves>) => boxes.map((shape, offset) => {
      const center = new T.Vector3(...shape.center).applyQuaternion(turn).add(new T.Vector3(...local.position)).applyQuaternion(anchor).add(position);
      const q = anchor.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), local.yaw + (shape.yaw ?? 0)))
        .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), shape.pitch ?? 0));
      return { index: firstCollider + offset, tag: shape.tag, center: center.toArray() as [number, number, number], half: [...shape.half] as [number, number, number], inverseQuaternion: q.invert().toArray() as [number, number, number, number] };
    });
    // Only the authoritative home's separately drawn, immutable door gets
    // alternatives. Match an entire endpoint, never a mixture of leaf poses.
    const expectedColliderStates = homeDoor?.buildingId === object.id && homeDoor.partNumber === part.n && isOpenDoorPartId(part.part)
      ? [false, true].map(open => ({ state: open ? 'open' as const : 'closed' as const,
        colliders: expectations([...shapes.filter(shape => shape.tag !== 'sliding leaf' && shape.tag !== 'wide door leaf'), ...homeDoorLeaves(open, part.part as Parameters<typeof homeDoorLeaves>[1])]) })) : undefined;
    const expectedColliders = expectedColliderStates?.find(state => state.state === (homeDoor!.open ? 'open' : 'closed'))?.colliders ?? expectations(shapes);
    if (expectedColliderStates?.some(state => state.colliders.length !== expectedColliders.length)) throw new Error('Home door collider identities changed between endpoints.');
    colliderIndex += expectedColliders.length;
    return { objectId: object.id, partNumber: part.n, partId: part.part, level: part.level, partSlot: slots.get(part.n)!, category,
      planePoint: planePoint.toArray() as [number, number, number], planeUp: planeUp.toArray() as [number, number, number],
      center: center.toArray() as [number, number, number], half: half.toArray() as [number, number, number], inverseQuaternion: inverse.toArray() as [number, number, number, number], expectedColliders, ...(expectedColliderStates ? { expectedColliderStates } : {}) };
  });
}
