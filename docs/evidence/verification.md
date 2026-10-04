# Local verification record

Run date: 2026-10-05 (Canberra; tool workspace date was 2026-10-04 UTC).
Implementation: `c02a639`, branch `prototype/small-world-c8`.

This is the historical first-round record. Current screenshots at this folder's
root now show round two; the original first views are preserved under
`round-2/before-*.png`. See `round-2/verification.md` for the current implementation
and checks, and git commit `b70a53a` for all first-round image versions.

## Environment and provenance

- Independent clone: `/Users/ray/Documents/Codex/2026-10-05/task-2/comp4020-final-ray0766`.
- Origin: `comp4020-agentic-coding-studio/comp4020-final-ray0766`, private.
- Started from the sole remote commit `07b2f35`; no pre-existing local changes.
- Local runtime: Node 24.19.0, pnpm 11.20.0. Docker build used Node 24-slim and
  course-pinned pnpm 11.9.0 with a frozen lockfile. Dependencies came from npm.
- Browser: installed Google Chrome through Playwright's `channel: chrome`.
  A visible Chrome preview was also opened at `http://localhost:8080/`.
- No edits to Crit7; no recovery of the cancelled implementation; no push,
  public visibility change, Fly deployment, credentials copied, or submission.

## Executed checks

| Check | Result / evidence |
| --- | --- |
| `pnpm typecheck` | Pass; includes client, server, shared, spec and browser tests |
| `pnpm lint` | Pass |
| `pnpm build` | Pass; final client JS 554.87 kB, 141.07 kB gzip estimate |
| `pnpm check` | 4 files / 9 tests pass |
| `APP_URL=http://127.0.0.1:8081 pnpm check` | Same 9 tests pass against the container |
| `APP_URL=http://127.0.0.1:8081 pnpm test:browser` | 6 tests pass in 31.8 s |
| Final focused browser regression | Desktop journey passes with the action button focused before E (7.9 s) |
| `pnpm check:evidence` | Pass mechanically; reflection and academic writing remain unfinished |
| `docker build -t little-post:c8 .` | Pass, frozen lockfile, production dependencies only in final stage |
| Container shape | Started with `--memory=256m --cpus=1`, bind-mounted isolated data directory |
| Container resource sample | 39.87 MiB / 256 MiB; one sample, not a load test |
| Image size sample | 85,511,144 bytes before the final keyboard-focus-only client correction |
| Concurrent task replay | Five parallel pickup and five parallel delivery requests: one parcel, one delivery |
| Actual container restart | Same cookie restored `sky`, `delivered`, `deliveries: 1`; full state equality passed |

The complete six-test container browser run preceded the final small keyboard
focus correction; that correction was rebuilt and its desktop journey was rerun
against the local Node server. The final Docker image was rebuilt after it. This
record distinguishes those runs rather than claiming every check ran on one
unchanging artifact.

## What the checks exercised

The motion spec runs 16,000 frames around repeated great circles through both
poles, checking unit position, tangent orthogonality, finite camera poses and
bounded frame-to-frame movement. Separate tests cover speed, diagonal input,
stopping, frame gaps and 180-degree reversal. Real Chrome also crossed the north
pole using W, reversed with S, then changed position by clicking the ground.

The store spec checks pickup before delivery, both proximity constraints, invalid
coats, malformed/nonfinite/off-sphere positions, implausible travel, duplicate
transitions and two independent identities. A file database is closed/reopened
with carrying state and again with completed state. The HTTP spec checks cookie
flags, identity isolation, request format, absent identity and cross-origin writes.

Browser journeys used visible interface controls, actual keyboard events and
Chrome touch events on the joystick. Both 1920 × 1080 and 390 × 844 completed the
quest. They selected Fern, refreshed while carrying, delivered, closed the browser
context and restored its cookie in a new context, then confirmed the saved coat
and completion. Offline/reconnect, resizing, reduced-motion mode and modal Escape
were also exercised. No production test backdoor or teleport endpoint was added.

## Screenshots inspected

- `desktop-initial.png`: the first playable desktop view.
- `mobile-initial.png`: 390 × 844, mission and joystick visible without overflow.
- `desktop-completed.png`: completed delivery and original scene.
- `mobile-completed.png`: completed delivery and flowers at the glasshouse.
- `north-pole.png`: rendered scene after crossing the north pole.

## Corrections observed during development

1. A canvas-only smoke check initially passed while the world was blank. A
   generic Object3D had the opposite lookAt forward convention. A PerspectiveCamera
   now computes the pose; browser checks additionally require projected NPC labels.
2. Linear interpolation plus normalisation can stick on an exactly opposite
   heading. Signed angular turning repaired it and gained a regression test.
3. A focused action button previously swallowed E. The key handler now accepts E
   during play, and the desktop journey explicitly focuses the button first.
4. The mobile toast initially covered the upper introduction. It now occupies the
   open area below the courier. Visual screenshots were re-inspected.
5. The first local container start failed because its bind directory was absent;
   the directory was created and the container then built/started successfully.

## Remaining limits and approvals

This is a C8 implementation prototype. Camera comfort, navigation clarity and
original design direction still need the user's playtest; no human feedback is
invented here. South-pole coverage is mathematical, while actual browser pole
crossing covered north. Browser phone testing is emulation, not a physical phone.
No multiplayer, C10 structured logging, account recovery or deployed environment
is implemented. A cookie is the returning-visitor identity; clearing it starts a
new visit. Collision is client-side and movement validation is a bounded
checkpoint, not competitive anti-cheat.

Before course publication: the student must author/review README's design argument,
PROCESS's process argument and reflections/crit-8.md. Verify the C8 cutoff in the
actual timetable. Deployment needs explicit approval for the course Fly app and
associated costs, then verification of /data volume, cold-start/restart, TLS cookie
and the live `/readme/`. Pushing this branch / merging to main, making the repo
public and invoking course submission remain separate approval steps.
