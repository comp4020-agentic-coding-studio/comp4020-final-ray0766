# Round 6 local verification — city and shared player assets

## Candidate and scope

Workspace: `/Users/ray/Desktop/Study/ANU-Master/8020/comp4020-final-ray0766`.
Branch: `prototype/small-world-c8`. Baseline: `4855c4b`.
Implementation/evidence commit: `103a7ff` (local only).
Final application bundle: `index-BfIgytnH.js`, built 2026-10-05.
All testing is local; nothing was pushed, deployed, published or submitted.

The public harbour now has an arrival street, structural facade detail, shared
service cabins, a physical boarding apron, original layered skyline and dusk
lighting. Public surface presentation uses a reversible 800-unit display sphere;
existing unit-normal saves, private terrain and server validation remain intact.
Ground camera drag-look and facade clearance were exercised. The short departure
shot uses the actual city and parked ship, then changes to orbital display scale.
It is not continuous city-to-orbit physics or an enterable city interior system.

The shared asset layer exports 17 types and three geometry tiers, with metre units,
axes, connection hints, lifecycle and provenance documented in
[the handoff](../../integration/shared-assets.md). Current playable placement retains
six saved kinds. Cabin/deck/light use the public asset factories. Component snapping,
wall/stair/level editing, undo and blueprint saving remain Claude's assignment.
No competing editor or new blueprint storage was added.

## Executed checks

| Check | Observed result | Evidence |
| --- | --- | --- |
| Lint | exit 0 | `lint-replay.log` |
| TypeScript + logic/HTTP/course | exit 0; 25 tests in 10 files | `logic-replay.log` |
| Production build | exit 0 | `build-replay.log` |
| Course evidence and whitespace | exit 0; seven local commit links resolve | `pnpm check:evidence`, `git diff --check` |
| Full installed Chrome regression, headless, one worker | 19 passed / 2 failed, exit 1, 10.3 min | `browser-final.log`, `run-results.json` |
| Final headed Chrome focused replay | 7 passed, exit 0, 6.0 min | `headed-replay.log`, `replay-results.json` |

The complete run passed ownership, touch placement, lost identity recovery, stale
edits, real flight and refresh, offline flight, physical ports, return beacons,
north-pole walking, reduced motion/resize, finite regions, shared player assets,
views and four independent visitor sessions. Both failed cases were the delivery
journey: the distance label said “You’re here” slightly before the interaction
button became available. The application label now uses the same nearby-NPC
condition as the action. The original journey assertions were retained.

The final headed replay covers both delivery journeys, offline/resize/reduced
motion, pole/reversal/click walking, both harbour journeys and shared-assets
placement/refresh/visitor authorization. All 21 scenarios now have passing evidence across these runs. This is distinct
from an all-green complete-suite run; the original two failures remain in the
record. The full run used `index-CNNDJeBc.js`; the final focused run used
`index-BfIgytnH.js`, whose only subsequent application change was the arrival-label
condition. Final lint, typecheck, 25 tests and build all passed after that fix.

The bundle is **701.24 kB / 187.29 kB gzip**, CSS **41.25 kB / 10.27 kB gzip**.
Vite's existing 650 kB chunk advisory remains visible. No threshold was raised.
Server code, schema, dependencies and deployment configuration were not changed.

## Actual browser and visual evidence

Installed Mac Chrome 154, ANGLE Metal on Apple M3. Desktop is 1600×1000; phone
layout is 390×844 with touch input, running on this Mac, not a physical handset.
Headed final-build samples after returning to the port and dragging the camera:

| View | Mean FPS, 3-second sample | Frame median / p95 | Draw calls / triangles |
| --- | --- | --- | --- |
| Desktop | 53.6 | 20.5 / 27.7 ms | 165 / 301,962 |
| Phone viewport | 57.7 | 14.2 / 27.8 ms | 172 / 291,318 |

Both samples recorded no page/console errors and no horizontal overflow. Camera
angles differ, so their draw-call counts are not a controlled hardware comparison.
These are short local samples, not minimum-FPS guarantees or mobile benchmarks.
The separate headless four-context sample was about 60 FPS, with three visible
visitors, 349 draw calls and 354,186 triangles; its capped timing is not a headed
GPU performance claim. It verifies meeting, expiry, reconnection, planet isolation
and permission checks on one computer, not public multiplayer capacity.

