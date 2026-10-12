import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { Group, InstancedMesh, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { GroundWorld, STEP_HEIGHT } from '../src/shared/physics/world.ts';
import type { GroundPose } from '../src/shared/physics/world.ts';
import { TownResidentMotion } from '../src/shared/town-resident-motion.ts';
import { townResidents, townResidentAnchors, residentDialogue } from '../src/shared/town-residents.ts';
import type { TownResidentDefinition } from '../src/shared/town-residents.ts';
import { TownResidents } from '../src/client/town-residents.ts';
import { cameraPose, SurfaceWalker } from '../src/client/motion.ts';
import { anchorQuaternion, localToDir } from '../src/assets/claude-geometry/core/anchor.ts';
import type { PartPlacement } from '../src/shared/blueprint-model.ts';
import { structureFit, structureSize } from '../src/shared/blueprints.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { publicTown } from '../src/shared/public-town-layout.ts';
import type { PublicTown } from '../src/shared/public-town-layout.ts';
import { distance, NPCS } from '../src/shared/world.ts';
import type { Vec3 } from '../src/shared/world.ts';

const point = (x: number, z = 0): Vec3 => new Vector3(x, 10, z).normalize().toArray() as Vec3;
const plain = () => new GroundWorld({ id: 'resident-test', revision: 1, radius: 10, objects: [], blueprints: {} });
function definition(overrides: Partial<TownResidentDefinition> = {}): TownResidentDefinition {
  return { ...townResidents()[0], position: point(0), facing: point(1), ...overrides };
}

it('authors four conversation roles and twelve daily-life residents without new task state', () => {
  const definitions = townResidents(), snapshot = JSON.stringify(definitions);
  expect(definitions).toHaveLength(16);
  expect(new Set(definitions.map(d => d.id)).size).toBe(16);
  expect(definitions.filter(d => d.conversational)).toHaveLength(4);
  expect(definitions.filter(d => d.route)).toHaveLength(4);
  expect(new Set(definitions.map(d => d.accessory)).size).toBe(8);
  expect(new Set(definitions.map(d => d.activity)).size).toBe(8);
  for (const resident of definitions) {
    expect(resident.kind).toBe('resident');
    expect(Math.hypot(...resident.position)).toBeCloseTo(1, 9);
    for (const language of ['en', 'zh'] as const) {
      expect(resident.role[language].length).toBeGreaterThan(0);
      const lines = ['available', 'carrying', 'delivered'].map(quest => residentDialogue(resident.id, quest as 'available' | 'carrying' | 'delivered', language));
      if (resident.conversational) expect(new Set(lines).size).toBe(3);
      else expect(lines).toEqual(['', '', '']);
    }
  }
  expect(JSON.stringify(definitions)).toBe(snapshot);
  expect(townResidents({})).toEqual([]);
  const anchors = townResidentAnchors(), pristine = JSON.stringify(townResidentAnchors());
  anchors['ada-shop'].position[0] = 0;
  anchors['market-basket'].route![0][0] = 0;
  expect(JSON.stringify(townResidentAnchors()), 'Callers cannot mutate the authored world anchors or patrol points.').toBe(pristine);
});

it('moves a short patrol using supported spherical poses, waits for a player and stays within the route', () => {
  const world = plain(), start = point(0), end = point(1.5);
  const resident = new TownResidentMotion(world, definition({ activity: 'walk', phase: 0, speed: .6, route: [start, end] }));
  for (let i = 0; i < 40; i++) resident.tick(.05, start);
  expect(new Vector3(...resident.pose.position).angleTo(new Vector3(...start))).toBeLessThan(.001);
  let distance = 0;
  for (let i = 0; i < 500; i++) {
    resident.tick(.05);
    const current = new Vector3(...resident.pose.position);
    distance = Math.max(distance, current.angleTo(new Vector3(...start)) * 10);
    expect(current.length()).toBeCloseTo(1, 8);
    expect(world.blocked(resident.pose)).toBe(false);
    expect(resident.pose.radius).toBeGreaterThanOrEqual(world.radius(resident.pose.position) - .01);
    expect(current.x).toBeGreaterThanOrEqual(-.005);
    expect(current.x).toBeLessThanOrEqual(end[0] + .005);
  }
  expect(distance).toBeGreaterThan(1.2);
});

function wallWorld(parts: PartPlacement[] = [{ n: 1, part: 'floor.deck', x: 2, z: 2, rot: 0, level: 0 }, { n: 2, part: 'wall.solid', x: 2, z: 2, rot: 0, level: 0 }]) {
  const position: Vec3 = [0, 1, 0], radius = 10;
  const object = { id: 'ordinary-wall', kind: 'structure' as const, position, rotation: 0, version: 1, blueprintHash: 'wall', ...structureSize(parts) };
  const fit = structureFit(parts, position, 0, fieldOf(undefined, radius));
  const turn = new Quaternion().fromArray(anchorQuaternion({ dir: position, yaw: 0 }));
  const world = new GroundWorld({ id: 'resident-wall', revision: 1, radius, objects: [object], blueprints: { wall: parts } });
  const direction = (x: number, z: number) => new Vector3(x, 0, z).applyQuaternion(turn).addScaledVector(new Vector3(...position), fit.baseRadius).normalize().toArray() as Vec3;
  return { world, direction, fit };
}

it('does not walk a patrol through an ordinary kit wall or teleport when obstructed', () => {
  const { world, direction } = wallWorld(), from = direction(0, 2), to = direction(0, -2);
  const resident = new TownResidentMotion(world, definition({ position: from, phase: 0, activity: 'walk', route: [from, to] }));
  expect(resident.valid).toBe(true);
  for (let i = 0; i < 300; i++) {
    const before = new Vector3(...resident.pose.position); resident.tick(.05);
    expect(before.angleTo(new Vector3(...resident.pose.position)) * 10).toBeLessThanOrEqual(resident.definition.speed * .05 + .003);
    expect(world.blocked(resident.pose)).toBe(false);
    expect(resident.pose.position[2]).toBeGreaterThan(0);
  }
});

it('rejects conversation across solid walls, on another floor, out of range and while paused', () => {
  const { world, direction } = wallWorld(), resident = definition({ position: direction(0, 1.1) });
  const crowd = new TownResidents(new Group(), world, [resident]);
  const player = direction(0, 1.8), foot = world.pose(player).radius;
  expect(crowd.nearest(player, foot)?.id).toBe(resident.id);
  expect(crowd.nearest(direction(0, -.6), world.pose(direction(0, -.6)).radius)).toBe(null);
  expect(crowd.nearest(player, foot + 2.2)).toBe(null);
  expect(crowd.nearest(direction(0, 5), foot)).toBe(null);
  const camera = new PerspectiveCamera(45, 1, .1, 200); camera.position.set(0, 15, 6); camera.lookAt(0, 10, 0);
  crowd.update({ dt: .016, time: 1, viewer: player, camera, enabled: false });
  expect(crowd.root.visible).toBe(true);
  expect(crowd.nearest(player, foot)).toBe(null);
  crowd.dispose();
});

it('responds to E immediately after a menu closes before the next resident frame, without moving anyone', () => {
  // Execute the actual input and dialogue functions, without booting WebGL or
  // connecting a player. This reproduces the real 5.5 ms Resume -> E failure.
  const source = ts.createSourceFile('main.ts', readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = ['closeResidentConversation', 'renderResidentConversation', 'talkToResident', 'interact'];
  const functions = names.map(name => {
    const node = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    if (!node) throw Error('Production function unavailable: ' + name);
    return node.getText(source);
  });
  const input = source.statements.find(statement => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(source) === 'window.addEventListener'
    && statement.expression.arguments[0]?.getText(source) === "'keydown'"
    && statement.getText(source).includes('void interact()'));
  if (!input) throw Error('Production ground E handler unavailable');
  const compiled = ts.transpileModule([...functions, input.getText(source)].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None } }).outputText;
  const dom = new JSDOM('<dialog id="menu-dialog"></dialog><section id="conversation" hidden><span id="speaker"></span><span id="dialogue-text"></span></section>');
  const world = plain(), resident = definition({ id: 'nell-garden' }), crowd = new TownResidents(new Group(), world, [resident]);
  const player = point(.9), standing = world.pose(player), camera = new PerspectiveCamera(45, 1, .1, 200);
  camera.position.set(0, 15, 6); camera.lookAt(0, 10, 0);
  const document = dom.window.document, dialog = document.querySelector('dialog')!, conversation = document.querySelector<HTMLElement>('#conversation')!;
  const keys = new Set<string>(), context = {
    window: dom.window, document, Element: dom.window.Element,
    $: (id: string) => document.getElementById(id)!,
    setText: (node: HTMLElement, text: string) => { node.textContent = text; },
    state: { quest: 'available', location: { kind: 'exterior' }, flight: { mode: 'ground' } },
    speakingResident: null, residentConversationKey: '', conversationUntil: 0,
    standing, walker: { up: new Vector3(...player) }, residents: crowd, camera, reduced: true, elapsed: 1,
    near: null, nearDock: false, homeControls: null, teleportStations: null, homeInterior: null, homeTransition: false, photoPaused: false,
    flight: null, colony: null, busy: false, online: true, world: { npcs: [] },
    sceneLoadingActive: () => false, keys, target: null, jumpQueued: false, residentDialogue,
    clearInput: () => keys.clear(),
  };
  const pressE = () => dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }));
  try {
    runInNewContext(compiled, context);
    const positions = JSON.stringify(crowd.positions()), feet = JSON.stringify(standing);
    dialog.open = true;
    crowd.update({ dt: .016, time: 1, viewer: player, camera, enabled: false });
    pressE();
    expect(conversation.hidden, 'An open modal still blocks interaction.').toBe(true);
    expect(crowd.nearest(player, standing.radius)).toBe(null);
    // Close the menu, then dispatch E synchronously: no rendering tick, wait,
    // extra key, pose reset or replacement identity may repair the result.
    dialog.open = false;
    pressE();
    expect(conversation.hidden, 'The first E after Resume must not be swallowed by the cached paused frame.').toBe(false);
    expect(conversation.dataset.resident).toBe(resident.id);
    expect(document.querySelector('#dialogue-text')!.textContent).toBe(residentDialogue(resident.id, 'available', 'en'));
    expect(JSON.stringify(crowd.positions())).toBe(positions);
    expect(JSON.stringify(standing)).toBe(feet);
    expect(context.state.quest).toBe('available');
  } finally { crowd.dispose(); dom.window.close(); }
});

