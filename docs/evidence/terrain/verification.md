# Terrain integration — local verification

2026-10-06, branch `final/workshop-v1`, following private history `a695ed4`.
This is factual engineering evidence, not the student's reflection.

## Storage and source preservation

Before schema changes, SQLite's backup API made `.data/before-terrain-v8.sqlite`
and `.data/terrain-migration-probe.sqlite`. The probe migrated to schema 9 with all
**12 existing application tables' original columns and rows unchanged**. Integrity
was `ok`, and no planet acquired an environment. The active server independently
made `.data/little-post.sqlite.v8-2026-10-06T11-45-53-439Z.backup.sqlite` before
migration. Its integrity is also `ok`. Only the explicitly operated browser-test
world, Little world 68, has opted in; the harbour and other old worlds remain null.
The databases and browser identities stay ignored in `.data/`.

The provenance check matched all 62 vendored TypeScript files byte-for-byte with
Claude `a4546bb120d969774776f1fbe2cb1c990a7c3e66` and their manifest hashes. This stage
adds 17 terrain dependency files. The independent Claude workspace remains clean.
The published source remains at `09233d9f0b8dac873d0d15e8367eec90e8b532e3` with no
tracked changes; its pre-existing untracked copies were left alone. Crit 8's
reflection, PROCESS and release evidence were not edited.

## Bounded verification

`APP_URL=http://127.0.0.1:8098 pnpm exec vitest run spec/terrain.test.ts
spec/history.test.ts spec/physics.test.ts spec/flight.test.ts
spec/blueprints.test.ts spec/ships.test.ts` passed **34/34** in six files.
No 393-case source-module suite was rerun. The nine terrain cases include:

- Deterministic fields for four styles, both poles and a dry landing pad.
- Owner-only, on-planet grounded writes, strict documents, revision fencing,
  identical retries, injected apply failure and unchanged legacy environments.
- Flooding and steep-footprint RESTRICT, including a custom structure; underwater
  occupants and aircraft too near the new surface also block application.
- Generated movement replay, persisted height/environment and dry-pad landing;
  conservative shared flight clearance rejects crossing into the new hull.
- Old and new building events retain their respective environment context.
- Drawn terrain vertices match the physical graded field within 0.00001 m for the
  exercised structure fixture. This is a vertex check, not a claim that finite
  triangles exactly reproduce a continuous field between vertices.
- A deliberately obstructed schema-8 migration rolls back its preceding column
  changes and rows, then succeeds after removing the obstruction.
- Finite turning at both sphere poles and camera clipping before terrain entry.

The first targeted run was 30/31: the movement fixture mixed a real-time visit with
zero-based movement time. Aligning its clock fixed the fixture; the server's time
validation was retained. Typecheck and lint passed after fixing test-only type and
unused-initialisation warnings. Production build passed at 785.92 kB main / 229.16
kB gzip. The existing 650 kB warning remains, without a raised budget. The two
unchanged course invariants also passed: `/` answers and `/readme/` publishes the
current README headings; the evidence checker passed.

## Real Chrome

Headed installed Chrome 154.0.8037.98 exercised 1440×900 desktop and 390×844 touch
viewports. The first complete journey passed in 56.7 s: four style previews left
the database unchanged; a deliberately rejected 503 save kept the original planet;
explicit apply saved desert terrain. W/D walking, refresh, placing a lamp, owner
history, boarding, launch, refresh in space, a controlled return flight and dry
landing all passed. A second isolated context verified phone preview, closing
without apply and touch walking. An independent visitor's apply returned 403.
Preview WebGL contexts were released and no page errors occurred.

Screenshot review then found a black atmospheric ring on the main transparent
canvas. An adapter now preserves canvas alpha while retaining the source's additive
RGB blend, and supplies the existing sun direction. Source art was not edited.
The complete replay after this fix passed in 20.6 s; ground, phone and approach
screenshots were inspected and the ring was gone.

A separate 1920×1080 check passed in 4.4 s: the real workshop created/saved a
one-deck blueprint, then its first placement ghost and server save worked on
generated ground. An ocean preview that would flood that custom structure disabled
Apply. A direct owner request also returned 409 and left all objects, transforms
and the saved environment unchanged. [Restriction result](restriction-result.json),
[placed blueprint](blueprint-on-terrain.png), [conflict preview](restrict-conflict.png).

An additional repeat of the travel driver initially clicked before the overview
camera settled and exhausted its fixed placement targets. Its [failed result](repeat-run-result.json)
and [screenshot](repeat-run-failure.png) are retained. Waiting for the camera and
removing the newly created temporary lamp after replay made the focused repeat
pass in 24.0 s. The added custom-blueprint check had already passed and was not rerun.

[Browser result](browser-result.json), [desktop ground](desktop-ground.png),
[return approach](orbit-return.png), [landing](landed.png),
[phone ground](phone-ground.png), [phone preview](phone-preview.png),
[building history](terrain-history.png).
Four style previews: [Ocean](preview-ocean.png), [Desert](preview-desert.png),
[Ice](preview-ice.png), [Temperate](preview-temperate.png).

Phone screenshots emulate a viewport and touch input, not physical-device
performance. Test Chrome contexts were closed. One local 8098 server remains;
no push, deployment, published-main modification or submission occurred.
