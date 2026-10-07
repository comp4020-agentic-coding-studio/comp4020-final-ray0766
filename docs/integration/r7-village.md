# R7 village — local integration

This is an engineering integration record, not student reflection. The local
baseline is `54ade588e010c0a1f97b78ea46ae8e889a0d6ef2`. The published Crit 8 release
`09233d9`, Crit 7, and the independent Claude source repository were not modified.

## Source and presentation

The immutable vendor manifest contains 79 files. Exactly 15 changed and 17 new
files come byte-for-byte from Claude commit
`5a73b228f13b8b20460ea6f9403167fdfedc08be`; each has its source commit and SHA-256
in `src/assets/claude-geometry/PROVENANCE.json`. The other 47 files retain their
previous hashes. The original `a4546bb` resource URL pin is preserved, as is the
library's industrial default. Host adapters explicitly request `village` at medium
quality with Neutral tone mapping, subdued practical lights and no scanned maps.

The same village ship factory supplies the workshop, parked craft, flight and
landed craft. Existing IDs, paint choices, documents and server saves are retained.
The six categories each have three options: **729 combinations**, including the
no-dorsal option. There are 17 physical ship-part builders and 21 building builders.
All 729 combinations are checked at the actual main-scene medium tier.

The host harbour adds plaster, timber, stone, small tiled roofs, clocks, mailboxes
and lanterns. The courier gains a cap, satchel, envelope pocket and paper parcel;
remote visitors share that vocabulary. Local trees, flowers, paths, benches and
return beacons use compatible geometry. Cream, teal and terracotta panels preserve
the existing keyboard, touch, editor and ownership flows. Space remains dark for
contrast. No Messenger assets were extracted.

Large fixed harbour geometry is merged by material. Its model ink shells and
crease lines are removed before merging because their callbacks cannot survive
that transform. Shared geometry/materials remain library-owned. The public scene
therefore has cel shading without full silhouette outlines. The character also has
no added outline. The original tall skyline layout and small private return beacon
remain; this milestone is not a complete map or character redesign.

Saved private objects retain their full geometry and ink. A bounded host shadow
policy turns off only distant shadow casting, using distance from the player to
the full model envelope and 12/14 m hysteresis. Selection restores that object's
shadows. Received shadows and picking are unchanged; previews never enter this
policy. Four focused tests cover these properties and resource ownership.

Placement previews hide ink shells/lines before replacing mesh materials, use one
transient tint, and exclude practical lights. Cleanup restores original materials
before releasing the owned model and disposes the tint once. Unit checks exercise
repeat disposal and shared-resource ownership.

## Collision, saves and recovery

Host-owned collision stays separate from immutable visual files. The enlarged
pitched roof has conservative gable slices, ceiling, ridge and a tilted tile proxy;
it is **not** walkable support. Existing flat roof support, 11 stair treads, the
0.26 m step bound and player capsule remain unchanged. Blueprint lamps use the
3.42 m model envelope with a separate arm/head; the independent short harbour
service lamp retains its original collision. Street pipes now use hedge bounds.
Roof overhangs contribute to future placement spacing at every quarter turn.

Schema 10 adds `ground_states.physics_version`; old rows initially have version 0.
Opening a version-9 file makes a consistent SQLite backup before migration.
Returning players recover against the current physics model, receive a new sequence
and player revision, and cannot restore a stale floor height through an older
response. Removed support leads to normal gravity. Old movement batches without
the current version are rejected with a reload message. Client motion epochs
invalidate pending old-scene batches and responses.

Building rows, immutable blueprint hashes, ships and history are not rewritten.
Read-time effective extents cover new roof overhangs while retaining old placements.
An already close pair of old buildings is not automatically moved. Terrain, history,
private access rules and the existing 8-structure / 64-total-object caps are unchanged.

For rollback, stop the local service first, preserve the current database, and
restore a consistent pre-migration copy together with the old application. The
old application intentionally refuses schema 10; reverting code alone is not a
safe database downgrade. Rolling back a database loses changes made after its backup.

## Validation

The first targeted run passed 59 checks in 10 files, including all 729 ship
combinations, all vendor hashes, preview disposal, migration/reopen, old-version
motion rejection, roof collision at both poles and four rotations, terrain,
multiplayer sequencing, walking support and save recovery. Typecheck, lint and
production build passed. A further 20 checks in six files passed, covering the
two shipped course HTTP invariants, store/API validation, blueprints, history and
immutable asset serving. `check-evidence` passed. One initial HTTP check invocation
could not reach localhost from the restricted execution sandbox; the authorised
local-network invocation passed. Browser and capacity measurements are recorded below.

The old-to-new Chrome replay used a consistent copy of the old database and a new
anonymous identity. It saved a custom ship through the old UI, then carried the
same in-memory cookie to the migrated copy. Character, quest, position and ship
were unchanged. Desktop and 390×844 ship previews rendered without page errors.
The first attempt used the test runner's default request port after navigating to
another port; that driver error is retained under `upgrade-first-attempt/`. The
corrected replay passed. No cookies, storage state, database or trace is committed.

### Fixed-camera public harbour comparison

