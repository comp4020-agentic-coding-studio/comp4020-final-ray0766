import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LOD } from '../style/lod.ts';
import type { LodTier } from '../style/lod.ts';
import { StyleLibrary } from '../style/materials.ts';
import { createEnvironment, createLightRig, loadHdriEnvironment } from '../style/lighting.ts';
import type { LightRig, Mood } from '../style/lighting.ts';
import { PracticalLights } from '../style/practical.ts';
import { TEXTURE_FORMAT } from '../style/scans.ts';
import type { TextureFormat } from '../style/scans.ts';
import { UI } from '../style/tokens.ts';

// The renderer, camera, lights, environment and post chain every demo shares,
// so the four modules are always judged under the same light. One Stage per
// page; dispose() frees everything it created, including the StyleLibrary.

export interface StageOptions {
  container: HTMLElement;
  lod: LodTier;
  mood: Mood;
  fov?: number;
  near?: number;
  far?: number;
  shadowExtent?: number;
  background?: string;
  fog?: { color: string; density: number } | null;
  /** Show the blurred environment behind the scene (default) or a flat colour. */
  backdrop?: boolean;
  /** Upgrade materials with the CC0 texture sets (default off). */
  scans?: boolean;
  /** Light with the mood's CC0 HDR photograph instead of the procedural environment (default procedural). */
  environment?: 'hdri' | 'procedural';
  /** Screen-space ambient occlusion (GTAO) at high LOD; defaults on with the HDR environment. */
  ambientOcclusion?: boolean;
  /** Real lights for the light fittings in the scene (src/style/practical.ts); default on. */
  practicalLights?: boolean;
  /** How texture sets travel; default TEXTURE_FORMAT for the texture-set tier (KTX2 falls back to WebP where unsupported). */
  textures?: TextureFormat;
  /** Texture-set sizes to load (default the LOD); planet-scale pages pass 'medium' at high (StyleLibraryOptions.scanDetail). */
  scanDetail?: LodTier;
}

/**
 * How much of the HDR photograph's light reaches the scene, per mood. The hangar
 * photograph is brighter than the procedural room; the outdoor ones are graded
 * to their mood's dome (lighting.ts gradeToMood), so they keep its level.
 */
const HDRI_INTENSITY = { hangar: 0.5, dusk: 1, orbit: 1 } as const;

export interface FrameStats {
  frameMs: number; fps: number; cpuMs: number; triangles: number; calls: number; geometries: number; textures: number; programs: number;
  /** Sum of usedTimes over compiled programs: rises with every live material, so it exposes leaked materials that memory counts miss. */
  programRefs: number;
}

export class Stage {
  readonly renderer: T.WebGLRenderer;
  readonly scene = new T.Scene();
  readonly camera: T.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly library: StyleLibrary;
  readonly lod: LodTier;
  readonly lights: LightRig;
  /** Pooled lights for the fittings parts record; its light count never changes. */
  readonly practical: PracticalLights;
  private environment: T.Texture;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private ao: GTAOPass | null = null;
  private callbacks = new Set<(dt: number, t: number) => void>();
  private raf = 0;
  private last = 0;
  private samples: number[] = [];
  private cpu: number[] = [];
  private lastInfo = { triangles: 0, calls: 0 };
  private observer: ResizeObserver;
  private container: HTMLElement;
  private disposed = false;
  private environmentReady: Promise<void> = Promise.resolve();
  /** Which environment is actually lighting the scene now. */
  environmentSource: 'procedural' | 'hdri' = 'procedural';
  /** Intensity the mood's environment wants (the HDRI's per-mood value once it has loaded). */
  moodEnvironmentIntensity = 1;

  /**
   * The mood's environment as it is now: procedural at first, the HDRI once it
   * has arrived. Pages that swap environments (the blueprint demo's planet
   * view) read this when they switch back, instead of a copy taken at start.
   */
  get moodEnvironment(): T.Texture { return this.environment; }

