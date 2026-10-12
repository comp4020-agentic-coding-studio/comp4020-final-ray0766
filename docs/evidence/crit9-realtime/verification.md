# Real-time sync and server memory check, 13 October 2026

This is a local check of code `0db9ee2`. It did not touch the hosted app, which still runs Crit 8 release `09233d9`.

## Setup

**Server**
- A fresh `.backup` copy of the local 8098 database for each run.
- The Dockerfile's environment: `NODE_ENV=production` and `--max-old-space-size=150`.
- The 8098 server and its database were not touched.

**Browser**
- Real Chrome 154, headless, on an Apple M3.
- Two separate browser contexts, so no cookies are shared. Both are new identities.
- A is the owner: desktop 1920×1080, English.
- B is the visitor: phone 390×844, Chinese, touch.

**Input**
- Real controls throughout.
- Each walks from their own home to its gate and teleports to the harbour.
- B then boards at its own home and flies to A's home (50–66 s). B lands there.

**Timing**
- One Node process records both pages' requests and responses, so both sides share one clock.

**Runs**
- Three runs.
- Runs 1 and 2 stopped part-way because of errors in the check script. One was a heading read that only matched the English HUD; the other read an acknowledgement too early.
- Run 3 completed.

## Results

| Shared change | Measured from → to | Result |
| --- | --- | --- |
| Presence: the other person walks | W pressed on one page → the other page's presence reply shows the new position (30 trials) | median 421 ms; 29 of 30 under 1 s; the slowest was 1926 ms, during a server stall |
| Presence: a saved step | movement save acknowledged → the other page's next reply carries that position | per-run medians 45–129 ms; max 508 ms |
| Door closed / opened | server acknowledgement → visitor's universe poll shows it | 430 ms / 379 ms |
| Lamp placed | server acknowledgement → visitor's poll / visitor's object count | 482 ms / 497 ms |
| Lamp moved | server acknowledgement → visitor's poll | 229 ms |
| Lamp removed | server acknowledgement → visitor's poll / visitor's object count | 54 ms / 59 ms |

Timing notes:
- A door command first flushes the walker's pending steps, so the acknowledgement came 1.1–1.3 s after the click.
- One removal took 2.2 s from click to acknowledgement. Its cause was not established.

**Visitor permissions**

B used its own cookie on A's planet. These calls were refused:

| Call | Status | Message |
| --- | --- | --- |
| place an object | 403 | "Only this planet’s owner can build here." |
| remove A's lamp | 403 | "Only this planet’s owner can build here." |
| enter A's room | 403 | "Only the home owner can enter the room." |
| read A's history | 403 | "Only the planet owner can read its history." |

- The lamp's version stayed 1 after these calls.
- B's build, claim and enter controls were hidden.

What this run did not show:
- **Using A's gate** returned 409 "Walk up to a teleport station first." B was not standing at the gate, so this run did not reach the ownership check. That check is covered by `spec/teleport-station.test.ts`.
- **Hiding the owner from outdoor visitors while indoors** was not measured: the script missed the enter acknowledgement.

## Server stalls

A request-timing preload logged slow requests and event-loop delay.

| Request | Event loop blocked |
| --- | --- |
| `GET /api/state` for a new identity, at open | 5.6 s and 2.4 s |
| `GET /api/state` for four identities arriving together | 8.7–13.9 s each; they queue, so the last one waited 41 s |
| `POST /api/teleport`, first arrival at the harbour | 26.3 s |
| `GET /api/universe` | usually 175–226 ms; up to 1.26 s |

While any of these run, no presence or save reply goes out to anyone.

A CPU profile of one phone session (new identity, room, teleport there and back) gives the split:

- **Creating the player took 4.3 s:**
  - home generation, 2.3 s;
  - teleport-station siting, 2.0 s.
- **The teleport took 4.0 s**, almost all of it building the destination's ground world. Terrain grading took 3.6 s of that.
- **The largest single cost** is terrain noise in the vendored `terrain/dual.ts`: 4.3 s of self time.

Two 409 replies appeared around stalls, and later steps were unaffected:
- `/api/presence` on A's page;
- `/api/flight/checkpoint` on B's page.

## Memory

| Where | Idle after start | Peak | Heap used, peak | V8 heap limit |
| --- | --- | --- | --- | --- |
| macOS, Node 24.19, M3 16 GB; two browsers plus four identities arriving together; three runs | RSS 147–151 MB | RSS 238–294 MB | 63–92 MB | 342 MB |
| Linux container, `--memory=256m`, no swap, `--cpus=1` | RSS 133 MB, cgroup 84 MB | RSS 161 MB, cgroup 118 MB | 40 MB | 153 MB |

