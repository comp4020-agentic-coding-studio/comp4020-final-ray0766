# Local live-guide trial — 25 October 2026

This records the authorised **local-only** trial on <http://127.0.0.1:8152/?measure=1>, developed on `integration/midpoint`. Its initial verification made no commit, push, production deployment or production data change. Later development-branch packaging includes the implementation and this record, not its credentials, trial ledger or production enablement. It supersedes the AI-off status in the earlier [local close-out](final-local-readiness.md); those earlier checks remain historical facts.

## Player experience and data boundary

Open Sprout with Space / Guide. The stationary, scene-anchored conversation now offers **Ask AI** and **Use fixed help**. Before sending, the interface explains that Ask AI sends only the current question and public gameplay instructions to DeepSeek. It sends no previous conversation, player cookie/identity, saved world or private messages. Topic buttons and fixed help stay local. There is no background provider call on opening the guide. The reply streams into the same bubble; Stop reply and closing the conversation cancel pending work. Switching language cancels an outstanding response.

Real replies, incomplete replies and fixed failure fallbacks are labelled separately. The model has no tools or game-state mutation capability. It may give incorrect advice; the tested prompt explicitly rejects unknown features and claims of having operated the game. This is not a guarantee against all hallucinations or prompt attacks.

## Persistent limits

- Each existing server-validated browser identity may start **8 upstream calls per rolling 60 minutes**, across tabs and server restarts. The interface shows remaining attempts and the earliest slot recovery time. It is a rolling window, not a reset on the hour.
- Empty/invalid questions, invalid identity, refused duplicates, full concurrency and exhausted quota/budget do not start upstream calls. A request cancelled before upstream starts releases its reservation. Once upstream starts, failure or Stop counts once; there is no automatic retry. Request IDs and short pending/content deduplication prevent accidental duplicate calls. A deliberately new request later is a new question.
- The shared trial cap is **US$1**, including acceptance tests. A separate SQLite ledger atomically reserves the worst bounded request cost before fetch. At most two upstream requests may be in flight globally. After the authorised December extension, each new reservation is **US$0.0202752**, using 32,768 input tokens plus 256 output tokens at twice the currently verified peak rates. The original five acceptance calls retain their original accounting; they are not reset or repriced. Serialized requests are capped at 8,192 UTF-8 bytes, questions at 500 characters, and replies at 256 tokens, with a 20-second deadline and bounded stream parsing.
- New valid reported usage settles at twice the peak cache-miss rate verified on 25 October, without cache/off-peak discounts. This keeps the safety margin in cumulative accounting rather than releasing it after each call. Failures, missing usage, disconnect uncertainty and abandoned reservations retain the full reserved amount. Restart does not clear spending. Calls stop when another reservation cannot fit, so some unspent balance can remain. A usage-bound violation halts further calls for review.
- Clearing cookies can create another anonymous identity. This is not fingerprinting, account authentication or absolute abuse prevention; the persistent global budget limits aggregate exposure. The ledger records internal identity keys, request IDs, message digests, state, token usage and timings, but no questions, answers, raw cookies or credentials. It is private local runtime data, not a public business log.
- This is conservative local token/price accounting, **not a guarantee of the supplier's billing**. The authorised trial ends at **1 January 2027, 00:00 Australia/Sydney (UTC+11)**, equal to **31 December 2026, 13:00 UTC**, covering all December locally. The former 1 November cutoff was a locally chosen review date, not a model retirement notice. It has been removed; the date is now explicitly a trial deadline, not a claim that future prices were verified. Do not reset/delete the ledger, extend the deadline or add budget without new approval.

## Provider and configuration

