import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { rankingCapture, replayRankingFocused } from './ground-camera-cutaway-ranking-r8-support-fixture.ts';

const vector = (p: unknown) => new Vector3(...(p as [number, number, number]));
describe('captured continuous cutaway candidate ranking', () => {
  it('retains the eight original goals and commits the selected authentic plan after multiple preparations', () => {
    expect(rankingCapture.schema).toBe('captured-camera-ranking-prefix-v1');
    expect(rankingCapture.bootstrap.frameSeq).toBe(132);
    expect(rankingCapture.inputs.map(frame => frame.frameSeq)).toEqual([133, 134]);
    const frames = replayRankingFocused();
    expect(frames.some(result => result.diagnostics.selectedCandidate! >= 8)).toBe(true);
    for (const result of frames) {
      const { diagnostics, pose, certificates, committed } = result;
      expect(diagnostics.status).toBe('accepted'); expect(diagnostics.candidates).toHaveLength(14);
      expect(certificates.length).toBeGreaterThan(1);
      expect(result.validBeforeCommit.every(Boolean)).toBe(true);
      expect(result.validAfterCommit.every(value => !value)).toBe(true);
      const selected = diagnostics.candidates[diagnostics.selectedCandidate!];
      expect(selected.status).toBe('accepted');
      expect(selected.eye).toEqual(pose.position.toArray()); expect(selected.direction).toEqual(pose.direction.toArray());
      expect(selected.frameCertificate!.frameId).toBe(committed!.plan.frameId);
      expect(pose.frameCertificate).toBe(committed);
      // These actual frames choose a plan prepared before the last candidate.
      expect(committed).not.toBe(certificates.at(-1));
      expect(committed!.accepted).toBe(true); expect(committed!.diagnostics.radius).toBe(.2);
      expect(committed!.rawEndpointClear && committed!.rawSweepClear).toBe(true);
      expect(committed!.diagnostics.optical.residual).toEqual([]);
      expect(committed!.diagnostics.avatarOptical.boxes).toBe(19);
      expect(committed!.diagnostics.avatarOptical.intersections).toEqual([]);
      const context = diagnostics.context!, history = context.history as Record<string, unknown>, resolved = context.resolved as Record<string, unknown>;
      const feet = vector(result.frame.feet), oldEye = vector(history.eye), oldFeet = vector(history.feet);
      const up = vector(resolved.up), right = vector(resolved.right), anchor = vector(resolved.anchor), nominal = vector(resolved.nominalEye);
      const step = resolved.maximumStep as number, cap = (resolved.desiredDistance as number) + .25 - 1e-6;
      expect(Math.abs(pose.avoidanceYaw)).toBeLessThan(Math.PI / 2 + 1e-7);
      expect(Math.abs(pose.framingPitch)).toBeLessThan(.30 + 1e-7);
      const previousView = vector(history.view).applyQuaternion(new Quaternion().fromArray(resolved.transport as number[]));
      expect(previousView.angleTo(pose.direction)).toBeLessThan((resolved.angleBudget as number) + 1e-7);
      expect(pose.position.distanceTo(oldEye)).toBeLessThan(step + 1e-7);
      const transport = new Quaternion().fromArray(resolved.transport as number[]), yaw = resolved.yawStep as number;
      const followed = feet.clone().add(oldEye.clone().sub(oldFeet).applyQuaternion(transport).applyAxisAngle(up, yaw));
      const side = Math.sign(followed.clone().sub(nominal).dot(right)) || 1;
      const sideGoal = (sign: number) => anchor.clone().add(followed.clone().addScaledVector(right, sign * step).sub(anchor).clampLength(0, cap));
      const offset = feet.clone().add(oldEye.clone().sub(oldFeet).applyQuaternion(transport)).sub(anchor);
      const horizontal = offset.clone().projectOnPlane(up); horizontal.setLength(Math.max(0, horizontal.length() - step));
      const retract = anchor.clone().add(horizontal).addScaledVector(up, offset.dot(up)), arm = nominal.clone().sub(anchor);
      const goals = [nominal, followed, sideGoal(side), sideGoal(-side), retract,
        ...[.85, .65, .45].map(scale => anchor.clone().add(arm.clone().projectOnPlane(up).multiplyScalar(scale)).addScaledVector(up, arm.dot(up)))];
      goals.forEach((goal, index) => expect(vector(diagnostics.candidates[index].goal).distanceTo(goal)).toBeLessThan(1e-10));
      const heading = vector(resolved.heading);
      const tangent = (offset: Vector3) => { const v = offset.projectOnPlane(up); if (v.lengthSq() < 1e-10) v.copy(heading).projectOnPlane(up); return v.normalize(); };
      const support = [-1, 1].map(sign => oldEye.clone().addScaledVector(up, sign * step));
      for (const horizontal of [tangent(anchor.clone().sub(oldEye)), tangent(nominal.clone().sub(oldEye))])
        for (const sign of [-1, 1]) support.push(oldEye.clone().add(horizontal.clone().addScaledVector(up, sign).normalize().multiplyScalar(step)));
      support.forEach((goal, index) => {
        const candidate = diagnostics.candidates[index + 8];
        expect(vector(candidate.goal).distanceTo(goal)).toBeLessThan(1e-10);
        expect(vector(candidate.eye).distanceTo(oldEye)).toBeLessThan(step + 1e-10);
      });
      for (const candidate of diagnostics.candidates) if (candidate.status === 'margin-dominated') {
        const upper = candidate.rankUpperBound!, best = selected.margins!;
        expect(upper.reserve <= best.reserve + 1e-7 && (upper.reserve < best.reserve - 1e-7 || upper.nominalDistance >= best.nominalDistance - 1e-7)).toBe(true);
        expect(candidate.frameCertificate).toBeUndefined();
      }
    }
  }, 20000);
});
