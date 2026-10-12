import { roadHalfWidth } from './params.ts';
import type { Network } from './network.ts';
import { fromLocalRight, v2 } from './network.ts';
import { angle, fromLocal, latLonOf, toLocal } from './sphere.ts';
import type { V2, V3 } from './sphere.ts';

/** What the plan map can draw beyond the road network (all optional). */
export interface PlanOverlay {
  footprints?: { id: string; outline: V3[]; canopy?: V3[]; kind: string; label?: string; conflict?: boolean }[];
  entrances?: { id: string; from: V3; to: V3 }[];
  setbacks?: { id: string; line: V3[] }[];
  reserves?: { id: string; at: V3; radius: number; kind: string }[];
  areas?: { id: string; at: V3; radius: number; kind: string; label: string }[];
  props?: { id: string; at: V3; kind: string }[];
  residents?: { id: string; at: V3; route?: V3[] }[];
  conflicts?: { id: string; at: V3; message: string }[];
  labels?: { at: V3; text: string; size?: number }[];
}

const COLORS: Record<string, string> = { main: '#6b8184', branch: '#b9b29b', lane: '#d6cfb9', door: '#e2dccb', plaza: '#cec8b5' };

/** Two azimuthal-equidistant discs (north and south hemispheres plus a 20° overlap). */
export function planSvg(network: Network, overlay: PlanOverlay = {}, title = 'Main planet plan'): string {
  const R = network.radius, reach = 110 * Math.PI / 180 * R, size = reach * 2 + 6, gap = 8;
  const views = [{ name: 'North hemisphere (lon 0 at bottom)', pole: [0, 1, 0] as V3, ox: size / 2, sign: 1 },
    { name: 'South hemisphere (lon 0 at bottom, seen from below)', pole: [0, -1, 0] as V3, ox: size * 1.5 + gap, sign: -1 }];
  const project = (view: typeof views[number], p: V3): V2 | null => {
    const d = angle(p, view.pole) * R;
    if (d > reach) return null;
    const lon = latLonOf(p)[1] * Math.PI / 180;
    return [view.ox + view.sign * d * Math.sin(lon), size / 2 + 4 + d * Math.cos(lon)];
  };
  const out: string[] = [];
  const poly = (view: typeof views[number], pts: V3[], attrs: string) => {
    const xy = pts.map(p => project(view, p));
    if (xy.some(q => !q)) return;
    out.push(`<polygon points="${xy.map(q => `${q![0].toFixed(2)},${q![1].toFixed(2)}`).join(' ')}" ${attrs}/>`);
  };
  const line = (view: typeof views[number], pts: V3[], attrs: string) => {
    const xy = pts.map(p => project(view, p));
    let run: V2[] = [];
    const flush = () => { if (run.length > 1) out.push(`<polyline points="${run.map(q => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(' ')}" fill="none" ${attrs}/>`); run = []; };
    for (const q of xy) { if (q) run.push(q); else flush(); }
    flush();
  };
  const circle = (view: typeof views[number], at: V3, r: number, attrs: string) => {
    const q = project(view, at); if (q) out.push(`<circle cx="${q[0].toFixed(2)}" cy="${q[1].toFixed(2)}" r="${r.toFixed(2)}" ${attrs}/>`);
  };
  const text = (view: typeof views[number], at: V3, s: string, attrs = '') => {
    const q = project(view, at); if (q) out.push(`<text x="${q[0].toFixed(2)}" y="${q[1].toFixed(2)}" ${attrs}>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
  };
  for (const view of views) {
    out.push(`<circle cx="${view.ox}" cy="${size / 2 + 4}" r="${reach}" fill="#7fb98f" stroke="#55705f" stroke-width=".15"/>`);
    // Latitude rings every 30°, equator emphasised.
    for (const lat of [-60, -30, 0, 30, 60]) {
      const pts: V3[] = []; for (let lon = 0; lon <= 360; lon += 5) { const a = lat * Math.PI / 180, b = lon * Math.PI / 180; pts.push([Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)]); }
      line(view, pts, `stroke="#ffffff" stroke-opacity="${lat === 0 ? .7 : .3}" stroke-width="${lat === 0 ? .18 : .1}"`);
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const a = -view.sign * 12 * Math.PI / 180, b = lon * Math.PI / 180;
      text(view, [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)], `${lon}°`, 'font-size="1.1" fill="#ffffff" fill-opacity=".85" text-anchor="middle"');
    }
    for (const area of overlay.areas ?? []) circle(view, area.at, area.radius, `fill="${area.kind === 'reserve' ? 'none' : '#5c9f63'}" stroke="#3c6e45" stroke-width=".12" stroke-dasharray=".4 .3"`);
    for (const plaza of network.plazas) {
      const pts: V3[] = [];
      if (plaza.centres.length === 1) for (let k = 0; k < 48; k++) pts.push(fromLocal(plaza.centres[0], [Math.cos(k / 48 * Math.PI * 2) * plaza.radius, Math.sin(k / 48 * Math.PI * 2) * plaza.radius], R));
      else for (const [c, o] of [[plaza.centres[0], plaza.centres[1]], [plaza.centres[1], plaza.centres[0]]] as [V3, V3][]) {
        const dir = v2.unit(toLocal(c, o, R));
        for (let k = 0; k <= 24; k++) {
          const th = Math.PI / 2 + k / 24 * Math.PI, c2 = Math.cos(th), s2 = Math.sin(th);
          pts.push(fromLocal(c, [(dir[0] * c2 - dir[1] * s2) * plaza.radius, (dir[0] * s2 + dir[1] * c2) * plaza.radius], R));
        }
      }
      poly(view, pts, `fill="${COLORS.plaza}" stroke="#8f8a78" stroke-width=".12"`);
    }
    for (const piece of network.pieces) {
      const half = roadHalfWidth(piece.class), left: V3[] = [], right: V3[] = [];
      for (const s of piece.samples) { left.push(fromLocalRight(s.p, s.r, -half, R)); right.push(fromLocalRight(s.p, s.r, half, R)); }
      poly(view, [...left, ...right.reverse()], `fill="${COLORS[piece.class]}" stroke="#3e4a4c" stroke-width=".06"`);
      if (piece.class !== 'door') line(view, piece.samples.map(s => s.p), 'stroke="#ffffff" stroke-opacity=".5" stroke-width=".06" stroke-dasharray=".5 .5"');
    }
    for (const j of network.junctions) poly(view, j.outline.map(q => fromLocal(j.center, q, R)), `fill="${COLORS[j.class]}" stroke="#3e4a4c" stroke-width=".06"`);
    for (const fp of overlay.footprints ?? []) {
      if (fp.canopy) poly(view, fp.canopy, `fill="none" stroke="#7a5a3a" stroke-width=".06" stroke-dasharray=".25 .2"`);
      poly(view, fp.outline, `fill="${fp.conflict ? '#e2786a' : fp.kind === 'site' ? '#d9c9a0' : '#e9e5d3'}" stroke="#5f4c3e" stroke-width=".1"`);
    }
    for (const s of overlay.setbacks ?? []) line(view, s.line, 'stroke="#c46a3a" stroke-width=".05" stroke-dasharray=".2 .15"');
    for (const e of overlay.entrances ?? []) { line(view, [e.from, e.to], 'stroke="#1f6f8b" stroke-width=".12"'); circle(view, e.from, .18, 'fill="#1f6f8b"'); }
    for (const r of overlay.reserves ?? []) circle(view, r.at, r.radius, `fill="none" stroke="${r.kind === 'ship' ? '#7a4fa0' : '#c03a8a'}" stroke-width=".12"`);
    for (const p of overlay.props ?? []) circle(view, p.at, p.kind === 'tree' ? .35 : .16, `fill="${p.kind === 'lamp' ? '#f2c14e' : p.kind === 'tree' ? '#2f6e4d' : p.kind === 'bench' ? '#a88e6c' : '#dc8571'}"`);
    for (const r of overlay.residents ?? []) { if (r.route) line(view, r.route, 'stroke="#283034" stroke-width=".06"'); circle(view, r.at, .22, 'fill="#283034" stroke="#ffffff" stroke-width=".05"'); }
    for (const c of overlay.conflicts ?? []) circle(view, c.at, .5, 'fill="none" stroke="#e01e1e" stroke-width=".18"');
    for (const l of overlay.labels ?? []) text(view, l.at, l.text, `font-size="${l.size ?? .8}" fill="#1d2629" text-anchor="middle"`);
    out.push(`<text x="${view.ox}" y="2.2" font-size="1.6" text-anchor="middle" fill="#283034">${view.name}</text>`);
  }
  const height = size + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size * 2 + gap} ${height}" width="${Math.round((size * 2 + gap) * 14)}" height="${Math.round(height * 14)}" font-family="system-ui, sans-serif">`
    + `<title>${title}</title><rect width="100%" height="100%" fill="#f4f1e6"/>${out.join('')}</svg>`;
}
