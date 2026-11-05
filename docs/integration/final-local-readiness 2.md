# Final local readiness — 25 October 2026

**Subsequent release:** See the [Final release record](../releases/final-2026-10.md) for the later local restart and main/Fly release scope. The limitations and earlier-stage statements below remain historical.

**Latest verification:** [HD close-out and public evidence](../evidence/final-hd/verification.md) records the newly authorised isolated full check, repairs and browser evidence. The following close-out is a historical stage; its local-only evidence and no-full-suite statements are not the latest status.

**Later updates:** the separately authorised [bounded live-guide trial](local-guide-ai.md) supersedes this earlier close-out's AI-off status. The author subsequently approved the revised English PROCESS, research note and three reflections, and final packaging for `origin/integration/midpoint`. The no-commit, AI-off and pending-writing statements below describe the earlier verification stage, not the subsequent packaging or current 8152 trial. Production deployment and production AI remain outside this request.

This is an **uncommitted local candidate**, not a release. Branch `integration/midpoint` remains based on `d5e524cf948c4d8da6476b61d5189ceb3df853a6`. Current preview: <http://127.0.0.1:8152/?measure=1>. No commit, push, deployment, production migration or real model request was made for this close-out.

## What was integrated

The current player contract is recorded in [README](../../README.md), [CLAUDE](../../CLAUDE.md), [the player guide](../player-guide.md) and [the local guide description](../world-guide.md):

- The new traveller is the only rendered player style. New identities must save their first appearance; existing appearances and progress remain compatible. Later edits have explicit Save/Cancel.
- Menu + Tab, Esc to release mouse capture only, and Space for the stationary scene guide have separate input ownership. Find ship belongs to the guide, with ground directions rather than a moving NPC. Fixed bilingual help works with real AI disabled.
- No character jumping; explicit confirmed safe-ground recovery. Rooms restore into fixed 2.5D. Outdoor observation is retained.
- Automatic travel with no visible rails or manual driving: choose and Depart, confirm retargeting, prepared Skip, or return to departure. Planet renaming stays owner-only, unique under server normalization and independent of stable IDs.
- Visitors can use another planet's gate to reach the main planet or their own home. English defaults, explicit language preferences, welcome notice, quality presets and bounded loading remain.

This close-out removed the obsolete static manual-flight/landing controls, aligned Atlas and returning-player instructions with automatic travel, made retarget cancellation say **Keep destination**, and corrected the flight HUD's public-hub label from **Unclaimed** to **Main planet**. The former mixed prototype player guide is preserved verbatim beneath a history label in [the frozen snapshot](player-guide-history-20261025.md).

One actual defect was repaired: a 12-second initial detail-load timeout previously aborted its controller but could leave the blocking loading task open while an asynchronous GPU step was unresolved. It now finishes the blocking feedback at the deadline, keeps coarse worlds available and still cancels/disposes late work. The existing timeout regression failed before this repair and passed afterward. Two stale test expectations were aligned with authoritative automatic-trip targets and non-blocking background loading; the room mock now implements the current appearance interface.

## Current checks and actual browser coverage

**214 assertions across 31 explicitly selected test files passed** (18.56 seconds), plus both course HTTP invariants against the running cloned app (`/` and current `/readme/`). TypeScript, repository lint, client build and worker build passed. `git diff --check` is clean. The default full suite was not run.

The explicit unit/integration selection covers character entry and appearance, guide/input ownership, mouse look, fixed rooms and room preparation/retry, walking-only movement and recovery, automatic trips/names, gate permissions, persistence feedback, welcome/quality, flight preparation/cache/boundary/checkpoints and translations. The automatic-trip tests exercise every available destination's prepared arrival and return on an isolated server store; they do not demonstrate every rendered route visually.

