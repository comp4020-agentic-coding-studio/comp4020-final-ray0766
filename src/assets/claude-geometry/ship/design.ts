import { decodeDoc, encodeDoc, FORMAT } from '../core/doc.ts';
import type { Check, DocCodec, Result } from '../core/doc.ts';
import { newShipDesignId, UUID_PATTERN } from '../core/ids.ts';
import type { ShipDesignId } from '../core/ids.ts';
import { GLOW_CHOICES, PAINT_CHOICES } from '../style/tokens.ts';
import type { PaletteName } from '../style/tokens.ts';
import { CATEGORIES, PART_IDS } from './spec.ts';
import type { ShipParts } from './spec.ts';

// ShipDesign: the saved, exported and transmitted description of one ship.
// Format `planet-modules/ship-design`, version 1, canonical JSON (sorted keys,
// no unknown fields), so save → load → save is byte-identical.
//
// {
//   "format": "planet-modules/ship-design", "version": 1,
//   "id": "<uuid>", "name": "Courier",
//   "parts": { "hull", "cockpit", "wings", "engines", "tail", "dorsal" },
//   "paint": { "primary", "secondary", "trim" },   // PAINT_CHOICES
//   "glow": "cyan",                                 // GLOW_CHOICES
//   "registration": "LW-0742"                       // optional
// }

export type PaintName = typeof PAINT_CHOICES[number];
export type GlowName = typeof GLOW_CHOICES[number];
export interface ShipPaint { primary: PaintName; secondary: PaintName; trim: PaintName }

export interface ShipDesign {
  id: ShipDesignId;
  name: string;
  parts: ShipParts;
  paint: ShipPaint;
  glow: GlowName;
  /** Short hull marking, e.g. "LW-0742". Absent when the ship carries none. */
  registration?: string;
}

export const SHIP_DESIGN_VERSION = 1;
export const NAME_MAX = 40;
/** One to four letters or digits, optionally a hyphen and one to five more. */
export const REGISTRATION_PATTERN = /^[A-Z0-9]{1,4}(-[A-Z0-9]{1,5})?$/;
export const PAINT_ZONES = ['primary', 'secondary', 'trim'] as const;
export type PaintZone = typeof PAINT_ZONES[number];

// Control characters (including DEL and the C1 range) are not allowed in names.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** Problem with a design name, or null when it is acceptable. */
export function nameProblem(name: string): string | null {
  if (name.trim() !== name) return 'must not start or end with spaces';
  if (name.length < 1 || name.length > NAME_MAX) return `expected 1–${NAME_MAX} characters`;
  if (CONTROL.test(name)) return 'must not contain control characters';
  return null;
}

/** Normalise what a person typed into a registration code: trim and upper-case. Empty means none. */
export function normalizeRegistration(input: string): string | undefined {
  const v = input.trim().toUpperCase();
  return v === '' ? undefined : v;
}
export const registrationProblem = (code: string): string | null =>
  REGISTRATION_PATTERN.test(code) ? null : 'use 1–4 letters or digits, optionally a hyphen and 1–5 more (e.g. LW-0742)';

