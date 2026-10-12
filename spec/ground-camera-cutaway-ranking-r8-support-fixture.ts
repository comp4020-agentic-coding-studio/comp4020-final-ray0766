import { readFileSync } from 'node:fs';
import * as T from 'three';
import { GroundCameraCutawayRig } from '../src/client/ground-camera-cutaway.ts';
import type { GroundCameraCutawayDiagnostics, GroundCameraCutawayInput } from '../src/client/ground-camera-cutaway.ts';
import { certifyCameraFrame } from '../src/client/camera-frame-collision.ts';
import type { CameraFrameAvatarBound, CameraFrameCertificate } from '../src/client/camera-frame-collision.ts';
import { CameraShipCollision } from '../src/client/camera-ship-collision.ts';
import { createPublicTownArt } from '../src/client/public-town-art.ts';
import { samplePublicVillage } from '../src/shared/sample-public-village.ts';
import { GroundWorld } from '../src/shared/physics/world.ts';

type Point = [number, number, number];
type Capture = {
  schema: string; source: string; sourceIndexSha256: string; worldRevision: number;
  bootstrap: { frameSeq: number; eye: Point; feet: Point; up: Point; view: Point; heading: Point; pitch: number;
    avatarBounds: CameraFrameAvatarBound[]; parkedShip: { bounds: { min: Point; max: Point }; solidBounds: { min: Point; max: Point }; matrixWorld: number[] } };
  inputs: { frameSeq: number; feet: Point; up: Point; heading: Point; pitch: number; radius: number; portrait: boolean;
    fov: number; aspect: number; dt: number; avatarBounds: CameraFrameAvatarBound[] }[];
};
export const rankingCapture = JSON.parse(readFileSync(new URL('./fixtures/ground-camera-cutaway-ranking-r8-support-prefix.json', import.meta.url), 'utf8')) as Capture;
const vector = (p: Point) => new T.Vector3(...p);

/** Actual capture132 bootstrap and two continuous inputs. No live setters or API.
 * Multiple candidate plans share one committed history until the chosen commit. */
export function replayRankingFocused(Rig = GroundCameraCutawayRig) {
  const world = new GroundWorld({ id: 'hub', radius: 21.6, revision: rankingCapture.worldRevision, objects: [], blueprints: {} });
  const town = createPublicTownArt(samplePublicVillage(21.6), 21.6, { cameraCutaway: true }), controller = town.cutaway;
  if (!controller) { town.dispose(); throw Error('Missing real town controller'); }
  const bootstrap = rankingCapture.bootstrap, ship = new CameraShipCollision();
  const shipBounds = new T.Box3(vector(bootstrap.parkedShip.bounds.min), vector(bootstrap.parkedShip.bounds.max));
  ship.update(new T.Box3(vector(bootstrap.parkedShip.solidBounds.min), vector(bootstrap.parkedShip.solidBounds.max)), new T.Matrix4().fromArray(bootstrap.parkedShip.matrixWorld));
  const rawShip = (a: T.Vector3, b: T.Vector3, radius: number) => {
    if (new T.Box3().setFromPoints([a, b]).expandByScalar(radius).intersectsBox(shipBounds)) throw Error('Captured broadphase overlap requires real raw ship narrowphase');
    return a.distanceTo(b);
  };
  let avatarBounds = bootstrap.avatarBounds, dt = 0;
  const context = { world, planCurrent: (plan: CameraFrameCertificate['plan']) => controller.validateFramePlan(plan),
    probeParked: rawShip, probeParkedSafety: (a: T.Vector3, b: T.Vector3, radius: number) => ship.distance(a, b, radius),
    get avatarBounds() { return avatarBounds; } };
  const prepare = (proposal: Parameters<typeof certifyCameraFrame>[0]) => {
    const plan = controller.planFrame({ world, ...proposal, dt, cameraException: true, diagnostics: true,
      opticalTargetPoints: avatarBounds.flatMap(box => box.corners) });
    return certifyCameraFrame(proposal, plan, context);
  };
  try {
    const initial = prepare({ eye: vector(bootstrap.eye), feet: vector(bootstrap.feet), up: vector(bootstrap.up), direction: vector(bootstrap.view), probeRadius: .2 });
    if (!initial.accepted) throw Error('Actual bootstrap certificate rejected');
    controller.commitFrame(initial.plan);
    const rig = new Rig();
    // This fixture starts at the real already-committed capture35 history.
    Object.assign(rig, { eye: vector(bootstrap.eye), feet: vector(bootstrap.feet), up: vector(bootstrap.up), view: vector(bootstrap.view), heading: vector(bootstrap.heading), pitch: bootstrap.pitch });
    return rankingCapture.inputs.map(frame => {
      dt = frame.dt; avatarBounds = frame.avatarBounds;
      const certificates: CameraFrameCertificate[] = [], diagnostics: GroundCameraCutawayDiagnostics = { schema: 'ground-camera-attempt-v1', candidates: [] };
      let committed: CameraFrameCertificate | undefined, validBeforeCommit: boolean[] = [], validAfterCommit: boolean[] = [];
      const input: GroundCameraCutawayInput = { ...frame, feet: vector(frame.feet), up: vector(frame.up), heading: vector(frame.heading), diagnostics,
        probe: (a, b, radius) => Math.min(world.cameraDistance(a, b, radius), rawShip(a, b, radius)),
        certifyFrame: proposal => { const certificate = prepare(proposal); certificates.push(certificate); return certificate; },
        commitFrame: certificate => {
          validBeforeCommit = certificates.map(candidate => controller.validateFramePlan(candidate.plan));
          if (!certificate.accepted || !controller.validateFramePlan(certificate.plan)) return false;
          controller.commitFrame(certificate.plan); committed = certificate;
          validAfterCommit = certificates.map(candidate => controller.validateFramePlan(candidate.plan));
          return true;
        } };
      const pose = rig.update(input);
      return { frame, pose, diagnostics, certificates, committed, validBeforeCommit, validAfterCommit };
    });
  } finally { town.dispose(); }
}
