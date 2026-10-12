import { Worker } from 'node:worker_threads';
import type { GroundFit } from '../assets/claude-geometry/core/ground.ts';
import { importFits } from '../shared/ground-fit-cache.ts';
import { fieldOf } from '../shared/terrain.ts';
import { RequestError } from './errors.ts';

export type HeavyKind = 'home' | 'station' | 'world';
export interface HeavyJob { id: number; kind: HeavyKind; input: unknown }
export interface PreparedFits { environment: string | null; radius: number; entries: [string, GroundFit][] }
export type HeavyReply = { id: number; value: unknown; fits: PreparedFits[] } | { id: number; error: string };

/** Shown to the player whose request needs heavy work while the queue is full. */
export const BUSY = 'Other worlds are being prepared. Try again in a moment.';
/** Shown while preparation is paused after the worker failed. */
export const PAUSED = 'Worlds cannot be prepared just now. Try again shortly.';

/** Terrain, collision and siting work for one player that would otherwise
 * hold every other player's request. One worker thread runs the jobs in arrival
 * order; a second request for the same key shares the first one's result.
 * The worker stops when idle, so it only holds memory while it is needed.
 *
 * Nothing falls back to this thread: that would hold everyone again. If the
 * worker fails, its jobs and every new one get a 503 for a cooling-off period
 * that doubles with each failure in a row (5 s up to a minute), so a broken
 * worker is not restarted on every retry. A job's own error (a generator
 * refusing its inputs) is not a worker failure and is reported as it is. */
export class HeavyWork {
  private worker: Worker | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private serial = 1;
  // Jobs this worker has finished. Each new home leaves its own terrain caches behind, so the
  // worker is replaced after a few jobs instead of growing towards its heap limit.
  private finished = 0;
  // Workers this class stopped on purpose; their exit is not a failure.
  private readonly stopping = new WeakSet<Worker>();
  private failures = 0;
  private pausedUntil = 0;
  private readonly waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly keys = new Map<string, Promise<unknown>>();

  private readonly options: { limit?: number; idleMs?: number; heapMb?: number; script?: URL; pauseMs?: number };
  constructor(options: { limit?: number; idleMs?: number; heapMb?: number; script?: URL; pauseMs?: number } = {}) { this.options = options; }

  /** Workers started so far: retries during a pause must not start another. */
  get starts() { return this.started; }
  private started = 0;

  /** Jobs queued or running; each holds one player's request open. */
  get pending() { return this.keys.size; }

  run<T>(kind: HeavyKind, key: string, input: unknown): Promise<T> {
    const shared = this.keys.get(key);
    if (shared) return shared as Promise<T>;
    if (Date.now() < this.pausedUntil) return Promise.reject(new RequestError(503, PAUSED));
    if (this.keys.size >= (this.options.limit ?? 24)) return Promise.reject(new RequestError(503, BUSY));
    const job = this.post(kind, input).finally(() => { this.keys.delete(key); this.sleepWhenIdle(); });
    this.keys.set(key, job);
    return job as Promise<T>;
  }

  close() {
    if (this.idle) clearTimeout(this.idle);
    const worker = this.worker; this.worker = null;
    if (!worker) return Promise.resolve();
    this.stopping.add(worker);
    return worker.terminate();
  }

  private post(kind: HeavyKind, input: unknown) {
    const worker = this.start(), id = this.serial++;
    return new Promise<unknown>((resolve, reject) => { this.waiting.set(id, { resolve, reject }); worker.ref(); const job: HeavyJob = { id, kind, input }; worker.postMessage(job); });
  }

  private start() {
    if (this.idle) { clearTimeout(this.idle); this.idle = null; }
    if (this.worker) return this.worker;
    this.finished = 0; this.started++;
    // The machine has 256 MB in all: the worker's heap is capped well below the main thread's.
    const heapMb = this.options.heapMb ?? 48;
    const worker = new Worker(this.options.script ?? new URL('./heavy-worker.ts', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: heapMb, maxYoungGenerationSizeMb: 8 } });
    worker.on('message', (reply: HeavyReply) => {
      const job = this.waiting.get(reply.id); if (!job) return;
      this.waiting.delete(reply.id);
      // Only a job in progress keeps the process alive; an idle worker never does.
      if (!this.waiting.size) worker.unref();
      this.finished++; this.failures = 0;
      if ('error' in reply) { job.reject(new Error(reply.error)); return; }
      // The worker built these for the same environment and radius; the server's own field reuses them.
      for (const prepared of reply.fits) importFits(fieldOf(prepared.environment, prepared.radius), prepared.entries);
      job.resolve(reply.value);
    });
    let failed = false;
    const fail = (error: Error) => {
      if (this.worker === worker) this.worker = null;
      if (this.stopping.has(worker) || failed) return;
      failed = true; this.failures++;
      this.pausedUntil = Date.now() + Math.min(60_000, (this.options.pauseMs ?? 5_000) * 2 ** (this.failures - 1));
      console.error('The preparation worker failed; pausing preparation:', error.message);
      for (const job of this.waiting.values()) job.reject(new RequestError(503, PAUSED));
      this.waiting.clear();
    };
    worker.on('error', fail);
    worker.on('exit', code => fail(new Error(`it stopped with code ${code}`)));
    worker.unref();
    this.worker = worker;
    return worker;
  }

  private sleepWhenIdle() {
    if (this.keys.size) return;
    if (this.finished >= 8) { this.finished = 0; void this.close(); return; }
    if (this.idle) return;
    this.idle = setTimeout(() => { this.idle = null; if (!this.keys.size) void this.close(); }, this.options.idleMs ?? 5_000);
    this.idle.unref();
  }
}
