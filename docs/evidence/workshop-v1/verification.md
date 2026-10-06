# Local Final workshop-v1 verification

This is a local implementation record, not a student reflection or deployment
claim. Baseline: published `main` at `09233d9`. Development branch:
`final/workshop-v1`; recovery tag: `release-before-workshop-20261006`.
The source repository and the prior Crit 8 release were not modified by this work.

## Results

- TypeScript, ESLint and production Vite build passed. Imported source files
  remain byte-identical to the 31-file Claude snapshot at `db79d7350decb4167d12e1a980a293cdb77cea83`.
  ESLint allows intentional underscore destructuring only in the vendored folder.
- The first unit/API run passed all 25 existing tests and three new tests; two new
  tests had fixture/assertion errors (a blank-planet selector included the harbour,
  and the ungrouped example was smaller than 2 KiB). Both test errors were repaired.
  The focused blueprint run then passed 5/5. After adding a disk migration/reopen
  test and robust request byte assembly, the final affected run passed **6/6**.
  The 31 cases have passing evidence across those runs; this is not described as
  one final all-green full-suite invocation.
- New coverage includes full names/groups, canonical content hashes, identical
  retries, stale version conflicts, malformed/oversized documents, finite grid
  constraints, library limits, owner-only placement, private library isolation,
  immutable placed geometry, overlap/landing clearance, visitor create/update/delete
  refusal, per-route HTTP limits, same-origin checks and cookie requirements.
- A consistent copy of the actual local schema-4 database was migrated first.
  Immediately afterward, every original column and row matched: 99 players,
  42 planets, 24 placed objects, 50 visits, five tombstones. A subsequent check
  after API/browser tests still matched all original players, owned planets,
  placed objects, visits and tombstones. Tests had legitimately claimed six
  previously blank planets in the **working copy**. Integrity is `ok`, with no
  foreign-key errors. [Counts only](migration-result.json); no session data included.
- Real installed Google Chrome, headed, on this Mac: one desktop 1920×1080 journey
  and one 390×844 phone context. The first journey stopped on an incorrect driver
  assertion (`Added` versus the editor's `Add Floor deck…`); the application had
  successfully added the part. The focused continuation reused the isolated owner
  and passed the complete workshop milestone in about 1.2 minutes.
- That journey actually flew and landed, claimed a home, edited/named/grouped,
  added/undid/redid a part, saved, tested offline recovery and a genuine version
  conflict, saved a copy, placed/rotated, refreshed, and retained the library.
  An independent visitor flew to the same planet, saw the structure and received
  403 for all three object mutation routes. The owner then used phone controls to
  save/place and refresh. No page errors. [Journey result](browser-result.json).
- Screenshot inspection found the first interior camera partly blocked by a door
  frame. It was moved inside the actual open doorway and widened to 74°; Frame
  model restores 44°. A small desktop/phone replay after server restart passed:
  both structures and grouped library remained, L2/interior framing rendered, and
  closing/reopening disposed the old WebGL context and left exactly one workshop
  canvas. [Final focused result](focused-result.json).

## Screenshots actually inspected

- [Desktop L2](desktop-workshop-l2.png) and [cabin interior](desktop-cabin-interior.png).
- [Phone L2](phone-workshop-l2.png) and [cabin interior](phone-cabin-interior.png).
- [Desktop placement](desktop-placed.png), [phone placement](phone-placed.png),
  [visitor read-only view](visitor-read-only.png).

The L2 model stays within the reserved viewport; tool scrolling and the status
footer do not float over it. The interior has readable wall/ceiling materials with
one bounded fill light. These are rendered screenshots, not canvas-existence-only
checks. Phone emulation is not a physical-phone performance measurement.

## Limits and release boundary

No Docker/Fly deployment, production-volume migration, physical-device test, public
load test or broad browser suite was run for this branch. The build reports one
858 kB minified JS chunk (about 234 kB gzip). The workshop 3D view and renderer are created only when opened,
although its module code is currently part of that chunk. World structures use
conservative solid collision footprints; walking through their doors is deferred.
No blueprint deletion/export/import, terrain editor, ship workshop, public history,
new account system or submission work is included.

The original source SQLite remained read-only. Tests used the isolated working
copy, temporary databases and their own Chrome identities. Browser cookies and
traces remain ignored/private. Automated Chrome contexts were closed. One local
preview may remain on 127.0.0.1:8098, using `.data/little-post.sqlite` in this branch.