Browser: installed Chrome 155.0.8059.85, headless WebGL; 1920×1080 desktop and 390×844 touch-emulated viewport, Smooth quality. These are browser feature checks, not a physical-phone or frame-rate benchmark. All test identities and fixture mutations were in a separate SQLite clone served on 8167.

| Scenario | Evidence actually obtained |
| --- | --- |
| New identity to boarding | Both viewport sizes: delayed game bundle still shows the English device notice despite a Chinese browser locale; required creation; offline first Save keeps draft; retry succeeds. Tab/Esc/Space and typed Space work separately. Walked the actual 42-point hub-to-ship route with keyboard/touch, without repositioning those identities. |
| Automatic visit and return | Both sizes: automatic takeoff, real visible destination label opens confirmation, cancel keeps target, confirmed retarget, injected arrival failure keeps space state, retry lands. Cancel returns to recorded departure; network interruption then refresh retains a safely paused trip; prepared Skip returns to the hub. Narrow-screen view was deliberately orbited to bring another real planet into view. |
| Appearance and names | Saved appearance and own renamed planet survive refresh; duplicate name is rejected; another independent browser identity reads the same public name. Permission, normalization and competing-connection conflict cases pass in targeted server tests. |
| Room and Find ship | Both sizes: entered a prepared owner room, refreshed in fixed 2.5D, chose Find ship, saw the exit-first guidance, exited and walked its six-point ground route to Board. These room-door starts were explicit fixtures on fresh clone identities, not the uninterrupted hub walk. |
| Visitor gates and recovery | Both sizes: separate visitor-gate fixtures show main/home destinations and hide owner setup; failed request leaves the visitor in place; retry reuses the request ID and succeeds. Main return works. Safe-ground Cancel preserves position; explicit confirmation produces grounded recovery. |
| Legacy far-space state | Final build: a new clone fixture with the previously reported far-space coordinates preserves them until explicit travel; a prepared Skip returns to the real hub without movement/trip rejection. The corrected Main planet label is visible. This does not claim all planets are visible from that old camera direction. |
| Language and layout | Explicit Chinese choice persists after refresh; returning to English works; Menu + Tab labels and relevant controls fit the checked widths without horizontal document overflow. The narrow guide bubble scrolls internally. |

The raw browser scripts were not all uninterrupted green runs. Preserved failures exposed four harness assumptions: unroute raced an already released delayed bundle; a ground-only diagnostic was awaited after refreshing in space; a new observer needed identity initialization; and `zh-CN` was incorrectly compared with `zh`. A narrow camera initially showed only its current target, so the supplementary check used real touch orbit before clicking a different visible planet. Later bounded checks completed the affected scenarios; earlier failed logs are retained, not relabelled as passing. No client page errors or unexpected movement 409s were observed in the executed journey checks. No guide/model requests were sent.

## Evidence index and preservation

Current local output root: `/Users/ray/Documents/Codex/2026-10-21/task/final-integration/`.

- `tests.log`: first run including the failed loading-timeout assertion and stale mocks.
- `tests-repair.log`, `tests-final.log`, `http.log`, `types-final.log`, `lint-final.log`, `build-final.log`, `worker.log`: scoped final checks.
- `browser-final/result.json`: desktop new-user walk and travel observations, ending at the observer-initialization harness error.
- `phone-final/result.json`: narrow new-user walk and takeoff, ending at the incorrect assumption that another label must already be visible.
- `phone-flight-finish/result.json`: remaining narrow travel, rename and recovery assertions, ending at the language-code assertion; language persistence was then verified in the following room script.
- `room-route/result.json`: passed desktop/narrow room restoration, actual walking route, visitor gate retries, recovery and language checks.
- `legacy-final/result.json`: passed final-build far-space compatibility check.
- Screenshots beside those JSON files record actual rendered scenes; the screenshot collection has not been copied into previously refused repository evidence folders.
- `preview-before.sqlite`, `preservation-before.json`, `preservation-after.json`, `preview-checks.json`, `final-check.json`: original 8152 backup, table hashes, byte-matched served build and persistent process checks.
- `protected-writing.json`, `final-worktree.json`: preserved writing hashes and changed-file inventory.

