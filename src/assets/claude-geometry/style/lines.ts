import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { LookParams } from './look.ts';

// Hand-drawn lines for the village look, found on screen from the scene's own
// depth: no model carries an outline, and no pass draws the scene a second time.
//
// - Silhouettes, where one surface passes in front of another: 1/z runs
//   linearly across any plane on screen, so its second difference is zero on a
//   plane at any angle (a grazing ground included) and jumps only at a step.
//   Only one side of the step draws (the pixel beyond the edge), so a
//   silhouette is one line, about two pixels; it fades by the depth of the
//   surface in front, so an outline against the sky (a roof, a planet's limb)
//   is drawn as near as the thing it outlines, not as far as the sky.
// - Creases, where a surface turns: normals rebuilt from the same depth, tested
//   towards one side only (a one-pixel line), graded around the threshold so a
//   soft bevel fades instead of flickering into dots, and only near the camera.
//   Where the Stage stretches the fade past the look's own (a planet page), a
//   crease beyond the look's own distance is drawn only at a corner: two
//   faces at least two pixels wide meeting at nearly a right angle. Buildings
//   keep their drawing at planet scale; the folds of the ground and sub-metre
//   scatter, whose every pixel turns, do not fill with ink.
// - The pen drifts slowly and swells a little along silhouettes, lifts now and
//   then (gaps), and its edge is antialiased from four samples a quarter texel
//   apart. The drift, swell and gaps come from noise fixed in the world at
//   the surface the line belongs to (rebuilt from depth), not to the screen,
//   so when the camera moves over a still scene the gaps stay where they are
//   on the drawing instead of crawling along the lines. (A model that moves
//   itself, a ship on the turntable or in flight, still carries its lines
//   through that noise: a post pass knows positions, not models.) Lines thin out with
//   distance, as an illustrator leaves the distance light. Anything that
//   writes no depth (sky, plumes, ghosts) gets none.
//
// The colour target must carry a DepthTexture (linesTarget() makes one) and be
// the one the scene was just drawn into: with an EffectComposer, put the pass
// directly after the RenderPass. Hosts with their own render loop use LineDrawer.

export type LineParams = NonNullable<LookParams['edges']>;

const NOISE = /* glsl */ `
float lnHash( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float lnNoise( vec3 p ) {
  vec3 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f );
  float a = mix( mix( lnHash( i ), lnHash( i + vec3( 1.0, 0.0, 0.0 ) ), u.x ), mix( lnHash( i + vec3( 0.0, 1.0, 0.0 ) ), lnHash( i + vec3( 1.0, 1.0, 0.0 ) ), u.x ), u.y );
  float b = mix( mix( lnHash( i + vec3( 0.0, 0.0, 1.0 ) ), lnHash( i + vec3( 1.0, 0.0, 1.0 ) ), u.x ), mix( lnHash( i + vec3( 0.0, 1.0, 1.0 ) ), lnHash( i + vec3( 1.0, 1.0, 1.0 ) ), u.x ), u.y );
  return mix( a, b, u.z );
}`;

/**
 * The pen's noise cell, in metres along a surface, where a host with a moving
 * camera fixes it in the world (setPenCell): a gap or a turn of the drift
 * every so often. The Stage uses it at the look's own fade and stretches it
 * with a stretched fade (Stage.lineReach), so a planet page keeps its gaps
 * about as far apart on screen as a street.
 */
export const PEN_CELL = 0.5;
/**
 * Where a host does not fix the cell (a still picture: the blueprint
 * thumbnails), it is taken from the image: this many CSS pixels at the depth
 * where the lines start to fade, about what PEN_CELL spans at the look's own
 * 45 m on a desktop page (40° field of view, 1032 px tall). A thumbnail that
 * keeps its whole model unfaded then gets its gaps about as far apart on
 * screen as a page, not five times closer.
 */
export const PEN_PX = 15;

