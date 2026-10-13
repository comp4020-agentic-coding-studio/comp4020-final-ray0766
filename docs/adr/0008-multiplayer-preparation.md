# C9 Multiplayer Decision: Keep Other Players Responsive While the Initiator Waits

**Status:** Approved; implemented locally, not deployed.

## Context

Little Worlds uses Node 24, TypeScript, Three.js, and SQLite in one service. Players can see their neighbours outdoors, while building changes, entry to the owner's room, and access to private history remain owner-only. World state is polled every second; presence heartbeats run every 250 ms. There are no actual users yet. All measurements below come from test clients.

Home generation, station placement, and preparing a first target collision involve substantial computation. Running these steps synchronously on the server's main thread delayed unrelated requests. One player entering or travelling could therefore make another player's world feel unresponsive.

The C9 priority is to keep those unrelated requests responsive. The player starting a costly action may wait longer for that action to finish. Changing the transport to WebSockets would not remove this CPU blockage.

## Decision

Move heavy computation into one background worker with a serial, bounded queue. Merge requests for the same work key and return HTTP 503 when the queue is full. The main thread revalidates the computed snapshot and performs the write transaction, preserving ownership checks and database consistency.

Supporting changes reduce unnecessary work: warm the hub at startup, query blueprint hashes instead of decoding every blueprint, and read one object instead of reading the whole world after each insertion.

Use the precompiled JavaScript worker when its build hash matches (`df994aa`). Development warns and falls back to TypeScript when that build is missing or mismatched. Set `MALLOC_ARENA_MAX=2` to limit allocator overhead (`6bb6c42`).

Worker failures must not trigger heavy recomputation on the main thread (`d898047`). Return 503 with a five-second cooldown, doubling up to 60 seconds. First entry retries automatically after 3, 6, and 12 seconds, then asks for a manual refresh. Failed preparation for a new player leaves no database write. If a home succeeds but its station fails, keep the complete home and attempt station repair when its owner returns, at most three times per home during a server run.

## Alternatives Considered

- **Keep synchronous computation.** This uses less memory and avoids a worker queue, but retains the shared main-thread blockage.
- **Use caching and startup warming alone.** These help known work such as the hub. They cannot cover every newly generated home, so they remain supporting measures.
- **Pre-generate homes into the database.** This is a possible future alternative. It was not selected or implemented for C9.

## Costs

The worker adds memory, queue management, build validation, and failure handling. It shares the container's CPU allowance with the server, so it provides isolation from synchronous execution rather than unlimited capacity. Serial work also means later requests can wait behind earlier ones. A full queue produces an explicit retryable failure.

The initiating player can wait longer. In the half-CPU experiment, initiator B's completion times changed from 3.5 to 6.2 seconds for joining, from 6.7 to 3.4 seconds for first travel, and from 2.5/5.4 to 7.3/8.6 seconds for two joins. This decision prioritises other players' responsiveness over the initiating player's completion time; the author should confirm that this waiting experience is acceptable.

## Evidence and Verification Limits

In that experiment, player A's slowest browser request completion changed from 1,769 to 91 ms during a join, from 3,978 to 29 ms during first travel, and from 5,010 to 399 ms during two joins. These are browser request timings, not necessarily the moment another player sees the result.

Earlier two-browser movement tests recorded a 421 ms median across 30 samples, with 29 of 30 below one second. Door timings of 379–430 ms and light timings of 54–482 ms started after server confirmation. Those measurements use different boundaries and must not be combined into a single latency claim.

With effective presence maintained, a local 256 MB, one-CPU container handled two online test clients and 40 joins with anonymous resident memory at 161–182 MB between rounds, peaking at 187 MB without sustained growth. This is not a Fly guarantee. The latest local smoke test used the repaired Dockerfile's actual build/start path at 256 MB without swap. Worker hash validity, invariants, and nonblocking checks passed; four joins took 0.6–1 seconds at roughly 159 MB. That smaller run does not replace the earlier peak-load result.

See [the verification record](../evidence/crit9-realtime/verification.md), [local handoff](../integration/candidate-handoff.md), and [heavy-work tests](../../spec/heavy-work.test.ts). Existing related DOM failures and disabled camera tests remain outside this change; camera behaviour is unchanged. There has been no live Fly verification, and these tests establish no one-second SLA.

## When to Reconsider

Revisit this decision if representative deployment tests show growing memory, frequent queue rejection, unacceptable initiator waits, or unrelated requests becoming slow again. Deployment verification should preserve presence and record both request completion and cross-browser visibility. Any broader architecture change should follow that evidence.
