# Final candidate verification — 25 October 2026 UTC

**Subsequent release:** [29e7e68](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/29e7e6870b458a4cfff70c13c9dc5fab6f0f509a) was deployed successfully in [run 40209299668](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/runs/40209299668). The [release record](../../releases/final-2026-10.md) separates that outcome from the initial local-only evidence below. The author subsequently accepted wall cutaway and same-position traveller occlusion as known limitations; this does not turn the recorded adverse views into fixes or blanket comfort approval. The historical pending statements below describe their original checkpoint.

This is a technical acceptance record, **not author playtest approval or a production release**. The baseline is `4200c33e6d531fc37a7f7598b441ea1c347eb72d`; this close-out adds the documented ground-state repair, fixture corrections, writing refinements and this evidence. [verification.json](verification.json) identifies the changed production file by SHA-256 and preserves log and screenshot hashes. A repository commit containing this record fixes the accompanying code and evidence together.

At this initial local verification stage, production and `main` were at `d5e524c`. The existing main workflow performs checks, a production backup and deployment; this close-out did not dispatch it or enable production AI. A development branch and local checks alone do not finish the course submission.

**Later usability follow-up:** the [usability follow-up](../../integration/usability-fixes-20261026.md) records route/framing repairs, exact support-query reuse, bounded test scheduling and fixture cleanup, with 153 files / 978 tests passing. Their publication and production verification are tracked separately in the release record above. The 971-test result below belongs to this 25 October stage and must not be relabelled as the newer run.

**Later production persistence evidence:** [three retained profiles](../three-player-20261026/return-visit/README.md) returned across the Sydney date change after 13h 25m–13h 28m, retaining their named homes and Bench 42 after an intervening successful deployment. This supplements the local restart evidence below; it is not 24-hour retention, an automatic-stop history audit or a test of the later usability repairs.

## What the full check found

The first authorised isolated `pnpm check` ran 151 files / 970 tests: **950 passed and 20 failed**. The first repair pass retained one failure. The final candidate ran **151 files / 971 tests, all passed, in 50.52 seconds**, including `app` and the separately isolated `legacy-http` project. `pnpm check:evidence` passed with seven resolvable commit references and the three required reflections. Typecheck, lint, client build and preparation-worker build passed. The optional disabled-camera suite was not run.

| Finding | Correction and preserved contract |
| --- | --- |
| Schema/physics assertions still expected schema 18 and versions 9/10 | Pin current schema 20 and physics 10/11. Migration backups, saved rows, integrity, collision dimensions and safety assertions remain. |
| Ship HTTP fixture bypassed new first-character creation | Assert the initial 409, explicitly save appearance, then retain authenticated success, 401/403, forged-owner and oversized-body checks. |
| Resident interaction VM omitted the current stationary guide state | Add the missing interface stub; still execute production input/dialogue functions and require immediate E after Resume without moving anyone. |
| The historical courier-envelope oracle was accidentally run against the new traveller | Pin its original model from `d5e524c` under `spec/fixtures/`; retain its byte hash, geometry counts, full bounds and seven assertions. This test-only model is not a player option or a current visual acceptance claim. |
| **Real regression: a scene revision zeroed valid falling velocity** | `groundStore.ensure` omitted the current physics version from compatible saves, so a door toggle invoked recovery. Preserve a current valid falling pose, while retaining collision/support checks and request fencing. The repaired door test still compares the complete pose; a new public-planet regression checks falling velocity and unchanged player rows. Old upward jump motion remains retired. |

The original failed runs are retained privately; the public JSON records their outcomes and hashes rather than exposing raw logs. No assertion or production speed/collision limit was relaxed to hide a failure.

## Browser evidence at this checkpoint

Installed Chrome **155.0.8059.85**, headless WebGL, Smooth quality; **1920×1080** and **390×844**, with a touch-emulated context and a separate resize check. Two new cookie contexts and fresh disposable databases were used. Doorway placement fixtures were explicit test setup; they are not evidence that two humans completed the whole route from the URL.

