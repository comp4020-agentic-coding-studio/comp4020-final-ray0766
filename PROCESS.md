# Process — Little Worlds, Crit 8

> AI-assisted account based on recorded instructions, commits and executed
> checks. Implementation, automated tests and browser captures were performed by agents;
> they are not claims that the student personally wrote or executed them.

## Direction and the current definition of good

The project began as a Messenger-inspired spherical courier prototype: continuous
walking, a following camera, two NPCs and one saved delivery. The student then
chose a different central activity: claim an empty planet, build a home and visit
other people's worlds without changing their work. That direction is implemented
in [733c543](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/733c543).
The courier remains an optional introduction rather than the whole project.

The working definition of good is a readable journey that leaves a durable,
recognisable contribution. Ownership and visits support that definition together:
people can encounter others' work while retaining control over their own. A browser
identity counts as a participant, with the explicit cost that lost cookies mean
lost ownership access. No real-world identity or account recovery is promised.

Messenger's live experience and its authors' interview grounded movement and camera
choices. Subsequent student feedback rejected the early miniature, low-poly look
as insufficient for the intended scale. Official city reference images informed
layered streets and mechanical structure. The stronger constraint was that players'
buildings must share the public scenery's quality. The references and limits are
recorded in [ADR 0006](docs/adr/0006-shared-city-assets-and-display-scale.md), not treated
as permission to copy commercial assets. Broader research into small shared spaces
remains a gap in the argument, rather than reading falsely attributed to the student.

## Stack and trade-offs

The implementation uses TypeScript, Three.js and Vite in the browser, with Node 24's
HTTP server and built-in SQLite on the backend. Three.js permits a custom surface
controller and camera without adopting a complete game engine. A small DOM interface
avoids a separate UI framework; the cost is explicit management of focus, dialogs,
input modes and state synchronization. TypeScript shares geometry and request types,
but server validation remains necessary because browser requests are untrusted.

SQLite fits the course's single machine and persistent `/data` volume. Transactions,
constraints and version checks protect ownership and edits. Built-in SQLite avoids
native-addon compilation; the runtime version remains a deployment dependency.
A JSON save file would require more custom recovery and concurrency handling. A
separate database service would add operational scope beyond the course allocation.
These choices and their original constraints are in [ADR 0001](docs/adr/0001-local-prototype.md)
and the initial implementation [c02a639](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/c02a639).

One-second polling supplies saved world changes and short-lived ground presence.
It is sufficient for this bounded prototype and keeps the server simple; it does
not prove capacity under a public crowd or unreliable networks. Presence contains
scoped ephemeral identifiers and never grants building rights. A persistent
connection may become useful later, but changing transports would not replace
permission checks or conflict handling. [705cc35](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/705cc35)
records the current presence and physical-port implementation.

## Directing and correcting agent work

The student supplied the interaction references, redirected the central loop,
challenged the visual scale and separated the independent Claude workshop from the
main playable system. Codex implemented and checked the main repository. The
workflow used concrete acceptance journeys, small recorded commits, browser
inspection and server tests. It preserved the course repository lineage and kept
Crit 7 and the cancelled earlier implementation outside the work.

An early rendered canvas was blank because a temporary Object3D and the camera
used opposite forward conventions. The correction changed the pose object and
required checking visible world content, not merely canvas existence. A separate
turning defect prevented reversal when opposite headings were blended; signed
angular rotation and a regression check replaced that approach. Both corrections
appear in the initial commits and now constrain `CLAUDE.md` and `spec/`.

Flight introduced saved journeys and sequence numbers, proximity-limited landing
and frozen recovery after failed saves. Tests use bounded motion and real travel
controls rather than a production teleport shortcut. [f590257](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/f590257)
and [ADR 0004](docs/adr/0004-continuous-flight.md) record that change. Existing coats,
quests and object transforms were retained across migration and restart checks.

The latest city changes separate public display scale from durable spherical
coordinates. This preserves old saves while showing a broader district. Thirteen
unchanged geometry dependencies were copied from a verified commit of the student's
independent Claude workspace, with per-file hashes and provenance. The editor,
blueprint persistence, terrain, timeline and ship-design modules remain separate.
The six existing placeable kinds reuse the shared asset layer; seventeen exported
resource types do not imply seventeen editable building tools.