  constructor(options: StageOptions) {
    this.container = options.container;
    this.lod = options.lod;
    const settings = LOD[options.lod];
    this.renderer = new T.WebGLRenderer({ antialias: !settings.bloom, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.pixelRatioCap));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.domElement.classList.add('stage-canvas');
    this.container.append(this.renderer.domElement);

    const scanDetail = options.scanDetail ?? options.lod;
    this.library = new StyleLibrary(options.lod, { scans: options.scans, scanDetail });
    this.library.setAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    // The delivery follows the sizes loaded: KTX2 pays for itself only with 1024 px maps.
    this.library.attachRenderer(this.renderer, options.textures ?? TEXTURE_FORMAT[scanDetail]);

    this.scene.background = new T.Color(options.background ?? UI.bg);
    if (options.fog !== null) {
      const fog = options.fog ?? { color: options.background ?? UI.bg, density: 0.018 };
      this.scene.fog = new T.FogExp2(fog.color, fog.density);
    }
    this.environment = createEnvironment(this.renderer, options.mood);
    this.scene.environment = this.environment;
    if (options.backdrop !== false) {
      // A dim, blurred view of the same environment instead of a black void.
      this.scene.background = this.environment;
      this.scene.backgroundBlurriness = 0.55;
      this.scene.backgroundIntensity = options.mood === 'hangar' ? 0.35 : 0.6;
    }
    this.lights = createLightRig(options.mood, settings.shadows, options.shadowExtent ?? 8);
    this.scene.add(this.lights.group);
    this.practical = new PracticalLights(options.lod, { enabled: options.practicalLights ?? true });
    this.scene.add(this.practical.group);
    if (options.environment === 'hdri') {
      const mood = options.mood, backdrop = options.backdrop !== false;
      this.environmentReady = loadHdriEnvironment(this.renderer, mood).then(texture => {
        if (!texture) return;
        if (this.disposed) { texture.dispose(); return; }
        const old = this.environment;
        this.environment = texture;
        this.moodEnvironmentIntensity = HDRI_INTENSITY[mood];
        // Only where the page still shows the mood: a page that swapped in its own
        // environment meanwhile picks the HDRI up through moodEnvironment when it switches back.
        if (this.scene.environment === old) {
          this.scene.environment = texture;
          this.scene.environmentIntensity = HDRI_INTENSITY[mood];
        }
        // The workshop photograph already carries the bounce light the hemisphere fill stood in for;
        // a graded outdoor sky carries no more than the procedural dome did, so the fill stays.
        if (mood === 'hangar') this.lights.fill.intensity *= 0.35;
        if (backdrop && mood === 'hangar' && this.scene.background === old) this.scene.background = texture;
        old.dispose();
        this.environmentSource = 'hdri';
      }).catch(error => { console.warn('HDR environment not loaded; keeping the procedural one.', error); });
    }

    this.camera = new T.PerspectiveCamera(options.fov ?? 40, 1, options.near ?? 0.05, options.far ?? 400);
    this.camera.position.set(6, 4, 8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    if (settings.bloom) {
      const size = new T.Vector2(1, 1);
      const target = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      if (options.ambientOcclusion ?? options.environment === 'hdri') {
        // Contact shadows in corners, under sills and between parts: what image-based
        // light alone cannot give. Radius in metres; high LOD only (it shares the bloom composer).
        this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
        this.ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 0.6, scale: 1.0, samples: 12 });
        this.ao.updatePdMaterial({ radius: 6, samples: 12 });
        this.ao.blendIntensity = 0.85;
        this.composer.addPass(this.ao);
      }
      // High threshold: only genuinely emissive elements bloom.
      this.bloom = new UnrealBloomPass(size, 0.42, 0.55, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.container);
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
  }

  onFrame(fn: (dt: number, t: number) => void): () => void {
    this.callbacks.add(fn);
    return () => this.callbacks.delete(fn);
  }

  start() {
    if (this.raf || this.disposed) return;
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
      if (this.last) { this.samples.push(now - this.last); if (this.samples.length > 90) this.samples.shift(); }
      this.last = now;
      this.renderOnce(dt, now / 1000);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.last = 0; }

  /** Advance callbacks and draw one frame. Used by the loop and by tests that step manually. */
  renderOnce(dt = 0, t = performance.now() / 1000) {
    const begin = performance.now();
    for (const fn of this.callbacks) fn(dt, t);
    this.controls.update();
    this.practical.update(this.scene, this.camera, dt);
    this.renderer.info.reset();
    this.renderer.info.autoReset = false;
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
    this.lastInfo = { triangles: this.renderer.info.render.triangles, calls: this.renderer.info.render.calls };
    this.cpu.push(performance.now() - begin); if (this.cpu.length > 90) this.cpu.shift();
  }

  stats(): FrameStats {
    const avg = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const frameMs = avg(this.samples);
    const info = this.renderer.info;
    return {
      frameMs, fps: frameMs ? 1000 / frameMs : 0, cpuMs: avg(this.cpu),
      triangles: this.lastInfo.triangles, calls: this.lastInfo.calls,
      geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
      programRefs: ((info.programs ?? []) as unknown as { usedTimes: number }[]).reduce((sum, p) => sum + p.usedTimes, 0),
    };
  }

  /** WebGL renderer string, for recording the hardware behind any performance number. */
  gpu(): string {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  }

  /** Resolves once the environment and every requested texture set have loaded (or failed). */
  async ready(): Promise<void> {
    await this.environmentReady;
    await this.library.ready();
  }