- [Desktop street](desktop-street.png), [phone street](phone-street.png).
- [Desktop gate](desktop-gate.png), [phone gate](phone-gate.png).
- [Desktop departure](desktop-departure.png), [phone departure](phone-departure.png).
- [Desktop return](desktop-returned.png), [phone return](phone-returned.png).
- [Player shared kit](player-shared-kit.png), [visitor shared kit](visitor-shared-kit.png).
- [Four visitors](four-visitors.png), [owner and visitor](owner-and-visitor.png).
- [Desktop delivery](desktop-completed.png), [phone delivery](mobile-completed.png).
- `desktop-render.json`, `phone-render.json`, `four-client-sample.json` retain raw samples.

`before-*` images show the prior build. `after-*` and `first-render.json` are early
iteration captures, not the final candidate. Original failures and partial runs
remain separate; no failed image was edited to present a passing result.

## Save and source protection

Before restarting the retained 8080 preview, a consistent private SQLite backup
was written to `.data/round6-before-20261005T153100Z.sqlite` (ignored by Git).
[Save preservation](save-preservation.json) compares complete sorted rows after
startup: all 99 players, 42 planets, 24 objects, 50 visits and five tombstones are
identical; schema remains 4, SQLite quick_check is ok. This is a startup comparison,
not a claim that later user interactions cannot change rows.

The regression database is separate: `/tmp/little-worlds-round6-clean.sqlite`,
served only on loopback port 8095. It does not replace the retained preview save.
To restore the private backup, stop the local server, retain a copy of the current
`.data/little-post.sqlite` and any WAL/SHM files, then restore using SQLite's backup
API into the closed live database. Do not overwrite a running SQLite database.

The 13 imported pure geometry dependencies match the committed source and manifest
SHA-256 values. The source workspace's uncommitted editor/server files and processes
were not modified. The exact provenance and measured 14-part/three-tier geometry
catalogue are in `docs/integration/`. No commercial reference image is bundled.

## Failures investigated

- A first runner was interrupted by exec-server transport loss. Its partial log is
  `browser-interrupted.log`; it is not a complete-suite result.
- A test flight driver stalled against a planet because its detour threshold and
  steering dead zone disagreed. `flight-driver-before-fix.md` records the blockage.
  Driver logic was aligned; real controls and server flight checks remain.
- Exact pause/reload comparison exposed a final small movement omitted by the
  save threshold/in-flight request. Forced saves now wait and resample the position.
  `checkpoint-before-fix.log` is retained; both harbour refresh checks pass.
- The old minimum logical velocity froze walking at the expanded south pole.
  The threshold now scales with local movement; `south-pole-before-fix.log` and
  the projection tests record the failure and correction.
- The early arrival label caused the two complete-run delivery failures.
  `desktop-keyboard-arrival-before-fix.md` and
  `phone-touch-arrival-before-fix.md` retain the original failure contexts.

## Reproduce and remaining limits

Use Node 24 and pnpm 11 in the workspace:

```sh
pnpm install
pnpm build
pnpm start
```

Open http://localhost:8080, `/readme/` or `/credits/`.
With a separate disposable test database and server running, set `APP_URL` to its
loopback address before `pnpm test:browser --trace=off`. For the headed replay:

```sh
pnpm test:browser tests/e2e/journey.spec.ts tests/e2e/harbour.spec.ts tests/e2e/shared-assets.spec.ts --headed --trace=off
```

Physical phones, public-network latency/load, hosted persistence and this round's
Docker execution were not tested. Previous container evidence remains in round 5
and is not presented as a new run. The art is a procedural industrial prototype,
not AAA photorealism. Arbitrary city interiors and component-level building are
not available. Cross-device identity/recovery, remote ships and C10 logs remain
outside this round. The student's reflection remains for the student to author.
Push, remote visibility, Fly costs/deployment and formal submission still require
specific approval.
