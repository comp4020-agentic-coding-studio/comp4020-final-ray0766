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
