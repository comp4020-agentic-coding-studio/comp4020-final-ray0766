# Physics milestone verification

Local branch: `final/workshop-v1`, following `3392d67`. Published `main` remains
`09233d9`. Testing used the installed Google Chrome on this Mac, headed desktop
1440×900 and touch-emulated phone 390×844. This is not a physical phone measurement.

## Checks performed

| Check | Result |
| --- | --- |
| `pnpm lint` | Passed after fixing two `prefer-const` findings |
| `pnpm typecheck` | Passed, including physics and browser fixtures |
| `APP_URL=http://127.0.0.1:8098 pnpm test` | 12 files, 37 tests passed |
| Focused physics after final speed constraint | 6 tests passed |
| Final physics + presence assertions | 2 files, 8 tests passed |
| `pnpm build` | Passed; main JS 867.83 kB / 236.95 kB gzip; existing chunk-size warning remains |
| `pnpm check:evidence` | Passed; existing Crit 8 reflection untouched |
| `/`, `/readme/`, `/healthz` | Local HTTP 200 |
| Forged outer movement `radius` | HTTP 400 |
| Movement body over 2 KiB | HTTP 413 |
| Vendored Claude SHA256 manifest | All 31 files match; no art files changed |
| Main repository tracked files | Clean at `09233d9`; pre-existing untracked duplicates preserved |

The 37-test run includes old quest/idempotency, persistence, flight, placement,
ownership, presence, poles/turning and course HTTP checks. Later focused runs
covered the changed physical-speed bound and the new public visitor-radius assertion;
the entire older browser suite was not repeated.

The six physics cases check open/closed doors, wall sliding, stairs up/down,
upper-floor idle support, a fall from an unguarded edge, rotated doorways at both
poles, camera ceiling clipping, removed support and overlapping-wall recovery,
server path replay, saved-height reopening, duplicate and stale sequences,
forged motion fields, elapsed-time and speed limits, server wall rejection,
read-only visitor ownership and server-derived visitor height.

## Data preservation

[Migration results](migration-result.json) compare a schema-5 backup against a
separate migrated copy, before starting the working database with schema 6.
All original fields/rows match: 111 players, 49 planets, 52 visits, 5 tombstones,
1 blueprint content row, 4 private library rows and 27 placed objects. SQLite
integrity is `ok`; foreign-key violations are empty. The working database and its
pre-migration backups remain ignored/private in `.data/`. Test runs add isolated
local users/fixtures and do not upload or alter the published database.

## Browser evidence

The initial journey verified real public-hub walking, launch, flight, landing and
claiming a planet ([initial-flight.json](initial-flight.json)). A subsequent final
workflow passed end to end ([browser-result.json](browser-result.json)):

- A 90-degree rotated cabin was entered and exited with keyboard/mouse controls.
- Continued walking was blocked by a solid wall.
- Eleven stair risers led to the upper landing; refresh retained its height.
- A phone context reopened the same height and used actual touch-stick input to
  descend and climb again, then refreshed successfully without horizontal overflow.
- The character flew back to the hub and returned to the test planet, landing on
  terrain without carrying an old upper-floor height into the landing.
- No page errors were observed. Test Chrome contexts/processes were closed.

Blueprint and placement fixtures were created with normal authenticated APIs;
there were no player teleports, clock changes or test-only movement endpoints.
Resumed runs reuse only the ignored test owner's cookie storage. Interior and
upper-floor frames were inspected visually to confirm actual rendered geometry.

| View | Screenshot |
| --- | --- |
| Inside the rotated open doorway | [Desktop interior](desktop-door-inside.png) |
| Standing at the upper landing | [Desktop upper floor](desktop-upper-floor.png) |
| Same saved floor in phone view | [Phone upper floor](phone-upper-floor.png) |
| Terrain after real return flight | [Return landing](return-landing.png) |

Early attempts are not represented as passes: the first walked directly into the
cabin's back wall; the next reached the phone stage but sent a duplicate touch-end;
later coarse eight-direction steering pressed against a stair rail, and one resumed
run tried to leave the stair sideways. The driver now routes around the cabin,
tracks touch lifetime, steers through real camera drags and descends before resuming.
[desktop-first-pass.json](desktop-first-pass.json) retains the earlier partial result.
The first pure physics tests also exposed an edge-support gap, corrected by matching
support probing to capsule radius plus one bounded substep.

## Limits and handoff

Collision proxies intentionally simplify decorative details, glass, sloped roofs
and stair undersides. Closed doors do not animate. There is no jump, crouch, dynamic
body solver or contact between players. Foundations taller than the step limit need
a suitable entry. Remote visitor height is server-derived but currently updates on
the existing presence cadence. Large scenes, public load and physical phone
performance were not measured in this milestone.

The independent Claude workspace has concurrent uncommitted art changes. They were
observed only through read-only status and were not copied or modified. The physics
branch remains pinned to its earlier verified asset contract.

Only the local `127.0.0.1:8098` preview is retained. The first physics milestone is
complete; no later phase, push, deployment or submission is included. Publication
requires separate approval plus a production backup and schema-6 rollout/rollback.
