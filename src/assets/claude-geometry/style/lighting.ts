import * as T from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { PALETTE } from './tokens.ts';
import { assetUrl, HDRI_FILES } from './scans.ts';

// Lighting moods. Metal only reads as metal when it has something to reflect,
// so each mood renders a small procedural environment (no image files) into a
// PMREM cube: a hangar with a warm overhead softbox and cool side strips, or an
// exterior dusk sky. Direct lights then add shape and shadows.

export type Mood = 'hangar' | 'dusk' | 'orbit';

const hdr = (hex: string, k: number) => new T.Color(hex).multiplyScalar(k);

/** Direction of the sun disc in the dusk and orbit environments (unit vector). */
export const ENVIRONMENT_SUN_DIRECTION: readonly [number, number, number] = (() => {
  const l = Math.hypot(12, 7, 9);
  return [12 / l, 7 / l, 9 / l] as const;
})();

/**
 * Colour of a mood's procedural sky dome at elevation sine `y` (−1 nadir … 1
 * zenith), linear, scaled as rendered. The dome and the HDRI grade both use it,
 * so a graded photograph keeps the mood's palette.
 */
export function domeColour(mood: 'dusk' | 'orbit', y: number): T.Color {
  const zenith = mood === 'dusk' ? hdr('#1d2c3a', 1.2) : hdr('#05070a', 1);
  const horizon = mood === 'dusk' ? hdr('#d7925a', 1.6) : hdr('#1a2430', 0.8);
  const ground = hdr('#0c0e10', 1);
  return y >= 0 ? horizon.clone().lerp(zenith, Math.pow(y, 0.55)) : horizon.clone().lerp(ground, Math.min(1, -y * 4));
}

function environmentScene(mood: Mood): T.Scene {
  const scene = new T.Scene();
  const basic = (color: T.Color, side: T.Side = T.FrontSide) => new T.MeshBasicMaterial({ color, side });
  const plane = (w: number, h: number, color: T.Color, position: [number, number, number], rotation: [number, number, number]) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), basic(color, T.DoubleSide));
    m.position.set(...position); m.rotation.set(...rotation); scene.add(m);
  };
  if (mood === 'hangar') {
    scene.add(new T.Mesh(new T.BoxGeometry(24, 12, 24), basic(hdr('#14171b', 1), T.BackSide)));
    plane(10, 6, hdr('#fff1de', 5.5), [0, 5.9, 0], [Math.PI / 2, 0, 0]);          // overhead softbox
    plane(0.6, 7, hdr(PALETTE.cyan, 0.8), [-11.8, 1.5, -3], [0, Math.PI / 2, 0]);  // cool strip
    plane(0.6, 7, hdr(PALETTE.sodium, 1.6), [11.8, 1.5, 4], [0, -Math.PI / 2, 0]); // warm strip
    plane(12, 3, hdr('#8a9099', 0.6), [0, 2, -11.8], [0, 0, 0]);                    // back wall bounce
    plane(24, 24, hdr('#0a0b0c', 1), [0, -5.9, 0], [-Math.PI / 2, 0, 0]);           // floor
  } else {
    // Sky dome: vertex colours from horizon to zenith.
    const dome = new T.SphereGeometry(20, 32, 16);
    const colors: number[] = [];
    const p = dome.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const c = domeColour(mood, p.getY(i) / 20);
      colors.push(c.r, c.g, c.b);
    }
    dome.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    scene.add(new T.Mesh(dome, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    // The sun disc and a cool bounce from the opposite side.
    const sun = new T.Mesh(new T.CircleGeometry(1.6, 24), basic(hdr('#fff0d8', mood === 'dusk' ? 30 : 40)));
    sun.position.set(...ENVIRONMENT_SUN_DIRECTION.map(v => v * Math.hypot(12, 7, 9)) as [number, number, number]); sun.lookAt(0, 0, 0); scene.add(sun);
    plane(8, 3, hdr(PALETTE.cyan, 0.5), [-14, 3, -8], [0, Math.PI / 3, 0]);
  }
  return scene;
}

/** Build a prefiltered environment map; the caller owns and disposes the returned texture. */
export function createEnvironment(renderer: T.WebGLRenderer, mood: Mood): T.Texture {
  const pmrem = new T.PMREMGenerator(renderer);
  const scene = environmentScene(mood);
  const target = pmrem.fromScene(scene, 0.035);
  scene.traverse(o => { const m = o as T.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as T.Material).dispose(); } });
  pmrem.dispose();
  return target.texture;
}