This distinction matters for acceptance: a showcase image cannot establish that an
object is editable, saved or available in the deployed system. Integration needs
its own schema, ownership and resource-lifecycle checks. The current Crit 8 candidate
therefore freezes features rather than treating the separate demos as shipped.
[103a7ff](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/103a7ff)
is the latest application implementation.

## Evidence and remaining release work

Round 6 records lint, TypeScript, 25 logic/HTTP/course tests and production build
success. The complete Chrome run passed 19 of 21 cases; two delivery cases exposed
an early arrival label. After aligning the label with interaction availability,
seven focused headed replays passed. All scenarios have passing evidence across
runs; this is not a single all-green full-suite result. The same round repaired
a final paused-position flush and walking at the expanded south pole.

[Round 6 verification](docs/evidence/round-6/verification.md) links screenshots and
failed-run evidence. Its desktop performance captures were 1600×1000; the phone
viewport was 390×844 on a Mac, not a physical phone. A startup comparison preserved all
rows in five existing tables. These older local results remain separate from the
new hosted release evidence.

The student approved public release of the complete history and revised the reflection
to begin with topic selection. [89b8e09](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/89b8e09)
contains that writing. Existing Actions credentials deployed it to the course Fly
app; check and deploy jobs passed. Headed Chrome at 1920×1080 and 390×844 then
verified delivery, flight, building, reopening and visitor permissions. Three cases
passed initially; the phone build driver selected an already-owned destination
and was interrupted. Selecting an unclaimed world fixed the driver; its focused
replay passed without an application change.

A second deployment of the same commit updated the existing Fly machine. Complete
saved player state and building transforms for four isolated test identities
matched their settled pre-deploy baselines. [Hosted evidence](docs/evidence/crit8-live/verification.md)
links both successful CI runs, screenshots and comparison results. Original local
saves were not uploaded. Physical phones and public load remain untested. This
overview replaces the accumulated chronology; earlier accounts stay in Git history.

## Final workshop-v1 — separate local development

After the Crit 8 release was frozen, the user authorised one local workshop
milestone. A separate worktree and `final/workshop-v1` branch start from `09233d9`;
`release-before-workshop-20261006` records that recovery point. Neither published
`main`, Crit 7 nor the deleted earlier implementation was used as an edit target.
The existing local SQLite was copied consistently and migrated only in that copy.

The implementation reuses 31 unchanged committed files from Claude's independent
module repository at `db79d7350decb4167d12e1a980a293cdb77cea83`, including its editor,
codec, grouping/undo, view and updated material/geometry code. An adapter adds the
owner-only workshop, reserved mobile viewport, interior camera/fill light, private
server blueprint library, immutable placed content and schema-5 migration. It does
not implement a competing assembly model. The source workspace remained untouched.

The initial migration comparison preserved every original field in five tables.
The 25 existing tests passed; six new focused tests ultimately passed after two
test fixture errors were corrected. Headed Chrome completed the desktop/phone
edit-save-place-refresh loop, offline/conflict recovery and an independently flown
visitor's read-only access. A driver expected different add-command wording on its
first attempt. Screenshot inspection then prompted a doorway camera correction;
a small final replay checked both viewports, server restart persistence and WebGL
release on close. These are agent-run engineering checks, not a user study.

[Workshop verification](docs/evidence/workshop-v1/verification.md) records passes,
interrupted attempts, screenshots and remaining limits. [The integration guide](docs/integration/workshop-v1.md)
contains startup and data contracts. No push, deployment, paid allocation or
submission was performed. Broader module integration remains outside this milestone.

## Ground physics — first local milestone

The user then assigned art to Claude and authorised this branch to implement
walkable building physics. The project retains the exact 31-file vendored resource
snapshot; collision proxies are separately authored from stable part IDs and anchor
conventions. No art, material, lighting, texture or independent Claude source file
was changed. The published `main` remains at `09233d9`.

The client and server now share radial capsule collision, floor/step support,
gravity and static-scene recovery. Doors with an open leaf are traversable;
closed leaves, wall segments, columns and railings remain barriers. Saved unit
surface directions remain unchanged in meaning; schema 6 adds a separate foot
height and motion state. Movement checkpoints have bounded samples, server-time
and speed checks, sequence/retry handling, and collision replay. This is validated
client checkpoint movement, not a fully server-authoritative rigid-body simulation.