/** Metres per pen cell for a picture whose lines start to fade `fadeStart` metres out: PEN_PX CSS pixels there. */
export function imagePenCell(fadeStart: number, camera: T.PerspectiveCamera, cssHeight: number): number {
  // projectionMatrix[5] is zoom / tan(fov / 2): a CSS pixel at depth z spans 2 z / (that × height) metres.
  return PEN_PX * 2 * fadeStart / (camera.projectionMatrix.elements[5] * cssHeight);
}
/** How much a silhouette's width swells and thins along it (0.3: from 0.85 to 1.15 of the width). */
const PEN_SWELL = 0.3;
/**
 * Between the crease fade and the corner fade (setFade), a crease is drawn only where the surface
 * turns by at least FAR_CORNER (1 − cos: 0.8 is about 78°, graded from 71° to 85°) between faces
 * that stay within FAR_FLAT (1 − cos 0.1, about 26°) for two pixels on either side.
 */
const FAR_CORNER = '0.8', FAR_FLAT = '0.1';

const QUAD_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;

/** View-space normals rebuilt from depth, packed like MeshNormalMaterial; the sky (depth 1) faces the camera. */
const NORMALS_FS = /* glsl */ `
#include <packing>
uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear, uFar; uniform mat4 uProjInv; varying vec2 vUv;
float iz( vec2 uv ) { return -1.0 / perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, uNear, uFar ); }
vec3 pos( vec2 uv, float inv ) { vec4 r = uProjInv * vec4( uv * 2.0 - 1.0, 1.0, 1.0 ); vec3 d = r.xyz / r.w; return d / -d.z / inv; }
void main() {
  vec2 uv = ( floor( vUv * uRes ) + 0.5 ) / uRes, dx = vec2( 1.0 / uRes.x, 0.0 ), dy = vec2( 0.0, 1.0 / uRes.y );
  if ( texture2D( tDepth, uv ).x >= 1.0 ) { gl_FragColor = vec4( 0.5, 0.5, 1.0, 1.0 ); return; }
  float c = iz( uv ), l1 = iz( uv - dx ), l2 = iz( uv - 2.0 * dx ), r1 = iz( uv + dx ), r2 = iz( uv + 2.0 * dx );
  float b1 = iz( uv - dy ), b2 = iz( uv - 2.0 * dy ), t1 = iz( uv + dy ), t2 = iz( uv + 2.0 * dy );
  vec3 P = pos( uv, c );
  // Each tangent from the side that continues the same surface (the smaller second difference of 1/z).
  vec3 ddx = abs( 2.0 * r1 - r2 - c ) < abs( 2.0 * l1 - l2 - c ) ? pos( uv + dx, r1 ) - P : P - pos( uv - dx, l1 );
  vec3 ddy = abs( 2.0 * t1 - t2 - c ) < abs( 2.0 * b1 - b2 - c ) ? pos( uv + dy, t1 ) - P : P - pos( uv - dy, b1 );
  vec3 n = normalize( cross( ddx, ddy ) ); if ( dot( n, -P ) < 0.0 ) n = -n;
  gl_FragColor = vec4( packNormalToRGB( n ), 1.0 );
}`;

