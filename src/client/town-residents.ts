import * as T from 'three';
import { applyArtMaterial, ART_PALETTE } from './art-profile.ts';
import { GroundWorld } from '../shared/physics/world.ts';
import { TownResidentMotion } from '../shared/town-resident-motion.ts';
import { townResidents, RESIDENT_INTERACT_DISTANCE, RESIDENT_INTERACT_HEIGHT } from '../shared/town-residents.ts';
import type { TownResidentDefinition } from '../shared/town-residents.ts';
import type { Vec3 } from '../shared/world.ts';

type Shape = 'box' | 'sphere' | 'cylinder' | 'cone';
interface Piece { node: T.Object3D; shape: Shape; color: T.Color; detail: boolean; slot: number }
interface Rig {
  anchor: T.Group; body: T.Group; head: T.Group; leftArm: T.Group; rightArm: T.Group;
  leftForearm: T.Group; rightForearm: T.Group; leftLeg: T.Group; rightLeg: T.Group;
  leftKnee: T.Group; rightKnee: T.Group; pieces: Piece[];
  workTool?: T.Group; wateringCan?: T.Group; water?: T.Object3D; sortingPaper?: T.Group;
}
interface Resident {
  definition: TownResidentDefinition; motion: TownResidentMotion; rig: Rig;
  elapsed: number; renderElapsed: number; greetUntil: number; visible: boolean; distance: number;
}
export interface TownResidentFrame {
  dt: number; time: number; viewer: Vec3; camera: T.Camera; reducedMotion?: boolean; enabled?: boolean;
}
const palette = { clay: ART_PALETTE.clay, sage: ART_PALETTE.sage, cream: ART_PALETTE.cream, blue: '#6b8796', ochre: '#bb914f' };
const skin = ['#d9b78c', '#b98765', '#805b46', '#e0bf9e'];
const ink = ART_PALETTE.ink, timber = ART_PALETTE.wood, cream = ART_PALETTE.cream;
const zero = new T.Matrix4().makeScale(0, 0, 0);

/** A two-segment reach in the shoulder's forward plane. The original .25 m
 * upper arm and .255 m forearm keep their lengths; only shoulder/elbow turn.
 * The target is in the resident's own metre frame, before the globe anchor. */
function workReach(rig: Rig, side: 'left' | 'right', height: number, forward: number) {
  const arm = side === 'left' ? rig.leftArm : rig.rightArm;
  const forearm = side === 'left' ? rig.leftForearm : rig.rightForearm;
  const target = new T.Vector3(arm.position.x, height, forward)
    .sub(rig.body.position).applyEuler(new T.Euler(-rig.body.rotation.x, 0, 0)).sub(arm.position);
  const upper = .25, lower = Math.hypot(.255, .014);
  const reach = Math.min(upper + lower - .001, Math.hypot(target.y, target.z));
  const bend = Math.acos(T.MathUtils.clamp((reach * reach - upper * upper - lower * lower) / (2 * upper * lower), -1, 1));
  const shoulder = Math.atan2(target.z, -target.y) - Math.atan2(lower * Math.sin(bend), upper + lower * Math.cos(bend));
  arm.rotation.set(-shoulder, 0, 0);
  forearm.rotation.set(-bend + Math.atan2(.014, .255), 0, 0);
}

/** Original host-owned residents, using the same village material adapter and
 * metre scale as the courier. Four instanced primitive batches share all models;
 * no cloned courier, skinned meshes, per-person textures or animation mixers. */