Before the working database was upgraded, a consistent schema-5 backup was made
and a separate copy was migrated. Every original column and row in seven tables
matched, and integrity/foreign-key checks passed. Existing state/flight/ownership
tests and six new physics tests passed (37 total); a later focused run covered the
final speed bound and validated visitor floor height. TypeScript, lint, production
build and course evidence checks passed. The build still warns about its large
main JavaScript chunk.

Headed installed Chrome completed desktop keyboard/mouse and 390×844 touch
navigation: rotated doorway entry/exit, wall blocking, stairs, upper-floor refresh,
reconnection on a phone context, and a real round-trip flight with terrain landing.
Test blueprints were seeded through ordinary authenticated APIs; player travel used
actual controls. Early automated attempts hit a back wall, double-ended a touch,
or pressed into a stair rail due to coarse heading/resume logic. These driver issues
were corrected and the final workflow passed. An initial physical edge-support
failure was corrected in the shared solver before those browser runs. Screenshot
inspection also led to hiding the local avatar when the camera is too close indoors.

[Physics evidence](docs/evidence/physics-v1/verification.md) and
[the physics contract](docs/integration/physics-v1.md) record exact checks and remaining
limits. These are engineering checks, not student reflection or a user study.
No push, deployment or submission was performed; further physics features are deferred.

## R7 village — bounded local integration

The user authorised integration of Claude's committed village presentation into
the existing local Final, including compatible ships, harbour, courier and UI. A
separate `integrate/r7-village-20261007` worktree started at `54ade588`; a consistent
SQLite backup and a copy/hash of the existing untracked release test protected the
active checkout. The integration reads the approved source commit `5a73b22`, not
Claude's newer working tree. Its 32 new/changed source files remain byte-identical;
the host separately owns presentation adapters, previews and collision changes.

Schema 10 versions ground physics, recovers old standing states lazily and rejects
old movement batches. Saved buildings, blueprints, ships and history retain their
identities. Roof overhang collision/spacing, blueprint lamps and hedges match the
new geometry while stairs, flat support and player step height keep their original
semantics. Public and private art share the village palette and procedural shapes.

The first focused run passed 59 checks, followed by 20 course and persistence checks.
A real Chrome old/new replay preserved a saved ship and player state across a copied
database migration. A separate desktop, two-identity and phone-touch journey passed
actual walking, flight, door/stair navigation, blueprint edits, saved placement,
visitor denial and recovery after support removal. Capacity was tested at the
existing 8 structures and 64 total objects, without reducing those limits.

The first capacity measurement exposed 741 phone-viewport and 864 desktop draws,
so it is preserved as evidence rather than described as meeting a 250-draw target.
The main harbour comparison improved from 293 to 278 desktop calls and 221 to 203
phone-viewport calls. These are Mac measurements, not physical-phone results.
[The R7 integration record](docs/integration/r7-village.md) records methodology,
failures, screenshots, source provenance, migration and remaining visual/performance
limits. No student reflection was written; no push, deployment or submission occurred.

The final bounded shadow policy reduced capacity baselines to 722 phone-viewport
and 845 desktop calls; it still exceeds a 250-call target. Four new shadow tests
passed, bringing distinct targeted checks to 83. An intermediate browser replay
completed all gameplay but recorded one unclassified 409; a diagnostic replay
captured the stale ground-sequence error during the support-removal portion. Both
failed zero-rejection assertions are retained. The final diagnostic-aware replay
passed without any rejected moves, and separately verified persisted landing after
support removal. It does not retroactively classify the earlier unlogged response.
Application code was then frozen for the local preview update.

## Compact worlds: authorised local scale pass (7 October 2026)

Replaced the large projected harbour with a real 14 m village and persisted stable
10–12 m dimensions only for new/safely untouched gardens. Existing player layouts
retain their scale. Preserved the previous harbour source and immutable vendor
assets. Shared radius now reaches terrain, collision, previews and flight. Schema11
backs up v10 and aborts safely if a saved flight conflicts with hub clearance.

Typecheck, lint, build and 57 targeted checks passed. Chrome completed copied-save
recovery, public delivery, real travel and construction/interior walking on two
sizes, refresh and phone touch without page errors or rejected moves. Screenshot
review led to a bounded relocation of two existing cottages and complete-globe
framing; focused route/view checks followed. See the factual
[compact scale record](docs/integration/compact-worlds.md) and its retained evidence.
No capacity claim, student reflection or public deployment was made. Shift sprint
and Space jump were newly authorised during this pass and remain the next stage.

