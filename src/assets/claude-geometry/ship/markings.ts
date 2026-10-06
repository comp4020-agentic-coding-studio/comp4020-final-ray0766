import * as T from 'three';
import type { Vec3 } from '../core/vec.ts';
import { PALETTE } from '../style/tokens.ts';
import { HULLS } from './spec.ts';
import type { HullId } from './spec.ts';

// Weathering and markings: one owned texture atlas and one decal mesh per ship.
//
// Shared paint from StyleLibrary.leasePaint is clean and uniform by design (it
// is shared by every ship with that colour). What makes a hull read as a
// working machine rather than a model kit is local and per ship: dirt that
// collects low on the sides and runs down from seams, soot around reaction
// thrusters, chipped paint along edges, service placards and the
// registration. All of it is painted into one canvas atlas and drawn by one
// transparent mesh of flat quads laid on the hull's flat facets, so it costs a
// single draw call and no paint material is ever modified.
//
// Placements are authored for the right-hand (starboard) side in the body
// frame and mirrored like sockets. tests/unit/ship ray-casts every corner
// against the built hull (each quad must lie flush on painted skin) and every
// placard against every part combination (nothing may cover it).

export type MarkingKind = 'grime' | 'grime-deck' | 'soot' | 'rescue' | 'no-step' | 'panel' | 'warning' | 'registration';
/** Markings that carry text or symbols and must stay readable (never covered by a part). */
export const PLACARDS: readonly MarkingKind[] = ['rescue', 'no-step', 'panel', 'warning', 'registration'];

/** Atlas size and cells in canvas pixels [x, y, width, height], y down. */
export const ATLAS = { width: 1024, height: 512 } as const;
export const CELLS: Record<MarkingKind, readonly [number, number, number, number]> = {
  grime: [0, 0, 1024, 128],
  'grime-deck': [0, 128, 512, 256],
  soot: [512, 128, 256, 256],
  rescue: [768, 128, 256, 64],
  'no-step': [768, 192, 256, 64],
  panel: [768, 256, 128, 64],
  warning: [896, 256, 64, 64],
  registration: [0, 384, 512, 128],
};

export interface Marking {
  kind: MarkingKind;
  /** Centre, on the hull surface. */
  position: Vec3;
  /** Outward surface normal. */
  normal: Vec3;
  /** Direction of the marking's top edge, projected onto the surface (default +Y; required on level faces). */
  up?: Vec3;
  width: number;
  height: number;
  /** Also placed reflected onto the left-hand side. */
  both: boolean;
}

const S = Math.SQRT1_2;
/** Wedge facet normals: upper slope (deck edge to chine) and lower slope (chine to keel). */
const WEDGE_UPPER: Vec3 = [0.28 / 0.3441, 0.2 / 0.3441, 0];
const WEDGE_LOWER: Vec3 = [0.24 / 0.3688, -0.28 / 0.3688, 0];
const AFT: Vec3 = [0, 0, 1];

/**
 * Per hull, on the constant mid-body section (see the station tables in
 * parts/hulls.ts): broad grime over each flat facet, then placards in clear
 * spots chosen around the wing roots, side engine plates, hatches and frames.
 */
