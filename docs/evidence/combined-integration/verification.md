# Combined local integration verification

Date: 2026-10-07 (Mac local clock; 2026-10-06 UTC). Worktree:
`/Users/ray/Desktop/Study/ANU-Master/8020/final-workshop-v1`, branch `final/workshop-v1`.

## Integrated commits and entry patches

| Worker/source | Local integration |
| --- | --- |
| Movement review | Existing `862fa4c` retained unchanged |
| Save recovery `798f145` | `f6222e4` |
| Build UX `95fcb5b` | `bcc6986`; separate M-key patch in `a0df873` |
| Multiplayer sync `84ddfae` | `a4809b1`; required main patch in `a5cf061` |
| First-visit tips `1f7a66e` | `cf38f7c`; two-line main entry included with this verification |

The worker cherry-picks were conflict-free, including the separate Colony input
and synchronization hunks. The onboarding entry patch did not apply verbatim
because its import context predated the new sync import. Its import and single
mount call were inserted manually and reviewed; no other onboarding entry change
was made. M-key input isolation, player/presence guards, both camera diagnostic
lines and the bounded movement fix are present together.

No new recovery or physics behavior was added while integrating. In particular,
a real movement conflict is still shown and rejected by the server. The existing
reconnect path recovers it and replaces/expires the old message. Source art,
models, presentation defaults, schema, approved reflection and PROCESS were not
changed in this integration. Earlier local PROCESS edits remain as they were.

## Checks actually run

Node 24.19.0, the repository's existing dependencies, and a fresh temporary
SQLite test database served on `127.0.0.1:8105`:

```sh
APP_URL=http://127.0.0.1:8105 node node_modules/vitest/vitest.mjs run \
  spec/save-recovery.test.ts spec/blueprints.test.ts spec/ships.test.ts \
  spec/terrain.test.ts spec/history.test.ts spec/planets.test.ts \
  spec/invariants.test.ts spec/build-ux.test.ts spec/door-step.test.ts \
  spec/multiplayer-sync.test.ts spec/presence-client.test.ts \
  spec/presence.test.ts spec/onboarding.test.ts \
  --no-cache --configLoader runner --reporter=verbose
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vite/bin/vite.js build --configLoader runner
node scripts/check-evidence.ts
git diff --check
```

All **13 files / 77 tests** passed. Typecheck, lint, production build (141 modules),
evidence and whitespace checks passed. Earlier integration subsets passed too:
55 save/UX/physics checks and 22 sync/presence/UX/physics checks. These are overlapping
runs, not additional unique tests. No full suite, long stress run or 393 sentinel
was run.

## Combined actual Chrome smoke

```sh
APP_URL=http://127.0.0.1:8105 node node_modules/@playwright/test/cli.js test \
  tests/e2e/integration-smoke.spec.ts --headed --trace off
```

Actual installed Chrome **154.0.8037.98**, one worker, two independent browser
contexts. The owner viewport began at **1600×1000** and changed to touch-enabled
**390×844**; the visitor used **1000×700**. These are Mac browser viewport checks,
not physical-phone testing. All application writes used newly created temporary
test databases; the existing 8098 world and live service were not used.

The passing replay completed in about **1.3 minutes** (runner total **1.4 minutes**),
with **no page errors**. The executed assertions cover:

- Visible scene rendering; Skip tips and How to play restore; two independent
  visitors visible through actual presence; real keyboard walking and flight.
- Real claim and workshop controls. Save an unplaced floor blueprint, add a second
  floor through the UI, save version 2, refresh and recover both geometry and Fern
  character. No object placement is required for that successful second save.
- Text input containing movement/action/map keys; M and Ctrl+M in the builder's
  select; R in the select while a real preview exists. These leave their unrelated
  actions unchanged.
- Two-identity recovery: hold an old visitor universe reply and a real movement
  request, create an owner-only lamp through the normal authenticated API, then
  let the stale movement reach the actual server. The response is a real **409**
  (`A newer ground position exists...`), not a fabricated route response.
  Reconnect accepts authoritative state before the older universe reply is
  released. The scene then reaches the new revision, the next movement saves
  with 200, the obsolete conflict notice is replaced by the recovery message,
  and a visitor delete attempt still returns **403**. The owner removes this
  temporary fixture before the first-build UI check.
- At 390 px, touch placement, declining draft cancellation, skipping/reopening
  tips without losing the draft, saving one tree, and returning to the ship.
  The test explicitly waits for Find my ship's notice to disappear, then asserts
  the boarding tip is **visible**, inside the viewport and centre-hit-testable;
  the Board button is also hit-testable. Page width remains 390 px.
- Stay here and Escape each cancel boarding. A real subsequent launch completes
  the guidance and hides the card.

`result.json` is the replay's recorded outcome. All four final screenshots were
visually inspected. `phone-boarding-visible.png` shows the complete Ready to board
card below the unobscured Board button; `desktop-visitor-recovered.png` shows the
recovery notice rather than the stale conflict. This closes the onboarding
worker's explicitly unrun visible-card assertion.

### Retained first attempt

The first combined run stopped at the blueprint version assertion after about
1.1 minutes. The driver used `selectOption('1')`, which matched the displayed
label "1" (value 0), leaving the original cell selected. The UI correctly rejected
the overlapping floor, and idempotent saving correctly retained version 1.
`first-attempt/` retains the actual failure result and screenshot. The driver now
selects `{value:'1'}`, verifies that value and checks for two parts before saving.
No application code or save rule was changed for this replay. This is one failed
driver attempt followed by a passing bounded replay, not a single all-green run.

## Retention and release boundary

Browser contexts close in `finally`, first navigating to `about:blank`; the Chrome
runner exited. The owned 8105 server was stopped. No browser cookies or storage
state are exported or committed. Temporary test databases remain outside Git.
The single launchd preview at `http://127.0.0.1:8098` is retained and restarted to
load this local build with its original database.

The original untracked `tests/e2e/crit8-update-live.spec.ts` remains excluded from
staging, with SHA256
`b3e8bdf427e4fb9569cc7aa7a631860b42848dab0a8a2fdc588d591ef970341c`.
Public main remains the frozen Crit 8 release `09233d9`; no push, release workflow,
production migration or deployment was performed. Art/model redesign and release
preflight work are outside this completed local integration.
