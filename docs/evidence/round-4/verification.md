# Round four — continuous flight and workspace relocation

Date: 2026-10-05. Branch: `prototype/small-world-c8`.
Starting commit: `a76575a`. No push, hosting change or submission.
Active workspace: `/Users/ray/Desktop/Study/ANU-Master/8020/comp4020-final-ray0766`.

## Relocation and preservation

The user explicitly authorised moving the whole repository to the course folder.
The destination did not exist. The old service was stopped and SQLite was
checkpointed and backed up with VACUUM INTO before the directory move. The whole
directory was renamed, retaining its inode and moving Git, dependencies, ignored
local saves and uncommitted flight work. The old workspace path no longer exists.

After moving, 106 file SHA-256 values matched, including Git HEAD/config. HEAD,
remote configuration and porcelain status matched the pre-move snapshot. All
93 player rows, 39 planet rows, 23 placed objects, 48 visit records and 5 deletion
tombstones were compared field by field after the v4 migration: all previous
fields were unchanged. Comparison snapshots remain private in
`/tmp/little-worlds-relocation`; they are not versioned or public evidence.

Local backups (ignored, never committed):

- `.data/before-relocation-2026-10-05T07-38-13-103Z.sqlite`
- `.data/little-post.sqlite.v3-2026-10-05T07-48-08-289Z.backup.sqlite`

V4 adds fixed planet slots and saved flight state. Migration assigns existing
planets slots in row order and preserves owners, objects, visits and delivery
progress. For a rollback investigation, stop the app, retain the current database,
and use a COPY of the v3 backup with the earlier commit in a separate checkout.
Do not point old code at the live v4 store or overwrite the sole backup.

## Implemented navigation

The main loop is now board, fly, land, explore/build and take off again. Worlds
occupy fixed coordinates at least 90 metres apart. The Atlas marks a target but
does not move the player. The old HTTP instant-visit route returns 410. The ship is
an original procedural model; keyboard, pointer dragging and touch controls
operate the same steering rules. W thrusts, A/D turn, arrows climb/dive, and S or
Space brakes. The chase camera follows heading and the cockpit shows bearing,
distance, speed, nearest-world altitude and landing availability.

Thrust, braking and turns are bounded. Swept sphere collision keeps the ship
outside the planet. A nearer planet can obstruct a direct bearing; the player
must steer around it. Landing requires the server's acknowledged position within
20 metres of the centre and speed at most 6 m/s. Confirmation can be cancelled
before either transition. Landing restores that planet's saved walking position,
or the initial landing spot. Existing spherical walking and building continue.

Checkpoints persist approximately every 350 ms through the shared mutation queue.
The server validates finite coordinates, speed, acceleration, turn budgets,
collision clearance and the current journey/sequence. Exact retries are safe;
stale competing writes are rejected. Walking and NPC actions are disallowed in
space. Reload restores the acknowledged flight state. Offline input freezes;
reconnection rebases to the server's saved position. Unsaved motion may be lost.

## Verification record

The full browser suite passed before the final orbital-texture and mobile-instrument polish; final-image core flight checks then passed again. Observed corrections:

- A test changed yaw beyond pi while intending to test a stale sequence. It was
  correctly rejected as invalid input; the test now keeps yaw in range.
- The phone offline check exposed a late success potentially restoring controls.
  The browser offline flag now freezes inputs and prevents that late resume.
- A straight-line test pilot ran into an intervening world. Navigation was
  correctly blocked; the test now flies a real turn-away/climb detour. The UI
  explains that a world is ahead, and the collision test covers departing contact.
- A later automated return flight stopped with no further turn updates. The test
  driver now reasserts held key events; the entire multi-identity journey passes.
- Running a second test suite while Chrome/other local work was busy produced five
  5-second timeout failures, including existing pole and README tests. This failed
  attempt is not presented as a pass; final checks are run separately.

