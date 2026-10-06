# Final workshop-v1 (local milestone)

The owner can fly to their planet, open Pause → Open workshop, edit a named and
grouped blueprint, save it to the server, place it on the surface and return later.
Visitors receive the placed geometry and cannot edit it. This branch starts at
published `09233d9`; it has not been pushed, merged, deployed or submitted.

## Run and play

```sh
pnpm install --frozen-lockfile
pnpm build
HOST=127.0.0.1 PORT=8098 DATABASE_PATH=.data/little-post.sqlite pnpm start
```

Open http://127.0.0.1:8098. Preserve the browser's cookies. Walk to STARPORT / 01,
board and fly to an unclaimed planet, land, then choose Make this my planet in
Pause. On your home, choose Open workshop. A two-by-two cabin is the starting
example; New starts an empty assembly. Tool + column/row/turn + Add at cell also
works without precise canvas picking. Drag the preview to orbit, pinch/scroll to
zoom, and choose L1/L2/L3 to work at that level. Upper components need support.
Parts & groups exposes multiple selection, grouping, moves and undo/redo.

Save blueprint persists the complete document. Place on planet requires a saved,
unchanged blueprint; tap a free surface point, rotate if desired and press Place
object. Existing placed objects retain their saved geometry if the library is
edited. Reopen a saved blueprint to place another copy. The owner can move,
rotate or remove placed structures with the ordinary building tools.

A failed save keeps the draft open. A concurrent edit returns a version conflict;
Save as copy preserves the current draft under a new ID. Closing an unsaved
blueprint asks before discarding it. Names/groups belong to the private library,
not the visitor-facing planet response. There is no new public activity history.

## Integration boundary

`src/assets/claude-geometry/PROVENANCE.json` pins 31 unchanged dependency files to
Claude's committed `db79d7350decb4167d12e1a980a293cdb77cea83`. The source repository
was not modified. `BlueprintEditor`, `WorkshopView`, its codec, group/undo model,
part templates, ground fitting and model builder are reused. Main adapter code is
in `src/client/workshop.ts`, `colony.ts` and `src/server/blueprints.ts`.

The public/player kit and workshop use medium geometry and image-based materials.
Workshop DPR is capped at 1.5; no GTAO or bloom is enabled. A procedural environment
and one real, unshadowed, distance-limited interior fill light keep the cabin
readable. Placed roofed structures each have one bounded unshadowed light (at most
eight saved structures plus one placement ghost). The workshop pauses main-world
rendering and disposes its view, templates, material library, renderer and WebGL
context on close. The persistent world retains its own separate material cache.
No KTX2 conversion or runtime external asset fetch is required. Asset license and
source details are in `ASSET-CREDITS.md` and the bundled texture manifest.

## Server authority and storage

- `GET /api/blueprints` returns only the session's own library.
- `POST /api/blueprints/save` accepts a versioned document and `expectedVersion`;
  zero means new. Its body cap is 64 KiB. Other POST routes retain 2 KiB limits.
- Schema 5 adds a full-document private library and an immutable content registry.
  Hashes are recomputed from validated canonical parts on the server. Names and
  groups are saved in the library but excluded from the shared content hash.
- Limits: 24 blueprints per owner, 120 parts in a 5 × 5 × 3 grid, 64 placed objects
  and at most eight custom structures per planet. Codec support/overlap/geometry
  budgets and unknown-field checks also apply.
- Placement checks the actual planet owner, membership of the chosen hash in
  their library, finite radial coordinates, spacing, landing clearance and dense
  terrain footprint fit. Dimensions are derived by the server, not trusted input.
- SQL transactions, object tombstones, versions and identical-request retries
  preserve existing concurrency rules. Old placements retain referenced content;
  unused content is collected when a blueprint is saved. Public responses contain
  only current placed parts, transforms, content hashes and geometry dimensions.

Before upgrading a disk database, migration writes a consistent `VACUUM INTO`
backup including committed WAL data. Original IDs, row order, character/quest,
flight, positions, visits and existing building fields are copied unchanged.
Newer schemas are refused. Downgrading the application requires restoring the
matching pre-migration backup while the server is stopped; simply checking out
schema-4 code against schema 5 is deliberately rejected.

## Evidence and limits

See [verification](../evidence/workshop-v1/verification.md) for exact checks and
screenshots. The build still reports an 858 kB minified main JS chunk (234 kB gzip);
code splitting and physical-device performance are not claimed by this milestone.
A phone viewport in Mac Chrome does not establish physical-phone performance.
Placed structures currently use conservative solid footprint collision, so walking
through their modeled doorways is not implemented. Interior viewing is available
in the workshop. Library deletion/export/import and cross-device accounts are not
included. Ship workshops, terrain editing and timeline integration remain deferred.

The currently published Crit 8 `main` and its local database were left untouched.
Publishing requires separate approval to merge/push this branch and deploy through
the existing course workflow, with a production-volume backup and rollback plan.
No new paid Fly allocation is necessary or authorized by this local milestone.
