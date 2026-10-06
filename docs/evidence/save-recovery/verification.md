# Save recovery verification

Date: 2026-10-07 (local execution clock). Base: `13a3e1e008e462dea499e084929d9c1eb680f230`.
Branch/worktree: `final-save-recovery`.

## Reproduced failures

On the unchanged base, the new `spec/save-recovery.test.ts` reported **8 failed,
4 passed**. Editing a saved blueprint's geometry before placing it, or after
removing its final placement, failed with `Blueprint content is immutable`.
Concurrent HTTP saves of that edit returned `[500, 500]`.

The save path still attempted to delete content absent from the current library
and object tables. Schema 8's history migration makes that content append-only:
old history events and snapshots can still refer to it. The failed cleanup
rolled back the otherwise valid new library document.

Temporary-database `RAISE(ROLLBACK, 'injected save failure')` triggers also showed
that blueprint, ship and terrain saves replaced the original error with
`cannot rollback - no transaction is active`.

## Change and retention

- Remove only the obsolete content deletion from blueprint save. Keep existing
  immutable triggers, hash deduplication and private library limits. Previously
  saved geometry stays available after the last placed instance is removed.
- Roll back a failed blueprint, ship or planet transaction only when SQLite
  still has an active transaction; retain the original failure if SQLite has
  already rolled it back.
- No schema/version change, new retry protocol, GC system, API shape change,
  presence/client change or asset change.

Content retention follows the existing history contract. Repeated identical
content is deduplicated by hash; distinct saved geometry continues to accumulate.
The 24-entry library cap does **not** bound historical content. No retention cap
or deletion policy is introduced here. A regression replays the original
geometry after deleting its last object and editing its library entry.

## Checks actually run

Node `v24.19.0`, Vitest `5.0.1`; local server on `127.0.0.1:8103` with an explicitly
created `/tmp/final-save-recovery-api.*` SQLite database. All fault injection and
lock contention used `:memory:` or newly created `save-recovery-*` /
`save-contention-*` directories under the OS temporary directory. No existing
application database or production service was opened.

```sh
APP_URL=http://127.0.0.1:8103 node node_modules/vitest/vitest.mjs run \
  spec/save-recovery.test.ts spec/blueprints.test.ts spec/ships.test.ts \
  spec/terrain.test.ts spec/history.test.ts \
  --no-cache --configLoader runner --reporter=verbose
```

Result: **5 files, 37 tests passed** (including all 12 new regression tests).
The new tests cover late `ABORT` and automatic `ROLLBACK` failures in all three
save paths, unchanged durable rows after failure and reopen, successful retry
without duplicate versions, SQLite write locks across two connections, stale
draft conflicts, duplicate HTTP blueprint/ship submissions and immutable history
references. Schema remains 9 and integrity checks return `ok`.

```sh
APP_URL=http://127.0.0.1:8103 node node_modules/vitest/vitest.mjs run \
  spec/invariants.test.ts spec/planets.test.ts \
  --no-cache --configLoader runner --reporter=verbose
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vite/bin/vite.js build --configLoader runner
node scripts/check-evidence.ts
git diff --check
```

Result: **2 files, 6 tests passed** (two course checks and four planet checks);
typecheck, lint, build and evidence checks passed. Total: **43 targeted tests**.
The full suite, release restore tooling and 393 sentinel were not run.

## Integration

Production changes are limited to `src/server/blueprints.ts`,
`src/server/ships.ts`, and the shared transaction catch in `src/server/planets.ts`.
The latter also serves existing object writes, covered by planet/history tests.
The new test and this evidence file have unique paths. There are no client,
movement/camera, presence, art, release, or schema edits to resolve.

The coordinating task explicitly waived a separate Chrome run for this backend
patch; it will recheck saving an edited, unplaced blueprint after integration.
No browser session was created. The local 8103 test server is stopped before
handoff. No push or deploy was performed.
