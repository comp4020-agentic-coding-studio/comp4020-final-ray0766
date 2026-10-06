# Save and build UX integration

Date: 2026-10-07 (Mac local clock). Development worktree: `final-workshop-v1`, branch `final/workshop-v1`.

Applied the reviewed save worker commit `798f14590f8f32d4582186d06e61f44589d29668`
as `f6222e4`, then UX worker commit `95fcb5baf71e764e06665d2c975ee78e9a5bb742`
as `bcc6986`, on top of movement review `862fa4c`. Both cherry-picks were conflict-free.
Applied the UX worker's separate `main.ts` keyboard patch after `git apply --check`:
M opens the map only outside editable controls and dialogs, and ignores modified,
composing, repeated and already-handled key events. Existing camera pose diagnostics
and the bounded ground slide change remain intact.

## Integration checks actually run

Node v24.19.0, a temporary server at `127.0.0.1:8105`, and a newly created
`/tmp/final-integration-save-ux.*` SQLite database. The existing 8098 world was not
used for HTTP test writes. Fault injection remains confined to the unit fixtures.

```sh
APP_URL=http://127.0.0.1:8105 node node_modules/vitest/vitest.mjs run \
  spec/save-recovery.test.ts spec/blueprints.test.ts spec/ships.test.ts \
  spec/terrain.test.ts spec/history.test.ts spec/planets.test.ts \
  spec/invariants.test.ts spec/build-ux.test.ts spec/door-step.test.ts \
  --no-cache --configLoader runner --reporter=verbose
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vite/bin/vite.js build --configLoader runner
node scripts/check-evidence.ts
git diff --check
```

All **9 files / 55 tests** passed, as did typecheck, lint, build, evidence and diff
checks. This is a targeted suite, not a full-suite or release validation.

## Browser evidence provenance and limits

The four PNGs in this directory are copied unchanged from the UX worker's
`/tmp/final-build-ux-evidence` handoff. They show that worker's desktop placement
and invalid-preview views, and phone invalid-preview and unsaved-name views.
The coordinating parent reported the worker's actual Chrome flow passed. They
are **not** a new browser run against this combined branch. No Chrome session was
opened during this integration; the shared browser slot belongs to the other
workers. Saving changed, unplaced geometry still needs the final combined browser
smoke check after all workers are integrated.

No schema, art, publication, approved reflection or course-process document was
changed. The pre-existing untracked `tests/e2e/crit8-update-live.spec.ts` is retained
and excluded from staging; SHA256 remains
`b3e8bdf427e4fb9569cc7aa7a631860b42848dab0a8a2fdc588d591ef970341c`.
No push, release preflight, migration or deployment was performed.
