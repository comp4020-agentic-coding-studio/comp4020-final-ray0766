# R8 workshop and public-village integration

Local engineering record, 7 October 2026. Published Crit 8 remains `09233d9`.
The implementation branch starts at `29bc9f6`; this record does not claim a public
deployment, physical-phone test, student reflection, or playtest feedback.

## Player changes

The existing workshop now exposes 45 parts, including 24 R8 additions, in Chinese
and English. Its Example selector loads the lived-in cottage, corner lane and
pad-side stall into the same editable draft and ordinary Save flow. Examples do
not save automatically. Existing blueprints retain their IDs and content hashes.

New quick-build trees, flower pots and benches use `garden.tree`, `garden.pot`
and `furniture.bench` directly: original dimensions, shared material library and
the same collider boxes. The pot's translation recentres its edge-local origin;
none of these new models is scaled. Old instances retain the previous procedural
models and their previous placement/collision extents.

The public village still has eight structures, sixteen rooms and 64 total
objects. The three ordinary blueprint combinations now include tables, chairs,
shelves, wall lamps, signs, flower beds, benches and port cargo. Their existing
doors, central alley and plot positions remain. The workshop can reproduce them;
the server accepts their normal blueprint documents. No bespoke public assets or
larger construction limits were added. The sample JSON under `/examples/village/`
matches the new public hashes.

## Source and collision contracts

Claude source `c499deeb19e1d8ac20a6997f1904d49a2a5f5341` was read without editing
its workspace. The actual host vendor baseline was
`5a73b228f13b8b20460ea6f9403167fdfedc08be`. The 33 copied changed/dependency files
are byte-identical to that source; `PROVENANCE.json` records their hashes and the
106-file mixed historical snapshot. Existing immutable resource URLs, codec,
style and shell files keep their prior pins. Host translations and collision
adaptations live outside the vendor directory.

New visual envelopes participate in rotated structure spacing. Terrain support
continues to use ground cells; entrance geometry does not acquire an extra
foundation. `ramp.entry` has exactly one pitched support plane plus side cheeks.
The six stepped fallback planes are excluded. Hip/valley roofs and verges block
body/camera penetration but never supply foot support; flat roof decks remain
walkable. The beam uses the central 1.84 m underside and separate side brackets
with a 1.62 m underside. Low lamps and signs block upward heads and cameras.

Physics version 5 fences old movement batches. Valid version 3/4 saves, including
airborne private poses, keep their physical values if they still fit; incompatible
poses recover locally through the existing safe-ground path. Radius and ordinary
walk/sprint speeds remain unchanged. Real placement uses `structureFit`; the
source demonstration's artificial +0.45 m display lift is not imported.
The final beam replay reproduced a descent stall beside the counter: radial
gravity moved the falling capsule into a tilted furniture side and the rejected
tick froze its velocity. The solver now slides that small penetration tangentially,
bounded by the fall distance. A regression uses the actual pad-stall geometry.

## Persistence and migration

Schema 13 adds `object_assets(object_id, planet_id, asset_version)` with immutable
version rows. The server assigns version 2 only when creating one of the three
new quick props. Clients cannot choose this field. A missing row means the legacy
model; moving an old object does not convert it. Rows outlive object deletion so
owner-only history can render the original asset. History responses carry this
metadata separately, preserving prior event documents, snapshot hashes and codecs.

Before changes, the real local code and SQLite were backed up outside the repo
under `../r8-backups/`. A copy of the real schema-12 database migrated successfully:
all values in all twelve original tables matched exactly, including 206 players,
35 placed objects, 22 saved blueprint-library rows and seven ground saves.
The new version table was empty. SQLite integrity and foreign keys passed.
All 22 existing blueprint documents decoded with unchanged content hashes.
The rollout procedure takes another consistent backup immediately before stopping
and updating 8098, then repeats this full original-table comparison.

## Verification and limitations

- Real Chrome 154.0.8037.98 on this Mac tested the actual workshop controls,
  selected all 24 additions, assembled the 43-part lane piece by piece, saved and
  reloaded, and displayed all three examples at desktop and 390×844 Chinese sizes.
  A cottage was placed through ordinary validated owner APIs and survived reload.
- Public-village Chrome journeys used real keys, mouse and emulated touch: doors,
  room interiors, wall-adjacent jumps, camera clearance, both delivery NPCs,
  duplicate interaction idempotency, character/task refresh, flight/claim and
  ordinary workshop reproduction of the three public documents. No page errors
  or rejected movement writes were recorded in the final public journey.
- Private Chrome checks cover actual terrain-seated ramp traversal and refresh,
  central beam head/camera clearance after the descent repair, normal builder-UI
  creation of all three new quick props, refreshed version
  metadata, a separate visitor's real flight and identical received content,
  and server refusal of visitor editing. Camera changes verify reassignment and
  intermediate fade values in the unchanged two-point/two-spot light pool.
- Focused unit checks cover all catalogue metadata, source provenance, legal
  examples, rotated footprints, multiple ramp rotations/poles and world radii,
  roof/beam/light collision, versioned props, immutable asset history and upgrade
  persistence. The R4 regression check now compares its original 78 fixtures as
  a subset of the expanded catalogue and leaves archived R4 evidence unchanged.
- Public stationary main-scene samples: desktop close/overview 133/136 draw calls
  and 138,532/138,712 triangles; 390px close/overview 127/136 median draw calls and
  138,004/138,712 triangles. Median rAF cadence was 16.7 ms; median render CPU
  submission was 0.803/0.820 ms desktop and 0.767/0.760 ms at 390px. These are 2.5 s
  measurements, not GPU timings or physical-phone performance.
- The full suite still contains three already reproduced historical failures:
  fake-v4 blueprint migration, fake-v6 ship migration, and the ship test's obsolete
  large ground-motion jumps. See the earlier bilingual baseline comparison.
  They are not counted as passes. No production migration was weakened to satisfy
  artificial downgraded-schema fixtures.
- Final full-suite result after the descent fix: 148 passed, three historical
  failures (151 total). Typecheck, lint, production build and evidence validation
  pass. The test commands used local installed binaries because `pnpm` attempted
  an unnecessary dependency reinstall in the linked Mac worktree.
- IAB, physical-phone GPU performance and the previous full private capacity-scene
  draw-call budget remain unverified/unresolved. This change does not claim to fix
  the previously measured 845/722-call private capacity scene.

Evidence: [workshop](../evidence/r8-workshop/player.json),
[public journey](../evidence/r8-village/journey.json),
[public frame measurements](../evidence/r8-village/after.json), and
[private journey](../evidence/r8-private/journey.json). Failures during driver
development are explained in the final verification record rather than counted
as successful runs.

## Running locally

Use Node 24 and the pinned dependencies. `pnpm build` followed by
`PORT=8098 HOST=127.0.0.1 DATABASE_PATH=.data/little-post.sqlite pnpm start`
serves the built app. The existing local 8098 preview is managed by its launchd
plist; do not start a second listener on that port. Tests use a separate database
and port 8116. `APP_URL=http://127.0.0.1:8116` must be set for Vitest and Playwright.
No push, Fly deployment, paid infrastructure or submission is authorised here.
