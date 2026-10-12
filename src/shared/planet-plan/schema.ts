import type { RoadClass } from './params.ts';

/** Latitude, longitude in degrees, or a named node / fixed anchor ("$spawn"). */
export type PlanPoint = [number, number] | string;
export interface PlanText { name: string; nameZh: string }

export interface PlanDistrict extends PlanText { id: string; center: [number, number]; intent: string }
export interface PlanRoad extends PlanText {
  id: string; class: Exclude<RoadClass, 'door'>; district: string;
  /** Ordered points; named nodes may be shared with other roads (junctions). */
  path: PlanPoint[];
}
export interface PlanPlaza extends PlanText {
  id: string; district: string; kind: 'square' | 'quay' | 'court' | 'garden';
  /** One centre for a disc; two centres for a capsule. */
  at: PlanPoint | [PlanPoint, PlanPoint]; radius: number;
}
/** A building or site placed by road-relative frontage. */
export interface PlanLot {
  id: string; district: string; composition: string;
  /** Road or plaza the front faces. */
  road?: string; plaza?: string;
  /** Road: metres along the road centreline from its first point. Plaza: bearing in degrees around its centre. */
  at: number;
  side?: 'left' | 'right';
  /** Extra setback beyond the road class minimum. */
  setback?: number;
  /** Shift along the frontage (metres) after placement. */
  shift?: number;
  /** Mirror the composition across its local X axis. */
  mirror?: boolean;
  /** Variant pick; omitted = stable seeded choice. */
  variant?: number;
  /** Skip the generated door path (the entrance meets a plaza or road directly). */
  noDoorPath?: boolean;
}
/** A run of frontage along one side of a road, filled in order with designed compositions. */
export interface PlanFrontage {
  id: string; district: string; road: string; side: 'left' | 'right';
  /** Metres along the road centreline. */
  from: number; to: number;
  /** Compositions to choose from; picked with the plan seed, never repeating the previous pick. */
  compositions: string[];
  /** Extra clear gap between buildings beyond the minimum; extra setback. */
  gap?: number; setback?: number;
}
export interface PlanArea extends PlanText {
  id: string; district: string; kind: 'garden' | 'court' | 'green' | 'orchard' | 'reserve';
  at: PlanPoint; radius: number;
  /** Trees, flowers and benches scattered with the plan seed. */
  trees?: number; flowers?: number; benches?: number;
}
export interface PlanProp { id: string; kind: 'lamp' | 'tree' | 'bench' | 'flowers'; at: PlanPoint; facing?: number }
/** A resident stands beside a lot's door path, on/next to a road (optionally walking along it), or near another resident. */
export interface PlanResident {
  id: string; place: string;
  lot?: string; road?: string; at?: number; to?: number; side?: 'left' | 'right';
  near?: string; distance?: number;
}
export interface PlanLandmark { id: string; lot: string; name: string; nameZh: string }
export interface PlanetPlan {
  format: 'little-worlds-planet-plan'; version: 1; planet: 'hub'; seed: number;
  nodes: Record<string, [number, number]>;
  districts: PlanDistrict[]; roads: PlanRoad[]; plazas: PlanPlaza[];
  lots: PlanLot[]; frontages?: PlanFrontage[]; areas: PlanArea[]; props: PlanProp[]; residents: PlanResident[];
  landmarks: PlanLandmark[];
  /** Lamps along roads: road id → spacing override, or 0 for none. */
  streetLamps?: Record<string, number>;
}

