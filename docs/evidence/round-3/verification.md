# Round three — original shared constellation

Date: 2026-10-05 (Canberra). Branch: `prototype/small-world-c8`.
Workspace: `/Users/ray/Documents/Codex/2026-10-05/task-2/comp4020-final-ray0766`.
Starting point: clean local commit `b98e0ce`. No push or deployment.

## Delivered interaction

Little Worlds makes star-map exploration and personal building the main loop.
Unclaimed and newly claimed worlds contain terrain only. Six blank worlds remain
available as others are claimed. Sunseed Harbour preserves the original visual
scene and optional delivery.

Owners can place cottages, trees, path stones, flowers, benches and lamps; select
them directly or from an object list; rotate, move and remove them. Placement
keeps a landing clearance and object spacing, with a 64-object limit. Path stones
can overlap one another. Building pauses the walking controls. Visitors can walk
around any planet and see saved changes through roughly one-second polling while
the page is visible. The app does not render other visitors' avatars.

## Ownership and request validation

- The server derives identity from the existing random HttpOnly cookie; public
  planet responses expose ownership flags, not the owner hash. Client owner IDs
  are neither accepted nor trusted.
- SQL uniqueness plus immediate transactions enforce one home per identity and
  one owner per world. The harbour cannot be claimed. Duplicate own-claim is safe.
- Every object write checks ownership. Models, finite unit coordinates, rotation,
  identifiers, expected versions, extra fields, overlap and capacity are checked.
- IDs make repeated creates idempotent; versions reject stale edits; repeated
  completed transforms/deletes are harmless. Deletion tombstones reject delayed
  create replays. Movement carries an expected planet to fence stale visits.
- No login, OAuth or email collection was introduced. This enforces one planet
  per anonymous browser identity, not one per real person. Profiles/incognito can
  create more identities. Clearing cookies loses ownership access; the planet
  remains visitable. There is no recovery or transfer UI.

## Migration and retained saves

The old server was stopped before the preservation snapshot. All 32 existing
rows' identity key, coat, quest, position, deliveries, revision and movement time
were recorded in an ignored local file. Migration used consistent VACUUM INTO
backups before changing schema:

- `.data/little-post.sqlite.v1-2026-10-05T00-05-06-065Z.backup.sqlite`
- `.data/little-post.sqlite.v2-2026-10-05T00-12-13-424Z.backup.sqlite`

V2 adds ownership, objects and per-planet visits; v3 adds deletion tombstones.
Fresh stores go directly to v3. The comparison after each upgrade reported:
**PASS: 32 previous saves match every pre-migration field.** Schema changes are
transactional, and newer unknown schemas are refused. No original save was reset.

For a safe rollback review, stop the app and retain the current v3 database. Use
a separate checkout of `b98e0ce`, copy the v1 backup to a new filename and point
DATABASE_PATH at that copy. Do not run old code against the v3 database or the
only backup. New ownership/building data intentionally does not exist in v1.
Backups, cookies and databases are ignored and are not committed.

## Executed local checks

| Check | Result |
| --- | --- |
| `pnpm lint` | Pass |
| `pnpm typecheck` / `pnpm check` | 6 files, 15 tests pass |
| `pnpm build` | Pass |
| Complete browser regression before final selector refinement | 11 Chrome tests pass in about 1.1 minutes |
| Focused building regression after selector refinement | 3 Chrome tests pass in 20.3 seconds |
| Focused regression including stale-tab conflict | 4 Chrome tests pass in 25.2 seconds |
| Final map-ordering regression | Same 4 building flows pass in 21.0 seconds |
| Real Chrome desktop and phone | Star-map labels, rendered harbour and 390 × 844 layout inspected; viewport reset after review |
| `docker build -t little-worlds:c8 .` | Pass with frozen dependencies and Node 24-slim |
| Container `pnpm check` | All 15 tests pass |
| Container `pnpm test:browser` | All 12 Chrome tests pass in about 1.6 minutes |
| Container runtime shape | One CPU, 256 MiB limit, isolated bind-mounted database |
| Container idle memory sample | 43.46 MiB / 256 MiB; not a load test |
| Image size sample | 85,532,024 bytes |
| Real container restart | Full two-identity universe snapshots match before/after |