## Sprint and jump: authorised local movement pass (7 October 2026)

After the compact scale milestone, the user requested Shift sprint and Space jump.
Added bounded movement flags to the shared client/server solver, radial jump and
ceiling sweeps, a held-key latch, input isolation and the public village collision
contract. Schema 12 preserves existing values and backs up v11; physics version 3
recovers standing state on return. Existing world sizes and saved layouts remain.

The Mac transport interruption left the original test session without a result;
work resumed on the same branch. 70 focused tests subsequently passed, alongside
typecheck, lint, build and evidence validation. A Chrome test-driver interruption
was traced to the unchanged unsaved-edit confirmation and corrected; the final
55-second journey passed with zero page errors or rejected moves. It includes real
travel, sprinting jump, ceiling/roof/stair collision, another visitor's height,
airborne refresh and phone touch. A final short visual check followed removal of
the floating contact blob. See the [movement record](docs/integration/sprint-jump.md).
Only local delivery is authorised; no deployment or student reflection was added.

## Chinese / English: authorised local interface pass (7 October 2026)

Added a language selector in the world header and each dialog, browser-language
fallback, and an explicit localStorage preference. Host-owned source-text bindings
translate existing nodes and accessible labels without reconstructing an editor
or changing saves. Names, IDs and immutable source assets stay unchanged.

Typecheck, lint, build and 45 focused checks passed. Chrome exercised both
languages through real delivery and flight, draft editing, an injected server
error/reconnect, refresh and a phone viewport. The first driver missed a collapsed
parts section; its retained failure led to an explicit expansion step. Broader
serial regression comparison found the same three older fixture failures in the
unchanged base commit; these are documented instead of counted as passes. See the
[bilingual record](docs/integration/bilingual.md) and its evidence. IAB is still
unverified; its earlier empty new tab and unavailable control/Accessibility tools
are separate from the Chrome results. No student reflection or deployment added.

## Catalogue-built public village: authorised local density pass (7 October 2026)

The user requested more public content and then required the actual player kit,
including construction rules. Replaced the provisional bespoke 24-house layout
with eight legal paired-house blueprints: sixteen rooms, paving, hedges/fences and
lanterns, plus ordinary quick-build props. The final scene uses 64 objects and eight
structures without widening limits. Public rendering and physics consume the same
placements, blueprint builder, foundation fit and collision code as player content.
The original private quick cottage and immutable resource snapshot are unchanged.

Testing exposed radial ascent into a flat side wall freezing jump velocity. Physics
version 4 clips that ascent and fences stale clients; a valid private v3 airborne
pose keeps its physical state during the lazy upgrade. SQLite stays at schema12.
The actual save was copied read-only and all construction, terrain, blueprint,
ship and history tables were verified unchanged after reading the copy with new code.

Chrome verified same-camera desktop/phone views, real door/room walking, wall-adjacent
jump landing, both delivery NPCs, replay idempotency, refresh, flight, three public
blueprints saved through the ordinary API and loaded in the player workshop, and
phone touch boarding. The final diagnostic run had no page errors or rejected moves.
Earlier driver overshoot and an unclassified two-409 replay remain archived as failures.
Targeted checks passed after replacing the old straight-checkpoint task fixture with
collision-resolved walking. One older fake-schema migration fixture still fails as
previously reproduced on the unchanged bilingual base; it is not counted as passing.

See [source mapping, screenshots and measured counters](docs/integration/village-density.md)
and the [full workshop inventory](docs/integration/workshop-module-audit.md). No new
Claude work, student reflection, push or public deployment was performed.

## R8 workshop: authorised local integration (7 October 2026)

Read Claude's committed c499dee snapshot against the actual host 5a73b228
baseline and copied 33 changed/dependency files byte-for-byte. The host now exposes
45 parts, three editable examples and their Chinese labels. New quick tree, pot
and bench placements directly share the unscaled blueprint parts, materials and
collision boxes. Schema13 stores immutable per-object asset versions so older
instances and historical replay retain their previous geometry and dimensions.
The real database's migration copy preserved every original row and column.