const LINES_FS = /* glsl */ `
#include <packing>
uniform sampler2D tColor, tNormal, tDepth; uniform vec2 uRes, uCreaseFade, uCornerFade, uFade; uniform float uNear, uFar, uWidth, uWobble, uBreaks, uSwell, uDepthK, uNormalK, uPx, uPenCell; uniform vec3 uInk;
uniform mat4 uProjInv, uViewInv;
varying vec2 vUv;${NOISE}
float viewZ( vec2 uv ) { return -perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, uNear, uFar ); }
// Where the pen is on the drawing: the world position of the nearest surface within three pixels (for a
// silhouette, the thing it outlines: the line lies up to its width beyond it), in pen cells. Where only
// sky is that near (the outer edge of a drifting outline) a fixed point keeps the pixel steady.
vec3 penAt( vec2 uv ) {
  vec2 dx = vec2( 3.0 / uRes.x, 0.0 ), dy = vec2( 0.0, 3.0 / uRes.y );
  float z = min( viewZ( uv ), min( min( viewZ( uv + dx ), viewZ( uv - dx ) ), min( viewZ( uv + dy ), viewZ( uv - dy ) ) ) );
  if ( z > uFar * 0.99 ) return vec3( 0.0 );
  vec4 r = uProjInv * vec4( uv * 2.0 - 1.0, 1.0, 1.0 ); vec3 d = r.xyz / r.w;
  return ( uViewInv * vec4( d / -d.z * z, 1.0 ) ).xyz / uPenCell;
}
vec3 nrm( vec2 uv ) { return texture2D( tNormal, uv ).xyz * 2.0 - 1.0; }
float silhouetteAt( vec2 uv, float r ) {
  uv = ( floor( uv * uRes ) + 0.5 ) / uRes;
  vec2 px = max( 1.0, floor( r + 0.5 ) ) / uRes;
  float z = viewZ( uv ), iz = 1.0 / z, e = 0.0, zNear = z;
  vec2 dirs[ 4 ];
  dirs[ 0 ] = vec2( 1.0, 0.0 ); dirs[ 1 ] = vec2( 0.0, 1.0 ); dirs[ 2 ] = vec2( 1.0, 1.0 ); dirs[ 3 ] = vec2( -1.0, 1.0 );
  for ( int i = 0; i < 4; i ++ ) {
    float za = viewZ( uv + dirs[ i ] * px ), zb = viewZ( uv - dirs[ i ] * px );
    e = max( e, step( uDepthK, ( 1.0 / za + 1.0 / zb - 2.0 * iz ) / iz ) );
    zNear = min( zNear, min( za, zb ) );
  }
  // The line lies on the far side of the step: fade it by the near surface, the one it outlines.
  return e * ( 1.0 - smoothstep( uFade.x, uFade.y, zNear ) );
}
// Creases fade over uCreaseFade. Where the host draws corners further out (uCornerFade: the Stage on a planet
// page, its stretched crease fade), a crease out there is drawn only at a corner: a turn of nearly a right angle
// between faces that stay flat for two pixels on either side. A pebble or a plant a few pixels across turns at
// every pixel.
float creaseAt( vec2 uv ) {
  uv = ( floor( uv * uRes ) + 0.5 ) / uRes;
  float z = viewZ( uv ); vec3 n = nrm( uv ); float e = 0.0;
  float own = 1.0 - smoothstep( uCreaseFade.x, uCreaseFade.y, z ), far = 1.0 - smoothstep( uCornerFade.x, uCornerFade.y, z );
  for ( int i = 0; i < 2; i ++ ) {
    vec2 d = ( i == 0 ? vec2( 1.0, 0.0 ) : vec2( 0.0, 1.0 ) ) / uRes, q = uv + d;
    vec3 nq = nrm( q );
    float turn = 1.0 - dot( n, nq ), c = smoothstep( uNormalK - 0.12, uNormalK + 0.12, turn ) * own;
    if ( far > own ) c = max( c, far * smoothstep( ${FAR_CORNER} - 0.12, ${FAR_CORNER} + 0.12, turn ) * step( 1.0 - dot( nrm( uv - d ), n ), ${FAR_FLAT} ) * step( 1.0 - dot( nq, nrm( q + d ) ), ${FAR_FLAT} ) );
    e = max( e, c * step( abs( viewZ( q ) - z ), z * 0.01 ) );
  }
  return e;
}
void main() {
  vec3 p = penAt( vUv );
  vec2 w = ( vec2( lnNoise( p * 0.75 ), lnNoise( p * 0.75 + 17.3 ) ) - 0.5 ) * 2.0 * uWobble * uPx;
  float rs = uWidth * 1.25 * uPx * ( 1.0 + uSwell * ( lnNoise( p * 0.53 + 5.1 ) - 0.5 ) );
  // A crease is found per pixel (creaseAt snaps to the pixel's centre), so once for all four samples.
  float e = 0.0, crease = creaseAt( vUv );
  for ( int k = 0; k < 4; k ++ ) {
    vec2 o = vec2( float( k & 1 ) - 0.5, float( k >> 1 ) - 0.5 ) * 0.5 / uRes;
    e += 0.25 * max( silhouetteAt( vUv + w / uRes + o, rs ), crease );
  }
  // Value noise in 3D gathers closer round its middle than the 2D noise the look's breaks were set
  // on; × 1.43 leaves the same share of a line out (about 2 % at breaks 0.1).
  e *= step( uBreaks * 1.43, lnNoise( p + 3.7 ) );
  vec4 c = texture2D( tColor, vUv );
  gl_FragColor = vec4( mix( c.rgb, uInk, e ), c.a );
}`;