function residentRig(definition: TownResidentDefinition, index: number): Rig {
  const anchor = new T.Group(), body = new T.Group(), head = new T.Group();
  const leftArm = new T.Group(), rightArm = new T.Group(), leftLeg = new T.Group(), rightLeg = new T.Group();
  const leftForearm = new T.Group(), rightForearm = new T.Group(), leftKnee = new T.Group(), rightKnee = new T.Group();
  anchor.add(body, leftLeg, rightLeg); body.position.y = .89;
  body.add(head, leftArm, rightArm); head.position.y = .36;
  leftArm.position.set(-.25, .22, 0); rightArm.position.set(.25, .22, 0);
  leftLeg.position.set(-.105, .63, 0); rightLeg.position.set(.105, .63, 0);
  const pieces: Piece[] = [];
  let workTool: T.Group | undefined, wateringCan: T.Group | undefined, water: T.Object3D | undefined, sortingPaper: T.Group | undefined;
  const piece = (parent: T.Object3D, shape: Shape, color: string, position: Vec3, size: Vec3, detail = false) => {
    const node = new T.Object3D(); node.position.fromArray(position); node.scale.fromArray(size); parent.add(node);
    pieces.push({ node, shape, color: new T.Color(color), detail, slot: -1 }); return node;
  };
  const coat = palette[definition.coat], face = skin[index % skin.length];
  const broad = definition.occupation === 'repairer' || definition.occupation === 'porter';
  piece(body, 'sphere', coat, [0, .075, 0], [broad ? .51 : .44, .45, .33]);
  piece(body, 'cylinder', coat, [0, -.14, 0], [broad ? .43 : .35, .22, .3]);
  piece(body, 'box', timber, [0, -.23, 0], [broad ? .4 : .33, .065, .3]);
  piece(body, 'sphere', '#465553', [0, -.285, -.005], [.33, .15, .29]);
  piece(body, 'box', cream, [0, .235, .11], [.14, .055, .11]);
  piece(head, 'sphere', face, [0, .04, 0], [.33, .37, .32]);
  piece(head, 'sphere', timber, [0, .13, -.025], [.35, .22, .3]);
  for (const x of [-.065, .065]) piece(head, 'sphere', ink, [x, .057, .151], [.025, .029, .018], true);
  piece(head, 'sphere', ink, [0, -.055, .15], [.048, .013, .013], true);
  for (const [arm, forearm] of [[leftArm, leftForearm], [rightArm, rightForearm]]) {
    piece(arm, 'sphere', coat, [0, -.08, 0], [.17, .25, .19]);
    piece(arm, 'cylinder', coat, [0, -.16, 0], [.15, .18, .17]);
    arm.add(forearm); forearm.position.y = -.25;
    piece(forearm, 'cylinder', coat, [0, -.10, 0], [.12, .2, .15]);
    piece(forearm, 'cylinder', cream, [0, -.195, 0], [.135, .045, .16]);
    piece(forearm, 'sphere', face, [0, -.255, .014], [.135, .14, .14]);
  }
  for (const [leg, knee] of [[leftLeg, leftKnee], [rightLeg, rightKnee]]) {
    piece(leg, 'cylinder', '#465553', [0, -.13, 0], [.185, .26, .20]);
    leg.add(knee); knee.position.y = -.28;
    piece(knee, 'cylinder', '#465553', [0, -.12, 0], [.14, .24, .16]);
    piece(knee, 'box', timber, [0, -.30, .055], [.185, .11, .28]);
    piece(knee, 'box', '#bc965f', [0, -.255, .055], [.17, .025, .22]);
  }
  const apron = () => {
    piece(body, 'box', cream, [0, -.065, .169], [.27, .38, .027]);
    piece(body, 'box', timber, [0, -.06, .19], [.2, .1, .022], true);
    for (const x of [-.11, .11]) piece(body, 'box', cream, [x, .19, .151], [.033, .15, .033]);
  };
  switch (definition.accessory) {
    case 'apron': apron(); break;
    case 'tools': {
      piece(body, 'box', timber, [0, -.19, 0], [.43, .09, .34]);
      const hammer = piece(body, 'box', timber, [-.23, -.26, .04], [.033, .25, .032], true); hammer.rotation.z = -.15;
      piece(hammer, 'box', ART_PALETTE.iron, [0, .5, 0], [3.5, .25, 1.8], true);
      piece(head, 'cylinder', coat, [0, .21, 0], [.35, .12, .35]);
      piece(head, 'box', coat, [0, .17, .11], [.34, .035, .28]);
      break;
    }
    case 'sunhat':
      piece(head, 'cylinder', '#c9af72', [0, .185, 0], [.58, .04, .55]);
      piece(head, 'cone', '#c9af72', [0, .265, 0], [.35, .16, .33]);
      apron();
      break;
    case 'mailbag': {
      const strap = piece(body, 'box', timber, [0, .05, .173], [.037, .58, .026]); strap.rotation.z = -.53;
      piece(body, 'box', '#bc965f', [.235, -.23, .025], [.23, .27, .18]);
      piece(body, 'box', cream, [.24, -.2, .124], [.16, .07, .018], true);
      piece(head, 'cylinder', coat, [0, .22, 0], [.33, .08, .32]);
      piece(head, 'box', coat, [0, .185, .13], [.28, .025, .25]);
      break;
    }
    case 'book':
      piece(body, 'box', ART_PALETTE.clay, [0, -.01, .33], [.39, .065, .27]);
      piece(body, 'box', cream, [0, .03, .33], [.35, .025, .23]);
      piece(body, 'box', timber, [0, .047, .33], [.018, .012, .23], true);
      break;
    case 'basket':
      piece(leftArm, 'cylinder', '#bc965f', [0, -.65, .04], [.34, .25, .29]);
      for (const x of [-.14, .14]) piece(leftArm, 'box', timber, [x, -.48, .04], [.027, .16, .035]);
      piece(leftArm, 'box', timber, [0, -.4, .04], [.31, .03, .035]);
      piece(leftArm, 'sphere', ART_PALETTE.leaf, [-.06, -.52, .04], [.14, .11, .16]);
      break;
    case 'shawl':
      piece(body, 'cone', cream, [0, .17, 0], [.62, .28, .37]);
      piece(head, 'sphere', timber, [0, .08, -.18], [.19, .2, .16]);
      break;
    case 'cap':
      piece(head, 'sphere', coat, [0, .185, -.025], [.36, .15, .32]);
      piece(head, 'box', coat, [0, .16, .115], [.28, .026, .21]);
      break;
  }
  if (definition.activity === 'repair') {
    // The same original host-made hand wrench serves apron-wearing makers too.
    // Its wrist stays connected to the original hand, never a floating prop.
    workTool = new T.Group(); workTool.position.set(0, -.255, .014); rightForearm.add(workTool);
    piece(workTool, 'box', ART_PALETTE.iron, [0, 0, .105], [.035, .04, .23]);
    piece(workTool, 'box', ART_PALETTE.iron, [0, 0, .23], [.095, .04, .07]);
  }
  if (definition.activity === 'tend') {
    wateringCan = new T.Group(); wateringCan.position.set(0, -.255, .014); leftForearm.add(wateringCan);
    piece(wateringCan, 'cylinder', ART_PALETTE.iron, [0, -.16, .035], [.17, .2, .17]);
    for (const x of [-.065, .065]) piece(wateringCan, 'box', ART_PALETTE.iron, [x, -.025, .035], [.023, .09, .027]);
    piece(wateringCan, 'box', ART_PALETTE.iron, [0, .02, .035], [.15, .025, .027]);
    const spout = piece(wateringCan, 'cylinder', ART_PALETTE.iron, [.05, -.085, .205], [.035, .25, .035]);
    spout.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(.10, .09, .23).normalize());
    piece(wateringCan, 'sphere', ART_PALETTE.iron, [.10, -.04, .33], [.055, .045, .05]);
    water = piece(anchor, 'cylinder', '#79aaa4', [0, 0, 0], [.012, 1, .012]);
  }
  if (definition.activity === 'sort') {
    sortingPaper = new T.Group(); sortingPaper.position.set(0, -.255, .014); leftForearm.add(sortingPaper);
    piece(sortingPaper, 'box', cream, [.025, -.06, .045], [.17, .008, .16]);
    piece(sortingPaper, 'box', timber, [.025, -.055, .045], [.12, .002, .008], true);
  }
  if (definition.activity === 'read' || definition.activity === 'rest') {
    // A small personal stool is part of the pose, not a new world structure.
    piece(anchor, 'box', timber, [0, .45, -.03], [.38, .07, .34]);
    for (const x of [-.14, .14]) for (const z of [-.14, .1]) piece(anchor, 'box', timber, [x, .21, z], [.045, .43, .045]);
  }
  return { anchor, body, head, leftArm, rightArm, leftForearm, rightForearm, leftLeg, rightLeg, leftKnee, rightKnee, pieces, workTool, wateringCan, water, sortingPaper };
}

