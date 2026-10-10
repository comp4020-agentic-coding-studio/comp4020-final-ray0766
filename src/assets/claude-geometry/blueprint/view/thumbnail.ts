import * as T from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { handleFor } from '../../core/dispose.ts';
import type { ModelHandle } from '../../core/dispose.ts';
import type { Stage } from '../../shell/stage.ts';
import { LineCompositor, linesTarget } from '../../style/lines.ts';
import { lookParams } from '../../style/look.ts';
import { UI, VILLAGE_UI } from '../../style/tokens.ts';
import { buildBlueprintModel } from '../model3d.ts';
import type { PartPlacement } from '../model.ts';
import { buildPart } from '../parts/catalogue.ts';
import type { PartId } from '../parts/catalogue.ts';

// Library thumbnails and palette icons, rendered with the page's own renderer
// into an offscreen target: the model is drawn into a half-float target under
// the shared environment, the village look's lines are laid over it from its
// depth (src/style/lines.ts), then OutputPass applies the page's tone mapping
// and sRGB encoding into an 8-bit target that is read back into a canvas.
// Everything made here is freed before returning.

/** `environment` defaults to the page's current one; pass the hangar map so thumbnails look the same in every view. */
export function renderModel(stage: Stage, model: ModelHandle, width: number, height: number, view = new T.Vector3(0.75, 0.55, 1), environment: T.Texture | null = stage.scene.environment): string {
  const renderer = stage.renderer;
  const w = width * 2, h = height * 2;
  const scene = new T.Scene();
  scene.environment = environment;
  const P = lookParams(stage.look);
  // As on the page: a flat look takes no image light (three reads the scene's intensity, not the material's).
  if (P?.toneMapping === 'none') scene.environmentIntensity = P.envIntensity;
  // The village look's icons sit on a pale wash of its sky (tokens.ts VILLAGE_UI; blueprint.css shows
  // the same colour round them). Its look parameters still carry the warm paper here.
  scene.background = new T.Color(stage.look === 'village' ? VILLAGE_UI.scene.thumbnail : P ? P.thumbnail : UI.bg);
  // Lit like the page's look, so an icon matches the part placed from it.
  const warm = P !== null, W = (P ?? lookParams('warm')!).light;
  const key = new T.DirectionalLight(warm ? W.key : '#ffdcb6', warm ? W.keyIntensity : 2.4);
  if (warm) key.position.set(...W.keyPosition); else key.position.set(6, 9, 7);
  const fill = warm ? new T.HemisphereLight(W.sky, W.ground, W.fillIntensity) : new T.HemisphereLight('#3c4652', '#17130f', 0.4);
  scene.add(key, fill);
  model.object.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
  scene.add(model.object);
  const sphere = new T.Box3().setFromObject(model.object).getBoundingSphere(new T.Sphere());
  const camera = new T.PerspectiveCamera(30, w / h, 0.05, 200);
  const distance = sphere.radius / Math.sin(T.MathUtils.degToRad(30) / 2) * (w > h ? 0.9 : 1.05);
  camera.position.copy(sphere.center).addScaledVector(view.clone().normalize(), distance);
  camera.lookAt(sphere.center);
  const edges = P?.edges ?? null;
  const hdr = edges ? linesTarget(w, h) : new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, samples: 4 });
  // Lines at the same width on screen as the page's (the image is drawn at twice its size), never faded:
  // the whole model is the subject however far the camera stands back to frame it.
  const lines = edges ? new LineCompositor(edges, 2) : null;
  const inked = edges ? new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, depthBuffer: false }) : null;
  lines?.setSize(w, h);
  lines?.setFade([distance * 4, distance * 5], [distance * 4, distance * 5]);
  const ldr = new T.WebGLRenderTarget(w, h);
  const output = new OutputPass();
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(hdr);
    renderer.clear();
    renderer.render(scene, camera);
    if (lines && inked) lines.render(renderer, hdr.texture, hdr.depthTexture!, camera, inked);
    output.render(renderer, ldr, inked ?? hdr, 0, false);
    const pixels = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(ldr, 0, 0, w, h, pixels);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(w, h);
    // GL rows run bottom-up.
    for (let y = 0; y < h; y++) image.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    renderer.setRenderTarget(previous);
    model.dispose();
    key.dispose(); fill.dispose();
    hdr.dispose(); ldr.dispose(); output.dispose();
    lines?.dispose(); inked?.dispose();
  }
}

export const blueprintThumbnail = (stage: Stage, parts: readonly PartPlacement[], width = 176, height = 120, environment?: T.Texture | null) =>
  renderModel(stage, buildBlueprintModel(parts, stage.library, stage.lod, { sockets: false }), width, height, undefined, environment);

/** Palette icon; the part's lamp stays on its mesh, so disposing the group frees it. */
export const partIcon = (stage: Stage, id: PartId, size = 64) =>
  renderModel(stage, handleFor(buildPart(id, stage.library).group), size, size, new T.Vector3(0.9, 0.6, 1.2));