export const shipDesignCodec: DocCodec<ShipDesign> = {
  format: FORMAT.ship,
  current: SHIP_DESIGN_VERSION,
  read(raw: Record<string, unknown>, check: Check): ShipDesign {
    const o = check.obj(raw, '$', ['id', 'name', 'parts', 'paint', 'glow', 'registration'], ['id', 'name', 'parts', 'paint', 'glow']);
    const id = check.str(o.id, 'id', { min: 36, max: 36, pattern: UUID_PATTERN }) as ShipDesignId;
    const name = check.str(o.name, 'name', { min: 1, max: NAME_MAX });
    if (typeof o.name === 'string') { const p = nameProblem(o.name); if (p && o.name.length >= 1 && o.name.length <= NAME_MAX) check.problem('name', p); }
    const po = check.obj(o.parts, 'parts', CATEGORIES);
    const parts = {} as Record<string, string>;
    for (const c of CATEGORIES) parts[c] = check.oneOf(po[c], `parts.${c}`, PART_IDS[c] as readonly string[]);
    const pa = check.obj(o.paint, 'paint', PAINT_ZONES);
    const paint = {} as Record<PaintZone, PaintName>;
    for (const z of PAINT_ZONES) paint[z] = check.oneOf(pa[z], `paint.${z}`, PAINT_CHOICES);
    const glow = check.oneOf(o.glow, 'glow', GLOW_CHOICES);
    const design: ShipDesign = { id, name, parts: parts as unknown as ShipParts, paint, glow };
    if ('registration' in o) {
      const r = check.str(o.registration, 'registration', { min: 1, max: 10 });
      if (typeof o.registration === 'string' && registrationProblem(o.registration)) check.problem('registration', registrationProblem(o.registration)!);
      design.registration = r;
    }
    return design;
  },
  write(d: ShipDesign) {
    const out: Record<string, unknown> = {
      id: d.id, name: d.name,
      parts: { hull: d.parts.hull, cockpit: d.parts.cockpit, wings: d.parts.wings, engines: d.parts.engines, tail: d.parts.tail, dorsal: d.parts.dorsal },
      paint: { primary: d.paint.primary, secondary: d.paint.secondary, trim: d.paint.trim },
      glow: d.glow,
    };
    if (d.registration !== undefined) out.registration = d.registration;
    return out;
  },
};

/** Canonical text of a design (compact for storage, pretty for people). */
export const encodeShipDesign = (design: ShipDesign, pretty = false): string => encodeDoc(shipDesignCodec, design, pretty);
/** Parse and validate a design from text or an object; every problem is reported with its path. */
export const decodeShipDesign = (input: unknown): Result<ShipDesign> => decodeDoc(shipDesignCodec, input);

/** Validate a design value already in memory (same rules as decoding). */
export function validateShipDesign(design: ShipDesign): Result<ShipDesign> {
  try { return decodeShipDesign(encodeShipDesign(design)); } catch (e) { return { ok: false, errors: [e instanceof Error ? e.message : String(e)] }; }
}

export const cloneDesign = (d: ShipDesign): ShipDesign => ({ ...d, parts: { ...d.parts }, paint: { ...d.paint } });

/** The three starters. Fixed ids so samples and tests are reproducible; the workshop copies them under fresh ids. */
export const STARTERS: readonly ShipDesign[] = [
  {
    id: '3f6b2c1e-8a4d-4e7b-9c21-5d0f7a9e1b01' as ShipDesignId, name: 'Courier',
    parts: { hull: 'slim-courier', cockpit: 'faceted-canopy', wings: 'swept', engines: 'twin-nacelle', tail: 'single-fin', dorsal: 'sensor-mast' },
    paint: { primary: 'bone', secondary: 'gunmetal', trim: 'amber' }, glow: 'cyan', registration: 'LW-0742',
  },
  {
    id: '3f6b2c1e-8a4d-4e7b-9c21-5d0f7a9e1b02' as ShipDesignId, name: 'Hauler',
    parts: { hull: 'boxy-hauler', cockpit: 'raised-bridge', wings: 'stub-pylon', engines: 'single-heavy', tail: 'twin-fin', dorsal: 'comms-dish' },
    paint: { primary: 'olive', secondary: 'gunmetal', trim: 'amber' }, glow: 'sodium', registration: 'HX-219',
  },
  {
    id: '3f6b2c1e-8a4d-4e7b-9c21-5d0f7a9e1b03' as ShipDesignId, name: 'Interceptor',
    parts: { hull: 'wedge-interceptor', cockpit: 'slit-visor', wings: 'delta', engines: 'pod-cluster', tail: 'v-tail', dorsal: 'none' },
    paint: { primary: 'graphite', secondary: 'gunmetal', trim: 'crimson' }, glow: 'signalRed', registration: 'IR-07',
  },
];

/** A starter copied under a new id, as the workshop's "start from" buttons do. */
export function fromStarter(index: number): ShipDesign {
  return { ...cloneDesign(STARTERS[index]), id: newShipDesignId() };
}

export type { PaletteName };