it('batches every resident into four shared primitive meshes and releases owned GPU resources once', () => {
  const parent = new Group(), crowd = new TownResidents(parent, plain(), townResidents().map((d, i) => ({ ...d, position: point(i * .8), route: undefined })));
  const batches = crowd.root.children as InstancedMesh[];
  expect(batches).toHaveLength(4);
  expect(batches.every(mesh => mesh.isInstancedMesh)).toBe(true);
  expect(new Set(batches.map(mesh => mesh.material)).size).toBe(1);
  expect(crowd.diagnostics.triangles).toBeLessThan(40000);
  let geometries = 0, materials = 0;
  batches.forEach(mesh => mesh.geometry.addEventListener('dispose', () => geometries++));
  const material = batches[0].material;
  if (!Array.isArray(material)) material.addEventListener('dispose', () => materials++);
  const before = JSON.stringify(crowd.positions());
  const camera = new PerspectiveCamera(45, 1, .1, 200); camera.position.set(0, 30, 15); camera.lookAt(0, 0, 0);
  crowd.update({ dt: .1, time: 4, viewer: point(0), camera, enabled: false });
  expect(JSON.stringify(crowd.positions())).toBe(before);
  crowd.greet('ada-shop', 4); crowd.greet('ada-shop', 4);
  expect(JSON.stringify(crowd.positions())).toBe(before);
  crowd.dispose(); crowd.dispose();
  expect(parent.children).toHaveLength(0);
  expect(geometries).toBe(4); expect(materials).toBe(1);
});

