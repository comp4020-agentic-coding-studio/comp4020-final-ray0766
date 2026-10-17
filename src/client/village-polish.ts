import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mainPlanetNetwork, MAIN_PLANET_LEDGER } from '../shared/planet-plan/main-planet.ts';
import { arc, fromLocal, heading } from '../shared/planet-plan/sphere.ts';
import { SPAWN } from '../shared/world.ts';
import type { Vec3 } from '../shared/world.ts';
import type { HomeDescriptor } from '../shared/home.ts';
import { ART_PALETTE, applyArtMaterial } from './art-profile.ts';
import type { TutorialSurface } from './tutorial-route.ts';

export type VillagePolishTier = 'smooth' | 'standard' | 'beautiful';
export interface VillagePolishFrame {
  planetId: string; radius: number; quality: VillagePolishTier; home?: HomeDescriptor | null;
  /** Visibility only; menus keep their scenery, interiors hide exterior art. */
  visible?: boolean; reducedMotion?: boolean; time?: number;
}
export interface VillagePolishSite { id: string; position: Vec3; toward: Vec3; label: 'post' | 'glasshouse' | 'gate' | 'home' }
export const VILLAGE_POLISH_BUDGET = { signs: 3, shallowRelief: .045, drawCalls: 3, animatedObjects: 30 } as const;

/** Existing entry anchors only. No new building, collision, reservation or
 * ledger entry: the trim sits above existing doors and against their lintels. */
export function publicVillagePolishSites(): VillagePolishSite[] {
  return ([['post-office', 'post'], ['glasshouse', 'glasshouse'], ['teleport-station', 'gate']] as const).flatMap(([id, label]) => {
    const door = MAIN_PLANET_LEDGER.doorPaths.find(d => d.lot === id);
    return door ? [{ id, position: [...door.from] as Vec3, toward: [...door.to] as Vec3, label }] : [];
  });
}
const labelRows = { post: 0, glasshouse: 1, gate: 2, home: 3 } as const;
const labelText = [['邮局', 'POST OFFICE'], ['温室', 'GLASSHOUSE'], ['回家 · 广场', 'HOME · SQUARE'], ['我的小屋', 'MY LITTLE HOME']];

/** Always-bounded host art, separate from temporary tutorial guidance. Three
 * shared draws at most; no lights, bloom, particle systems or per-frame mesh
 * updates. Beautiful adds only a bounded 5 mm petal sway in the existing fine
 * draw; reduced motion fixes its shader time. Low retains the same sign trim. */
