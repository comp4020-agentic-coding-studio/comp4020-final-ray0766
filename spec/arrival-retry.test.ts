import { expect, it } from 'vitest';
import { ARRIVAL_RETRY_DELAYS, arrivalRetryDelay } from '../src/client/arrival-retry.ts';

// A first visit the server cannot prepare (503) is retried three times, further
// apart each time, then the player is asked to reload: never an endless loop
// that keeps asking a struggling server to prepare another home.
it('retries a refused first visit three times, further apart, then stops', () => {
  expect([1, 2, 3].map(arrivalRetryDelay)).toEqual([...ARRIVAL_RETRY_DELAYS]);
  expect(ARRIVAL_RETRY_DELAYS[0]).toBeLessThan(ARRIVAL_RETRY_DELAYS[1]);
  expect(ARRIVAL_RETRY_DELAYS[1]).toBeLessThan(ARRIVAL_RETRY_DELAYS[2]);
  for (const failures of [4, 5, 100]) expect(arrivalRetryDelay(failures)).toBeNull();
});