it('submits only camera-visible residents and can orbit a paused photograph without losing the far-side cast', () => {
  const world = plain(), parent = new Group();
  const crowd = new TownResidents(parent, world, [definition(), definition({ id: 'south-fixture', position: [0, -1, 0], facing: point(1) })]);
  const camera = new PerspectiveCamera(45, 1, .1, 200); camera.position.set(0, 30, 5); camera.lookAt(0, 0, 0);
  crowd.update({ dt: 0, time: 0, viewer: point(0), camera, enabled: false });
  expect(crowd.diagnostics.visible).toBe(1);
  expect(crowd.diagnostics.visibleInstances).toBeGreaterThan(0);
  expect(crowd.diagnostics.visibleInstances).toBeLessThan(crowd.diagnostics.instances);
  expect(crowd.diagnostics.visibleTriangles).toBeLessThan(crowd.diagnostics.triangles);
  const before = JSON.stringify(crowd.positions());
  camera.position.set(0, -30, 5); camera.lookAt(0, 0, 0);
  crowd.update({ dt: 0, time: 0, viewer: point(0), camera, enabled: false });
  expect(crowd.diagnostics.visible).toBe(1);
  expect(crowd.diagnostics.visibleInstances).toBeGreaterThan(0);
  expect(JSON.stringify(crowd.positions())).toBe(before);
  crowd.dispose();
});