The model is `deepseek-flash` with `thinking: {type: "disabled"}`, streaming and usage reporting explicitly enabled. Official prices checked on 25 October 2026 list peak cache-miss input at US$0.30 per million tokens and output at US$1.20 per million. The latest official changelog states that the 17 October Flash update kept model pricing unchanged. The announced 1 November Search/Fetch billing change concerns separate tools not used by this guide. No scheduled Flash price increase was found in the checked pricing page or changelog; the provider nevertheless reserves the right to change prices. Future local accounting uses US$0.60/million input and US$2.40/million output as a **2x safety assumption**, not an official tariff. Changes beyond that margin, token-accounting anomalies or other uses of the same provider key can defeat any claimed provider-wide dollar ceiling. The local US$1 cap itself remains strict under this accounting, including atomic pre-reservation and restart persistence. Sources: [official changelog](https://api-docs.deepseek.com/updates/), [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) and [chat-completion API](https://api-docs.deepseek.com/api/create-chat-completion).

The endpoint is pinned to `https://api.deepseek.com/chat/completions`, with redirects rejected. The app reads `GUIDE_AI_ENABLED`, `GUIDE_AI_LEDGER_PATH` and `DEEPSEEK_API_KEY` from the backend process environment. Enabling requires `HOST=127.0.0.1`; default configuration remains disabled. `GET /api/guide/status` exposes non-secret availability to a valid identity; `POST /api/guide/ask` validates identity, origin, appearance readiness and question structure, then streams bounded NDJSON to the client. The older fixed/mock `/api/guide/help` remains available.

The authorised local launcher is `/Users/ray/Documents/Codex/2026-10-21/task/guide-live/start-live.mjs`. It loads the existing user-filled `/Users/ray/Documents/Codex/2026-10-21/task/private-config/deepseek.env` directly into the backend environment without copying, echoing or returning its value. No credential was added to the repository, browser bundle, logs or evidence. The trial ledger is `/Users/ray/Documents/Codex/2026-10-21/task/guide-live/trial.sqlite`; the game database remains the existing `camera-validation/runtime/camera.sqlite`. Neither file is a repository deliverable. The server is a detached loopback-only process; process metadata contains paths and status, not secrets. Stopping the local preview stops availability; re-enabling must reuse this ledger.

## Verification actually performed

**31 tests in five explicitly selected files passed in 6.13 seconds:** `guide-ai`, `world-guide`, `guide-interaction`, `scene-shortcuts`, and `business-log-api`. TypeScript, repository ESLint, client build and worker build passed. No default full-suite run was attempted.

New ledger/provider tests cover the eighth/ninth call, rolling slot recovery, persistence across connections/restart, last-affordable-call reservation, duplicate/conflicting requests, concurrency, empty/oversized/private extra data, official payload shape, failure/unknown charging, cancellation before/after upstream, missing usage, bounded prompt and price/usage fail-closed behavior. Atomicity is also protected by SQLite `BEGIN IMMEDIATE`; the test uses competing connections, not a production load benchmark.

Installed Chrome 155, 1920×1080 and 390×844 touch emulation, isolated cloned game data on 8168: disclosure before explicit send; streamed scene replies; double click sends once; fixed help sends nothing; mock upstream failure gives labelled fallback; Stop counts; eighth accepted/ninth refused; another tab and refresh share quota; invalid identity refused; backend restart preserves quota; separate exhausted mock ledger disables AI while fixed help remains usable. The mock ledger was never substituted for the real trial ledger. These are desktop-browser checks, not physical-phone performance measurements.

**Five actual official-provider attempts** used independent acceptance identities and public/fictitious questions. All five have completed usage records. Conservative aggregate cost was **US$0.0010044**, leaving **US$0.9989956** before user trial activity. No further provider calls were made for the final 8152 health check.

| Actual attempt | First non-whitespace content | Total server stream | Result |
| --- | ---: | ---: | --- |
| English ship/visit help | 876 ms | 1,114 ms | Correct automatic-flight help visible in the scene |
| Unknown feature / override prompt | 892 ms | 1,209 ms | Server completed; browser response-body capture failed, so answer content is not claimed verified |
| Additional unknown/override inspection | 836 ms | 1,115 ms | Refused combat/erasing another world and did not claim an action |
| Chinese return help | 721 ms | 965 ms | Unnecessary two-step return advice exposed prompt ambiguity |
| Chinese return after prompt clarification | 547 ms | 789 ms | Correctly offered direct Return to my home |

The browser capture failure was inspected against the ledger before any additional call; it was not blindly retried. The Chinese wording defect and repair are retained here rather than describing every initial answer as correct. First-content figures are measured by the local backend receiving non-whitespace provider content; they are not browser paint times or provider-only latency. These five short calls do not establish a stable service-level guarantee. The final Chinese browser round trip was 1,358 ms.

## Local evidence and preservation

Evidence root: `/Users/ray/Documents/Codex/2026-10-21/task/guide-live/`.

- `tests-final.log`, `types-final.log`, `lint.log`, `build-final.log`, `worker-final.log`: scoped checks.
- `browser-mock/result.json`: desktop/narrow mock integration, quota, cancellation, identity, restart and exhaustion checks.
- `browser-live/result.json`: first successful real answer followed by the browser capture error.
- `browser-live-finish/result.json`: inspected unknown-feature answer and initially ambiguous Chinese return.
- `chinese-corrected/result.json`: corrected Chinese response and timing.
- Screenshots beside those reports show the game only. They have not been copied into the previously refused repository evidence folders.
- `preview-before.sqlite`, `preservation-before.json`, `preservation-after.json`, `preview-checks.json`, `final-check.json`, `preview-process.json`: original game backup, data/build/health/process checks and private runtime metadata.

The original 8152 database is reused, backed up consistently and checked table by table. No test identity or acceptance question is inserted into it. The separate quota ledger carries acceptance cost into the live trial. Production, 8098 and protected author-review PROCESS/research/reflections remain unchanged. Room wall cutaway remains an unresolved visual decision; the default full test suite and refused repository screenshot archival remain outside this approval. No new game features were added beyond the authorised guide trial.

A temporary staging-directory creation at the canonical repository's `guide-live/staged` path was denied by the filesystem before executing. It was not retried there; staging used the designated task workspace. This did not block the authorised source edits or local trial.


## December extension verification

The user explicitly requested coverage through December after the initial trial was delivered. Only the deadline, conservative future accounting, known-policy migration, expiry label and current instructions changed. The model, endpoint, hourly allowance, concurrency, prompt/token bounds, cumulative US$1 cap and fixed fallback did not change. The constructor accepts only the exact recognised legacy policy for an atomic policy-only update; it preserves every request, existing charge, hourly timestamp, pending state and halted flag. Unknown policies or altered caps still refuse startup.

`guide-live/december/tests.log` records **16 passing guide-specific tests**, including both sides of the exact Sydney cutoff, continued availability on 1 November and late 31 December, preserved legacy request rows/charges/halt state across migration and restart, rejected unknown policies/caps, and the unchanged quota/concurrency/budget regressions. Typechecking, changed-file lint and the client build are checked separately. This extension makes **no real provider request**. It does not rerun the full application suite or browser gameplay tour.

The update uses the same owned 8152 process entry, original game database and cumulative trial ledger. `guide-live/december/` contains consistent pre-update game/ledger backups, request/table hashes, a metadata-only migration comparison and final health/resource checks. No secret values are included. The earlier five-call latency/cost observations above remain historical; this extension adds no new latency claim. The preview runs locally while the Mac/server is available; the deadline does not promise uninterrupted uptime or provider availability.
