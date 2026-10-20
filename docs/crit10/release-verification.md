# Crit10 release verification

Prepared 2026-10-20 UTC / 2026-10-21 Australia/Sydney. This file records evidence, not a substitute for peer observation.

## Candidate and focused correction

- Canonical branch: `integration/midpoint`; previous production branch tip: `60d54ae9008db9f60659c7d040d2ed789122f2be`.
- Integrated loading notice: [`acb888c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/acb888c). The preceding Retina fix and arrival/quality work are retained.
- Retry mapping: [`3d9a1b1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/3d9a1b1). `POST /api/arrival/retry` now records `arrival.retry_requested`, including accepted 200 and refused 403. Acceptance means a request was accepted, not that home preparation completed.
- Red/green verification: four newly added unit/HTTP assertions failed with `api.unknown` before the one-line mapping fix. Afterwards both focused files passed, **10 tests**, in 4.86 seconds. Real HTTP checks used separate temporary databases, including an integrated arrival and a legacy owner/visitor pair. No production or 8098 data was used.
- TypeScript and lint for the three changed TypeScript files passed. Logging privacy, aliases, rotation, refusal classification and actual door results remain covered.
- The loading-notice commit was checked at 1920×1080 and 390×844 in English/Chinese, before the main module and in the welcome lifecycle. These isolated browser checks did not start the game renderer or prove device performance. Its earlier selected integration run passed 160 tests in 28 files; that is historical scoped evidence, not a replacement for this release's CI.

## Release procedure and confirmation

Production release is authorized. The [Checks workflow](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/workflows/checks.yml) runs the current main commit's full `pnpm check`, evidence and secret checks, then independently verifies a private volume backup before image deployment. Source code never replaces production with a test database. Current confirmation is the exact SHA's completed workflow and the live machine image, not this procedure alone.

The workflow run is the timestamped release ledger: inspect the current commit’s backup, check, deploy and release-confirmation steps to establish the terminal outcome. A documentation file cannot declare its own future workflow successful. The public targets are [app](https://comp4020-final-ray0766.fly.dev/), [health](https://comp4020-final-ray0766.fly.dev/healthz), and [README](https://comp4020-final-ray0766.fly.dev/readme/). No deployment was in progress when work began.

The local 8098 frozen release and its save database are outside this publication. Human observations remain in [the user report](peer-report.zh-CN.md); no timestamps or action transcripts have been invented.

## Confirmed first publication and bounded loading correction

The first Crit10 publication, [`7d48d2b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/7d48d2b), completed [CI and deployment run 39456054787](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/runs/39456054787) at 2026-10-20 16:22 UTC. All 127 default test files / 798 tests passed, as did type checking, evidence and both secret scans. Production backup `/data/release-backups/7d48d2b3dd5d-39456054787/before.sqlite` was schema 16, integrated, 2,715,648 bytes, integrity `ok`, zero foreign-key violations; its second read matched SHA256 `05e5fd02f1618f6fd25d55baa280589c4ecffe003e32caa042cf3fb7ace51e41`. The cutover reported that the database was already integrated, so it was not replaced. The workflow confirmed the new image and healthy integrated service; no recovery ran.

Read-only public verification found root, health and README at HTTP 200, with the built index and entry bundle matching the candidate byte-for-byte. It then exposed a real loading failure: Vite removes the source script's `id`, so the old bootstrap could not recognize a failed built module and reveal Retry. The device notice itself stayed visible. The focused [correction cec70b5](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/cec70b5) recognizes external module script attributes instead. Two new language cases failed before the fix; all 19 loading/welcome tests passed afterwards. Type checking, focused lint and a temporary production build passed. Actual built HTML passed four Chrome 155 cases (English/Chinese × 1920×1080/390×844), including module failure, persistent exact notice text and no horizontal overflow. No identity API was called.

This correction follows the completed first release; its current main workflow must also finish successfully. The [workflow ledger](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/workflows/checks.yml) is authoritative for the final SHA. A local Fly machine read was refused as `unauthorized`; it was not retried with the same credentials. Therefore direct local inspection of live journal files is not claimed. Backup/schema and image confirmation come from the existing authorized release workflow, with public page checks kept separate.
