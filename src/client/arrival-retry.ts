// A first visit that the server cannot prepare yet (503: other worlds are being
// prepared, or preparation is paused) is retried a few times, further apart each
// time; then the player is asked to try again. Every other failure keeps the
// ordinary reconnect, which never gives up on saves.
export const ARRIVAL_RETRY_DELAYS = [3000, 6000, 12000] as const;

/** Milliseconds before the next automatic attempt after `failures` refused arrivals, or null to stop. */
export function arrivalRetryDelay(failures: number): number | null {
  return failures >= 1 && failures <= ARRIVAL_RETRY_DELAYS.length ? ARRIVAL_RETRY_DELAYS[failures - 1] : null;
}
