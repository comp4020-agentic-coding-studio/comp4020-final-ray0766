import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { markShared } from '../core/dispose.ts';

// Ink outlines for the village look, drawn the way an illustrator would: a
// dark line round every silhouette and along every sharp edge.
//
// - Silhouettes: an inverted shell. The model's opaque surfaces are copied
//   into one mesh drawn back-faces-only in the ink colour, each vertex pushed
//   out along a smoothed normal by a fixed number of screen pixels, so the
//   line is equally thick near and far and never covers the model itself.
// - Creases: line segments on every edge whose faces meet at more than
//   `crease` degrees (box corners, roof ridges, door and window frames).
//
// One shell and one line set per model: two extra draw calls whatever the
// model's size. Neither casts shadows; both take the scene's fog. Materials
// marked `userData.inkShell = false` (flat ground surfaces such as paving,
// whose silhouette is the ground's) get crease lines but no shell, which
// would only double their triangles.

export interface InkMaterials { shell: T.MeshBasicMaterial; lines: T.LineBasicMaterial; width: number }

/** The shared ink materials of a library; `width` is the shell's line width in CSS pixels. */
export function createInkMaterials(color: string, width: number, lineOpacity: number): InkMaterials {
  const uniforms = { uInkWidth: { value: width }, uInkResolution: { value: new T.Vector2(1920, 1080) } };
  const shell = new T.MeshBasicMaterial({ color, side: T.BackSide });
  shell.name = 'ink:shell';
  shell.userData.inkUniforms = uniforms;
  shell.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 inkNormal;\nuniform float uInkWidth;\nuniform vec2 uInkResolution;')
      .replace('#include <project_vertex>', /* glsl */ `#include <project_vertex>
        vec3 inkN = normalize( normalMatrix * inkNormal );
        vec2 inkDir = ( projectionMatrix * vec4( inkN, 0.0 ) ).xy;
        float inkLen = length( inkDir );
        if ( inkLen > 1e-5 ) gl_Position.xy += inkDir / inkLen * uInkWidth * 2.0 / uInkResolution * gl_Position.w;`);
  };
  shell.customProgramCacheKey = () => 'ink.shell.v1';
  const lines = new T.LineBasicMaterial({ color, transparent: lineOpacity < 1, opacity: lineOpacity });
  lines.name = 'ink:lines';
  return { shell: markShared(shell), lines: markShared(lines), width };
}

const scratch = new T.Vector2();
/** Keep the shell's pixel width right for whatever it is drawn into (canvas or render target). */
function trackResolution(this: T.Mesh, renderer: T.WebGLRenderer) {
  const u = (this.material as T.MeshBasicMaterial).userData.inkUniforms as { uInkWidth: { value: number }; uInkResolution: { value: T.Vector2 } };
  const target = renderer.getRenderTarget();
  if (target) u.uInkResolution.value.set(target.width, target.height);
  else u.uInkResolution.value.copy(renderer.getDrawingBufferSize(scratch));
  u.uInkWidth.value = ((this.userData.inkWidth as number) ?? 1.5) * (target ? 1 : renderer.getPixelRatio());
}

/**
 * Add an ink shell and crease lines to `group`, from its opaque meshes (whose
 * geometry is already in the group's frame, as PartBuilder builds it). The
 * shell is made from `shellFrom` when given (geometries the caller has picked
 * and hands over; PartBuilder leaves out pieces drawn with `shellOff`), else
 * from every opaque mesh whose material allows it. Returns what the ink adds
 * to the model's cost.
 */
export function addInk(group: T.Group, ink: InkMaterials, crease: number, options: { shell?: boolean; shellFrom?: T.BufferGeometry[] } = {}): { triangles: number; drawCalls: number } {
  const sources = group.children.filter((o): o is T.Mesh => {
    const m = o as T.Mesh;
    return m.isMesh && !(m.material as T.Material).transparent;
  });
  const parts = options.shellFrom ?? sources.filter(m => (m.material as T.Material).userData.inkShell !== false).map(m => surfaceOf(m.geometry));
  if (!sources.length) { parts.forEach(g => g.dispose()); return { triangles: 0, drawCalls: 0 }; }
  let triangles = 0, drawCalls = 0;
  if (options.shell !== false && parts.length) {
    const merged = mergeGeometries(parts, false)!;
    smoothInkNormals(merged);
    merged.deleteAttribute('normal');
    merged.computeBoundingSphere();
    const shell = new T.Mesh(merged, ink.shell);
    shell.name = 'ink-shell';
    shell.userData.inkWidth = ink.width;
    shell.onBeforeRender = trackResolution as T.Mesh['onBeforeRender'];
    shell.castShadow = false; shell.receiveShadow = false;
    group.add(shell);
    triangles += merged.getAttribute('position').count / 3;
    drawCalls++;
  }
  parts.forEach(g => g.dispose());
  const edges = sources.map(m => new T.EdgesGeometry(m.geometry, crease));
  const lineGeometry = mergeGeometries(edges, false)!;
  edges.forEach(g => g.dispose());
  lineGeometry.computeBoundingSphere();
  const lines = new T.LineSegments(lineGeometry, ink.lines);
  lines.name = 'ink-lines';
  group.add(lines);
  drawCalls++;
  return { triangles, drawCalls };
}

/** A copy of a geometry's positions and normals, the only attributes the shell needs. */
export function surfaceOf(source: T.BufferGeometry): T.BufferGeometry {
  const g = new T.BufferGeometry();
  g.setAttribute('position', source.getAttribute('position').clone());
  g.setAttribute('normal', source.getAttribute('normal').clone());
  return g;
}

/** inkNormal: the average normal of every vertex at the same position, so the pushed-out shell stays closed at hard corners. */
function smoothInkNormals(g: T.BufferGeometry) {
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
  const sums = new Map<string, T.Vector3>();
  const key = (i: number) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const n = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let s = sums.get(k);
    if (!s) { s = new T.Vector3(); sums.set(k, s); }
    s.add(n.fromBufferAttribute(nor, i));
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(key(i))!;
    const l = s.length() || 1;
    out[i * 3] = s.x / l; out[i * 3 + 1] = s.y / l; out[i * 3 + 2] = s.z / l;
  }
  g.setAttribute('inkNormal', new T.BufferAttribute(out, 3));
}