/**
 * A CC0 HDR photograph (Poly Haven, 1K) prefiltered for image-based lighting.
 * Resolves to null for moods without one (orbit keeps the procedural sky).
 * The caller owns and disposes the returned texture.
 */
export async function loadHdriEnvironment(renderer: T.WebGLRenderer, mood: Mood): Promise<T.Texture | null> {
  const file = mood === 'orbit' ? null : HDRI_FILES[mood];
  if (!file) return null;
  const equirect = await new HDRLoader().setDataType(T.HalfFloatType).loadAsync(assetUrl(file));
  // Outdoors, turn the photograph so its sun stands at the procedural
  // environment's sun azimuth: pages that aim the environment at their key light
  // (the showcase) then get one sun in reflections, where the key light is.
  if (mood !== 'hangar') {
    const sun = findSun(equirect);
    if (sun) turnEquirect(equirect, sun, new T.Vector3(...ENVIRONMENT_SUN_DIRECTION));
  }
  capRadiance(equirect, HDRI_PEAK);
  // Outdoors the photograph's own colour would replace the scene's (a pink-white
  // desert, cold blue buildings at dusk): grade it to the mood's dome instead.
  if (mood !== 'hangar') gradeToMood(equirect, mood);
  equirect.mapping = T.EquirectangularReflectionMapping;
  const pmrem = new T.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(equirect);
  equirect.dispose();
  pmrem.dispose();
  return target.texture;
}

/**
 * Ceiling on the linear luminance of HDRI texels. The workshop photographs
 * hold lamps and doorways in the hundreds; reflected in canopy glass and
 * panel seams they came out as bloomed white strips, which is glow, not
 * material. Capped texels keep their hue and still read as the brightest
 * thing in a reflection; direct light comes from the key light, which casts
 * the shadows.
 */
export const HDRI_PEAK = 8;

/** Read texel `i` (RGBA) of a half-float or float data texture as linear luminance. */
function texelLuminance(data: Uint16Array | Float32Array, i: number): number {
  const half = data instanceof Uint16Array;
  const v = (k: number) => (half ? T.DataUtils.fromHalfFloat(data[k]) : data[k]);
  return 0.2126 * v(i) + 0.7152 * v(i + 1) + 0.0722 * v(i + 2);
}

/**
 * Direction of the brightest texel above the horizon of an equirectangular
 * texture, in three.js's equirect convention (u from atan2(z, x), first row at
 * the zenith), or null when it is no brighter than 4x the sky's mean (overcast).
 */
export function findSun(texture: T.DataTexture): T.Vector3 | null {
  const { width: w, height: h } = texture.image as { width: number; height: number };
  const data = texture.image.data as Uint16Array | Float32Array;
  let best = -1, at = 0, sum = 0, n = 0;
  for (let r = 0; r < h / 2; r++) for (let c = 0; c < w; c++) {
    const i = (r * w + c) * 4, l = texelLuminance(data, i);
    sum += l; n++;
    if (l > best) { best = l; at = r * w + c; }
  }
  if (best <= 4 * (sum / Math.max(1, n))) return null;
  const r = Math.floor(at / w), c = at % w;
  const elevation = (0.5 - (r + 0.5) / h) * Math.PI, azimuth = ((c + 0.5) / w - 0.5) * Math.PI * 2;
  return new T.Vector3(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth));
}

/** Rotate an equirectangular texture about +Y (shifting its columns) so `from`'s azimuth lands on `to`'s. */
export function turnEquirect(texture: T.DataTexture, from: T.Vector3, to: T.Vector3) {
  const { width: w, height: h } = texture.image as { width: number; height: number };
  const data = texture.image.data as Uint16Array | Float32Array;
  const turn = Math.atan2(to.z, to.x) - Math.atan2(from.z, from.x);
  const shift = ((Math.round((turn / (Math.PI * 2)) * w) % w) + w) % w;
  if (!shift) return;
  const row = data.slice(0, w * 4);
  for (let r = 0; r < h; r++) {
    const start = r * w * 4;
    row.set(data.subarray(start, start + w * 4));
    // new[c] = old[c - shift]
    data.set(row.subarray((w - shift) * 4), start);
    data.set(row.subarray(0, (w - shift) * 4), start + shift * 4);
  }
  texture.needsUpdate = true;
}

