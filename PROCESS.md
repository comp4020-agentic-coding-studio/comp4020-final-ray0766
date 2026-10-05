# Implementation evidence — Little Post

This document records engineering actions for the local prototype. It is not the
student's 900–1100 word process argument and must be rewritten by the student
before submission. No personal reflection or judgement is attributed to them.

## Starting point and scope

The course Final repository was independently cloned into the authorised Mac
workspace. The remote contained only
[`07b2f35`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/07b2f35),
the course template. Work proceeded on `prototype/small-world-c8`. The template's
Dockerfile, fly.toml, CI workflow, package scripts and spec were read before
implementation. No existing uncommitted Final work was overwritten. Crit7 and the
cancelled/deleted implementation were not modified or recovered.

The user authorised a Messenger-inspired learning prototype with original assets:
a spherical world, following camera, two NPCs, one delivery and saved character /
quest state. Earlier Hamlet planning was treated as historical context, not as an
approved feature specification. Current C8 and Final pages were checked. The
reported local C8 time was not verified against MyTimetable and is not asserted
here.

## Implementation and corrections

`docs/adr/0001-local-prototype.md` records the stack and controller decisions.
`src/client` contains the scene, camera/controller and interface. `src/server`
contains SQLite storage and request validation. `src/shared/world.ts` holds the
small shared world contract. The local implementation is recorded in
[`c02a639`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/c02a639)
(this commit has not been pushed, so the web link becomes available only after
an authorised push). The shipped HTTP invariant tests remain intact.

The first browser screenshots showed a blank world although the canvas existed.
The temporary camera-pose object used Object3D.lookAt, whose forward convention
is opposite to Camera.lookAt. Replacing it with a camera repaired the orientation.
This correction is captured in CLAUDE.md and the browser check now requires the
NPC labels to be visibly projected as well as an actual rendered-world inspection.
Review of movement also found that normalising a linear blend of opposite heading
vectors can prevent a full reversal; the turn now uses a signed angular rotation,
with a regression test.

## Evidence and remaining student work

Following the user's request for a closer visual and interaction study, the live
Messenger was opened in Mac Chrome. The opening dialogue and normal play camera
were observed and brief forward input tried. Its close character framing, dense
streets, flatter shading and small interface informed a second implementation
round. This is a limited direct observation, not a systematic playtest or a claim
that the original architecture was reverse engineered.

The second round adds original procedural cottages, postal props, a glasshouse,
connected lanes, pond and windmill; articulated couriers; a close camera with
optional overview; contextual dialogue and a smaller HUD. A coarse occlusion
silhouette keeps the player's position visible behind props. Static scenery is
merged by material. Existing server persistence and task schema are unchanged.
The old radial visibility approximation hid NPC labels with the close camera;
a camera-to-label sphere intersection and edge-clamped active marker repaired it.
Before/after screenshots, actual rendering samples and the expanded browser
regression are recorded in `docs/evidence/round-2/verification.md`.
The implementation and captured evidence are in local commit
[`e1e1d54`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/e1e1d54),
which has not been pushed.

See `docs/evidence/verification.md` for executed commands, browser coverage and
remaining limits. Screenshots in that folder are generated from the local app.
No push, public visibility change, Fly deployment or course submission was made.

The student still needs to write their own definition of good, audience and source
argument in README.md; develop this factual record into their process argument;
write reflections/crit-8.md; and later produce the COMP8020 research note. The
current reflection file is explicitly unfilled. A green mechanical evidence
check does not mean those academic requirements are complete.

## Original multi-planet direction

The user explicitly authorised a new main loop: claim an empty planet, build only
on one's own planet, and visit everyone else's planet read-only. This replaces
the earlier single-planet restriction. The courier task remains an optional
activity in Sunseed Harbour, not the central loop.