const ids = (list: { id: string }[], what: string, errors: string[]) => {
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(item.id)) errors.push(`${what}: invalid id ${JSON.stringify(item.id)}`);
    if (seen.has(item.id)) errors.push(`${what}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
  return seen;
};
const latLon = (value: unknown) => Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n))
  && Math.abs(value[0]) <= 90;
export const FIXED_ANCHORS = ['$spawn', '$dock', '$mica', '$sol', '$ship'] as const;

/** Structural validation of a loaded plan. Geometry conflicts are reported by the generator. */
export function planErrors(plan: PlanetPlan, compositions: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  if (plan.format !== 'little-worlds-planet-plan' || plan.version !== 1) errors.push('Not a version 1 Little Worlds planet plan.');
  if (!Number.isSafeInteger(plan.seed)) errors.push('seed must be an integer');
  for (const [id, at] of Object.entries(plan.nodes ?? {})) if (!latLon(at)) errors.push(`node ${id}: needs [lat, lon]`);
  const point = (where: string, p: PlanPoint) => {
    if (typeof p === 'string') { if (!(p in plan.nodes) && !(FIXED_ANCHORS as readonly string[]).includes(p)) errors.push(`${where}: unknown point ${p}`); }
    else if (!latLon(p)) errors.push(`${where}: needs [lat, lon] or a node name`);
  };
  const districts = ids(plan.districts, 'district', errors);
  const roads = ids(plan.roads, 'road', errors), plazas = ids(plan.plazas, 'plaza', errors);
  ids(plan.lots, 'lot', errors); ids(plan.areas, 'area', errors); ids(plan.props, 'prop', errors); ids(plan.residents, 'resident', errors);
  const named = (where: string, item: PlanText) => { if (!item.name || !item.nameZh) errors.push(`${where}: needs English and Chinese names`); };
  for (const d of plan.districts) { named(`district ${d.id}`, d); if (!latLon(d.center)) errors.push(`district ${d.id}: center`); }
  for (const r of plan.roads) {
    named(`road ${r.id}`, r);
    if (!['main', 'branch', 'lane'].includes(r.class)) errors.push(`road ${r.id}: class must be main, branch or lane`);
    if (!districts.has(r.district)) errors.push(`road ${r.id}: unknown district ${r.district}`);
    if (!Array.isArray(r.path) || r.path.length < 2) errors.push(`road ${r.id}: needs at least two points`);
    else r.path.forEach((p, i) => point(`road ${r.id} point ${i}`, p));
  }
  for (const p of plan.plazas) {
    named(`plaza ${p.id}`, p);
    if (!districts.has(p.district)) errors.push(`plaza ${p.id}: unknown district`);
    const centres = Array.isArray(p.at) && p.at.length === 2 && (typeof p.at[0] === 'string' || Array.isArray(p.at[0])) ? p.at as [PlanPoint, PlanPoint] : [p.at as PlanPoint];
    centres.forEach((c, i) => point(`plaza ${p.id} centre ${i}`, c));
    if (!(p.radius > .5 && p.radius < 12)) errors.push(`plaza ${p.id}: radius out of range`);
  }
  for (const lot of plan.lots) {
    if (!districts.has(lot.district)) errors.push(`lot ${lot.id}: unknown district`);
    if (!compositions.has(lot.composition)) errors.push(`lot ${lot.id}: unknown composition ${lot.composition}`);
    if (!!lot.road === !!lot.plaza) errors.push(`lot ${lot.id}: front onto exactly one road or plaza`);
    if (lot.road && !roads.has(lot.road)) errors.push(`lot ${lot.id}: unknown road ${lot.road}`);
    if (lot.plaza && !plazas.has(lot.plaza)) errors.push(`lot ${lot.id}: unknown plaza ${lot.plaza}`);
    if (lot.road && lot.side !== 'left' && lot.side !== 'right') errors.push(`lot ${lot.id}: side must be left or right`);
    if (!Number.isFinite(lot.at)) errors.push(`lot ${lot.id}: at`);
  }
  ids([...plan.lots, ...(plan.frontages ?? [])], 'lot or frontage', errors);
  for (const f of plan.frontages ?? []) {
    if (!districts.has(f.district)) errors.push(`frontage ${f.id}: unknown district`);
    if (!roads.has(f.road)) errors.push(`frontage ${f.id}: unknown road ${f.road}`);
    if (f.side !== 'left' && f.side !== 'right') errors.push(`frontage ${f.id}: side must be left or right`);
    if (!(f.to > f.from)) errors.push(`frontage ${f.id}: to must exceed from`);
    if (!f.compositions?.length || f.compositions.some(c => !compositions.has(c))) errors.push(`frontage ${f.id}: unknown composition`);
  }
  for (const a of plan.areas) { named(`area ${a.id}`, a); point(`area ${a.id}`, a.at); if (!districts.has(a.district)) errors.push(`area ${a.id}: unknown district`); }
  for (const p of plan.props) { point(`prop ${p.id}`, p.at); if (!['lamp', 'tree', 'bench', 'flowers'].includes(p.kind)) errors.push(`prop ${p.id}: kind`); }
  for (const r of plan.residents) {
    if ([r.lot, r.road, r.near].filter(Boolean).length !== 1) errors.push(`resident ${r.id}: give exactly one of lot, road or near`);
    if (r.road && (!roads.has(r.road) || !Number.isFinite(r.at))) errors.push(`resident ${r.id}: road and at`);
    if (r.near && !plan.residents.some(o => o.id === r.near)) errors.push(`resident ${r.id}: unknown near ${r.near}`);
  }
  for (const l of plan.landmarks) if (!plan.lots.some(lot => lot.id === l.lot)) errors.push(`landmark ${l.id}: unknown lot ${l.lot}`);
  for (const [road, spacing] of Object.entries(plan.streetLamps ?? {})) if (!roads.has(road) || !(spacing >= 0)) errors.push(`streetLamps ${road}`);
  return errors;
}

/** Load from text: parse, check structure, and return the plan or the problems. */
export function loadPlan(text: string, compositions: ReadonlySet<string>): { ok: true; plan: PlanetPlan } | { ok: false; errors: string[] } {
  let plan: PlanetPlan;
  try { plan = JSON.parse(text) as PlanetPlan; } catch (error) { return { ok: false, errors: [`Not JSON: ${(error as Error).message}`] }; }
  const errors = planErrors(plan, compositions);
  return errors.length ? { ok: false, errors } : { ok: true, plan };
}
/** Canonical save text: stable key order, one item per line in long lists. */
export function savePlan(plan: PlanetPlan): string {
  const line = (value: unknown) => JSON.stringify(value);
  const list = (items: unknown[]) => items.length ? `[\n    ${items.map(line).join(',\n    ')}\n  ]` : '[]';
  const nodes = Object.entries(plan.nodes).map(([k, v]) => `    ${line(k)}: ${line(v)}`).join(',\n');
  return `{\n  "format": ${line(plan.format)},\n  "version": ${plan.version},\n  "planet": ${line(plan.planet)},\n  "seed": ${plan.seed},\n`
    + `  "nodes": {\n${nodes}\n  },\n`
    + `  "districts": ${list(plan.districts)},\n  "roads": ${list(plan.roads)},\n  "plazas": ${list(plan.plazas)},\n`
    + `  "lots": ${list(plan.lots)},\n  "frontages": ${list(plan.frontages ?? [])},\n  "areas": ${list(plan.areas)},\n  "props": ${list(plan.props)},\n`
    + `  "residents": ${list(plan.residents)},\n  "landmarks": ${list(plan.landmarks)},\n  "streetLamps": ${line(plan.streetLamps ?? {})}\n}\n`;
}