Extended rotated footprints and collision proxies for entrances, corner roofs,
verges, beams and low fixtures. The entrance uses one pitched support plane.
Physics5 preserves compatible airborne saves and rejects obsolete motion batches.
The last browser beam replay exposed radial descent into a counter side freezing
the character; a bounded fall-distance slide and an actual-stall regression repair
that case. No source-demo display lift is used for real placements.

Player workflow was tested before enriching the existing eight public blueprint
plots and 64-object scene with furniture, gardens, wall lamps, signs and cargo.
Chrome exercised real workshop assembly/save/reload, translated phone views,
public rooms/tasks/flight/touch, private ramp movement, normal quick-prop creation,
visitor read-only access and the existing light-pool fades. Measurements and
screenshots are retained in the R8 evidence folders. The final full unit run has
148 passes and the same three historical migration/movement fixture failures
previously reproduced on an unchanged baseline. Two obsolete catalogue/lighting
assertions were updated without weakening production behavior. Typecheck, lint,
build and evidence checks passed. See [the R8 record](docs/integration/r8-workshop.md).
No student reflection, independent source-workspace edits or public deployment.

## Planned main planet v12: local redesign (12 October 2026)

Reworked the public hub from one plan. The v11 town had density but no
street hierarchy. Its roads were 271 flat deck packs that rose 15 cm at
their edges on the sphere, and buildings crowded the walking width. The
plan now holds streets, plazas, lots, frontage runs, planting and
residents. A generator places buildings by measured footprint and eave
setbacks, joins each entrance to the paving and reports conflicts by
position. The game loads the frozen ledger. Streets are continuous
draped meshes with kerbs on the main streets, and the ground is graded
under them for drawing only. Seventeen appended workshop parts include a
two-cell long gable roof, which gives four-deep houses a ridge. Nineteen
public compositions became workshop examples.

The first browser pass showed grass covering the main street lane. A
string replacement in the terrain adapter had silently failed, so the
render grading never reached the mesh. I fixed it and rechecked in a
street-only debug page and in Chrome. The kit collider coverage test
failed for six new parts. I fitted the colliders to the meshes and
raised the shop noren above head height instead of exempting the
parts. While I was injecting sentinel bugs, a `git checkout` restore
also discarded uncommitted collider and plan edits. I reapplied them
from the session record and confirmed the plan's content hash matched
the pre-loss value. Typecheck, build and 193 related tests pass. The
full lint still fails on imported camera files I did not change. See
[the v12 record](docs/integration/planned-main-planet-v12.md). No push,
deployment or 8098 change.

## Teleport stations: local candidate (12 October 2026)

Added a teleport station to the harbour's arrival square and to every
home. The station is a moon-gate workshop part inside one shared
composition. The harbour and the homes use the same blueprint, and
players can load it in the workshop.

Only a completed flight landing marks a planet, inside the landing
transaction. A station teleports only to the harbour, your own home or
a marked planet. The server checks the gate and the mark, and replays
a repeated request without travelling twice. For old saves, the only
proof of a landing I could trust was a flight record that ended on the
current planet; the `visits` table was also written by the retired
atlas route.

My first version placed stations on every existing home when the
database opened. The related specs caught that: reopening must not
change content, and the integration migration audit relies on that. I
moved the one-time attempt to the owner's first visit home. A receipt
stops it from ever repeating.

The first real-Chrome pass hid the avatar on arrival. Facing away from
the gate put the follow camera inside the ring, so travellers now
arrive facing the gate. I did not change the camera code.

One new sentinel stayed green under its injected bug. A landing
response had already placed the station before the test measured the
home, so I moved the baseline before takeoff and saw it fail. See
[the teleport station record](docs/integration/teleport-stations.md).
No push, deployment or 8098 change.

## Teleport stations narrowed to home and harbour (12 October 2026)

After review the stations now link only each player's own home and the
harbour. The home gate offers "Go to the main planet". The harbour gate
offers "Return to my home", chosen from the player's identity. A
neighbour's gate offers visitors nothing. The server derives the single
allowed destination and refuses any other planet ID.

I removed the destination list, landing marks and the old-save
back-fill. Schema 16 and its existing rows stay, so the migrated
candidate database is unchanged. I checked the round trip both ways,
third-planet refusal and visitor refusal: each sentinel failed with
its check removed, and real Chrome passed at both sizes. No push,
deployment or 8098 change.