// These are integration checks on the actual authored town, independent of the
// small synthetic walls above. A layout edit must move its inhabitants or leave
// these checks failing; the renderer hiding an invalid actor is not acceptance.
let authored: { town: PublicTown; world: GroundWorld } | undefined;
const authoredTown = () => {
  if (authored) return authored;
  // A preparation run may explicitly bind one frozen candidate. Normal CI uses
  // the real public ledger; it must not silently accept a stale v9 layout.
  const snapshot = process.env.TOWN_RESIDENT_SNAPSHOT;
  let town: PublicTown;
  if (snapshot) {
    const bytes = readFileSync(snapshot), expected = process.env.TOWN_RESIDENT_SNAPSHOT_SHA256;
    expect(expected, 'A candidate run must bind its exact bytes.').toMatch(/^[a-f0-9]{64}$/);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
    town = JSON.parse(bytes.toString()) as PublicTown;
  } else town = publicTown(21.6);
  expect(town.version, 'These world anchors belong to the v14 planned main planet.').toBe(14);
  const world = new GroundWorld({ ...town, id: 'resident-authored-test', revision: 0 });
  // Include the unchanged shared ship obstacle without auto-appending another
  // public village to this explicit, hash-bound object ledger.
  const harbour = new GroundWorld({ id: 'hub', radius: 10, revision: 0, objects: [], blueprints: {} });
  const ship = harbour.bodies.find(body => body.objectId === 'hub-ship');
  if (!ship?.round) throw new Error('Shared harbour ship obstacle is missing.');
  world.bodies.push({ ...ship, round: { ...ship.round, base: world.radius(ship.dir.toArray() as Vec3) } });
  authored = { town, world };
  return authored;
};
function supportedPose(world: GroundWorld, point: Vec3): GroundPose {
  const pose = world.pose(point);
  return { ...pose, radius: world.support(point, pose.radius + STEP_HEIGHT).radius };
}
function residentClothClear(world: GroundWorld, pose: GroundPose) {
  const up = new Vector3(...pose.position), right = new Vector3(1, 0, 0).projectOnPlane(up);
  if (right.lengthSq() < .01) right.set(0, 0, 1).projectOnPlane(up);
  right.normalize(); const forward = new Vector3().crossVectors(up, right);
  // Player capsule plus .24 m offsets gives a conservative .42 m outer width
  // for cloth, sleeves and held props. No collision proxy or mesh is changed.
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const position = up.clone().addScaledVector(right, Math.cos(angle) * .24 / pose.radius)
      .addScaledVector(forward, Math.sin(angle) * .24 / pose.radius).normalize().toArray() as Vec3;
    if (!world.blocked({ ...pose, position })) continue;
    // The wider capsule is an advisory cloth envelope, not an extra flat pair
    // of feet. Its offset foot may rest on a nearby stone step, but may only
    // reach support through the unchanged ordinary walking controller.
    const support = world.support(position, pose.radius + STEP_HEIGHT), rise = support.radius - pose.radius;
    if (rise <= 0 || rise > STEP_HEIGHT) return false;
    let adjacent = { ...pose, position: [...pose.position] as Vec3 };
    for (let step = 1; step <= 2; step++) {
      const target = up.clone().lerp(new Vector3(...position), step / 2).normalize().toArray() as Vec3;
      adjacent = world.move(adjacent, target, .04);
    }
    if (!adjacent.grounded || world.blocked(adjacent) || distance(adjacent.position, position, world.baseRadius) > .02
      || Math.abs(adjacent.radius - support.radius) > .02) return false;
  }
  return true;
}

