# Door and stair contact review

2026-10-06 UTC / 2026-10-07 Canberra. Starting commit `13a3e1e`, local branch
`final/workshop-v1`. Existing Little World 47 cabin and stair fixtures; no new
building or terrain was placed. The original untracked release acceptance test
was preserved. No publication, preflight, source-art import or schema change.

## Reproduced problems and final change

Two low-speed contacts could repeatedly cancel an otherwise usable slide:

- A diagonal exit beside the open door leaf stopped at the 25 mm threshold.
  The real browser stopped near cabin-local x=-0.603596, z=0.624010.
  Raising the radial capsule onto the threshold overlapped the leaf even while
  the horizontal input was moving away from it.
- Phone joystick ascent near a stair rail corner stopped at stair-local
  x=-0.162966, y=0.203457, z=1.311279. Small inputs remained against the rail;
  a larger input could escape. Replaying the original HEAD reproduced this too.

`GroundWorld.move` now uses the already calculated penetration depth after the
slide projection. It redirects the candidate outward within the remaining input
length and retries the existing bounded collision loop. This changes neither
speed/step/fall limits nor capsule dimensions, proxy geometry, asset IDs,
anchors, floor/door/stair dimensions, ship contracts, world layout or storage.
Client prediction and server replay import the same function. No server endpoint
or saved-state schema was changed. The final implementation does not lower the
character to get under an obstacle.

Read-only camera/head positions and character visibility were added to the
existing canvas diagnostics. Camera behaviour was not redesigned: close indoor
avoidance can still hide the local character. The normal smoothed camera and
reduced-motion view were inspected using actual controls and screenshots.

## Evidence

- [Door replay](contact-replay.json): identical recorded contact, old HEAD vs final
  algorithm, 12/16/20 mm inputs. All three old paths stayed stuck; all final paths
  reached the exit with no blocked pose.
- [Stair replay](stair-contact-replay.json): identical recorded contact, 12/25/49 mm
  inputs. Old small inputs stayed stuck; final inputs reached the upper floor.
- [Final browser summary](final-summary.json): final phone and desktop runs, movement
  HTTP status counts, camera-clearance and body-overlap checks. Network bodies
  and browser identities are private under `.data/`, not committed.
- [Final phone stairs](final-phone-phone-stairs.png),
  [final phone door/camera](final-phone-phone-door-camera.png),
  [final normal indoor camera](final-camera-indoor-follow.png).
- Original observations: [diagonal entry](before-diagonal-entry.png),
  [wall sliding](before-wall-slide.png), [floor-edge rest](before-floor-edge.png),
  [stuck door](camera-failure.png), [stuck stair](after-phone-failure.png).

The broad initial desktop review completed diagonal entry/exit, three repeated
jamb contacts, wall sliding, a full indoor orbit, stair ascent/descent, floor-edge
rest and a bottom turn (60 samples, no blocked pose or camera crossing). Its
context-close trace archive failed with a byte-count/ZIP error after a minor
in-run driver edit; `before.json` truthfully retains the interrupted status.
The subsequent separate phone review passed before the fix (`phone.json`).

Normal camera review then exposed the door stall (`camera.json`), despite all 36
camera samples being clear. An early candidate let the original stuck character
exit (`after-camera.json`) but recorded one 409 without its error body; that run
is not claimed to pass. A repeat with network capture passed (`verify-camera.json`).
The following phone run exposed the old stair corner stall (`after-phone.json`).
The early lower-support candidate was replaced with the final bounded outward
slide, which addresses both recorded contacts. The first added unit fixture also
needed its radial starting height corrected to match the real world point.
All these partial results are preserved rather than relabelled as successes.

## Final executed validation

| Check | Result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | Pass |
| `APP_URL=http://127.0.0.1:8098 pnpm exec vitest run spec/door-step.test.ts spec/physics.test.ts spec/motion.test.ts spec/terrain.test.ts` | 4 files / 23 tests pass |
| New contact regressions | Low-speed door exit; closed leaf still blocks; rail escape stays within input distance; quantized door and stair paths replay with server-authoritative height |
| Existing focused regressions | Poles/turning, walls, step/fall/recovery, camera ceiling, server sequence/time/speed/forgery checks, terrain compatibility |
| `MOVEMENT_REVIEW=final-phone APP_URL=http://127.0.0.1:8098 pnpm exec playwright test tests/e2e/movement-review.spec.ts --headed --trace off` | Pass, 21.5s including startup; actual touch ascent from saved stair contact, descent, diagonal door entry/exit, camera drag and refresh |
| Same command with `MOVEMENT_REVIEW=final-camera` | Pass, 12.7s; actual keyboard entry/exit plus 12 yaw/pitch drags and 36 smoothed-camera samples |
| Art provenance | All 62 vendored source hashes match; source models/materials, presentation adapter and Claude workspace untouched |

Final browser: installed Chrome 154.0.8037.98; desktop 1440×900 normal animation,
phone viewport 390×844 with real Chrome touch events and reduced motion. Both
final runs had no page error or rejected movement response. The 44 final samples
were clear of body overlap and camera-ray solid intersection. Saved building and
terrain records remained equal to the starting world; the local test player's
position changed through normal movement only. The same 8098 launchd job was
restarted so browser and server used the final shared solver, and kept running.

This is bounded verification of the existing cabin/stair fixtures, not proof for
every user-built geometry or a physical phone. No new camera style, jump/crouch,
door interaction, multiplayer or building UI work was added. A future original
model redesign still needs reviewed collision metadata; a warm palette sample
alone is not treated as approval. Publishing remains paused.