export class TownResidents {
  readonly root = new T.Group();
  readonly definitions: readonly TownResidentDefinition[];
  readonly diagnostics = { residents: 0, conversational: 0, invalidAnchors: [] as string[], visible: 0, animated: 0, moving: 0, batches: 4, instances: 0, triangles: 0, visibleInstances: 0, visibleTriangles: 0, movementReversals: 0 };
  private residents: Resident[];
  private batches: Record<Shape, T.InstancedMesh>;
  private world: GroundWorld;
  private disposed = false;
  private enabled = true;
  private animationTime = 0;
  private frustum = new T.Frustum();
  private projection = new T.Matrix4();
  private basis = new T.Matrix4();
  private cameraPosition = new T.Vector3();
  private eye = new T.Vector3();
  private forward = new T.Vector3();
  private right = new T.Vector3();
  private up = new T.Vector3();
  private sphere = new T.Sphere(new T.Vector3(), 1.3);

  constructor(parent: T.Object3D, world: GroundWorld, definitions: readonly TownResidentDefinition[] = townResidents()) {
    this.world = world; this.definitions = definitions; this.root.name = 'town-residents';
    this.residents = definitions.map((definition, index) => ({ definition, motion: new TownResidentMotion(world, definition), rig: residentRig(definition, index), elapsed: 0, renderElapsed: Infinity, greetUntil: 0, visible: false, distance: 0 }));
    const shapes: Record<Shape, T.BufferGeometry> = {
      box: new T.BoxGeometry(1, 1, 1), sphere: new T.SphereGeometry(.5, 10, 8),
      cylinder: new T.CylinderGeometry(.5, .5, 1, 8), cone: new T.ConeGeometry(.5, 1, 8),
    };
    const material = applyArtMaterial(new T.MeshStandardMaterial({ color: '#ffffff', roughness: .9, metalness: 0 }));
    material.userData.ownedResource = true;
    this.batches = {} as Record<Shape, T.InstancedMesh>;
    for (const shape of Object.keys(shapes) as Shape[]) {
      const count = this.residents.reduce((n, resident) => n + resident.rig.pieces.filter(piece => piece.shape === shape).length, 0);
      const batch = new T.InstancedMesh(shapes[shape], material, Math.max(1, count));
      batch.name = `resident-${shape}`; batch.count = count; batch.frustumCulled = false;
      batch.castShadow = true; batch.receiveShadow = true;
      batch.instanceMatrix.setUsage(T.DynamicDrawUsage); this.root.add(batch); this.batches[shape] = batch;
      this.diagnostics.triangles += (shapes[shape].index?.count ?? shapes[shape].attributes.position.count) / 3 * count;
    }
    const slots: Record<Shape, number> = { box: 0, sphere: 0, cylinder: 0, cone: 0 };
    for (const resident of this.residents) {
      if (!resident.motion.valid) this.diagnostics.invalidAnchors.push(resident.definition.id);
      for (const piece of resident.rig.pieces) {
        piece.slot = slots[piece.shape]++; this.batches[piece.shape].setColorAt(piece.slot, piece.color);
        this.batches[piece.shape].setMatrixAt(piece.slot, zero);
      }
    }
    this.diagnostics.instances = Object.values(slots).reduce((a, b) => a + b, 0);
    this.diagnostics.residents = definitions.length; this.diagnostics.conversational = definitions.filter(d => d.conversational).length;
    for (const resident of this.residents) if (resident.motion.valid) {
      this.pose(resident, 0, true); resident.rig.anchor.updateMatrixWorld(true);
      for (const piece of resident.rig.pieces) this.batches[piece.shape].setMatrixAt(piece.slot, piece.node.matrixWorld);
    }
    for (const batch of Object.values(this.batches)) batch.instanceMatrix.needsUpdate = true;
    parent.add(this.root);
  }