The container image built locally with Node 24-slim. It ran with one CPU and a
256 MiB limit, binding only localhost:8092 and using an isolated temporary volume.
A real Chrome journey landed, claimed a world, saved a tree, took off again and
stopped in space. After a real `docker restart`, the complete universe snapshot
matched: identity state, owned planet, tree and second flight were unchanged.
The private cookie/snapshots are in ignored `.data/round4-container-*` files.
An idle memory sample was 46.09 MiB / 256 MiB, CPU 0.14%; this is not a load test.

## Scope and remaining work

The universe is bounded to 256 worlds. Flight is arcade movement, not orbital
physics; the browser predicts motion and the server validates checkpoints rather
than simulating authoritative continuous physics. Planet claiming and scene-write
ownership rules are unchanged. Anonymous browser identity still has no account
recovery or cross-device login. Public multiplayer avatars, physical-phone
performance, latency under load, C10 logging and deployment remain unverified.

No module workshop, blueprint system, ecology generator, modular-ship editor or
build-history feature was implemented. Proposed Claude work remains separate and
was not sent externally. Student-authored design/process arguments and Crit8
reflection remain unfinished. Crit7 and the deleted old implementation were not
touched. Publishing, push, Fly costs/deployment and submission need explicit approval.


## Final executed results

| Check | Result |
| --- | --- |
| `git diff --check`, `pnpm lint`, `pnpm typecheck` | Pass |
| `APP_URL=http://127.0.0.1:8091 pnpm test` | 7 files, 18 tests pass |
| `pnpm build` | Pass; JS 637.54 kB / 167.01 kB gzip, CSS 32.97 kB |
| Complete real Chrome suite | All 14 tests pass in 4.3 minutes |
| Desktop/phone flight after final instrument/nozzle polish | Both pass, 32.7 seconds |
| Final Docker image build | Pass, Node 24-slim; only localhost binding |
| Final image `pnpm check` | All 18 tests pass, 625 ms test run |
| Final image desktop/phone flight | Both pass, 22.7 seconds |
| Final image saved-state comparison | Full prior universe snapshot identical |
| `/healthz`, `/readme/`, `/credits/`, both lunar textures | 200 on local app and final container; images served as image/jpeg |
| `pnpm check:evidence` | Pass; this does not complete student reflection |

The final image runs under one CPU / 256 MiB and uses the existing isolated test
volume. The course fly.toml machine, volume and deployment settings were unchanged.
The main localhost:8080 service uses the retained course-folder database.

### Actual rendered performance

`APP_URL=http://127.0.0.1:8091 node scripts/measure-flight.mjs` opens actual headed
Mac Google Chrome 154, warms the scene, drives with the normal controls and samples
three seconds of moving/coasting frames. The GPU reports Apple M3 through ANGLE
Metal. Device-pixel ratio is 1. These are short samples, not load-test claims.

| Viewport | Mean FPS | Median / p95 frame | Draw calls / triangles |
| --- | --- | --- | --- |
| 1600 × 1000 | 144.04 | 6.9 / 8.1 ms | 25 / 69,666 |
| 390 × 844 | 143.98 | 6.9 / 8.6 ms | 18 / 49,634 |

Both captures have no page errors or horizontal overflow. Phone measurements run
on the Mac with touch/viewport emulation; no physical-phone performance is claimed.
JSON evidence: `desktop-flight-performance.json`, `phone-flight-performance.json`.
The final images were inspected, including ship/nozzle shape, moon detail, HUD
readability and mobile instrument separation. Ground assets retain their previous
style. See `visual-study.md` and root `ASSET-CREDITS.md` for the scoped art change
and NASA SVS public-domain texture provenance; no paid asset or game asset was used.

### Reviewable visual evidence

- [Before the direction change](flight-before.png)
- [Industrial desktop flight / approach](desktop-industrial-flight.png)
- [Industrial phone flight](phone-industrial-flight.png)
- [Desktop landing](desktop-landed.png), [phone landing](phone-landed.png)
- [Built world](desktop-built.png), [read-only visitor](visitor-read-only.png)
- [Phone builder](phone-built.png), [Atlas](star-map.png)
