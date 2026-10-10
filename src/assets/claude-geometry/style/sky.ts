import * as T from 'three';
import type { LookParams } from './look.ts';

// The village look's sky: flat colour in three tones, its clouds long ragged
// bands made by thresholding value noise stretched along the horizon. A dome
// that follows the camera, drawn first and writing no depth, so it never takes
// part in the screen-space lines (src/style/lines.ts). The bands lie along the
// camera's own horizon (camera.up): +Y on a flat street, so the clouds never
// stream down the screen. On a planet page (acrossView) they lie across the
// view instead: those cameras look down at a planet, and along camera.up the
// sky behind it is the bands' pole, where they close up into round patches.

const NOISE = /* glsl */ `
float skHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float skNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( skHash( i ), skHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( skHash( i + vec2( 0.0, 1.0 ) ), skHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float skFbm( vec2 p ) { return 0.5 * skNoise( p ) + 0.3 * skNoise( p * 2.07 + 13.1 ) + 0.2 * skNoise( p * 4.13 + 7.7 ); }
// The tone field at q (azimuth and height, stretched): mean 0.5, thresholded below into the three tones.
float skTone( vec2 q ) {
  float n = skFbm( q * vec2( 1.0, 1.6 ) + vec2( 0.0, 2.3 ) ), m = skFbm( q * 2.6 + 11.0 );
  return n + 0.12 * ( m - 0.5 );
}`;

/**
 * Radians of azimuth, just past -pi in the sky frame, over which the band
 * noise eases into its continuation from +pi (11.5 degrees). The cameras of
 * the village sample and its workshop set show sky from -166.7 degrees round
 * to +178.9 degrees (desktop), so their sky never reaches this sliver and is
 * drawn exactly as it was.
 */
export const SKY_SEAM = 0.2;

/**
 * Rows of the sky's frame for a camera whose up is `up`: across, up, and the
 * third axis, so +Y gives the identity and a street's sky is unchanged.
 */
export function skyFrame(up: T.Vector3, out = new T.Matrix3()): T.Matrix3 {
  const y = up.clone().normalize();
  // Across: world +X made perpendicular to up (world +Z when up is close to X).
  const ref = Math.abs(y.x) > 0.9 ? new T.Vector3(0, 0, 1) : new T.Vector3(1, 0, 0);
  const x = ref.addScaledVector(y, -ref.dot(y)).normalize();
  const z = new T.Vector3().crossVectors(x, y);
  // Matrix3.set takes rows: frame * d = (d·x, d·y, d·z).
  return out.set(x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z);
}

const viewUp = new T.Vector3(), view = new T.Vector3(), level = new T.Vector3();
const turn = new T.Quaternion(), turn4 = new T.Matrix4(), turn3 = new T.Matrix3();

/**
 * The sky frame for a camera looking along `forward` with up `up`, where the
 * bands lie across the view (CloudSky.acrossView): skyFrame(up) turned about
 * the camera's right until the view lies on the bands' horizon. A camera that
 * looks down at a planet then sees the bands lie across the screen as a
 * street camera does, instead of looking into their pole, where they close
 * up into round patches. The bands slide sideways as the camera turns about
 * up and hold still on screen as it tilts. Null when the camera looks
 * straight along up (the sky keeps the frame it had).
 */
export function viewSkyFrame(up: T.Vector3, forward: T.Vector3, out = new T.Matrix3()): T.Matrix3 | null {
  viewUp.copy(up).normalize(); view.copy(forward).normalize();
  level.copy(view).addScaledVector(viewUp, -view.dot(viewUp));
  if (level.lengthSq() < 1e-8) return null;
  turn3.setFromMatrix4(turn4.makeRotationFromQuaternion(turn.setFromUnitVectors(view, level.normalize())));
  return out.multiplyMatrices(skyFrame(viewUp), turn3);
}

/** The cloud sky dome. */
export type CloudSky = T.Mesh<T.SphereGeometry, T.ShaderMaterial> & {
  /**
   * Lay the bands across the view (viewSkyFrame) rather than along the
   * horizon of camera.up (skyFrame): planet pages, whose cameras look down
   * at a planet (src/shell/stage.ts Stage.skyAcrossView).
   */
  acrossView: boolean;
};

/** The cloud sky dome; its bands lie along the horizon of the camera drawing it (camera.up), or across its view. */
export function createCloudSky(p: NonNullable<LookParams['cloudSky']>, radius = 350): CloudSky {
  // three.Color reads a hex as sRGB and keeps it in linear working space, which the scene target holds.
  const frame = new T.Matrix3(), up = new T.Vector3(0, 1, 0), forward = new T.Vector3();
  const material = new T.ShaderMaterial({
    uniforms: { uDeep: { value: new T.Color(p.deep) }, uMid: { value: new T.Color(p.mid) }, uLight: { value: new T.Color(p.light) }, uScale: { value: p.scale }, uFrame: { value: frame } },
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep, uMid, uLight; uniform float uScale; uniform mat3 uFrame; varying vec3 vDir;${NOISE}
      const float PI = 3.14159265359, SEAM = ${SKY_SEAM.toFixed(4)};
      void main() {
        vec3 d = uFrame * normalize( vDir );
        // Long horizontal bands: stretch the noise along the horizon.
        float az = atan( d.z, d.x );
        float t = skTone( vec2( az * 2.2, d.y * 7.0 ) * uScale );
        // The azimuth jumps from +pi to -pi on the frame's -across side and the noise does not wrap with it,
        // so every band was cut there along a half circle of the sky. Just past -pi the field eases over
        // from the bands as they run on past +pi to its own, keeping its spread (two independent fields
        // mixed by s and 1 - s, divided by the length of (s, 1 - s)), so they meet without a cut.
        // Everywhere else the sky is exactly as before.
        if ( az < SEAM - PI ) {
          float s = smoothstep( -PI, SEAM - PI, az ), on = skTone( vec2( ( az + 2.0 * PI ) * 2.2, d.y * 7.0 ) * uScale );
          t = 0.5 + ( mix( on, t, s ) - 0.5 ) / length( vec2( s, 1.0 - s ) );
        }
        // Mostly the light tone, with long streaks of the mid tone and a few of the deep one in them.
        vec3 c = mix( uLight, uMid, step( t, 0.43 ) );
        c = mix( c, uDeep, step( t, 0.31 ) );
        gl_FragColor = vec4( c, 1.0 );
        #include <colorspace_fragment>
      }`,
    side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const sky: CloudSky = Object.assign(new T.Mesh(new T.SphereGeometry(radius, 48, 24), material), { acrossView: false });
  sky.name = 'cloud-sky';
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  let turned = false;
  sky.onBeforeRender = (_r, _s, camera) => {
    sky.position.copy(camera.position); sky.updateMatrixWorld();
    if (sky.acrossView) { if (viewSkyFrame(camera.up, camera.getWorldDirection(forward), frame)) turned = true; }
    else if (turned || !up.equals(camera.up)) { skyFrame(up.copy(camera.up), frame); turned = false; }
  };
  return sky;
}