/**
 * A colour target that keeps the scene's depth readable for the lines: 32-bit
 * float depth, so far ground's 1/z does not quantise into false edges.
 */
export function linesTarget(width = 1, height = 1, samples = 4): T.WebGLRenderTarget {
  return new T.WebGLRenderTarget(width, height, { type: T.HalfFloatType, samples, depthTexture: new T.DepthTexture(width, height, T.FloatType) });
}

/** The two full-screen steps: normals from depth, then lines laid over the colour. Owns its normal target. */
export class LineCompositor {
  private readonly normals = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false });
  private readonly normalQuad: FullScreenQuad;
  private readonly lineQuad: FullScreenQuad;
  private readonly nU: Record<string, T.IUniform>;
  private readonly lU: Record<string, T.IUniform>;
  private readonly pen: { wobble: number; breaks: number };
  /** The pen cell a host fixed in the world, or null to take it from the image (imagePenCell). */
  private fixedCell: number | null = null;

  constructor(p: LineParams, pixelRatio = 1) {
    this.pen = { wobble: p.wobble, breaks: p.breaks };
    const normalMat = new T.ShaderMaterial({
      uniforms: { tDepth: { value: null }, uRes: { value: new T.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 100 }, uProjInv: { value: new T.Matrix4() } },
      vertexShader: QUAD_VS, fragmentShader: NORMALS_FS, depthTest: false, depthWrite: false,
    });
    const lineMat = new T.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null },
        uRes: { value: new T.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 100 },
        // three.Color keeps a hex in linear working space, which the colour target holds.
        uInk: { value: new T.Color(p.color) }, uWidth: { value: p.width }, uWobble: { value: p.wobble }, uBreaks: { value: p.breaks }, uSwell: { value: PEN_SWELL },
        uDepthK: { value: p.depth }, uNormalK: { value: p.normal }, uPx: { value: pixelRatio },
        uCreaseFade: { value: new T.Vector2(...p.creaseFade) }, uCornerFade: { value: new T.Vector2(...p.creaseFade) }, uFade: { value: new T.Vector2(...p.fade) },
        uPenCell: { value: PEN_CELL }, uProjInv: { value: new T.Matrix4() }, uViewInv: { value: new T.Matrix4() },
      },
      vertexShader: QUAD_VS, fragmentShader: LINES_FS, depthTest: false, depthWrite: false,
    });
    this.nU = normalMat.uniforms; this.lU = lineMat.uniforms;
    this.normalQuad = new FullScreenQuad(normalMat);
    this.lineQuad = new FullScreenQuad(lineMat);
  }

  /** Size in drawing-buffer pixels (CSS size × pixel ratio). */
  setSize(width: number, height: number) {
    this.normals.setSize(width, height);
    this.nU.uRes.value.set(width, height);
    this.lU.uRes.value.set(width, height);
  }

  /** Widths and wobble are given in CSS pixels; this scales them to the drawing buffer. */
  setPixelRatio(ratio: number) { this.lU.uPx.value = ratio; }

  /**
   * Thin the drawing out over these camera distances (metres): creases first,
   * then everything. Past `crease`, out to `corners`, only corners are creased
   * (the Stage on a planet page, where the fade follows the camera); by default
   * there is no such band, and every crease inside `crease` is drawn.
   */
  setFade(crease: readonly [number, number], all: readonly [number, number], corners: readonly [number, number] = crease) {
    this.lU.uCreaseFade.value.set(...crease); this.lU.uCornerFade.value.set(...corners); this.lU.uFade.value.set(...all);
  }

  /**
   * Fix the pen's noise cell in the world, in metres (a host whose camera
   * moves: the Stage, LineDrawer), or null (the default) to take it from the
   * image every frame: PEN_PX CSS pixels where the lines start to fade.
   */
  setPenCell(metres: number | null) {
    this.fixedCell = metres;
    if (metres !== null) this.lU.uPenCell.value = metres;
  }

  /** The pen cell this compositor draws with through `camera`, in metres. */
  penCellFor(camera: T.PerspectiveCamera): number {
    const u = this.lU;
    return this.fixedCell ?? imagePenCell(u.uFade.value.x, camera, u.uRes.value.y / u.uPx.value);
  }

  /**
   * The pen's hand on (default) or off: off, every line is drawn whole and
   * steady, without drift, swell or gaps (to measure what the hand adds).
   */
  setPen(on: boolean) {
    this.lU.uWobble.value = on ? this.pen.wobble : 0;
    this.lU.uBreaks.value = on ? this.pen.breaks : 0;
    this.lU.uSwell.value = on ? PEN_SWELL : 0;
  }

  /** Metres per pen-noise cell in the last frame drawn (or the fixed cell). */
  get penCell(): number { return this.lU.uPenCell.value as number; }

  render(renderer: T.WebGLRenderer, color: T.Texture, depth: T.DepthTexture, camera: T.PerspectiveCamera, out: T.WebGLRenderTarget | null) {
    this.nU.tDepth.value = depth; this.nU.uNear.value = camera.near; this.nU.uFar.value = camera.far;
    this.nU.uProjInv.value.copy(camera.projectionMatrixInverse);
    renderer.setRenderTarget(this.normals);
    this.normalQuad.render(renderer);
    this.lU.tColor.value = color; this.lU.tNormal.value = this.normals.texture; this.lU.tDepth.value = depth;
    this.lU.uNear.value = camera.near; this.lU.uFar.value = camera.far;
    this.lU.uProjInv.value.copy(camera.projectionMatrixInverse); this.lU.uViewInv.value.copy(camera.matrixWorld);
    this.lU.uPenCell.value = this.penCellFor(camera);
    renderer.setRenderTarget(out);
    this.lineQuad.render(renderer);
  }

  dispose() {
    this.normals.dispose();
    (this.normalQuad.material as T.Material).dispose(); this.normalQuad.dispose();
    (this.lineQuad.material as T.Material).dispose(); this.lineQuad.dispose();
  }
}

