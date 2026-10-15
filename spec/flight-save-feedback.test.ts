// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { SpaceFlight } from '../src/client/flight.ts';
import { SaveProgress } from '../src/client/save-progress.ts';
import { groundFlight } from '../src/shared/flight.ts';
import type { FlightState } from '../src/shared/flight.ts';
import type { PlayerState } from '../src/shared/world.ts';

it('the real flight checkpoint keeps later steering pending and clears a no-op return to acknowledged state', async () => {
  const progress = new SaveProgress(), initial: FlightState = { ...groundFlight(), mode: 'space', position: [0, 0, 50] };
  let finish!: (state: PlayerState) => void;
  const checkpoint = vi.fn(() => new Promise<PlayerState>(resolve => { finish = resolve; })), apply = vi.fn();
  // Exercise flush without constructing WebGL scenery, controls or animation timers.
  const flight: SpaceFlight = Object.create(SpaceFlight.prototype);
  Object.assign(flight, { pilot: { ...initial, speed: 1 }, ack: initial, saving: null,
    bridge: { online: () => true, progress, checkpoint, apply, failed: vi.fn() } });
  progress.dirty('flight'); const saving = flight.flush(); expect(progress.phase).toBe('saving');
  flight.pilot!.speed = 2; progress.dirty('flight');
  finish({ flight: { ...initial, speed: 1, sequence: 1 } } as PlayerState); await saving;
  expect(apply).toHaveBeenCalledOnce(); expect(progress.phase).toBe('pending');
  // A user can steer away and back before the next timer. No save is needed
  // when the current full snapshot already equals the acknowledged checkpoint.
  flight.pilot!.speed = 1; await flight.flush();
  expect(checkpoint).toHaveBeenCalledOnce(); expect(progress.phase).toBe('saved');
});