it('allows only a reachable small paving step under an advisory foot while still rejecting furniture and walls below an upper floor', () => {
  const paving: PartPlacement = { n: 1, part: 'street.paving', x: 2, z: 2, rot: 0, level: 0 };
  const step = wallWorld([paving]), pose = supportedPose(step.world, step.direction(-.8, 0));
  expect(step.world.blocked(pose)).toBe(false);
  expect(step.world.blocked({ ...pose, position: step.direction(-.56, 0) }), 'This fixture must exercise the offset foot, not an already clear envelope.').toBe(true);
  expect(residentClothClear(step.world, pose)).toBe(true);
  const furniture = wallWorld([paving, { ...paving, n: 2, part: 'furniture.sideboard' }]);
  const besideTable = supportedPose(furniture.world, furniture.direction(.65, .2));
  expect(furniture.world.blocked(besideTable)).toBe(false);
  expect(residentClothClear(furniture.world, besideTable), 'Do not lift a cloth probe to a table or ignore a real side obstruction.').toBe(false);
  const wall = wallWorld([paving, { ...paving, n: 2, part: 'wall.solid' }, { ...paving, n: 3, part: 'floor.deck', level: 1 }]);
  const besideWall = supportedPose(wall.world, wall.direction(0, .9));
  expect(wall.world.blocked(besideWall)).toBe(false);
  expect(residentClothClear(wall.world, besideWall), 'The support ceiling must never raise the probe onto a different storey.').toBe(false);
});

it('seats all eighteen residents beside their planned doorways and streets without embedding bodies or clothing in town solids', () => {
  const { world } = authoredTown(), definitions = townResidents();
  const inhabitants = [...definitions, ...Object.entries(NPCS).map(([id, npc]) => ({ id, position: npc.position }))];
  expect(inhabitants).toHaveLength(18);
  const failures = inhabitants.flatMap(definition => {
    const pose = supportedPose(world, definition.position);
    return world.blocked(pose) || !residentClothClear(world, pose) ? [definition.id] : [];
  });
  expect(failures, 'Real public ledger resident placement failures; do not hide actors or substitute synthetic fixtures.').toEqual([]);
}, 15000);

