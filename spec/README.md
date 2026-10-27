# The spec

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
and its spec are on the course website, along with the specs for crits 8, 9 and
10, which run in this repo. The brief poses the problem; the spec is the fixed
contract.

## What ships

`invariants.test.ts` checks the two things the course relies on:

- `/` answers with a 200, which is what the deploy and the crit capture read
- `/readme/` publishes `README.md`. Markdown renderers all differ slightly, so
  it checks the README's headings rather than every word: each one has to
  appear, in order, in the HTML the server sends, since no script runs. Render
  it however you like, as long as it's there in full; the marker reads it there.

Both run against the **running** app over HTTP, so they hold whatever it's built
with. In CI that app is the image your `Dockerfile` builds, started with a
throwaway `/data`, and a red run blocks the deploy. Locally, start the app
however you run it and `pnpm check` finds it at `APP_URL` (default
`http://localhost:8080`). Keep them; don't delete them.

## Your checks

Everything else in `spec/` is yours to write. Any `spec/*.test.ts` runs with
`pnpm check`, against the same running app. Some lines of a spec only a person
can judge; those are left to the crit and the marker.

The exception is the legacy HTTP suite listed in `vitest.config.ts`
(`api`, `blueprints`, `planet-api`, `boarding-api`, `history`, `save-recovery`,
`terrain`). Those specs check the original contract, where a new identity
arrives without a home, which the deployed world no longer has. `pnpm check`
runs them in a second project against their own legacy test world, started
from this checkout on a free port with a throwaway database
(`spec/legacy-world-setup.ts`). It runs one file at a time and refuses to start
if the server is not the legacy world.

Twenty specs whose subject is camera code the game does not run are kept but
left out of `pnpm check`: the v11 ground camera rig, the cutaway rig, frame
certification and town cutaways (listed in `vitest.config.ts`). The game builds
neither rig, never certifies a frame and leaves the cutaway switch off; several
of these specs replay captures from a town the main planet replaced, and one
replays pole travel for over twenty minutes. `pnpm test:disabled-camera` runs
them.

The normal gate caps file-level concurrency at two because several specs generate
CPU-heavy collision-checked worlds and some start preparation workers. This limits
resource contention without changing test inclusion, isolation or deadlines; the
legacy HTTP project remains sequential. Heavy-work fixtures clean up only the
temporary stores and bundle directories they create.

At a crit, a green `check` job is half the shipped mark, but it's never the
judgement of the work: your tutor checks what you deployed against the published
spec.

The original courier continuous-envelope oracle is retained with its pinned
`spec/fixtures/original-courier.ts` subject from `d5e524c`. Its hash, geometry
counts and strict bounds are unchanged; it is historical coverage, not evidence
that the new traveller fits every camera. Current traveller checks are in
`character-sample`, `appearance`, `first-character` and `legacy-ground-camera`.

The [Final verification record](../docs/evidence/final-hd/verification.md) keeps
the first full-run failures, fixture corrections, the door-revision falling
regression, and the boundaries of current browser evidence.

The right-side guide-chat revision is covered by `guide-conversation`,
`guide-ai`, `guide-interaction`, `world-guide` and `scene-shortcuts`. Free-text
questions use the enabled model endpoint; fixed help remains a separate local
section. These provider tests use mocks and do not enable production AI or
prove real model answer quality. The [revision record](../docs/integration/guide-chat-panel-20261027.md)
separates scoped/browser checks, the subsequent full gate, and publication status.

Production startup checks in `guide-config` require the explicit app/path configuration and an existing transferred ledger. `guide-ai` refuses an empty ledger in production mode; none of these tests contacts the provider.
