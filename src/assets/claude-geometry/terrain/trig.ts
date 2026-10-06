// Sine, cosine and tangent from plain arithmetic, for the few per-field
// constants that need an angle (desert wind axis, slope thresholds).
// Math.sin/cos/tan are not required to be correctly rounded, so engines may
// differ in the last bit; a fixed series of + − × ÷ (and Math.round for the
// range reduction) gives the same bits in every conforming engine.

const TAU = 6.283185307179586;

/** [sin x, cos x] for x in radians: reduce to [−π, π], quarter the angle, Taylor series, double twice. */
export function sinCos(x: number): [number, number] {
  if (!Number.isFinite(x)) throw new RangeError('sinCos needs a finite angle.');
  const h = (x - TAU * Math.round(x / TAU)) / 4, h2 = h * h;
  let s = h, c = 1, ts = h, tc = 1;
  for (let k = 1; k <= 10; k++) {
    ts *= -h2 / ((2 * k) * (2 * k + 1));
    tc *= -h2 / ((2 * k - 1) * (2 * k));
    s += ts; c += tc;
  }
  for (let i = 0; i < 2; i++) { const s2 = 2 * s * c, c2 = c * c - s * s; s = s2; c = c2; }
  return [s, c];
}

/** tan of an angle given in degrees. */
export function tanDeg(deg: number): number {
  const [s, c] = sinCos(deg * Math.PI / 180);
  return s / c;
}