it('gives each of the four authored speakers a real unobstructed walking approach across the interaction boundary', () => {
  const { town, world } = authoredTown(), definitions = townResidents();
  const crowd = new TownResidents(new Group(), world, definitions);
  const inaccessible: string[] = [];
  try {
    for (const resident of definitions.filter(d => d.conversational)) {
      const up = new Vector3(...resident.position), front = new Vector3(...resident.facing!).projectOnPlane(up).normalize();
      const right = new Vector3().crossVectors(up, front).normalize();
      let accessible = false;
      for (let i = 0; i < 24 && !accessible; i++) {
        const angle = i * Math.PI / 12, direction = front.clone().multiplyScalar(Math.cos(angle)).addScaledVector(right, Math.sin(angle));
        const start = up.clone().addScaledVector(direction, 2.8 / town.radius).normalize().toArray() as Vec3;
        const destination = up.clone().addScaledVector(direction, 1.45 / town.radius).normalize().toArray() as Vec3;
        let pose = supportedPose(world, start);
        const end = supportedPose(world, destination);
        if (world.blocked(pose) || world.blocked(end) || crowd.nearest(destination, end.radius)?.id !== resident.id) continue;
        if (crowd.nearest(start, pose.radius)?.id === resident.id) continue;
        // Ordinary 3 m/s player movement, no recovery, jump or collision bypass.
        for (let step = 0; step < 90; step++) {
          const gap = distance(pose.position, destination, town.radius);
          if (gap < .08) break;
          const from = new Vector3(...pose.position), toward = new Vector3(...destination).projectOnPlane(from).normalize();
          const next = from.clone().addScaledVector(toward, Math.min(gap, 3 / 60) / pose.radius).normalize().toArray() as Vec3;
          pose = world.move(pose, next, 1 / 60);
          if (world.blocked(pose)) break;
        }
        accessible = pose.grounded && !world.blocked(pose) && distance(pose.position, destination, town.radius) < .08
          && crowd.nearest(pose.position, pose.radius)?.id === resident.id;
      }
      if (!accessible) inaccessible.push(resident.id);
    }
    expect(inaccessible, 'Speakers need a reachable player capsule within 2.2 m, compatible height and an unblocked eye line.').toEqual([]);
  } finally { crowd.dispose(); }
});

it('walks the glasshouse door path to Nell with room for sleeves and an unobstructed facing camera', () => {
  const { town, world } = authoredTown(), nell = townResidents().find(d => d.id === 'nell-garden')!;
  // v12: Nell stands beside the glasshouse's door path; the route runs street → path end → doorstep.
  const route = town.routes.find(r => r.id === 'door-glasshouse')!;
  const closest = route.points.slice(1).reduce((best, p) => distance(p, nell.position, town.radius) < distance(best, nell.position, town.radius) ? p : best);
  const points = [route.points[0], closest];
  const crowd = new TownResidents(new Group(), world, [nell]);
  let pose = supportedPose(world, points[0]);
  try {
    for (const target of points.slice(1)) {
      for (let tick = 0; tick < 600 && distance(pose.position, target, town.radius) >= .02; tick++) {
        const gap = distance(pose.position, target, town.radius), up = new Vector3(...pose.position);
        const forward = new Vector3(...target).projectOnPlane(up).normalize(), angle = Math.min(.05, gap) / pose.radius;
        const desired = up.clone().multiplyScalar(Math.cos(angle)).addScaledVector(forward, Math.sin(angle)).normalize().toArray() as Vec3;
        pose = world.move(pose, desired, 1 / 60);
        expect(pose.grounded).toBe(true); expect(world.blocked(pose)).toBe(false);
        expect(residentClothClear(world, pose), 'The door path needs room for sleeves and the carried parcel.').toBe(true);
      }
      expect(distance(pose.position, target, town.radius)).toBeLessThan(.02);
    }
    expect(crowd.nearest(pose.position, pose.radius)?.id).toBe(nell.id);
    const up = new Vector3(...pose.position), toward = new Vector3(...nell.position).projectOnPlane(up).normalize();
    for (const portrait of [false, true]) for (const sign of [1, -1]) {
      const north = toward.clone().multiplyScalar(sign), walker = new SurfaceWalker(pose.position);
      walker.north.copy(north); walker.facing.copy(north);
      const normal = cameraPose(walker, portrait, false, town.radius);
      normal.position.addScaledVector(up, pose.radius - town.radius);
      const head = up.clone().multiplyScalar(pose.radius + 1.35);
      expect(world.cameraDistance(head, normal.position), 'Nell must not require the hidden-player close camera when facing her or turning back to the street.').toBeGreaterThanOrEqual(2.5);
    }
    void PerspectiveCamera; void Quaternion; void anchorQuaternion; void localToDir; void structureFit; void fieldOf;
  } finally { crowd.dispose(); }
}, 15000);

