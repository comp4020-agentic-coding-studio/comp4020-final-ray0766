# Presentation adapter — bounded local verification

2026-10-06 UTC / 2026-10-07 Canberra. Starting commit `1280beb`, branch
`final/workshop-v1`. This is a configuration refactor, not a new visual style.
The independently prepared, untracked `tests/e2e/crit8-update-live.spec.ts` was
preserved and excluded from this work. Publishing remains paused.

## Executed checks

| Check | Observed result |
| --- | --- |
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |
| `pnpm build` | Pass; existing versioned resources retained; separate lazy `presentation-stage` chunk |
| `APP_URL=http://127.0.0.1:8098 pnpm exec vitest run spec/presentation.test.ts spec/r3.test.ts spec/physics.test.ts spec/ships.test.ts` | 4 files / 17 tests pass, 1.23s |
| Existing vendor provenance | All 62 source hashes match; zero vendor changes |
| Protected source/deliverables diff | No changes under `src/shared`, `src/server`, `src/assets`, `public`, `reflections`, `.github`, `scripts/release`, or to README / PROCESS |
| Actual local Chrome | Installed Chrome 154.0.8037.98, headed, desktop 1920×1080 and phone viewport 390×844, reduced motion |
| Before/after visual comparison | Seven RGB pixel-identical pairs: desktop, phone, public harbour, building workshop, shipyard, history and terrain preview; no horizontal overflow |
| Core controls | Existing stair descent and open-door traversal; existing building selection/cancel; actual launch, thrust/brake, return landing and refresh. Existing buildings unchanged, no page errors |

This is a short regression check on one Mac. Phone viewport emulation is not a
physical-device or performance result. No full historic suite or public release
acceptance was run. Ground/flight saves changed normally while the existing local
test identity moved; the test did not teleport, write transforms directly, apply
terrain, or alter the saved building set.

## Evidence and driver corrections

The opt-in driver is `tests/e2e/presentation.spec.ts`, requiring
`.data/physics-browser-owner.json` (private, not committed) and `APP_URL`.

1. `PRESENTATION_PHASE=before ... pnpm exec playwright test tests/e2e/presentation.spec.ts --headed`
   passed in 22.4s against the original built client; `before.json` records the context.
2. The first `after` attempt compared serialized floats exactly. Reload normalized
   unit vectors by about 1e-15, so it stopped before gameplay. The driver now uses
   1e-10 numeric precision for pose and exact equality for UI computed colours.
   See `first-floating-point-driver-failure.json` / `.png`.
3. The next `after` attempt completed all seven visual comparisons, opened/closed
   all four panels without edits, descended the stairs and walked through the
   cabin door. Its direct return waypoint to SPAWN crossed the cabin wall and
   timed out after about 1.2 minutes. The application collision was left intact;
   the test route now goes around the cabin via the previously verified stair
   approach. `second-route-driver-failure.json` / `.png` retain that result,
   including all compared UI/pose data. `after-door.png` shows the completed entry.
4. `PRESENTATION_PHASE=continue ... pnpm exec playwright test tests/e2e/presentation.spec.ts --headed`
   resumed only the remaining route, building and flight checks; passed in 25.8s.
   `continue.json` and `after-flight.png` record this completion. The interrupted
   `after` run is not presented as a single passing run.

`pixel-comparison.json` independently compares the seven complete before/after
screenshots with Pillow: all have mean absolute RGB difference 0. The desktop
and phone images were also visually inspected. Both contexts rendered the world,
character and existing stair, rather than merely showing a canvas.

| View | Before | After |
| --- | --- | --- |
| Desktop | [before](before-desktop.png) | [after](after-desktop.png) |
| Phone | [before](before-phone.png) | [after](after-phone.png) |
| Public harbour | [before](before-harbour.png) | [after](after-harbour.png) |
| Building | [before](before-workshop.png) | [after](after-workshop.png) |
| Ship | [before](before-shipyard.png) | [after](after-shipyard.png) |
| History | [before](before-history.png) | [after](after-history.png) |
| Terrain | [before](before-terrain.png) | [after](after-terrain.png) |

## Remaining work

The new art sample is still awaited. The host adapter intentionally does not
rewrite vendor presets, TerrainKit, generated sign/texture artwork, individual
body-part colours, saved paint or module-specific UI accents. Their exact owners
and required inputs are listed in [the handoff](../../presentation-handoff.md).
No source snapshot was imported from Claude's currently modified working tree.
No migration, main push, preflight rerun or deployment was started.
