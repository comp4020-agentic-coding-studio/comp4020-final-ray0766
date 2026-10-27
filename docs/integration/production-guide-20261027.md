# Production guide handoff — 27 October 2026

The author explicitly approved using the existing DeepSeek credential on the existing Fly backend, retiring local paid use and transferring the **remaining original budget**, without adding another US$1 allowance. This record describes that handoff and its release gates; current service availability is reported in the guide panel.

## One budget, one active backend

At handoff there were seven completed attempts, no pending requests, US$0.0017832 conservatively charged and **US$0.9982168 remaining**. A SQLite consistent backup preserved all request records, hourly timestamps, policy and charges. Both local paid ports were inactive. The local launcher was fenced before credential loading and its ledger halted; the production copy retains the original active flag. This prevents the two supported launch paths spending the same balance. The source credential remains private; it is not an application asset.

The 20,480-byte transferred file at `/data/guide-ai/trial.sqlite` passed integrity checking and matched SHA-256 `cb68d663e885acf5c443a492ea0c95757fbb228fa8c44a7063388d46d675c1b2` before activation. Production startup requires explicit deployment mode, the expected Fly app, this exact persistent path and a pre-existing trial row. It cannot initialise an empty production budget. Runtime writes will naturally change the file; subsequent validation compares accounting and integrity rather than expecting that initial hash forever.

The original cumulative US$1 cap, eight attempts per rolling hour per server-validated cookie identity, two-request concurrency limit, 500-character question limit, 256-token output bound, no automatic retries, conservative unknown charges and deadline remain: **1 January 2027 00:00 Australia/Sydney**. Only the current submitted question and public game instructions reach the pinned official DeepSeek endpoint; no saves, account identity, prior conversation or private messages are included. Clearing cookies is not prevented; the global ledger is the backstop.

Official Flash peak pricing rechecked on 27 October remains US$0.30/million input cache-miss tokens and US$1.20/million output tokens. The unchanged ledger reserves and settles at twice those rates, US$0.0202752 per bounded reservation. This is conservative application accounting, not a guarantee of a future supplier bill or other use of the credential. Model `deepseek-flash`, non-thinking streaming; [official pricing](https://api-docs.deepseek.com/quick_start/pricing/).

## Release and validation boundaries

The credential is supplied only through Fly's encrypted secret import on standard input. It is staged without enabling requests. First deploy the checked code with AI disabled using the existing CI, production database backup and release confirmation; only then enable the controlled production configuration. This avoids making the previous local-only server fail during the code rollout. Never roll back to that older server while leaving the production enable flag on. Preserve the game database, retained test profiles/buildings and the accounting ledger through deployment or recovery.

The earlier [987-test gate and desktop/narrow mock checks](guide-chat-panel-20261027.md) concern the chat revision. The final local gate passed 155 files / 991 tests, including the additional startup/ledger cases for production fencing and refusal to create a replacement trial; typecheck, full lint, client/worker build and evidence checks also passed. Real-provider acceptance is a separate post-deployment step, within this same budget, using retained test identities and only public/fictitious questions; no model-quality or latency result is inferred from the mocks. Failure simulation remains explicitly labelled and need not consume a real provider attempt. The CI run and runtime acceptance in the release handover identify the exact deployed SHA.

The research revision has 687 body words. PROCESS and Crit 8/9/10 retain their truthful historical descriptions; production approval does not retroactively change the earlier local-only phase.
