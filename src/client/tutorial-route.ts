import * as T from 'three';
import { arc, fromLocal, slerp } from '../shared/planet-plan/sphere.ts';
import { routeToTutorialTarget, sampleTutorialRoute, TUTORIAL_NAVIGATION_BUDGET } from '../shared/tutorial-navigation.ts';
import type { TutorialTarget, TutorialNavigationInput } from '../shared/tutorial-navigation.ts';
import type { Vec3 } from '../shared/world.ts';

export interface TutorialRouteFrame {
  position: Vec3; target: TutorialTarget | null; planetId: string; radius: number;
  visible: boolean; paused?: boolean; reducedMotion?: boolean; time?: number;
  homeRoutes?: TutorialNavigationInput['homeRoutes'];
  stationApproaches?: TutorialNavigationInput['stationApproaches'];
  canConnect?: TutorialNavigationInput['canConnect'];
  /** Invalidate proofs after a new scene/door/placement revision. */
  routeRevision?: string | number;
}
export interface TutorialSurface {
  /** Uses the active world's real, already configured surface adapter. */
  surfacePoint: (direction: T.Vector3, offset?: number) => T.Vector3;
}
export const TUTORIAL_ROUTE_BUDGET = { arrows: 40, metres: 30, ribbonVertices: 1200, drawCalls: 3, proofEntries: 256, arrowWidth: .6, arrowHeight: .14 } as const;
export const tutorialArrowFade = (distance: number) => 1 - .8 * Math.pow(T.MathUtils.clamp(distance / TUTORIAL_ROUTE_BUDGET.metres, 0, 1), 1.35);

/** Drawing only. No picking, camera obstacles, colliders, storage or motion.
 * One ribbon, one instanced arrow batch, one current destination ring. */