- Both contexts completed the real first-character Save UI. The owner and visitor saw each other's presence. Owner creation/rotation requests reached the other page without reload; a visitor write returned 403 without adding an object.
- Six object updates measured **247–852 ms**, median **587.5 ms**, from request start to the observer's applied revision plus two animation frames. A changed appearance reached the rendered-avatar diagnostic in **522 ms**. These are loopback samples, not a WAN/p95 guarantee or independently timed pixel-difference measurements. Object writes used the authenticated API; creation and rename dialogs used real UI.
- The real rename dialog updated the other page. A 500 ms universe-response delay and a brief offline toggle recovered without reload. These are controlled failure scenarios, not a calibrated mobile-network benchmark.
- The owned test server was actually stopped and started using the same test database. Complete object records, planet name and appearance were compared after both contexts reloaded. First creation did not repeat. This proves the local process-restart case, not a Fly redeployment.
- In a private 2.5D room, four movement probes remained within its bounds. A far-from-door exit click was refused as designed; a separate follow-up walked away and back to the doorway, then exited successfully. Settled 390×844 layout had one room header and no document overflow. This does not reproduce every walk-through building's cutaway.

The first browser attempt failed in its delayed-route teardown; waiting for in-flight route handlers corrected the harness. The next attempt completed the shared-state and restart checks, then stopped at the invalid far-from-door exit assumption. Those partial runs are not relabelled as uninterrupted passes. The room-only follow-up passed. No page exceptions or paid AI requests were observed.

## Inspected screenshots and limitations

| Image | Observation |
| --- | --- |
| [First character, 390×844](phone-first-character.png) | Finite options and explicit Save fit the viewport; this is a synthetic new user. |
| [Shared home, 1920×1080](desktop-shared-home.png) | Two rendered travellers beside the fixture doorway; home actions are visible. |
| [Visitor obstruction, 390×844](phone-visitor-obstruction.png) | A close façade fills much of the visitor's initial view. This is adverse evidence, **not** a claim that every doorway/camera position is comfortable. |
| [Private room, 1920×1080](desktop-private-room.png) | Character and room boundary remain visible after movement; exit is disabled away from the doorway. |
| [Private doorway, settled 390×844](phone-private-room-door.png) | Doorway position enables Go outside; explicit exit succeeded after this capture. |

At this checkpoint, the reported abrupt wall cutaway in walk-through interiors remained an unresolved visual decision; the author subsequently accepted it as noted above. It was not silently redesigned. Small-scale readability on physical phones, arbitrary buildings, every route, long sessions, other browser engines and production load remain outside this bounded check. The room exit tooltip is also generic: it says to open the door even when distance is the actual reason for refusal. This is a clarity issue, not evidence that exit bypasses proximity checks.

## Course / HD evidence map

The [official Final brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/) and [assessment guidance](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/) set the criteria; the following is a readiness map, not a promised grade.

| Area | Current support | Remaining boundary |
| --- | --- | --- |
| Process / harness / stack | PROCESS explains direction, tradeoffs, ownership rules, test correction and ADR 0001, with seven commit references. | Code commits support implementation, not independent proof of who gave a conversational instruction. Author judgement remains theirs. |
| Application's definition of good | README body approximately 506 words: lasting contributions, safe visits, low-attention travel; Messenger and its creator interview; explicit scope choices. | Enjoyment, unusual routes and the adverse camera view above need human judgement. |
| Multiuser, realtime, persistence | Current two-context writes/permission checks, six timed shared-object updates, appearance update and actual isolated restart. | Not two-human acceptance, WAN latency or production redeployment. Historical Crit 10 peer/log practice remains separately author-confirmed. |
| Research | Approximately 698 body words; independent goal/acceptance position, source comparison and bounded response to review cost, including fallibility of human judgement. | A normative proposal, not measured productivity benefit. |
| Required writing / checks | PROCESS approximately 1053 body words; reflection bodies 253 / 241 / 219. Files and cited commits pass evidence check. | Word guidance is not a mechanical grading guarantee. Historical reflections were not rewritten as current feature claims. |
| Published main / live / CI | Earlier production `d5e524c` remains available; candidate checks are local. | At this stage main/Fly approval and the candidate CI/backup/deploy/live chain were pending; subsequent release evidence is separate. Production AI remains unauthorised. |

[Historical flight-loading measurements](historical-flight-loading.json) support the PROCESS's intermediate 18-to-zero interruption example. They identify earlier served bundles and are explicitly not a benchmark of current automatic travel.

## Preservation and publication boundary

8170 and 8171 used separate disposable test data. The existing 8152 backend, game database and paid-guide budget ledger were not replaced or reset by this check; 8098 and production were untouched. The small server repair is exercised on the isolated candidate, not claimed active in the already-running 8152 process. No credentials were read and no supplier calls were sent. Evidence excludes databases, cookies, internal identity hashes, private configuration and raw business logs. Subsequent development-branch packaging was followed by separate approval for the 8152 restart and main/Fly release. The release record records those later operations; they are not inferred from this local test result.