[Source credits](../../ASSET-CREDITS.md) remain the asset provenance record. [Crit10 materials](../crit10/README.md) and existing observations/reflections are historical/submission records; the author confirmed their real peer/log exercise. Existing dated performance and 8098 evidence remains historical, not evidence for this candidate. Experimental manual/plane/rail source modules remain outside the active flight import path; no broad deletion of unrelated files was attempted.

The original 8152 SQLite database is reused after a consistent backup and table-hash comparison. Test fixtures do not write it. The 8098 preview, production and credentials are untouched. Unknown untracked/duplicate files are preserved.

## Remaining decisions and limits

- **Wall cutaway remains an unresolved visual decision.** Close-to-wall/corner clipping was diagnosed earlier; collision and saved rooms were not redesigned in this close-out. It is not presented as fixed.
- **AI remains disabled.** Fixed local help is not a live model. Earlier bounded provider experiments do not authorize persistent calls.
- **Author review remains outstanding** for the proposed new PROCESS/three-reflection wording and research-note argument. The actual `PROCESS.md`, `research-note.md` and `reflections/crit-8.md`, `crit-9.md`, `crit-10.md` were byte-for-byte preserved from this turn's starting snapshot.
- No newly approved full-suite run or repository evidence archive was attempted. After explicit approval and starting a fresh isolated test server, the proposed release check is `APP_URL=http://127.0.0.1:<test-port> pnpm check`. Earlier full-suite logs took about 55 seconds; allow roughly 1–3 minutes plus fixture startup, **an estimate, not a current measurement**. Never point that run at 8152's original saves or production. The separate disabled-camera replay suite is not part of this recommendation.
- Browser coverage is representative: not every custom building, physical mobile device, browser engine, long multiplayer session or natural no-skip full flight was replayed. Slow loading was represented by a held module request and controlled failure/retry, not a calibrated mobile-network benchmark. No new RAM/VRAM/FPS result is claimed.
- A read-only host metadata query (`sysctl` for `machdep.cpu.brand_string` and `hw.memsize`) was denied by the execution environment with “Operation not permitted”; it was not retried. This does not block feature verification, but current hardware metadata was not independently re-read.

## Final development-branch packaging

The author approved the revised English PROCESS, research note and Crit 8/9/10 reflections and requested a final push. The target is `origin/integration/midpoint`; `main` and production remain at `d5e524c`. The existing workflow triggers automatically only for `main` pushes and pull requests, so this development-branch push does not run remote CI or deploy. No workflow was changed or manually dispatched.

The packaging also removes the fixed-help unknown-answer sentence that incorrectly asserted AI was disabled. The fallback now states only that fixed help has no answer and offers its topic choices; actual AI availability stays with the backend status and disclosed Ask AI action. No other gameplay behavior changed in this packaging pass.

The final explicitly selected **32 files / 230 assertions passed in 17.95 seconds**. TypeScript, repository lint, client and preparation-worker builds, whitespace checks and cited-commit resolution passed. The default full suite was not run. Earlier rendered desktop/narrow scenarios above and the later guide-trial checks remain the gameplay evidence; this packaging did not repeat them or claim a new physical-device/performance result. Raw new check logs remain in the local task's `final-push/` directory, outside the repository.

8152 was updated by replacing only its static-build symlink. Its existing backend process stayed running; all 15 entry resources matched the new build, `/healthz` and `/readme/` returned 200, and all 28 game tables plus the separate AI budget ledger were unchanged across the update. Consistent backups were saved outside the repository. No credentials were read, no provider calls were made and the original trial cap/deadline were not reset. The new commit contents exclude databases, runtime ledgers, keys, build outputs and unrelated duplicate files. Wall cutaway and the broader validation limits above remain.