export function createTutorialRoute(parent: T.Object3D, surface: TutorialSurface) {
  const root = new T.Group(); root.name = 'tutorial-route'; root.visible = false; parent.add(root);
  const ribbonMaterial = new T.MeshBasicMaterial({ color: '#fff18a', side: T.DoubleSide, transparent: true, opacity: .36, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const arrowMaterial = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const ringMaterial = new T.MeshBasicMaterial({ color: '#ffcc52', side: T.DoubleSide, transparent: true, opacity: .95, depthWrite: false });
  const ribbonGeometry = new T.BufferGeometry(), ringGeometry = new T.BufferGeometry();
  ribbonGeometry.setAttribute('position', new T.BufferAttribute(new Float32Array(TUTORIAL_ROUTE_BUDGET.ribbonVertices * 3), 3).setUsage(T.DynamicDrawUsage));
  ringGeometry.setAttribute('position', new T.BufferAttribute(new Float32Array(48 * 6 * 3), 3).setUsage(T.DynamicDrawUsage));
  ribbonGeometry.setDrawRange(0, 0); ringGeometry.setDrawRange(0, 0);
  const ribbon = new T.Mesh(ribbonGeometry, ribbonMaterial), ring = new T.Mesh(ringGeometry, ringMaterial);
  ribbon.name = 'tutorial-walkable-ribbon'; ring.name = 'tutorial-current-target';
  // A genuinely extruded V: local +Z points forward, with a 12 cm body and
  // 1 cm bevel above/below it. Warm light tops and darker sides make its low
  // silhouette legible without another light, texture or shadow pass.
  const shape = new T.Shape();
  shape.moveTo(-.28, .20); shape.lineTo(-.17, .24); shape.lineTo(0, .02);
  shape.lineTo(.17, .24); shape.lineTo(.28, .20); shape.lineTo(0, -.20); shape.closePath();
  const arrowGeometry = new T.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: true, bevelThickness: .01, bevelSize: .012, bevelSegments: 1, steps: 1, curveSegments: 1 });
  arrowGeometry.rotateX(-Math.PI / 2); arrowGeometry.computeBoundingBox();
  const normals = arrowGeometry.getAttribute('normal'), colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const color = new T.Color(normals.getY(i) > .5 ? '#ffbf55' : normals.getY(i) < -.5 ? '#76463e' : '#c55b46');
    colors.set(color.toArray(), i * 3);
  }
  arrowGeometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  const fades = new T.InstancedBufferAttribute(new Float32Array(TUTORIAL_ROUTE_BUDGET.arrows), 1).setUsage(T.DynamicDrawUsage);
  arrowGeometry.setAttribute('tutorialFade', fades);
  arrowMaterial.onBeforeCompile = shader => {
    shader.vertexShader = `attribute float tutorialFade; varying float vTutorialFade;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vTutorialFade = tutorialFade;');
    shader.fragmentShader = `varying float vTutorialFade;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vTutorialFade;');
  };
  arrowMaterial.customProgramCacheKey = () => 'tutorial-chevron-extruded-fade-v1';
  const arrowTriangles = (arrowGeometry.index?.count ?? arrowGeometry.getAttribute('position').count) / 3;
  const arrows = new T.InstancedMesh(arrowGeometry, arrowMaterial, TUTORIAL_ROUTE_BUDGET.arrows);
  arrows.name = 'tutorial-direction-arrows'; arrows.count = 0; arrows.instanceMatrix.setUsage(T.DynamicDrawUsage); arrows.frustumCulled = false;
  for (const mesh of [ribbon, arrows, ring]) { mesh.raycast = () => {}; mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 3; root.add(mesh); }
  const matrix = new T.Matrix4(), up = new T.Vector3(), front = new T.Vector3(), right = new T.Vector3();
  let disposed = false, lastKey = '', lastPosition: Vec3 | null = null, lastPlanAt = -Infinity, lastRingKey = '';
  let routesReference: TutorialRouteFrame['homeRoutes'], routesSignature = '', proofRevision = '';
  const proofCache = new Map<string, boolean>();
  const diagnostics = { connected: false, sourceRoutes: [] as string[], reason: '', arrows: 0, arrowTriangles, drawCalls: 3, triangles: 0, replans: 0, lastReplanMs: 0, maxReplanMs: 0, proofCacheEntries: 0 };
  root.userData.tutorialRoute = diagnostics;
  const point = (p: Vec3, offset: number) => surface.surfacePoint(new T.Vector3(...p), offset);
  const write = (geometry: T.BufferGeometry, vertices: number[]) => {
    const attribute = geometry.getAttribute('position') as T.BufferAttribute, count = Math.min(vertices.length, attribute.array.length);
    (attribute.array as Float32Array).set(vertices.slice(0, count)); attribute.needsUpdate = true;
    attribute.clearUpdateRanges(); attribute.addUpdateRange(0, count); geometry.setDrawRange(0, count / 3);
    geometry.boundingSphere = count ? new T.Box3().setFromArray(vertices.slice(0, count)).getBoundingSphere(new T.Sphere()) : new T.Sphere(new T.Vector3(), 0);
  };
  function drawRing(target: Vec3, radius: number) {
    const vertices: number[] = [];
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2, b = (i + 1) / 48 * Math.PI * 2;
      const p = (r: number, angle: number) => point(fromLocal(target, [Math.cos(angle) * r, Math.sin(angle) * r], radius), .055);
      const A = p(.65, a), B = p(.83, a), C = p(.83, b), D = p(.65, b);
      vertices.push(...A.toArray(), ...B.toArray(), ...C.toArray(), ...A.toArray(), ...C.toArray(), ...D.toArray());
    }
    write(ringGeometry, vertices);
  }
  function drawPath(points: Vec3[], radius: number) {
    const visible: Vec3[] = []; let length = 0;
    for (let i = 1; i < points.length && length < TUTORIAL_ROUTE_BUDGET.metres; i++) {
      const segment = arc(points[i - 1], points[i], radius), allowed = Math.min(segment, TUTORIAL_ROUTE_BUDGET.metres - length);
      const steps = Math.max(1, Math.ceil(allowed / .4));
      for (let k = visible.length ? 1 : 0; k <= steps; k++) visible.push(slerp(points[i - 1], points[i], segment > 0 ? allowed / segment * k / steps : 0));
      length += allowed;
    }
    const vertices: number[] = [];
    for (let i = 1; i < visible.length; i++) {
      const a = point(visible[i - 1], .035), b = point(visible[i], .035);
      up.fromArray(visible[i]); front.copy(b).sub(a).projectOnPlane(up).normalize(); right.crossVectors(up, front).normalize().multiplyScalar(.095);
      const A = a.clone().sub(right), B = a.clone().add(right), C = b.clone().add(right), D = b.clone().sub(right);
      vertices.push(...A.toArray(), ...B.toArray(), ...C.toArray(), ...A.toArray(), ...C.toArray(), ...D.toArray());
    }
    // The maximum visible path and sampling bounds cap this allocation.
    write(ribbonGeometry, vertices.slice(0, TUTORIAL_ROUTE_BUDGET.ribbonVertices * 3));
    const samples = sampleTutorialRoute(points, radius, .8, TUTORIAL_ROUTE_BUDGET.arrows, TUTORIAL_ROUTE_BUDGET.metres);
    samples.forEach((sample, i) => {
      up.fromArray(sample.position); front.fromArray(sample.forward).projectOnPlane(up).normalize(); right.crossVectors(up, front).normalize();
      matrix.makeBasis(right, up, front); matrix.setPosition(point(sample.position, .10)); arrows.setMatrixAt(i, matrix); fades.setX(i, tutorialArrowFade(sample.distance));
    });
    arrows.count = samples.length; arrows.instanceMatrix.needsUpdate = true; fades.needsUpdate = true;
    diagnostics.arrows = samples.length; diagnostics.triangles = vertices.length / 9 + samples.length * arrowTriangles + 96;
  }
  function frame(input: TutorialRouteFrame) {
    if (disposed) return;
    const { target } = input;
    root.visible = input.visible && !input.paused && !!target && target.planetId === input.planetId;
    if (!root.visible || !target) { lastKey = ''; return; }
    // Polling reconstructs equivalent JSON arrays. Only re-serialize on a new
    // reference; use its exact contents, not reference identity, to invalidate.
    if (routesReference !== input.homeRoutes) {
      routesReference = input.homeRoutes;
      const segments = (input.homeRoutes ?? []).reduce((sum, route) => sum + Math.max(0, route.points.length - 1), 0);
      routesSignature = segments > TUTORIAL_NAVIGATION_BUDGET.homeSegments ? `too-complex:${segments}` : JSON.stringify(input.homeRoutes ?? []);
    }
    const key = JSON.stringify([input.planetId, input.radius, target.kind, target.position, input.routeRevision, routesSignature, input.stationApproaches]);
    const now = input.time ?? 0;
    if (proofRevision !== key) { proofCache.clear(); proofRevision = key; }
    if (key !== lastRingKey) { drawRing(target.position, input.radius); lastRingKey = key; }
    if (key !== lastKey || !lastPosition || (!diagnostics.connected && now - lastPlanAt >= .6) || (now - lastPlanAt >= .35 && arc(lastPosition, input.position, input.radius) >= .65)) {
      const started = performance.now();
      const route = routeToTutorialTarget({ ...input, target, readProofCache: (from, to) => {
        const id = `${from.join(',')}|${to.join(',')}`, known = proofCache.get(id);
        // Refresh authored segment proofs as they are consumed, so later
        // approach checks cannot evict the beginning of a long pending route.
        if (known !== undefined) { proofCache.delete(id); proofCache.set(id, known); } return known;
      }, canConnect: input.canConnect ? (from, to) => {
        const id = `${from.join(',')}|${to.join(',')}`;
        const safe = input.canConnect!(from, to); if (proofCache.size >= TUTORIAL_ROUTE_BUDGET.proofEntries) proofCache.delete(proofCache.keys().next().value!); proofCache.set(id, safe); return safe;
      } : undefined });
      drawPath(route.points, input.radius); diagnostics.connected = route.connected; diagnostics.reason = route.reason;
      diagnostics.sourceRoutes = route.sourceRoutes; diagnostics.replans++; lastKey = key; lastPosition = [...input.position]; lastPlanAt = now;
      diagnostics.lastReplanMs = performance.now() - started; diagnostics.maxReplanMs = Math.max(diagnostics.maxReplanMs, diagnostics.lastReplanMs); diagnostics.proofCacheEntries = proofCache.size;
    }
    ringMaterial.opacity = input.reducedMotion ? .95 : .86 + Math.sin(now * 2.5) * .09;
  }
  return { root, frame, diagnostics, dispose() {
    if (disposed) return; disposed = true; root.removeFromParent(); root.clear();
    ribbonGeometry.dispose(); arrowGeometry.dispose(); ringGeometry.dispose(); ribbonMaterial.dispose(); arrowMaterial.dispose(); ringMaterial.dispose();
  } };
}