/**
 * Grade an equirectangular texture to a mood's dome: each row (one elevation)
 * is scaled per channel so its mean colour becomes domeColour at that
 * elevation (means smoothed over ±6 rows). Clouds, gradients and the sun keep
 * their variation within the row; the average colour and level are the mood's.
 */
export function gradeToMood(texture: T.DataTexture, mood: 'dusk' | 'orbit') {
  const { width: w, height: h } = texture.image as { width: number; height: number };
  const data = texture.image.data as Uint16Array | Float32Array;
  const half = data instanceof Uint16Array;
  const read = (i: number) => (half ? T.DataUtils.fromHalfFloat(data[i]) : data[i]);
  const write = (i: number, v: number) => { data[i] = half ? T.DataUtils.toHalfFloat(v) : v; };
  const means: [number, number, number][] = [];
  for (let r = 0; r < h; r++) {
    const m: [number, number, number] = [0, 0, 0];
    for (let c = 0; c < w; c++) for (let k = 0; k < 3; k++) m[k] += read((r * w + c) * 4 + k) / w;
    means.push(m);
  }
  for (let r = 0; r < h; r++) {
    const m = [0, 0, 0];
    let n = 0;
    for (let q = Math.max(0, r - 6); q <= Math.min(h - 1, r + 6); q++, n++) for (let k = 0; k < 3; k++) m[k] += means[q][k];
    const y = Math.sin((0.5 - (r + 0.5) / h) * Math.PI);
    const target = domeColour(mood, y).toArray();
    const f = m.map((v, k) => target[k] / Math.max(1e-4, v / n));
    for (let c = 0; c < w; c++) for (let k = 0; k < 3; k++) { const i = (r * w + c) * 4 + k; write(i, read(i) * f[k]); }
  }
  texture.needsUpdate = true;
}

/** Scales every texel brighter than `peak` down to it, keeping its colour. */
export function capRadiance(texture: T.DataTexture, peak: number) {
  const data = texture.image.data as Uint16Array | Float32Array;
  const half = data instanceof Uint16Array;
  const read = (i: number) => (half ? T.DataUtils.fromHalfFloat(data[i]) : data[i]);
  const write = (i: number, v: number) => { data[i] = half ? T.DataUtils.toHalfFloat(v) : v; };
  for (let i = 0; i < data.length; i += 4) {
    const r = read(i), g = read(i + 1), b = read(i + 2);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum <= peak) continue;
    const k = peak / lum;
    write(i, r * k); write(i + 1, g * k); write(i + 2, b * k);
  }
  texture.needsUpdate = true;
}

export interface LightRig { group: T.Group; key: T.DirectionalLight; fill: T.HemisphereLight; dispose(): void }

/** Key, rim and fill lights for a mood. Shadow map size follows `shadows`. */
export function createLightRig(mood: Mood, shadows: boolean, extent = 8): LightRig {
  const group = new T.Group();
  group.name = `lights:${mood}`;
  const key = new T.DirectionalLight(mood === 'orbit' ? '#fff3e2' : '#ffdcb6', mood === 'orbit' ? 3.4 : 2.6);
  key.position.set(6, 9, 7);
  key.castShadow = shadows;
  if (shadows) {
    key.shadow.mapSize.set(2048, 2048);
    const c = key.shadow.camera;
    c.left = -extent; c.right = extent; c.top = extent; c.bottom = -extent; c.near = 0.5; c.far = 60;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025;
  }
  // In orbit there is one sun: a rim light there would add a second specular glint on water and glass.
  const rim = new T.DirectionalLight('#a9c4e2', mood === 'hangar' ? 0.6 : mood === 'dusk' ? 0.5 : 0);
  rim.visible = mood !== 'orbit';
  rim.position.set(-7, 4, -8);
  const fill = new T.HemisphereLight(mood === 'dusk' ? '#5a6878' : '#3c4652', '#17130f', mood === 'orbit' ? 0.12 : 0.35);
  group.add(key, key.target, rim, fill);
  return {
    group, key, fill,
    dispose() { key.shadow.map?.dispose(); key.dispose(); rim.dispose(); fill.dispose(); group.removeFromParent(); },
  };
}
