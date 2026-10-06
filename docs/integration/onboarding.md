# First-visit context tips: local integration

Base: `13a3e1e`. The module adds optional help for departure, first claim,
first placement and the walk back to the parked ship. It changes no game rules,
server routes, databases, art or presentation defaults.

## Integrator's two-line entry patch

Apply `docs/integration/onboarding-main.patch` after the module commit. It imports
`mountOnboarding` after the existing host CSS and mounts it once after Colony is
created. `main.ts` itself is intentionally unchanged in this commit. Check the
patch against the integration branch before applying; movement work in `main.ts`
may require manually inserting its two added lines. No Colony or flight edits are
needed. The read callback supplies the acknowledged universe, current flight
mode, build mode, proximity and connection state.

## Behaviour and boundaries

- A single card moves into Pause, Atlas, the end of the builder or the boarding
  prompt. On ordinary ground it occupies a small dismissible area below the
  location line. It yields to notices, delivery, unrelated dialogs and workshops.
  There is no new navigation bar, modal tutorial or forced task order.
- Actions call existing Pause / Atlas / Find my ship buttons. The guide never
  claims, saves, travels or launches for the player. Read-only sampling runs
  every 250 ms, with no network request; dispose removes the timer and DOM.
- Steps use acknowledged ownership and object counts. A ghost preview or failed
  save cannot mark the first build complete. Completion waits for a subsequent
  takeoff. Existing owners with saved objects do not get tips automatically.
- Skip tips stores only a local preference (`little-worlds:first-visit:v1`) and
  returns focus to an existing control; it does not close the builder or cancel a
  draft. How to play can re-enable tips at the current state. Unavailable storage
  falls back to the current page. No cookies or session identifiers are inspected.
- All added CSS colours use `presentation.css` tokens. No warm sample, palette,
  material, model, lighting or shared layout is changed.
- Build help is appended after existing controls in normal document flow.
  Save, Cancel and Done retain their order and click targets; the panel scrolls.

## Targeted checks

`node node_modules/vitest/vitest.mjs run --config vitest.onboarding.config.ts --configLoader runner`
runs only the guide's DOM/state tests, with no HTTP setup or database. Run
`node node_modules/typescript/bin/tsc --noEmit` and
`node node_modules/eslint/bin/eslint.js src/client/onboarding.ts spec/onboarding.test.ts tests/e2e/onboarding.spec.ts vitest.onboarding.config.ts`
for the type/lint checks. The normal repository suite still includes the guide
tests. No full suite or 393-check sentinel is needed for this change.

Browser integration must be scheduled by the parent task, one worker on 8104,
with a new temporary DATABASE_PATH. Verify a visibly rendered world, skip/help
return, claim/build/return-to-ship controls and lack of overlap at desktop and
phone viewport sizes. A jsdom pass is not a visual-browser pass. Keep the existing
main `.data`, art source and production release untouched.


## Local verification (2026-10-07 UTC)

- Base commit existence verified; the independent `final-onboarding` worktree
  starts at `13a3e1e008e462dea499e084929d9c1eb680f230`.
- 12 guide DOM/state tests passed. Initial test setup failed because jsdom's
  `import.meta.url` did not supply a file URL; reading the repository's
  `index.html` fixture from the test root repaired that setup.
- Full TypeScript check and targeted ESLint passed, including the entry patch
  assembled into a temporary copy. Vite production build passed (140 modules).
  `git apply --check` passed; the branch's shared `main.ts` has no edits.
- Browser details and screenshot review are recorded in
  `docs/evidence/onboarding/verification.md`. These checks exercise a local
  candidate, not a deployment or physical phone.
- The pnpm wrapper tried to bootstrap dependencies into the protected worktree
  and was denied; checks used the existing Node binaries directly. No package
  installation, lockfile update, sentinel or full suite was run.

Conflict surface: `docs/player-guide.md` may need a prose merge with documentation
updates. `main.ts` has only the separately supplied two-line entry patch, which
must be placed around any concurrent movement edits. All other source, CSS,
configuration and test paths in this change are onboarding-specific. The change
contains no Crit 8 reflection, PROCESS, database, cookie or art-source file.