The database migration used VACUUM INTO to create a consistent v1 backup before
adding planets, objects and per-planet visits. A second incremental migration
adds deletion tombstones. All 32 pre-existing saved identities were compared
field by field against their pre-migration values, with no losses or changes.
Ownership uses a unique owner column and immediate transactions. Building writes
derive identity from the session cookie, validate ownership and placement on the
server, and use versions to reject stale edits. Tombstones prevent replaying a
deleted object's original creation request. No account service was connected.

The original building kit contains six object types. Owners place, rotate, move
and remove objects; visitors receive saved scene revisions through one-second
polling. Build mode pauses character controls. The catalogue and saved-object
selector supplement direct 3D selection. The star map explains anonymous identity
and the loss of access after clearing browser data.

Independent Chrome contexts exercised separate ownership, read-only visits,
live scene updates, editing and refresh/return. A phone-size context used touch
placement, checked that building input did not move the courier, and recovered
from offline state. One phone test tapped sky before the overview transition
completed; it now waits for that transition before choosing a fixed screen point.
Initial-request recovery was repaired and tested to initialise the star map
without a reload. Reconnection also restores the acknowledged walking position.

Actual checks, screenshots, backup paths, recovery instructions and remaining
limits are recorded in `docs/evidence/round-3/verification.md`. This engineering
record does not invent the student's design argument or user-study findings.
The multi-planet implementation is recorded in local commit
[`733c543`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/733c543),
which has not been pushed.

## Continuous travel and course-folder relocation

The user authorised replacing instant star-map visits with a controllable ship in
one spatial constellation. Planets receive persistent slots and deterministic
centres; the Atlas now marks bearings only. Original procedural ship geometry,
heading-based chase camera, keyboard/drag/touch controls and approach instruments
connect takeoff to surface walking and building. Server checkpoints validate
motion and collision clearance; landing requires saved proximity and low speed.
Journey and sequence numbers fence stale requests. Database v4 preserves existing
state and restores flight position, heading, target and mode after reconnecting.

The user also authorised moving the whole repository into
`/Users/ray/Desktop/Study/ANU-Master/8020/comp4020-final-ray0766`. The destination
was absent. A consistent backup preceded the move. Directory inode, 106 file
hashes, Git HEAD/remote/status and all pre-existing table fields were verified.
The old workspace no longer contains a second implementation. Local schema
migration retained 93 characters, 39 planets, 23 placed objects, 48 visit records
and five deletion tombstones unchanged in their previous fields.

Actual flight tests use keyboard/touch input and cockpit readings. They do not
teleport the character to pass travel checks. A blocked straight bearing led to
an explicit turn-away/climb test route and a collision-departure regression.
Offline handling was adjusted so a late successful response cannot resume flight
while the browser reports offline. The existing ownership/building journeys now
fly between worlds. Real container restart retained a claimed world, saved tree
and a second journey stopped in space. Executed checks and limits are recorded in
`docs/evidence/round-4/verification.md`; the design boundary is in ADR 0004.

Four possible Claude modules were discussed only as isolated future work. No
external contact, source transfer or implementation of those modules occurred.
This remains factual engineering evidence, not the student's reflection.

After reviewing the first flight view, the user changed its art direction from
cartoon low-poly to a more mature industrial science-fiction sample. The flight
scene now uses an original mechanical ship, layered metal/glass materials,
procedural wear and crater maps, restrained instruments, a distant scale cue and
smoothed steering/camera/engine feedback. Actual Chrome captures guided a second
adjustment to overly bright hull values and overly noisy planet texture. This
scope retains earlier ground art and does not implement the proposed Claude
workshops. `docs/evidence/round-4/visual-study.md` records the art boundary and
sources. No proprietary game asset or paid asset service was used.

A final close-up review found the procedural crater circles too artificial. The
NASA SVS CGI Moon Kit page and usage terms were checked; its public-domain LROC
colour and LOLA elevation images were downloaded, bundled locally and credited
in ASSET-CREDITS.md and /credits/. No runtime third-party fetch is required.

The completed flight implementation and visual evidence are saved in local commit
[`f590257`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/f590257).
It has not been pushed; this link will resolve on the remote only after an authorised push.