  /**
   * Render a frame and read a grid of pixels back in the same task, before the
   * browser presents and clears the buffer. Lets browser tests prove the scene
   * is actually drawn rather than that a canvas exists.
   */
  sample(grid = 24): { mean: number; std: number; distinct: number } {
    this.renderOnce(0);
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth, hgt = gl.drawingBufferHeight;
    const px = new Uint8Array(4), lum: number[] = [], seen = new Set<number>();
    for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
      gl.readPixels(Math.floor((i + 0.5) / grid * w), Math.floor((j + 0.5) / grid * hgt), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      lum.push(0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]);
      seen.add((px[0] >> 3) << 10 | (px[1] >> 3) << 5 | (px[2] >> 3));
    }
    const mean = lum.reduce((s, v) => s + v, 0) / lum.length;
    const std = Math.sqrt(lum.reduce((s, v) => s + (v - mean) ** 2, 0) / lum.length);
    return { mean, std, distinct: seen.size };
  }

  /** Turn the GTAO pass on or off (where it exists): pages switching to a planet-scale view turn it off. */
  setAmbientOcclusion(on: boolean) { if (this.ao) this.ao.enabled = on; }

  /**
   * Render one frame and return the mean luminance (0–255, sRGB bytes) of a
   * (2·radius+1)² pixel block round each world point's projection; NaN when a
   * point is off screen or behind the camera. Read-only, for browser tests.
   */
  probe(points: readonly [number, number, number][], radius = 4): number[] {
    this.renderOnce(0);
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth, hgt = gl.drawingBufferHeight, n = 2 * radius + 1;
    const px = new Uint8Array(4 * n * n), p = new T.Vector3();
    return points.map(point => {
      p.set(...point).project(this.camera);
      const x = Math.round((p.x + 1) / 2 * w), y = Math.round((p.y + 1) / 2 * hgt);
      if (p.z > 1 || x < radius || y < radius || x >= w - radius || y >= hgt - radius) return NaN;
      gl.readPixels(x - radius, y - radius, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0;
      for (let i = 0; i < n * n; i++) sum += 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
      return sum / (n * n);
    });
  }

  frame(target: T.Vector3, distance: number, direction = new T.Vector3(0.75, 0.5, 1)) {
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(direction.normalize(), distance);
    this.controls.update();
  }

  /**
   * Look at `box` from `direction` (default: the current view direction) and
   * back off until every corner of the box is inside the view with `margin` to
   * spare, in width and in height, so a portrait phone frames the same subject
   * as a desktop. `topInset` and `bottomInset` (0 to 0.4 each) are the shares
   * of the canvas height overlays cover at the top and the bottom: the box is
   * fitted into the band between them and centred in it.
   */
  frameBox(box: T.Box3, options: { direction?: T.Vector3; margin?: number; topInset?: number; bottomInset?: number; minDistance?: number } = {}) {
    const clamp = (v = 0) => Math.min(0.4, Math.max(0, v));
    const top = clamp(options.topInset), bottom = clamp(options.bottomInset);
    const margin = options.margin ?? 1.06;
    const centre = box.getCenter(new T.Vector3());
    const tanV = Math.tan(T.MathUtils.degToRad(this.camera.fov) / 2), tanH = tanV * this.camera.aspect;
    // The free band, in normalised device units: half-height and centre offset from the canvas middle.
    const band = 1 - top - bottom, offset = bottom - top;
    const dir = (options.direction?.clone() ?? this.camera.position.clone().sub(this.controls.target)).normalize();
    // Screen-up at the target: the camera's up made perpendicular to the view direction.
    const up = this.camera.up.clone().addScaledVector(dir, -this.camera.up.dot(dir)).normalize();
    const right = new T.Vector3().crossVectors(up, dir);
    // With the camera `d` back along `dir` and the box centre drawn at the band's centre, a corner at
    // (x, y, z) in the camera's axes (z towards the camera) lands at x / ((d − z) tanH) across and
    // offset + (y + offset·z·tanV) / ((d − z) tanV) up; each corner bounds d from below.
    let distance = options.minDistance ?? 0;
    const p = new T.Vector3();
    for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
      p.set(cx, cy, cz).sub(centre);
      const x = p.dot(right), y = p.dot(up), z = p.dot(dir);
      distance = Math.max(distance, z + (margin * Math.abs(x)) / tanH, z + (margin * Math.abs(y + offset * z * tanV)) / (band * tanV));
    }
    const target = centre.addScaledVector(up, -offset * distance * tanV);
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(dir, distance);
    this.controls.update();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.observer.disconnect();
    this.controls.dispose();
    this.lights.dispose();
    this.practical.dispose();
    this.environment.dispose();
    this.composer?.renderTarget1.dispose();
    this.composer?.renderTarget2.dispose();
    this.composer?.dispose();
    this.bloom?.dispose();
    this.ao?.dispose();
    this.library.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