/** The lines as an EffectComposer pass: directly after the RenderPass, whose target carries a DepthTexture. */
export class HandDrawnLinesPass extends Pass {
  readonly lines: LineCompositor;
  private readonly camera: T.PerspectiveCamera;

  constructor(camera: T.PerspectiveCamera, p: LineParams, pixelRatio = 1) {
    super();
    this.camera = camera;
    this.lines = new LineCompositor(p, pixelRatio);
  }

  setSize(width: number, height: number) { this.lines.setSize(width, height); }

  render(renderer: T.WebGLRenderer, writeBuffer: T.WebGLRenderTarget, readBuffer: T.WebGLRenderTarget) {
    // Read at render time, never cached: the composer swaps its targets.
    const depth = readBuffer.depthTexture;
    if (!depth) throw new Error('HandDrawnLinesPass needs the scene target to carry a DepthTexture (see linesTarget)');
    this.lines.render(renderer, readBuffer.texture, depth, this.camera, this.renderToScreen ? null : writeBuffer);
  }

  dispose() { this.lines.dispose(); }
}

/**
 * For a host with its own render loop (the main project's world view): call
 * drawer.render() where it called renderer.render(scene, camera). It draws the
 * scene into a depth-bearing target, lays the lines over it and writes to the
 * canvas through an OutputPass, which applies the renderer's tone mapping and
 * output colour space as renderer.render would have. Call setSize on resize.
 */
export class LineDrawer {
  readonly composer: EffectComposer;
  readonly pass: HandDrawnLinesPass;

  constructor(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.PerspectiveCamera, p: LineParams) {
    this.composer = new EffectComposer(renderer, linesTarget());
    this.composer.addPass(new RenderPass(scene, camera));
    this.pass = new HandDrawnLinesPass(camera, p, renderer.getPixelRatio());
    // The world view's camera moves: the pen's gaps stay put on the drawing, as on the Stage.
    this.pass.lines.setPenCell(PEN_CELL);
    this.composer.addPass(this.pass);
    this.composer.addPass(new OutputPass());
  }

  /** CSS pixels; the composer applies the renderer's pixel ratio. */
  setSize(width: number, height: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.pass.lines.setPixelRatio(pixelRatio);
  }

  render() { this.composer.render(); }

  dispose() { this.pass.dispose(); this.composer.dispose(); }
}
