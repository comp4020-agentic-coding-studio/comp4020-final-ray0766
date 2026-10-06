# Terrain and owner-private history: integration assessment

Read-only assessment after the R3 and ship work. The reviewed source is Claude's
`a4546bb120d969774776f1fbe2cb1c990a7c3e66`; this note does not claim either feature
is integrated or independently verified in the current application.

## Terrain

Source contracts: `src/terrain/index.ts`, `docs/modules/terrain.md` (integration
example and next steps), `src/terrain/integration/main-project.example.ts`.
The example targets main commit `a76575a`; this project's server/ground physics
and blueprint structures have since changed.

Current dependencies that must change together:

- `src/client/terrain.ts` uses the legacy private-planet height formula. The public
  harbour has its own reversible 800 m display projection and must keep it.
- `src/shared/physics/world.ts` has a module-level `legacyHeightField`, used for
  support radius, collider bases, steps and falling. The server replays that same
  world in `src/server/ground.ts`. Replacing only the visible mesh would leave
  couriers floating or walking through slopes.
- `src/server/planets.ts`, `src/shared/blueprints.ts`, colony picking, placed-object
  anchors, port support and the orbital representation need the same pinned
  environment/height-field interpretation. A surface normal remains the durable
  position; height stays separate.

Smallest safe sequence: vendor the unchanged terrain dependency closure and its
height-field contract; add nullable canonical environment documents with a backed
up migration; retain null/legacy terrain for **every existing planet**, including
owned worlds and saved visits. Introduce generated terrain on newly provisioned
planets only. Feed one environment into both the collision world and drawn mesh,
including graded building/pad footprints, before enabling terrain changes.

Any subsequent owner change needs RESTRICT checks inside the placement transaction:
reject underwater or unsupported existing objects; keep immutable blueprint hashes,
all object transforms, the boarding pad and acknowledged player support valid.
A terrain/scene revision must invalidate the server ground cache and rebase client
movement; stale paths must not replay against different ground.

Validation boundary: migrate a real-save copy and compare legacy rows; compare
height samples server/browser including poles; exercise steps, falling, camera
occlusion, placement footprints, landing and reconnect on each style. Keep source
module geometry/performance failures separate from adapter failures. No terrain
editing or schema change was made by this assessment.

## Owner-private history

Source contracts: `server/timeline/store.ts`, `main-adapter.ts`,
`src/timeline/reader.ts`, `docs/modules/timeline.md`.
The provided main adapter targets a v3 schema and prop-only legacy writes. Current
schema 7 has placed structures, immutable blueprint content, tombstones, ground
states and private ships. It is not a drop-in replacement.

The timeline store's read methods take a planet ID, without an actor argument.
Therefore the application must enforce **server-cookie-derived ownership on every
history read and repair endpoint**, including snapshots, object detail and any
historical blueprint-body retrieval. Public visitors may retain their present-day
view; they must not gain access to the owner's history or private library metadata.

Keep `planet_objects` authoritative initially. Append each accepted create/update/
delete event in the **same existing SQL transaction** as that write and its planet
revision. Do not invoke a second `BEGIN` from inside the host transaction. Retries,
unchanged updates and tombstone replays must add zero new events. Structure events
must reference validated immutable content hashes and the current footprint rules.

Use a truthful migration baseline of the current saved world. Do not fabricate past
actions, dates or a student's personal reflections to backfill a narrative. Any
initial baseline must be explicitly identified as an import at integration time.
Ship and movement writes need not become public or high-frequency history events.

Build a separate read-only preview group and snapshot reader; disposing it must
leave the live world, collision proxies and shared resources intact. No restore
write route, public timeline, combat, economy or destruction is in this stage.

Validation boundary: backup and migrate a copy first; two independent sessions
must prove owner-only reads; force append failures to prove world/event atomicity;
check duplicate commands, gaps, out-of-order repair and immutable content lookup;
close/reopen historical previews in desktop and phone Chrome without mutating live
objects. No timeline endpoints, events or tables were introduced by this assessment.
