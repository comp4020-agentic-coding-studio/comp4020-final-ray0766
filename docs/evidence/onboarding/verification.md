# First-visit guidance — local verification, 2026-10-07 UTC

Scope: independent branch/worktree `final-onboarding`, committed base
`13a3e1e008e462dea499e084929d9c1eb680f230`. The entry patch was applied only to a
throwaway archive under the macOS temporary directory for the build/browser
checks. The branch's `src/client/main.ts` remains unchanged for parallel work.

## Checks actually run

- Full `tsc --noEmit`: passed, including the temporarily assembled entry patch.
- Targeted ESLint for the onboarding module, unit/browser tests and isolated
  Vitest config: passed.
- `vitest run --config vitest.onboarding.config.ts --configLoader runner`:
  **12 passed**. Tests cover acknowledged claim/build progression, failed-save
  non-progression, visitor/second-home guidance, skip preserving build controls,
  modal/offline suppression, help reopening, storage denial and timer disposal.
- `vite build --configLoader runner`: passed, **140 modules** transformed.
- Entry patch `git apply --check` and whitespace check: passed.
- One Chrome worker and one context, `tests/e2e/onboarding.spec.ts`:
  **1 passed, 41.2 s** (runner total **44.6 s**). Actual controls drove walking to
  the harbour gate, flight to a blank world, claiming, preview placement, skipping
  tips while retaining the draft, saving one tree, reopening tips in How to play,
  returning to the beacon, cancelling boarding with Stay here and Escape, and
  launching. There were **no pageerror events**. No API travel shortcut, cookie
  export or injected ownership/player state was used.

The desktop start and first-build screenshots show the world visibly rendered.
At **1600×1000**, claim/build control hit tests passed. The same touch-enabled
context was resized to **390×844**; Save, Cancel, Done and Board control centre
hit tests passed, and the page width remained 390 px. This is viewport/touch
emulation, not a measurement of a physical phone.

Environment: Node **24.19.0**, Google Chrome **154.0.8037.98**, macOS **27.0.1**,
arm64. No performance claim is inferred from the test duration.

The server listened only on `127.0.0.1:8104`, using
`/tmp/final-onboarding-browser-20261007/world.sqlite`. It did not use the main
`.data` or any production database. The browser context was closed in `finally`;
the test runner exited, the server was stopped, and `lsof` showed no listener on
8104 before the parent task was told the browser slot was free.

## Screenshot review and remaining integration check

- `desktop-arrival.png`: short route cue below the location line; harbour and
  player visibly rendered.
- `desktop-first-build.png`: help follows the kit and saved-object selector;
  Done remains at the top of the build panel.
- `phone-preview-controls.png`: Save / Cancel and Done are visible and hit-tested;
  help continues below them inside the scrollable panel. The Skip button was
  reached by scrolling and did not cancel the unsaved preview.
- `phone-boarding-notice.png`: the real boarding control is visible, but Find my
  ship's notice is still present. The guide intentionally yields to this notice.
  **This screenshot does not validate the visible boarding-tip layout.**

Review found that the first browser run waited only for `data-step="board"`,
which can remain set while the guide is hidden for a notice. The final browser
spec now also waits for the tip to be visible before the Board hit test and
screenshot. **That added visibility assertion has not been run.** The parent
explicitly requested no further Chrome run and will verify the 390 px boarding
card after the notice disappears in the combined integration smoke test.

No deployment, full suite, 393-check sentinel, reflection/PROCESS edit, art
change, package installation or production data mutation was performed.
