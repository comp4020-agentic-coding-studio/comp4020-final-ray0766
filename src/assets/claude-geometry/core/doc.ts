import { isFiniteVec3, isUnitVec3, quantize } from './vec.ts';
import type { Vec3 } from './vec.ts';

// Versioned JSON documents. Every file a module saves, exports or sends carries
// `format` and `version` at the top level. Readers refuse newer versions
// (the main project refuses newer SQLite schemas the same way) and upgrade older
// ones step by step. Output is canonical: sorted keys and numbers rounded to six
// decimals, so save → load → save is byte-identical.

export const FORMAT = {
  blueprint: 'planet-modules/blueprint',
  blueprintLibrary: 'planet-modules/blueprint-library',
  ship: 'planet-modules/ship-design',
  environment: 'planet-modules/planet-environment',
  worldEvent: 'planet-modules/world-event',
  worldSnapshot: 'planet-modules/world-snapshot',
} as const;
export type FormatName = typeof FORMAT[keyof typeof FORMAT];

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(...errors: string[]): Result<T> => ({ ok: false, errors });

export const NUMBER_DECIMALS = 6;

/** Deep copy with sorted object keys and quantised numbers. Throws on values JSON cannot round-trip. */
export function canonicalize(value: unknown, decimals = NUMBER_DECIMALS, path = '$'): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path}: non-finite number cannot be saved`);
    return Number.isInteger(value) ? (Object.is(value, -0) ? 0 : value) : quantize(value, decimals);
  }
  if (Array.isArray(value)) return value.map((v, i) => {
    if (v === undefined) throw new TypeError(`${path}[${i}]: undefined cannot be saved`);
    return canonicalize(v, decimals, `${path}[${i}]`);
  });
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = canonicalize(v, decimals, `${path}.${key}`);
    }
    return out;
  }
  throw new TypeError(`${path}: ${typeof value} cannot be saved`);
}

export function canonicalJson(value: unknown, options: { pretty?: boolean; decimals?: number } = {}): string {
  return JSON.stringify(canonicalize(value, options.decimals ?? NUMBER_DECIMALS), null, options.pretty ? 2 : undefined);
}

/** SHA-256 of the compact canonical JSON, as lower-case hex. Works in Node 24 and secure browser contexts. */
export async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Collects every validation problem with a JSON path instead of stopping at the first. */
export class Check {
  errors: string[] = [];
  problem(path: string, message: string) { this.errors.push(`${path}: ${message}`); }

  /** A plain object with no unexpected keys; missing required keys are reported. */
  obj(v: unknown, path: string, allowed: readonly string[], required: readonly string[] = allowed): Record<string, unknown> {
    if (!v || typeof v !== 'object' || Array.isArray(v)) { this.problem(path, 'expected an object'); return {}; }
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) if (!allowed.includes(k)) this.problem(`${path}.${k}`, 'unexpected field');
    for (const k of required) if (!(k in o)) this.problem(`${path}.${k}`, 'missing');
    return o;
  }
  str(v: unknown, path: string, opts: { min?: number; max?: number; pattern?: RegExp } = {}): string {
    const { min = 0, max = 200, pattern } = opts;
    if (typeof v !== 'string') { this.problem(path, 'expected text'); return ''; }
    if (v.length < min || v.length > max) this.problem(path, `expected ${min}–${max} characters`);
    if (pattern && !pattern.test(v)) this.problem(path, 'has an invalid format');
    return v;
  }
  num(v: unknown, path: string, opts: { min?: number; max?: number; int?: boolean } = {}): number {
    const { min = -Infinity, max = Infinity, int = false } = opts;
    if (typeof v !== 'number' || !Number.isFinite(v)) { this.problem(path, 'expected a finite number'); return min > -Infinity ? min : 0; }
    if (int && !Number.isSafeInteger(v)) this.problem(path, 'expected a whole number');
    if (v < min || v > max) this.problem(path, `expected a value from ${min} to ${max}`);
    return v;
  }
  bool(v: unknown, path: string): boolean {
    if (typeof v !== 'boolean') { this.problem(path, 'expected true or false'); return false; }
    return v;
  }
  oneOf<T extends string>(v: unknown, path: string, options: readonly T[]): T {
    if (typeof v !== 'string' || !options.includes(v as T)) { this.problem(path, `expected one of ${options.join(', ')}`); return options[0]; }
    return v as T;
  }
  arr(v: unknown, path: string, opts: { max?: number } = {}): unknown[] {
    if (!Array.isArray(v)) { this.problem(path, 'expected a list'); return []; }
    if (opts.max !== undefined && v.length > opts.max) { this.problem(path, `expected at most ${opts.max} items`); return v.slice(0, opts.max); }
    return v;
  }
  vec3(v: unknown, path: string): Vec3 {
    if (!isFiniteVec3(v)) { this.problem(path, 'expected three finite numbers'); return [0, 0, 0]; }
    return [v[0], v[1], v[2]];
  }
  unitVec3(v: unknown, path: string): Vec3 {
    if (!isUnitVec3(v)) { this.problem(path, 'expected a unit direction'); return [0, 1, 0]; }
    return [v[0], v[1], v[2]];
  }
  result<T>(value: T): Result<T> { return this.errors.length ? { ok: false, errors: this.errors } : { ok: true, value }; }
}

/**
 * How one document type is read and written. `read` validates the current
 * version; `upgrades[n]` turns a version-n payload into version n+1.
 */
export interface DocCodec<T> {
  format: FormatName;
  current: number;
  upgrades?: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>;
  read(raw: Record<string, unknown>, check: Check): T;
  write(value: T): Record<string, unknown>;
}

export function decodeDoc<T>(codec: DocCodec<T>, input: unknown): Result<T> {
  let raw = input;
  if (typeof input === 'string') {
    try { raw = JSON.parse(input); } catch { return fail('This file is not valid JSON.'); }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Expected a JSON object.');
  let doc = { ...(raw as Record<string, unknown>) };
  if (doc.format !== codec.format) return fail(`Expected a ${codec.format} document, found ${JSON.stringify(doc.format ?? null)}.`);
  const version = doc.version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return fail('The document version is missing or invalid.');
  if (version > codec.current) return fail(`This document was made by a newer version (v${version}); this build reads up to v${codec.current}.`);
  for (let v = version; v < codec.current; v++) {
    const step = codec.upgrades?.[v];
    if (!step) return fail(`No upgrade from v${v} to v${v + 1}.`);
    doc = { ...step(doc), format: codec.format, version: v + 1 };
  }
  const { format: _f, version: _v, ...payload } = doc;
  const check = new Check();
  const value = codec.read(payload, check);
  return check.result(value);
}

export function encodeDoc<T>(codec: DocCodec<T>, value: T, pretty = false): string {
  return canonicalJson({ ...codec.write(value), format: codec.format, version: codec.current }, { pretty });
}

/** The canonical value a document decodes to after one save/load cycle. */
export function roundTrip<T>(codec: DocCodec<T>, value: T): Result<T> {
  return decodeDoc(codec, encodeDoc(codec, value));
}