  update({ dt, time, viewer, camera, reducedMotion = false, enabled = true }: TownResidentFrame) {
    if (this.disposed) return;
    // Menus and photo mode pause life; the town must not empty behind the UI.
    this.enabled = enabled;
    if (enabled) this.animationTime = time;
    camera.updateMatrixWorld(); camera.getWorldPosition(this.cameraPosition);
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.projection);
    const viewerVector = new T.Vector3(...viewer), eyeRadius = this.cameraPosition.length();
    this.diagnostics.visible = 0; this.diagnostics.animated = 0; this.diagnostics.moving = 0;
    let dirty = false;
    for (const resident of this.residents) {
      const { motion, rig } = resident;
      resident.elapsed += enabled ? Math.min(.1, Math.max(0, dt)) : 0;
      resident.renderElapsed += enabled ? Math.min(.1, Math.max(0, dt)) : 0;
      this.up.fromArray(motion.pose.position);
      const distance = this.up.angleTo(viewerVector) * this.world.baseRadius;
      resident.distance = distance;
      this.sphere.center.copy(this.up).multiplyScalar(motion.pose.radius + .8);
      const horizon = this.sphere.center.dot(this.cameraPosition) >= this.world.baseRadius ** 2 - 2.8 * eyeRadius;
      const visible = motion.valid && horizon && this.frustum.intersectsSphere(this.sphere);
      const interval = distance < 9 ? 1 / 30 : distance < 18 ? 1 / 10 : .5;
      if (visible) this.diagnostics.visible++;
      if (enabled && visible && distance < 18 && resident.elapsed >= .1) {
        motion.tick(resident.elapsed, viewer, this.residents.filter(r => r !== resident && r.motion.valid).map(r => r.motion.pose.position)); resident.elapsed = 0;
        if (motion.moving) this.diagnostics.moving++;
      } else if (!visible || distance >= 18) resident.elapsed = 0;
      if (visible === resident.visible && resident.renderElapsed < interval) continue;
      resident.visible = visible; resident.renderElapsed = 0; dirty = true;
      if (visible) {
        this.diagnostics.animated++;
        this.pose(resident, this.animationTime, reducedMotion || distance >= 18);
        rig.anchor.updateMatrixWorld(true);
      }
    }
    this.diagnostics.movementReversals = this.residents.reduce((n, r) => n + r.motion.reversals, 0);
    // Pack only visible pieces, so horizon/frustum and detail LOD also reduce
    // submitted vertices instead of leaving zero-scaled hidden GPU instances.
    if (dirty) {
      const slots: Record<Shape, number> = { box: 0, sphere: 0, cylinder: 0, cone: 0 };
      for (const resident of this.residents) if (resident.visible) for (const piece of resident.rig.pieces) {
        if (piece.detail && resident.distance > 12) continue;
        const batch = this.batches[piece.shape], slot = slots[piece.shape]++;
        batch.setMatrixAt(slot, piece.node.matrixWorld); batch.setColorAt(slot, piece.color);
      }
      this.diagnostics.visibleInstances = 0; this.diagnostics.visibleTriangles = 0;
      for (const shape of Object.keys(this.batches) as Shape[]) {
        const batch = this.batches[shape]; batch.count = slots[shape]; batch.instanceMatrix.needsUpdate = true;
        if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
        this.diagnostics.visibleInstances += batch.count;
        this.diagnostics.visibleTriangles += (batch.geometry.index?.count ?? batch.geometry.attributes.position.count) / 3 * batch.count;
      }
    }
  }

  private pose(resident: Resident, time: number, reduced: boolean) {
    const { rig, definition, motion } = resident, t = time + definition.phase;
    this.up.fromArray(motion.pose.position); this.forward.fromArray(motion.heading).projectOnPlane(this.up).normalize();
    this.right.crossVectors(this.up, this.forward).normalize(); this.forward.crossVectors(this.right, this.up).normalize();
    this.basis.makeBasis(this.right, this.up, this.forward); rig.anchor.quaternion.setFromRotationMatrix(this.basis);
    rig.anchor.position.copy(this.up).multiplyScalar(motion.pose.radius);
    const stride = motion.moving && !reduced ? Math.sin(t * 4.4) : 0;
    rig.body.position.y = .89; rig.body.rotation.set(0, 0, 0); rig.head.rotation.set(0, 0, 0);
    rig.leftLeg.position.set(-.105, .63, 0); rig.rightLeg.position.set(.105, .63, 0);
    rig.leftLeg.rotation.set(stride * .38, 0, 0); rig.rightLeg.rotation.set(-stride * .38, 0, 0);
    rig.leftKnee.rotation.set(Math.max(0, -stride) * .35, 0, 0); rig.rightKnee.rotation.set(Math.max(0, stride) * .35, 0, 0);
    rig.leftArm.rotation.set(-stride * .3, 0, .06); rig.rightArm.rotation.set(stride * .3, 0, -.06);
    rig.leftForearm.rotation.set(-.12, 0, 0); rig.rightForearm.rotation.set(-.12, 0, 0);
    if (definition.activity === 'read' || definition.activity === 'rest') {
      rig.body.position.y = .7;
      for (const leg of [rig.leftLeg, rig.rightLeg]) { leg.position.y = .5; leg.position.z = 0; leg.rotation.x = -1.1; }
      rig.leftKnee.rotation.x = 1.1; rig.rightKnee.rotation.x = 1.1;
      rig.body.rotation.x = .06; rig.head.rotation.x = definition.activity === 'read' ? .23 : -.04;
      if (definition.activity === 'read') { rig.leftArm.rotation.x = -.65; rig.rightArm.rotation.x = -.65; rig.leftForearm.rotation.x = -.55; rig.rightForearm.rotation.x = -.55; }
    } else if (definition.activity === 'repair') {
      rig.body.rotation.x = .11; rig.head.rotation.x = .2;
      const lift = reduced ? .015 : (1 + Math.sin(t * 1.8)) * .015;
      workReach(rig, 'right', .975 + lift, .43);
      if (rig.workTool) rig.workTool.rotation.x = .25 - rig.body.rotation.x - rig.rightArm.rotation.x - rig.rightForearm.rotation.x;
    } else if (definition.activity === 'tend') {
      rig.body.rotation.x = .18; rig.head.rotation.x = .24;
      workReach(rig, 'left', .87, .44);
      if (rig.wateringCan && rig.water) {
        rig.wateringCan.rotation.x = .3 - rig.body.rotation.x - rig.leftArm.rotation.x - rig.leftForearm.rotation.x;
        // Compute the water from the actual can mouth in the anchor's frame.
        // A short stream ends at bed height; it never changes body dimensions.
        rig.body.updateMatrixWorld(true);
        const mouth = rig.wateringCan.localToWorld(new T.Vector3(.10, -.04, .33));
        rig.anchor.worldToLocal(mouth);
        const end = new T.Vector3(mouth.x, .225, mouth.z + .025), delta = end.clone().sub(mouth);
        rig.water.position.copy(mouth).add(end).multiplyScalar(.5);
        rig.water.scale.set(.012, delta.length(), .012);
        rig.water.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
      }
    } else if (definition.activity === 'sort') {
      rig.body.rotation.x = .10; rig.head.rotation.x = .12;
      const lift = reduced ? .006 : (1 + Math.sin(t * 1.3)) * .006;
      workReach(rig, 'left', .96 + lift, .48);
      workReach(rig, 'right', .97, .46);
      if (rig.sortingPaper) rig.sortingPaper.rotation.x = -rig.body.rotation.x - rig.leftArm.rotation.x - rig.leftForearm.rotation.x;
    } else if (definition.activity === 'chat') {
      rig.head.rotation.y = reduced ? 0 : Math.sin(t * .4) * .08;
      rig.rightArm.rotation.x = -.35; rig.rightArm.rotation.z = -.24 + (reduced ? 0 : Math.sin(t) * .09);
    }
    if (time < resident.greetUntil && !reduced) {
      // Wave beside the shoulder; never sweep a hand through the face or hat.
      // Repairers acknowledge a visitor with the free hand, keeping the wrench
      // over its bench instead of sweeping a tool beside their head.
      const arm = rig.workTool ? rig.leftArm : rig.rightArm, forearm = rig.workTool ? rig.leftForearm : rig.rightForearm;
      const side = rig.workTool ? -1 : 1;
      arm.rotation.z = side * .85; arm.rotation.x = -.12;
      forearm.rotation.z = side * (2.2 + Math.sin(time * 7) * .1); forearm.rotation.x = -.1;
    }
  }

  /** Uses current ground height and solid geometry, so no roof-level or through-wall conversations. */
  nearest(position: Vec3, feetRadius = this.world.radius(position)): TownResidentDefinition | null {
    if (this.disposed || !this.enabled) return null;
    const player = new T.Vector3(...position), eye = player.clone().multiplyScalar(feetRadius + 1.35);
    let nearest: TownResidentDefinition | null = null, best = RESIDENT_INTERACT_DISTANCE;
    for (const resident of this.residents) {
      if (!resident.definition.conversational || !resident.motion.valid) continue;
      const { pose } = resident.motion, up = new T.Vector3(...pose.position);
      const distance = player.angleTo(up) * this.world.baseRadius;
      if (distance > best || Math.abs(feetRadius - pose.radius) > RESIDENT_INTERACT_HEIGHT) continue;
      this.eye.copy(up).multiplyScalar(pose.radius + 1.3);
      if (this.world.cameraDistance(eye, this.eye) + .03 < eye.distanceTo(this.eye)) continue;
      nearest = resident.definition; best = distance;
    }
    return nearest;
  }

  greet(id: string, time: number) {
    const resident = this.residents.find(r => r.definition.id === id);
    if (resident?.definition.conversational) resident.greetUntil = Math.max(resident.greetUntil, time + 1.2);
  }

  /** Read-only diagnostic poses, never the player's saved state. */
  positions() { return this.residents.map(r => ({ id: r.definition.id, position: [...r.motion.pose.position] as Vec3, radius: r.motion.pose.radius, valid: r.motion.valid, moving: r.motion.moving })); }

  dispose() {
    if (this.disposed) return; this.disposed = true; this.root.removeFromParent();
    const materials = new Set<T.Material>();
    for (const batch of Object.values(this.batches)) { batch.geometry.dispose(); (Array.isArray(batch.material) ? batch.material : [batch.material]).forEach(m => materials.add(m)); batch.dispose(); }
    materials.forEach(material => material.dispose()); this.root.clear();
  }
}