export const HULL_MARKINGS: Record<HullId, Marking[]> = {
  // Constant section z −1.2…0.85: side x 0.42 (y −0.25…0.16), shoulder (0.30, 0.28)–(0.42, 0.16), deck y 0.28.
  'slim-courier': [
    { kind: 'grime', position: [0.42, -0.045, -0.18], normal: [1, 0, 0], width: 2.0, height: 0.39, both: true },
    { kind: 'grime', position: [0.36, 0.22, -0.18], normal: [S, S, 0], width: 2.0, height: 0.15, both: true },
    { kind: 'grime-deck', position: [0, 0.28, 0.55], normal: [0, 1, 0], up: AFT, width: 0.5, height: 0.5, both: false },
    // Nose reaction thruster on the tapering side facet (z −1.5…−1.2, x = 0.36 + 0.2·(z + 1.5)).
    { kind: 'soot', position: [0.4, 0, -1.3], normal: [1 / 1.0198, 0, -0.2 / 1.0198], width: 0.18, height: 0.18, both: true },
    { kind: 'rescue', position: [0.42, 0.115, -0.3], normal: [1, 0, 0], width: 0.24, height: 0.06, both: true },
    { kind: 'panel', position: [0.42, 0.12, 0.45], normal: [1, 0, 0], width: 0.1, height: 0.05, both: true },
    { kind: 'warning', position: [0.36, 0.22, 0.5], normal: [S, S, 0], width: 0.06, height: 0.06, both: true },
  ],
  // Constant section z −1.45…1.3: side x 0.58 (y −0.35…0.24), shoulder (0.42, 0.40)–(0.58, 0.24), deck y 0.40.
  'boxy-hauler': [
    { kind: 'grime', position: [0.58, -0.055, -0.08], normal: [1, 0, 0], width: 2.7, height: 0.57, both: true },
    { kind: 'grime', position: [0.5, 0.32, -0.08], normal: [S, S, 0], width: 2.7, height: 0.2, both: true },
    { kind: 'grime-deck', position: [0, 0.4, 0.75], normal: [0, 1, 0], up: AFT, width: 0.7, height: 1.9, both: false },
    // Between the 0.25 m frame and a side nacelle's intake lip (z ≥ 0.6).
    { kind: 'rescue', position: [0.58, 0, 0.4], normal: [1, 0, 0], width: 0.24, height: 0.06, both: true },
    { kind: 'panel', position: [0.58, 0.18, -0.4], normal: [1, 0, 0], width: 0.1, height: 0.05, both: true },
    { kind: 'warning', position: [0.58, -0.05, -1.1], normal: [1, 0, 0], width: 0.06, height: 0.06, both: true },
    // Aft of the roof hatch, outboard of the dorsal mount, inboard of the handrail.
    { kind: 'no-step', position: [0.28, 0.4, 0.4], normal: [0, 1, 0], up: AFT, width: 0.16, height: 0.05, both: true },
  ],
  // Constant section z −0.9…1.3: deck y 0.22 (x ±0.3), upper slope (0.3, 0.22)–(0.5, −0.06), lower slope (0.5, −0.06)–(0.22, −0.3).
  'wedge-interceptor': [
    { kind: 'grime', position: [0.4, 0.08, 0.2], normal: WEDGE_UPPER, width: 2.16, height: 0.32, both: true },
    { kind: 'grime', position: [0.36, -0.18, 0.2], normal: WEDGE_LOWER, width: 2.16, height: 0.34, both: true },
    { kind: 'grime-deck', position: [0, 0.22, 0.375], normal: [0, 1, 0], up: AFT, width: 0.52, height: 0.85, both: false },
    { kind: 'rescue', position: [0.4, 0.08, 0.05], normal: WEDGE_UPPER, width: 0.24, height: 0.06, both: true },
    { kind: 'panel', position: [0.3133, -0.22, 0.9], normal: WEDGE_LOWER, width: 0.1, height: 0.05, both: true },
    { kind: 'warning', position: [0.36, -0.18, -0.12], normal: WEDGE_LOWER, width: 0.06, height: 0.06, both: true },
    // Between a comms dish's rim (z ≤ 0.77) and the tail plinths (z ≥ 0.83).
    { kind: 'no-step', position: [0.21, 0.22, 0.8], normal: [0, 1, 0], up: AFT, width: 0.16, height: 0.05, both: true },
  ],
};

/** A marking reflected through the YZ plane. */
export const mirrorMarking = (m: Marking): Marking => ({
  ...m,
  position: [-m.position[0], m.position[1], m.position[2]],
  normal: [-m.normal[0], m.normal[1], m.normal[2]],
  up: m.up && [-m.up[0], m.up[1], m.up[2]],
});

/**
 * Every quad a hull carries, in drawing order (grime first, the registration
 * last so text sits on top of dirt). The registration uses the hull's decal
 * placement from spec.ts.
 */
export function hullMarkings(hull: HullId, registration: boolean): Marking[] {
  const order: MarkingKind[] = ['grime', 'grime-deck', 'soot', 'rescue', 'no-step', 'panel', 'warning'];
  const list = [...HULL_MARKINGS[hull]].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const out: Marking[] = [];
  for (const m of list) { out.push(m); if (m.both) out.push(mirrorMarking(m)); }
  if (registration) {
    const d = HULLS[hull].decal;
    const reg: Marking = { kind: 'registration', position: d.position, normal: d.normal, width: d.width, height: d.height, both: true };
    out.push(reg, mirrorMarking(reg));
  }
  return out;
}