export function createVillagePolish(parent: T.Object3D, surface: TutorialSurface) {
  const root = new T.Group(); root.name = 'village-focus-polish'; parent.add(root);
  const material = applyArtMaterial(new T.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true }));
  const detailMaterial = applyArtMaterial(new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  const petalTime = { value: 0 }, compileDetail = detailMaterial.onBeforeCompile, detailKey = detailMaterial.customProgramCacheKey.bind(detailMaterial);
  detailMaterial.onBeforeCompile = (shader, renderer) => {
    compileDetail.call(detailMaterial, shader, renderer); shader.uniforms.polishTime = petalTime;
    shader.vertexShader = `attribute float polishPetal; uniform float polishTime;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += polishPetal * sin(polishTime + position.y * 2.0) * vec3(0.004, 0.001, 0.003);');
  };
  detailMaterial.customProgramCacheKey = () => `${detailKey()}|village-petal-sway-v1`;
  const base = new T.Mesh(new T.BufferGeometry(), material), details = new T.Mesh(new T.BufferGeometry(), detailMaterial);
  const atlas = typeof document === 'undefined' ? null : document.createElement('canvas');
  if (atlas) {
    atlas.width = 512; atlas.height = 512; const context = atlas.getContext('2d');
    if (context) for (let row = 0; row < labelText.length; row++) {
      context.fillStyle = '#f4ead0'; context.fillRect(0, row * 128, 512, 128);
      context.fillStyle = '#54453e'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.font = '600 36px system-ui, sans-serif'; context.fillText(labelText[row][0], 256, row * 128 + 43, 480);
      context.font = '600 23px system-ui, sans-serif'; context.fillText(labelText[row][1], 256, row * 128 + 92, 480);
    }
  }
  const texture = atlas ? new T.CanvasTexture(atlas) : null;
  if (texture) { texture.colorSpace = T.SRGBColorSpace; texture.minFilter = T.LinearFilter; texture.generateMipmaps = false; }
  const signMaterial = new T.MeshBasicMaterial({ map: texture, color: texture ? '#ffffff' : ART_PALETTE.cream, polygonOffset: true, polygonOffsetFactor: -1 });
  const signs = new T.Mesh(new T.BufferGeometry(), signMaterial);
  for (const mesh of [base, details, signs]) { mesh.raycast = () => {}; mesh.castShadow = false; mesh.receiveShadow = true; root.add(mesh); }
  base.name = 'village-focus-silhouette'; details.name = 'village-focus-fine-relief'; signs.name = 'village-bilingual-sign-atlas';
  let disposed = false, key = '';
  const diagnostics = { sites: 0, triangles: 0, detailTriangles: 0, drawCalls: 0, collision: false, animation: false };
  root.userData.villagePolish = diagnostics;

  function rebuild(input: VillagePolishFrame) {
    const basic: T.BufferGeometry[] = [], fine: T.BufferGeometry[] = [], labels: T.BufferGeometry[] = [];
    const add = (geometry: T.BufferGeometry, color: string, transform: T.Matrix4, detailed = false) => {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone(); geometry.dispose(); flat.applyMatrix4(transform);
      const c = new T.Color(color), colors = new Float32Array(flat.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
      flat.setAttribute('color', new T.BufferAttribute(colors, 3));
      if (detailed) flat.setAttribute('polishPetal', new T.BufferAttribute(new Float32Array(flat.attributes.position.count).fill(geometry.type === 'SphereGeometry' ? 1 : 0), 1));
      (detailed ? fine : basic).push(flat);
    };
    const local = (frame: T.Matrix4, x: number, y: number, z: number, rotation = 0) => frame.clone().multiply(new T.Matrix4().makeTranslation(x, y, z)).multiply(new T.Matrix4().makeRotationZ(rotation));
    const box = (frame: T.Matrix4, color: string, w: number, h: number, d: number, x: number, y: number, z: number, detailed = false) => add(new T.BoxGeometry(w, h, d), color, local(frame, x, y, z), detailed);
    const doorTrim = (frame: T.Matrix4, label: keyof typeof labelRows) => {
      // Timber cap, tiny roof shoulders and a recessed paper plaque refine the
      // silhouette; every piece stays above 2.05 m and behind the walking path.
      box(frame, ART_PALETTE.wood, 1.5, .08, .11, 0, 2.64, -.03);
      box(frame, ART_PALETTE.clay, 1.62, .06, .16, 0, 2.71, -.03);
      box(frame, ART_PALETTE.wood, 1.42, .43, .065, 0, 2.37, -.04);
      for (const side of [-1, 1]) {
        box(frame, ART_PALETTE.wood, .05, .48, .09, side * .69, 2.37, -.01);
        // Wall-mounted hanging boxes, not a new floor-standing obstacle.
        box(frame, ART_PALETTE.clay, .24, .14, .12, side * .57, 2.13, -.035);
        add(new T.SphereGeometry(.11, 5, 3), ART_PALETTE.leaf, local(frame, side * .57, 2.23, -.025));
        for (let petal = 0; petal < 5; petal++) {
          const a = petal / 5 * Math.PI * 2;
          add(new T.SphereGeometry(.028, 4, 3), petal % 2 ? ART_PALETTE.gold : '#e18c83', local(frame, side * .57 + Math.cos(a) * .065, 2.25 + Math.sin(a) * .055, .045), true);
        }
      }
      const plane = new T.PlaneGeometry(1.25, .33), uv = plane.getAttribute('uv'), row = labelRows[label];
      for (let i = 0; i < uv.count; i++) uv.setY(i, (3 - row + uv.getY(i)) / 4);
      plane.applyMatrix4(local(frame, 0, 2.37, .003)); labels.push(plane);
    };
    const surfaceFrame = (position: Vec3, toward: Vec3) => {
      const up = new T.Vector3(...position), forward = new T.Vector3(...heading(position, toward)), right = new T.Vector3().crossVectors(up, forward).normalize();
      return new T.Matrix4().makeBasis(right, up, forward).setPosition(surface.surfacePoint(up));
    };
    if (input.planetId === 'hub' && Math.abs(input.radius - 21.6) < .001) {
      const sites = publicVillagePolishSites(); sites.forEach(site => doorTrim(surfaceFrame(site.position, site.toward), site.label)); diagnostics.sites = sites.length;
      // Dressed fan accents stay a maximum 45 mm above the existing surface.
      // Only the arrival plaza and its two closest authored junctions receive
      // the accent, rather than adding geometry along every town street.
      const network = mainPlanetNetwork(), plaza = network.plazas.find(p => p.id === 'arrival-square');
      const accents = [ ...(plaza ? [{ center: plaza.centres[0], radius: plaza.radius - .2 }] : []),
        ...[...network.junctions].sort((a, b) => arc(a.center, SPAWN, input.radius) - arc(b.center, SPAWN, input.radius)).slice(0, 2).map(j => ({ center: j.center, radius: .6 })) ];
      for (const accent of accents) for (let k = 0; k < 12; k++) {
        const angle = k / 12 * Math.PI * 2;
        const p = fromLocal(accent.center, [Math.cos(angle) * accent.radius, Math.sin(angle) * accent.radius], input.radius);
        const frame = surfaceFrame(p, accent.center);
        box(frame, k % 3 ? ART_PALETTE.stone : ART_PALETTE.clay, .22, .018, .10, 0, .032, 0);
        box(frame, ART_PALETTE.gold, .09, .009, .025, 0, .044, 0, true);
      }
    } else if (input.home?.planetId === input.planetId && input.home.door.frame) {
      const frame = input.home.door.frame;
      doorTrim(new T.Matrix4().compose(new T.Vector3(...frame.position), new T.Quaternion(...frame.quaternion), new T.Vector3(1, 1, 1)), 'home'); diagnostics.sites = 1;
    } else diagnostics.sites = 0;
    const finish = (mesh: T.Mesh, pieces: T.BufferGeometry[]) => {
      const merged = pieces.length ? mergeGeometries(pieces) : null; pieces.forEach(g => g.dispose());
      mesh.geometry.dispose(); mesh.geometry = merged ?? new T.BufferGeometry(); if (merged) merged.computeBoundingSphere(); mesh.visible = pieces.length > 0;
    };
    finish(base, basic); finish(details, fine); finish(signs, labels);
    diagnostics.triangles = (base.geometry.getAttribute('position')?.count ?? 0) / 3 + (signs.geometry.index?.count ?? signs.geometry.getAttribute('position')?.count ?? 0) / 3;
    diagnostics.detailTriangles = (details.geometry.getAttribute('position')?.count ?? 0) / 3;
  }
  function frame(input: VillagePolishFrame) {
    if (disposed) return;
    const nextKey = JSON.stringify([input.planetId, input.radius, input.home?.buildingId, input.home?.door.frame]);
    if (nextKey !== key) { rebuild(input); key = nextKey; }
    root.visible = input.visible !== false;
    details.visible = input.quality === 'beautiful' && diagnostics.detailTriangles > 0;
    petalTime.value = input.reducedMotion ? 0 : input.time ?? 0;
    diagnostics.animation = root.visible && details.visible && !input.reducedMotion;
    diagnostics.drawCalls = root.visible ? Number(base.visible) + Number(signs.visible) + Number(details.visible) : 0;
  }
  return { root, frame, diagnostics, dispose() {
    if (disposed) return; disposed = true; root.removeFromParent(); root.clear();
    base.geometry.dispose(); details.geometry.dispose(); signs.geometry.dispose(); material.dispose(); detailMaterial.dispose(); signMaterial.dispose(); texture?.dispose();
  } };
}