it('replays all four authored short patrols against the actual town for sixty seconds without clipping or abandoning a waypoint', () => {
  const { town, world } = authoredTown(), failures: { id: string; invalid: boolean; blockedSteps: number; clothingSamplesBlocked: number; missedWaypoints: number[]; excessiveSteps: number }[] = [];
  for (const definition of townResidents().filter(d => d.route)) {
    const motion = new TownResidentMotion(world, definition), route = definition.route!;
    const nearest = route.map(() => Infinity);
    let blockedSteps = 0, clothingSamplesBlocked = 0, excessiveSteps = 0;
    for (let i = 0; i < 1200; i++) {
      const previous = [...motion.pose.position] as Vec3; motion.tick(.05);
      if (world.blocked(motion.pose)) blockedSteps++;
      if (i % 10 === 0 && !residentClothClear(world, motion.pose)) clothingSamplesBlocked++;
      if (distance(previous, motion.pose.position, town.radius) > definition.speed * .05 + .01) excessiveSteps++;
      route.forEach((point, index) => nearest[index] = Math.min(nearest[index], distance(point, motion.pose.position, town.radius)));
    }
    const missedWaypoints = nearest.flatMap((gap, index) => gap > .15 ? [index] : []);
    if (!motion.valid || blockedSteps || clothingSamplesBlocked || missedWaypoints.length || excessiveSteps)
      failures.push({ id: definition.id, invalid: !motion.valid, blockedSteps, clothingSamplesBlocked, missedWaypoints, excessiveSteps });
  }
  expect(failures, 'Real public ledger patrol failures; runtime reversal/pausing is not proof of a valid authored route.').toEqual([]);
});

it('keeps all sixteen real residents together without permanently blocking patrols and resumes after the player leaves', () => {
  const { town, world } = authoredTown(), motions = townResidents().map(definition => new TownResidentMotion(world, definition));
  const basket = motions.find(m => m.definition.id === 'market-basket')!;
  const waitingPosition = [...basket.pose.position] as Vec3;
  const tick = (viewer?: Vec3) => {
    const neighbours = motions.map(m => [...m.pose.position] as Vec3);
    motions.forEach((motion, index) => motion.tick(.05, viewer, neighbours.filter((_, other) => other !== index)));
  };
  for (let i = 0; i < 80; i++) tick(waitingPosition);
  expect(distance(waitingPosition, basket.pose.position, town.radius), 'A player in the lane must be allowed to pause a resident.').toBeLessThan(.01);
  const patrols = motions.filter(m => m.definition.route), nearest = patrols.map(m => m.definition.route!.map(() => Infinity));
  const clipped = new Set<string>();
  for (let i = 0; i < 1200; i++) {
    tick();
    patrols.forEach((motion, index) => {
      if (world.blocked(motion.pose) || (i % 10 === 0 && !residentClothClear(world, motion.pose))) clipped.add(motion.definition.id);
      motion.definition.route!.forEach((point, waypoint) => nearest[index][waypoint] = Math.min(nearest[index][waypoint], distance(point, motion.pose.position, town.radius)));
    });
  }
  expect([...clipped], 'Avoidance must not push a resident into town solids.').toEqual([]);
  const stranded = patrols.flatMap((motion, index) => nearest[index].some(gap => gap > .15) ? [motion.definition.id] : []);
  expect(stranded, 'Fixed residents and neighbouring patrols must not permanently block a whole short route once the player leaves.').toEqual([]);
});