/** Corners of a marking quad (and its centre) in the body frame, plus its in-plane axes. */
export function markingFrame(m: Marking) {
  const n = new T.Vector3(...m.normal).normalize();
  const upHint = new T.Vector3(...(m.up ?? [0, 1, 0]));
  const v = upHint.addScaledVector(n, -upHint.dot(n)).normalize();
  // u = v × n runs left to right for a viewer facing the surface with v as their up.
  const u = new T.Vector3().crossVectors(v, n).normalize();
  const c = new T.Vector3(...m.position);
  const corner = (su: number, sv: number) => c.clone().addScaledVector(u, su * m.width / 2).addScaledVector(v, sv * m.height / 2);
  return { n, u, v, centre: c, corner };
}

/** Height of the decal layer above the surface; polygon offset does the rest. */
const LIFT = 0.004;

/** Flat quads for a list of markings, with UVs into the atlas cells. Non-indexed, owned by the caller. */
export function markingGeometry(markings: Marking[]): T.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const quad: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (const m of markings) {
    const { n, corner } = markingFrame(m);
    const [cx, cy, cw, ch] = CELLS[m.kind];
    // Canvas textures are flipped on upload: canvas row 0 is v = 1.
    const u0 = cx / ATLAS.width, u1 = (cx + cw) / ATLAS.width, v0 = 1 - (cy + ch) / ATLAS.height, v1 = 1 - cy / ATLAS.height;
    const pts = quad.map(([a, b]) => corner(a, b).addScaledVector(n, LIFT));
    const face = new T.Vector3().crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0]));
    const order = face.dot(n) >= 0 ? [0, 1, 2, 3, 4, 5] : [0, 2, 1, 3, 5, 4];
    for (const i of order) {
      positions.push(pts[i].x, pts[i].y, pts[i].z); normals.push(n.x, n.y, n.z);
      uvs.push(quad[i][0] < 0 ? u0 : u1, quad[i][1] < 0 ? v0 : v1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.computeBoundingSphere();
  return g;
}

// ----------------------------------------------------------------- painting

export interface AtlasSpec {
  /** Registration text; the registration cell stays empty without one. */
  registration?: string;
  /** Registration ink that reads against the paint under it. */
  ink: string;
  /** Seed for the dirt, so a design always gets the same wear. */
  seed: number;
}

/** Stable 32-bit seed from a design id. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const GRIME = '#1a150f', SOOT = '#0c0b0a', CHIP = '#6b6f73';
const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Paint the atlas into a 2D context. Separate from the texture so it can be inspected on its own. */
export function paintAtlas(g: CanvasRenderingContext2D, spec: AtlasSpec): void {
  let s = spec.seed >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  g.clearRect(0, 0, ATLAS.width, ATLAS.height);
  const cell = (kind: MarkingKind, draw: (w: number, h: number) => void) => {
    const [x, y, w, h] = CELLS[kind];
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y);
    draw(w, h);
    g.restore();
  };
  const blotches = (w: number, h: number, count: number, rMin: number, rMax: number, aMin: number, aMax: number, color: string, bias = 0) => {
    for (let i = 0; i < count; i++) {
      // bias > 0 pushes blotches towards the bottom edge, where dirt collects.
      const yy = h * (1 - Math.pow(rnd(), 1 + bias));
      g.fillStyle = rgba(color, aMin + rnd() * (aMax - aMin));
      g.beginPath(); g.ellipse(rnd() * w, yy, rMin + rnd() * (rMax - rMin), (rMin + rnd() * (rMax - rMin)) * 0.6, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  };
  const chips = (w: number, h: number, count: number, band: number) => {
    // Paint chipped back to primer along the facet's edges.
    for (let i = 0; i < count; i++) {
      const top = rnd() < 0.5, yy = top ? rnd() * band * h : h - rnd() * band * h;
      g.fillStyle = rgba(CHIP, 0.35 + rnd() * 0.4);
      g.beginPath(); g.ellipse(rnd() * w, yy, 0.6 + rnd() * 2.2, 0.5 + rnd() * 1.2, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  };

  // Side and slope facets: dirt collects towards the lower edge, runs down from
  // the upper edge and from seams, and the paint is chipped along both edges.
  cell('grime', (w, h) => {
    const low = g.createLinearGradient(0, h, 0, h * 0.4);
    low.addColorStop(0, rgba(GRIME, 0.38)); low.addColorStop(1, rgba(GRIME, 0));
    g.fillStyle = low; g.fillRect(0, 0, w, h);
    const lip = g.createLinearGradient(0, 0, 0, h * 0.12);
    lip.addColorStop(0, rgba(GRIME, 0.22)); lip.addColorStop(1, rgba(GRIME, 0));
    g.fillStyle = lip; g.fillRect(0, 0, w, h);
    blotches(w, h, 520, 3, 26, 0.02, 0.07, GRIME, 1.2);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w, y0 = rnd() * h * 0.55, len = h * (0.2 + rnd() * 0.65), wd = 1 + rnd() * 3.5;
      const run = g.createLinearGradient(0, y0, 0, y0 + len);
      run.addColorStop(0, rgba(GRIME, 0.1 + rnd() * 0.16)); run.addColorStop(1, rgba(GRIME, 0));
      g.fillStyle = run; g.fillRect(x, y0, wd, len);
    }
    chips(w, h, 260, 0.1);
  });

  // Deck: boot scuffs, patchy dirt and worn chips where people walk and kneel.
  cell('grime-deck', (w, h) => {
    blotches(w, h, 380, 4, 34, 0.02, 0.07, GRIME);
    g.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
      const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, len = 6 + rnd() * 26;
      g.strokeStyle = rgba(GRIME, 0.06 + rnd() * 0.12); g.lineWidth = 1 + rnd() * 3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    chips(w, h, 160, 0.5);
  });

  // Reaction-thruster soot: a dark core with four plumes along the nozzle axes.
  cell('soot', (w, h) => {
    const cx = w / 2, cy = h / 2;
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, w * 0.48);
    core.addColorStop(0, rgba(SOOT, 0.62)); core.addColorStop(0.35, rgba(SOOT, 0.3)); core.addColorStop(1, rgba(SOOT, 0));
    g.fillStyle = core; g.fillRect(0, 0, w, h);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      for (let i = 0; i < 26; i++) {
        const t = rnd(), r = 6 + rnd() * 16;
        g.fillStyle = rgba(SOOT, 0.05 + 0.08 * (1 - t));
        g.beginPath(); g.ellipse(cx + dx * t * w * 0.46 + (rnd() - 0.5) * 10, cy + dy * t * h * 0.46 + (rnd() - 0.5) * 10, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
      }
    }
  });

  const plate = (w: number, h: number, fill: string, border: string) => {
    g.fillStyle = fill; g.fillRect(4, 4, w - 8, h - 8);
    g.strokeStyle = border; g.lineWidth = 2; g.strokeRect(7, 7, w - 14, h - 14);
  };
  const text = (value: string, x: number, y: number, size: number, color: string, maxWidth: number) => {
    g.fillStyle = color; g.font = `700 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(value, x, y, maxWidth);
  };
  // Amber rescue placard with a pointer towards the canopy release.
  cell('rescue', (w, h) => {
    plate(w, h, rgba(PALETTE.amber, 0.92), rgba(PALETTE.graphite, 0.9));
    text('RESCUE', w * 0.42, h / 2 + 2, 34, PALETTE.graphite, w * 0.62);
    g.fillStyle = PALETTE.graphite; g.beginPath(); g.moveTo(w - 50, h / 2 - 14); g.lineTo(w - 22, h / 2); g.lineTo(w - 50, h / 2 + 14); g.closePath(); g.fill();
  });
  cell('no-step', (w, h) => {
    plate(w, h, rgba(PALETTE.graphite, 0.86), rgba(PALETTE.bone, 0.7));
    text('NO STEP', w / 2, h / 2 + 2, 34, PALETTE.bone, w - 40);
  });
  cell('panel', (w, h) => {
    plate(w, h, rgba(PALETTE.graphite, 0.86), rgba(PALETTE.bone, 0.55));
    text('B-07', w / 2, h / 2 + 2, 30, PALETTE.bone, w - 24);
  });
  cell('warning', (w, h) => {
    g.fillStyle = PALETTE.graphite;
    g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w - 4, h - 6); g.lineTo(4, h - 6); g.closePath(); g.fill();
    g.fillStyle = PALETTE.amber;
    g.beginPath(); g.moveTo(w / 2, 13); g.lineTo(w - 12, h - 11); g.lineTo(12, h - 11); g.closePath(); g.fill();
    text('!', w / 2, h * 0.62, 30, PALETTE.graphite, w);
  });

  // Registration in the hull's ink, letter-spaced, with worn flecks knocked out.
  if (spec.registration) {
    const reg = spec.registration;
    cell('registration', (w, h) => {
      g.fillStyle = spec.ink;
      g.font = `700 92px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '6px';
      g.fillText(reg, w / 2, h / 2 + 4, w - 24);
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 260; i++) { g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.6 + rnd() * 1.8, 0, Math.PI * 2); g.fill(); }
      g.globalCompositeOperation = 'source-over';
    });
  }
}