Installed Chrome 154.0.8037.98, Apple M3 / ANGLE Metal; headless desktop execution,
DPR 1. Both builds use the same saved position and camera for each viewport.
Counters include shadow rendering. Each capture sampled 90 animation frames.

| Main scene | Calls | Triangles | Median / p95 rAF interval (ms) |
| --- | ---: | ---: | ---: |
| 54ade desktop 1440×900 | 293 | 309,608 | 16.7 / 16.7 |
| R7 desktop 1440×900 | 278 | 261,672 | 16.7 / 16.8 |
| 54ade phone viewport 390×844 | 221 | 263,156 | 16.7 / 16.8 |
| R7 phone viewport 390×844 | 203 | 223,748 | 16.7 / 16.8 |

R7's optional `?measure=1` records CPU time spent submitting `renderer.render`,
averaged across 30 calls (about 0.65 / 0.77 ms in these two captures). This is not
GPU time. rAF cadence is display/browser scheduling, not an uncapped FPS benchmark.
Phone dimensions and touch emulation on this Mac do not establish physical-phone
performance. These main-scene figures do not reuse the independent source sample's
performance claims.

The complete concentrated Chrome journey passed before the shadow policy; that
raw run is retained under `before-shadow-budget/`. Its phone selected-object ghost
was largely outside the camera, so the final driver explicitly moves an unsaved
preview into the central ground view before sampling and cancels it afterward.

The first post-shadow replay completed every gameplay and capacity assertion but
failed its final "no rejected moves" assertion on one HTTP 409. Its logger recorded
only status, so the reason is **unclassified**, even though subsequent walking,
saved state and recovery checks succeeded. `shadow-replay-conflict/` preserves the
report and screenshots. The diagnostic driver now records response text and stage;
a later clean replay cannot retrospectively prove that this was an expected stale
sequence. This remains a recorded intermittent validation limitation.

Raw old/new comparison: [upgrade-and-hub.json](../evidence/r7-village/upgrade-and-hub.json).
Concentrated journey: [integration-result.json](../evidence/r7-village/integration-result.json).
Screenshots are kept in [the R7 evidence folder](../evidence/r7-village/).

### Final concentrated replay and capacity

The final Chrome replay passed in 2.3 minutes with no page errors and no rejected
ordinary moves. It completed saved ship selection, real flight/landing, doorway
walking, stairs and upper-floor refresh, blueprint add/undo/redo/save, placed-object
cancel/save/reload, an independently flown visitor with three 403 ownership checks,
synchronised support removal, and 390×844 joystick/editor/ship controls. The final
run had no scene conflicts either; the stricter diagnostic branch now requires the
specific stale-sequence response, an advancing same-planet revision, current physics
version and persisted landing before treating a support-removal race as recovery.
The earlier unclassified 409 is not retrospectively relabelled. The intermediate
diagnostic replay captured the stale-sequence error during the support-removal
portion and completed all later gameplay assertions, but failed the original zero-409
assertion; its report is retained in `diagnostic-sequence-conflict/`.

The capacity fixture used normal owner APIs: 8 custom structures, 10 cottages,
10 trees, and 9 each of paths, flowers, benches and lamps = **64 total objects**.
All remain visible/pickable as appropriate; physics and capacity were not reduced.
The final ghost is moved into the visible central ground and cancelled without a
save. Each baseline/ghost pair holds the same camera. Both use DPR 1 on this Mac.

| Main scene at capacity | Median calls | Median triangles | p95 rAF ms | Median CPU submission ms |
| --- | ---: | ---: | ---: | ---: |
| phone-capacity baseline | 722 | 217,542 | 16.7 | 1.437 |
| phone-capacity moved-object ghost | 734 | 222,334 | 16.7 | 1.59 |
| desktop-capacity baseline | 845 | 253,242 | 16.7 | 2.303 |
| desktop-capacity moved-object ghost | 857 | 258,034 | 16.8 | 2.513 |

The bounded shadow policy kept 59 of 64 objects casting shadows in this fixture.
Before that policy, capacity baselines were 741 phone / 864 desktop calls; after,
722 / 845. This small reduction **does not meet a 250-call target**. The active
ink/material meshes still make dense scenes expensive. Further batching and a
physical-phone check remain future work; no additional optimisation is included
in this bounded integration. The original off-screen phone ghost sample is not
used to estimate visible-preview cost.

Final validation totals: 83 distinct targeted checks passed (59 original focused
checks, 20 course/storage/resource checks and 4 new shadow checks). Seven build-UX
checks were also repeated after the shadow change. Typecheck, lint, production
build and evidence checks passed. This was a selected suite, not every historical
browser script. The older shared-assets browser sentinel was updated to the new
asset-kit version; its complete historical journey was not rerun separately.

## Local operation

Use the existing Final checkout and its Node 24 / pnpm 11 dependencies:
`pnpm build`, then `HOST=127.0.0.1 PORT=8098 pnpm start`. The managed preview uses
its existing launchd service and `.data/little-post.sqlite`. Do not start another
server on that port while the service is running. `/readme/` publishes the README.
The separate integration worktree used temporary ports 8106–8108 and private
copied databases; these are test fixtures, not public deployments.

No push, Fly deployment, paid allocation, repository publication or submission is
authorised by this local integration. Those remain separate approval steps.