The restart probe preserves two owners and a read-only visitor on the first
owner's world. A saved cottage retains its π/4 rotation. A deleted tree's original
create request is still rejected after restart, and a visitor's write is still
rejected. The probe waits for `/healthz` before checking state. Its cookies and
snapshots are in ignored local files; no production test endpoint was introduced.

The complete container run preceded a final UI-only star-map ordering adjustment
that puts my/public/blank worlds before other claimed worlds. The ordering does
not change the server, schema, scene or walking controller. It is followed by the
focused four-flow building regression and a new local build/container image.

Final bundled JS is 593.87 kB (154.09 kB gzip estimate); CSS is 22.08 kB.
The short renderer samples in `desktop-render-sample.json` and
`phone-render-sample.json` measured about 60 FPS with median 16.7 ms and p95
16.8 ms frames. These are 2.5-second stationary harbour samples in Mac Chrome
154 at device-pixel ratio 1, not a 64-building stress test or physical-phone
performance claim. Draw calls were 441 desktop and 321 phone viewport.

The data/API tests exercise A versus B claiming one world concurrently; one
identity claiming two worlds concurrently; A owning P1 and B owning P2;
all visitor create/update/delete endpoints being rejected; forged owner fields;
invalid placement/rotation/model/identifier; SQL uniqueness itself; stale object
versions; landing clearance/overlap; 64-object budget; duplicate requests; deleted
object replay; saved visits; and actual file-database reopen. The existing course
invariants, delivery validation and repeated pole traversal remain in the suite.

Browser building journeys use independent contexts, normal star-map/claim buttons,
canvas mouse or touchscreen input and the object selector. The server API is read
for verification, not used to bypass placement or claiming in the browser journey.
Owner A builds and edits P1 while B's read-only scene updates; A cannot claim P2;
B claims P2 and revisits P1. Rotation, movement, deletion, refresh and a new context
with the retained cookie are exercised. Phone checks cover 390 × 844, touch,
building/WASD isolation, offline disabled saving, reconnect and layout overflow.
An initial failed identity fetch recovers the star map without reloading.

## Corrections observed

1. One phone regression tapped sky during the walking-to-building camera
   transition. The screen-point test now waits for that visual transition.
2. An early screenshot was captured while a save was still in progress. The
   screenshot now waits until the editor has acknowledged and cleared the draft.
3. Saving cleared the draft but left the object selector on the old item. The
   selector now resets, allowing the same object to be selected again normally.
4. A failed first identity request initially recovered the walker but did not
   create the star-map controller. Recovery now initialises both; a test covers it.
5. Scene polling could restore connectivity before the movement retry restored
   position. Any transition back online now restores the acknowledged position.
6. Direct object picking now rejects geometry hidden behind the planet surface.
7. A stale editing tab now clears its rejected draft so the saved object can be
   selected again normally. A second tab's newer rotation is preserved.
8. Many verification planets pushed blank worlds below a long list. The map now
   prioritises my planet, the harbour and unclaimed planets.

## Visual evidence

- [Star map](star-map.png): blank, mine and neighbour states.
- [Empty desktop planet](desktop-empty-builder.png): no prebuilt scenery.
- [Desktop building](desktop-built.png): saved cottage, tree and flowers.
- [Read-only visitor](visitor-read-only.png): saved scene visible without editor.
- [Phone building](phone-built.png): compact touch catalogue and saved object.
- [Phone empty planet](phone-empty-builder.png): blank starting point.
- The root evidence screenshots retain the current optional-delivery regression;
  round-two before/after screenshots remain separately preserved.

The local development database includes planets created by verification sessions;
these are test data, not evidence of real community participation. Physical-phone
testing, a large concurrent audience, latency under load and deployed TLS/volume
behaviour remain unverified. Same-cookie tabs share an active visit. This phase
does not claim to complete shared-avatar multiplayer or the C10 logging brief.

The student still needs to author/review the design/research argument, PROCESS
argument and Crit8 reflection. This file records actions and evidence only.
No Crit7 work or deleted implementation was touched. Push, public repository
visibility, Fly costs/deployment and formal submission require specific approval.
