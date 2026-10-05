# Round 5 — Physical starports, a finite survey and ground visitors

Implemented in `/Users/ray/Desktop/Study/ANU-Master/8020/comp4020-final-ray0766`,
branch `prototype/small-world-c8`, following local baseline `67d6988`.
Only local work was authorised. No push, public repository change, Fly deployment,
paid service, external module integration or course submission occurred.

## What can be played

- Public arrival → blue-lit street → physical STARPORT gate → contextual E/touch
  boarding → confirm/cancel → controllable flight → approach/brake → land → return.
- The public hub has original industrial buildings, service routes, signs and an
  observatory. Private worlds start with zero saved owner objects and retain a
  temporary return beacon/craft. Landing at that beacon guarantees a clear exit.
- The normal HUD contains location, save status and relevant local actions. Pause
  opens optional management/help/Atlas. Build mode isolates walking controls.
- Fresh saves seed 33 worlds in three finite regions. The retained live save has
  42 existing worlds. Stable slots/centres remain unchanged. Atlas shows regions
  and distances; selecting a card never teleports the player.
- Same-planet ground visitors appear through one-second heartbeats and smooth
  interpolation. Their positions come from server saves, their public IDs are
  ephemeral UUIDs, and absent heartbeats expire after six seconds. Departure clears
  presence. Cookies/database identity hashes are excluded. Visitors cannot edit.

Server takeoff validates current planet, journey, ground mode and the saved walker
within 1.65 m of the port. The client reveals boarding slightly inside that range
and flushes walking before confirmation. Existing navigation validation, ownership,
object versioning/tombstones and quest idempotence remain in place.

## Executed checks

| Check | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `git diff --check` | Pass |
| `APP_URL=http://127.0.0.1:8093 pnpm check` | 9 files / 21 tests pass |
| `pnpm build` | Pass; JS 637.53 kB / 166.70 kB gzip, CSS 41.05 kB |
| Full real Chrome suite against final application build | 16 / 18 passed; two Mac Chrome session lifecycle timeouts, detailed below |
| Focused final replays | Desktop delivery/restoration passed in headed Chrome (17.1 s); four-client presence passed in 2.2 min after the harness changes below |
| Final Docker image build | Pass; `little-worlds:starport-c8` |
| Container HTTP/logic/course checks | 9 files / 21 tests pass |
| Container real walking/flight/claim/build/second-flight journey | Pass; original keyboard/UI controls, no teleport endpoint |
| Real container restart | Full universe snapshot identical; suit, owner, tree and second flight restored |
| SQLite `PRAGMA quick_check` after restart | `ok` |
| Live 8080 restart | Every saved row unchanged, schema remains v4 |
| `/healthz`, `/readme/`, `/credits/`, two lunar textures | 200 on live preview and container; JPEG content types preserved |
| `pnpm check:evidence` | Pass; this is not completion of student reflection |

The browser cases cover desktop and 390 × 844 touch controls, public gate walking,
distant takeoff denial, cancellation, pause input isolation, pole crossing/reversal,
click walking, optional delivery, saved suit/task restoration, independent owners,
read-only visits, object editing, stale edits, offline recovery, real flight/return,
region filtering, actual flight to an outer world and rendering budgets. Four
independent browser contexts exercise meeting, dropping offline, reconnecting,
leaving, different planets and denied guest edits.

### Failures and repairs, without discarding the failures

The first flight driver used a very small steering dead zone and sequential key
updates. One phone navigation test timed out while the driver over-corrected.
The test now sends key updates together and accommodates the ship's steering
smoothing; it still flies with real keyboard/touch input and server validation.
A long six-flight ownership test reached its old 240-second total deadline; the
larger scenario has a 420-second deadline and passed on the final build.

Moving controls into a closed pause dialog required visibility assertions to be
updated to check stored control state. A pause test initially compared a server
snapshot before the final pre-dialog movement save had completed, observing a
0.13–0.17 m change. It now lets that prior checkpoint finish before testing paused
input. Both desktop and touch round trips subsequently passed.

The final 18-case run completed 16 tests and the application assertions in the other
two, but timed out when creating/closing Mac Chrome contexts (delivery restoration
and four-client teardown). Its browser logs included `CVDisplayLinkCreateWithCGDisplay`
and GPU mailbox errors. Those logs establish an observed browser runtime problem;
they do not prove a single cause. The tests now navigate away from active WebGL
before releasing their custom contexts, and the affected cases are replayed in
headed real Chrome. The delivery test's total deadline also covers leaving and
creating a new browser context. This does not weaken any save/permission assertion.
The original failed run is not represented as an all-green full-suite run.