**About the container run**
- It used the Crit 8 runtime image, built from this Dockerfile on `node:24-slim` with Node 24.21. Today's `dist` and server sources were mounted in. Dependencies are unchanged since `09233d9`.
- Its workload was fixed and ran through the API:
  - 15 s idle;
  - two identities arriving and polling for 20 s;
  - four identities arriving together;
  - 20 s idle.
- The container was not OOM-killed.
- With one CPU, creating an identity took 2.1–9.5 s. The longest event-loop stall was 8.5 s.
- On macOS, the heap total rose to about 196 MB because V8 sizes its young generation from the host's memory. Under the 256 MB limit, V8 set a 153 MB heap limit and the heap total stayed under 46 MB.

## Limits

- Nothing was measured on Fly. Its VM kernel overhead and shared-CPU throttling are not reproduced here.
- The container ran no browser.
- The container workload's presence requests were rejected (409) because the script left out the visit scope, so presence load is absent from the container figures.
- These are small-concurrency figures, not a capacity claim.

## After moving heavy work off the request thread (`50d8741`)

### What changed

- New homes, their station search and other planets' ground are prepared on one worker thread.
- The server re-checks the saved planet and writes everything itself.
- The harbour's ground is built at startup.

### Scenario

The same scenario ran before and after the change, with real controls:
- A walks the whole time at their home.
- B opens the app (a new home), teleports to the harbour, then teleports home.
- Two more identities then arrive together.

How it was measured:
- Every A request is timed from the browser sending it to its response.
- B's waits are timed from B's own action.

Setup:
- A Linux container with `--memory=256m`, no swap and half a CPU (`--cpus=0.5`).
- A fresh copy of the live database for each run.

| Event | A's slowest request, before | after | B's wait, before | after |
| --- | --- | --- | --- | --- |
| A walking alone | 30 ms | 29 ms | — | — |
| B joins (new home) | 1769 ms | 71 ms | 3.5 s | 5.9 s |
| B's first teleport to the harbour | 3978 ms | 22 ms | 6.7 s | 2.7 s |
| B teleports home | 17 ms | 15 ms | 0.8 s | 0.8 s |
| Two identities join together | 5010 ms | 268 ms | 2.5 / 5.4 s | 7.7 / 8.7 s |

The person who starts the heavy work now waits longer when the worker has to start first. Everyone else is no longer held.

### Main-thread stall per new player

Setup: in-process on an Apple M3, measured with a 10 ms ticker on the server's thread, live database copy.

| Path | Longest stall |
| --- | --- |
| Inline creation (before) | 530–1092 ms |
| Worker | 12–19 ms |

A run with only a single arrival at half a CPU left at most about 0.4 s of main-thread work. That work is:
- writing the home's objects and history;
- rebuilding the new home's ground after its station is placed.

### Memory, 256 MB container

Setup:
- One CPU.
- The fixed API workload, now with accepted presence requests (75 of 75 returned 200 per visitor).

| Phase | Before, RSS / cgroup peak | After, RSS / cgroup peak |
| --- | --- | --- |
| Idle after start | 131 / 84 MB | 143 / 96 MB |
| Two visitors arrive and poll | 155 / 112 MB | 256 / 215 MB |
| Four identities arrive together | 167 / 125 MB | 248 / 208 MB |
| 20 s idle | 167 / 126 MB | 222 / 181 MB; 140 MB cgroup at the end, after the worker stopped |

**Why "after" is higher.** The worker is a second V8 isolate with its own heap and its own copy of the modules.
- Loading TypeScript in a worker costs about 21 MB of RSS on its own: an empty `.ts` module adds 34 MB, an empty `.mjs` adds 13 MB.
- The harbour ground built at startup accounts for about 12 MB of the idle difference. Before the change, it would have been built at the first harbour visit.

**Bundled worker (experiment, not committed).** A copy with the worker bundled to plain JavaScript peaked at 177 MB cgroup with two visitors and 198 MB with four.

**The worker heap cap is not a safety net.** A worker that runs out of its heap can stop the whole process.
- 4 MB and 8 MB caps ended only the worker.
- 1 MB, 2 MB and 16 MB caps ended the process with a fatal out-of-memory error.
- The jobs measured here used at most about 35 MB of worker heap; the cap is 48 MB.

No run was out-of-memory killed. That shows only that this limited load fits in 256 MB on this machine. It does not show that it fits on Fly, whose VM kernel also uses that memory.

### Specs

- `spec/heavy-work.test.ts` checks four things:
  - prepared and inline arrivals produce identical objects, history and station;
  - a broken worker still yields the same home and station;
  - jobs are shared and the queue is bounded;
  - `/healthz` stays under 250 ms while a new player arrives.
- Each assertion was seen failing with its fault injected:
  - a wrong seed in the worker;
  - each fallback removed;
  - the pre-change server, where `/healthz` waited 1216 ms.
- 48 related spec files: 274 tests pass. The 8 failures are the same ones that fail on `82c6455`.
