import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { createTutorialRoute, TUTORIAL_ROUTE_BUDGET } from '../src/client/tutorial-route.ts';
import { NPCS, SPAWN } from '../src/shared/world.ts';
import { routeToTutorialTarget } from '../src/shared/tutorial-navigation.ts';
import { TUTORIAL_NAVIGATION_BUDGET } from '../src/shared/tutorial-navigation.ts';
import { dirOf } from '../src/shared/planet-plan/sphere.ts';

describe('tutorial drawing is bounded and uses the actual surface adapter', () => {
  it('draws the current goal and curved path on a non-constant surface, then hides and releases them', () => {
    const parent = new T.Group(), offsets: number[] = [];
    const view = createTutorialRoute(parent, { surfacePoint(direction, offset = 0) {
      offsets.push(offset); return direction.clone().multiplyScalar(21.6 + direction.x * .2 + offset);
    } });
    const input = { position: SPAWN, target: { kind: 'mica' as const, position: NPCS.mica.position, planetId: 'hub' }, planetId: 'hub', radius: 21.6, visible: true, reducedMotion: true, time: 1, canConnect: () => false };
    view.frame(input);
    expect(view.root.visible).toBe(true); expect(view.diagnostics.connected).toBe(true);
    expect(view.root.children).toHaveLength(3); expect(view.diagnostics.arrows).toBeLessThanOrEqual(TUTORIAL_ROUTE_BUDGET.arrows);
    expect(offsets).toContain(.035); expect(offsets).toContain(.055); expect(offsets).toContain(.10);
    const arrows = view.root.getObjectByName('tutorial-direction-arrows') as T.InstancedMesh;
    const bounds = arrows.geometry.boundingBox!;
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(TUTORIAL_ROUTE_BUDGET.arrowHeight, 4);
    expect(bounds.max.x - bounds.min.x).toBeLessThan(.6);
    const fades = arrows.geometry.getAttribute('tutorialFade');
    expect(fades).toBeInstanceOf(T.InstancedBufferAttribute);
    expect(fades.getX(0)).toBeGreaterThan(fades.getX(arrows.count - 1));
    const matrix = new T.Matrix4(), right = new T.Vector3(), up = new T.Vector3(), forward = new T.Vector3();
    for (let i = 0; i < arrows.count; i++) {
      arrows.getMatrixAt(i, matrix); matrix.extractBasis(right, up, forward);
      expect(matrix.elements.every(Number.isFinite)).toBe(true); expect(up.dot(forward)).toBeCloseTo(0, 5);
      expect(forward.length()).toBeCloseTo(1, 5); expect(fades.getX(i)).toBeGreaterThanOrEqual(.2);
    }
    expect(view.diagnostics.arrowTriangles).toBeLessThanOrEqual(64); expect(view.diagnostics.drawCalls).toBe(3);
    const ring = view.root.getObjectByName('tutorial-current-target') as T.Mesh;
    const ribbon = view.root.getObjectByName('tutorial-walkable-ribbon') as T.Mesh, ribbonAttribute = ribbon.geometry.getAttribute('position');
    const positions = ring.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const point = new T.Vector3().fromBufferAttribute(positions, i), normal = point.clone().normalize();
      expect(point.length()).toBeCloseTo(21.6 + normal.x * .2 + .055, 4);
    }
    const opacity = (ring.material as T.MeshBasicMaterial).opacity; view.frame({ ...input, time: 8 });
    expect((ring.material as T.MeshBasicMaterial).opacity).toBe(opacity);
    view.frame({ ...input, routeRevision: 2, time: 9 });
    expect(ribbon.geometry.getAttribute('position')).toBe(ribbonAttribute); expect(ring.geometry.getAttribute('position')).toBe(positions);
    expect(ribbon.geometry.drawRange.count).toBeLessThanOrEqual(TUTORIAL_ROUTE_BUDGET.ribbonVertices);
    expect(view.diagnostics.replans).toBe(2); expect(view.diagnostics.lastReplanMs).toBeGreaterThanOrEqual(0);
    view.frame({ ...input, paused: true }); expect(view.root.visible).toBe(false);
    view.frame({ ...input, target: null }); expect(view.root.visible).toBe(false);
    view.dispose(); view.dispose(); expect(parent.children).toHaveLength(0);
  });
  it('keeps destination feedback but never draws an unproven off-route line', () => {
    const parent = new T.Group(), view = createTutorialRoute(parent, { surfacePoint: p => p.clone().multiplyScalar(21.6) });
    const input = { position: [-1, 0, 0] as [number, number, number], target: { kind: 'sol' as const, position: NPCS.sol.position, planetId: 'hub' }, planetId: 'hub', radius: 21.6, visible: true, time: 1, canConnect: () => false };
    expect(routeToTutorialTarget(input).connected).toBe(false); view.frame(input);
    expect(view.diagnostics.arrows).toBe(0);
    expect((view.root.getObjectByName('tutorial-walkable-ribbon') as T.Mesh).geometry.drawRange.count).toBe(0);
    view.dispose();
  });
  it('finishes a home route with more than twelve segments across bounded rounds, then invalidates all proofs on scene revision', () => {
    const parent = new T.Group(), view = createTutorialRoute(parent, { surfacePoint: (p, offset = 0) => p.clone().multiplyScalar(21.6 + offset) });
    const points = Array.from({ length: 16 }, (_, i) => dirOf(80 + i * .1, 0));
    let proofs = 0;
    const input = { position: points[0], target: { kind: 'home' as const, position: points.at(-1)!, planetId: 'my-home' },
      planetId: 'my-home', radius: 21.6, visible: true, routeRevision: 'scene-1', homeRoutes: [{ id: 'home', width: 1, points }],
      canConnect: () => { proofs++; return true; } };
    for (let round = 0; round < 8 && !view.diagnostics.connected; round++) {
      const before = proofs; view.frame({ ...input, homeRoutes: structuredClone(input.homeRoutes), time: round * .7 });
      expect(proofs - before).toBeLessThanOrEqual(TUTORIAL_NAVIGATION_BUDGET.connectorChecks);
    }
    expect(view.diagnostics.connected).toBe(true); expect(proofs).toBe(15);
    const stable = view.diagnostics.replans;
    view.frame({ ...input, homeRoutes: structuredClone(input.homeRoutes), time: 8 });
    expect(view.diagnostics.replans).toBe(stable); expect(proofs).toBe(15);
    const before = proofs; view.frame({ ...input, routeRevision: 'scene-2', time: 9 });
    expect(proofs - before).toBeGreaterThan(0); expect(proofs - before).toBeLessThanOrEqual(TUTORIAL_NAVIGATION_BUDGET.connectorChecks);
    expect(view.diagnostics.connected).toBe(false);
    for (let round = 1; round < 8 && !view.diagnostics.connected; round++) view.frame({ ...input, homeRoutes: structuredClone(input.homeRoutes), routeRevision: 'scene-2', time: 9 + round * .7 });
    expect(view.diagnostics.connected).toBe(true); expect(proofs).toBe(30);
    const changed = structuredClone(input.homeRoutes); changed[0].points[5] = dirOf(80.51, .01);
    view.frame({ ...input, homeRoutes: changed, routeRevision: 'scene-2', time: 20 });
    expect(view.diagnostics.connected).toBe(false); expect(proofs).toBeGreaterThan(30); view.dispose();
  });
  it('can finish more than 64 authored segments without cache churn and rejects oversized guidance documents within a fixed bound', () => {
    const parent = new T.Group(), view = createTutorialRoute(parent, { surfacePoint: (p, offset = 0) => p.clone().multiplyScalar(21.6 + offset) });
    const points = Array.from({ length: 81 }, (_, i) => dirOf(80 + i * .05, 0)); let proofs = 0;
    const input = { position: points[0], target: { kind: 'home' as const, position: points.at(-1)!, planetId: 'long-home' },
      planetId: 'long-home', radius: 21.6, visible: true, routeRevision: 1, homeRoutes: [{ id: 'home', width: 1, points }], canConnect: () => { proofs++; return true; } };
    for (let round = 0; round < 100 && !view.diagnostics.connected; round++) {
      const before = proofs; view.frame({ ...input, homeRoutes: structuredClone(input.homeRoutes), time: round * .7 });
      expect(proofs - before).toBeLessThanOrEqual(TUTORIAL_NAVIGATION_BUDGET.connectorChecks);
      expect(view.diagnostics.proofCacheEntries).toBeLessThanOrEqual(TUTORIAL_ROUTE_BUDGET.proofEntries);
    }
    expect(view.diagnostics.connected).toBe(true); expect(proofs).toBe(80);
    const tooMany = Array.from({ length: TUTORIAL_NAVIGATION_BUDGET.homeSegments + 2 }, (_, i) => dirOf(70 + i * .05, 0)), before = proofs;
    view.frame({ ...input, homeRoutes: [{ id: 'home', width: 1, points: tooMany }], time: 101 });
    expect(view.diagnostics.reason).toBe('route-too-complex'); expect(view.diagnostics.connected).toBe(false); expect(proofs).toBe(before);
    view.dispose();
  });
});