The desktop delivery replay passed in headed Chrome in 17.1 seconds. Four-context
trace teardown still stalled, so tracing is disabled only for that case; its real
controls, screenshots and all state/permission assertions remain. A subsequent
run reached the default five-second flight-HUD assertion while the two queued
save/launch requests were still pending. Transition waits now allow 15 seconds
(two individually bounded requests), without changing the application timeout.
The final four-client test used a 1440 × 900 owner viewport and three 800 × 600
visitor viewports to avoid conflating four full-size renderers with four separate
devices. It passed in 2.2 minutes, including offline cleanup, reconnect, ownership,
actual flight/return, different-planet isolation and denied guest edits.
Thus all 18 scenarios have passing evidence across the complete run and focused
replays; there was not a single 18/18 all-green run in this round.

## Original save preservation and recovery

Before updating the localhost:8080 service, a consistent SQLite backup was written
inside ignored `.data/round5-before-start-20261005T113852Z.sqlite`. Hashes of sorted
complete rows matched after starting the new code: 99 players, 42 planets, 24 saved
objects, 50 visit records and five tombstones. No schema migration was required.
`live-save-preservation.json` contains aggregate counts/digests only, not session
cookies. The previously deleted implementation was not restored; Crit7 was untouched.

To recover locally, stop the app, retain the current `.data` files separately, copy
the chosen consistent backup to `.data/little-post.sqlite`, remove only the matching
old SQLite WAL/SHM sidecars while the app is stopped, then restart. Do not combine a
backup main database with unrelated current WAL files. No restore was needed here.

The container was stopped after validation, preserving its image and isolated data.
The temporary 8091/8093 test services were also stopped; the user preview remains
on localhost:8080. The container bound only `127.0.0.1:8092` and used
`/tmp/little-worlds-starport-container` as an isolated volume. Its limits were one
CPU and 256 MiB; an idle sample was 46.77 MiB and 0.01% CPU, with no OOM exit. This
is an idle resource observation, not a concurrency guarantee. The restart identity
and full before-snapshot are private ignored `.data/round5-container-*` files;
`container-restart.json` records the non-secret outcome.

## Rendering and explicit limits

Orbit detail is capped at eight detailed planets and 24 solid models, with a batched
far-beacon layer. Labels are limited to five near worlds plus the target. Ground
presence replies/rendering cap neighbours at 16 and full suits at four; remote
characters use contact marks instead of additional dynamic shadow passes. Presence
storage has a 256-entry ceiling. These are budgets, not tested production capacity.
The actual multi-client browser test used four contexts on one Mac, not four
physical devices. A server fixture also checks nearest-16 truncation with 20 peers.

`node scripts/measure-flight.mjs` used headed Chrome 154 / Apple M3 / ANGLE Metal,
DPR 1. Short warmed moving/coasting samples: 1600 × 1000 averaged 143.34 FPS
(median 6.9 ms / p95 8.2 ms); 390 × 844 averaged 143.96 FPS (6.9 / 8.3 ms).
Draw calls were 24 / 20 and triangles 50,534 / 49,814 respectively. Both saw eight
detailed and 24 solid allocated world models from a 33-world survey, no page errors
and no horizontal overflow. These phone dimensions run on the Mac, not phone hardware.

Headless ground and four-client frame samples are separate JSON records. Multiple
WebGL contexts and other concurrent local work contend for the same machine, so the
samples are not a controlled comparison or a multiplayer hosting/load claim.
The final mixed-viewport four-context sample is `four-client-sample.json` and
records all four viewport sizes. Earlier four-full-desktop-window stress samples
are preserved separately as `four-client-headless-sample.json` and
`four-client-headed-stress-sample.json`; they observed about 32 and 15 FPS on the
shared Mac during runs that later hit browser lifecycle limits. They are limits
of this measurement setup, not evidence of physical-phone or public-server capacity.

The user-selected reference qualities and explicit gaps are compared in ADR 0005.
`docs/integration/workshop-adapter.md` documents the exported existing `ColonyBridge`
and real validated endpoints; no workshop was integrated. Exporting that type did
not change the built client artifact hash (`index-CB0hCiOH.js`).

No remote spacecraft, avatar collision, chat, voice, login/recovery, blueprint
workshop, ecology generator, ship workshop or history timeline is included. Existing
owner objects remain the earlier small prototype kit. C10 logging, public deployment,
physical-phone testing and the student's academic writing/reflection remain outside
this completed local implementation. The course `fly.toml`, original two shipped
checks and unfilled `reflections/crit-8.md` were preserved.

## Reviewable images

- [Before desktop](before-desktop.png), [before phone](before-phone.png)
- [Actual desktop street](desktop-headed-street.png), [phone street](phone-headed-street.png)
- [Physical boarding gate](desktop-headed-gate.png), [touch boarding](phone-boarding-gate.png)
- [Phone return beacon](phone-return-beacon.png), [phone building](phone-built.png)
- [Four visitors](four-visitors.png), [owner and visitor](owner-and-visitor.png)
- [Outer region Atlas](outer-region-atlas.png), [outer-world flight](outer-world-approach.png)
- [Desktop flight](desktop-industrial-flight.png), [phone flight](phone-industrial-flight.png)
- [Container resumed flight](container-resumed-flight.png)
