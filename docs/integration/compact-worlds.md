# Compact worlds — local scale milestone

The user asked to return to the first Messenger-inspired small-world feeling,
reduce empty travel, retain the new village assets and existing gameplay, and keep
saved player layouts safe. This is an engineering record, not a student reflection.

## Scale and spatial decisions

The first prototype (`b98e0ce`) used a 10 m sphere. The preceding local release
`f2a350a` displayed the public harbour on an 800 m sphere with stereographic
compression 0.048. That produced a large, shallow city district. The public harbour
now has a real 14 m radius and identity projection. New/untouched gardens receive
stable 10, 11 or 12 m radii by slot. Owned, built, occupied or historically edited
old gardens remain 10 m. Avatars, modules, relief, speeds, IDs and 64-object /
8-structure caps are unchanged. The server persists and returns radius.

The four existing cottages, four lamps, nine trees and three benches form a short
village loop. Two cottages now sit about 5 m from spawn, framing the route.
Main paths are 1.35 m wide, side paths 1.15 m (quiet branches 0.9 m); the curved
ship pad is 3.8 m across its radius. No decorative population was added to fill space.
Spawn→Mica is 7.37 m (previous projected arc 20.48 m); Mica→Sol is 11.37 m
(previous 32.71 m); Sol→dock is 5.27 m. At 3 m/s these are roughly 2–4 seconds
of direct unobstructed travel, excluding acceleration, steering and interaction.
NPC and boarding normals are retained. The old layout is preserved verbatim in
`src/client/harbour-city.ts` and Git; restoring it also requires its old projection.

Walking cameras retain the first small-sphere boom: desktop 4.6 m up / 6.8 m back;
phone 6.4 m up / 9 m back from the local surface. Whole-planet view now targets
the planet centre and faces the village, fitting the complete globe in portrait
and landscape. It is an optional overview, not a scale substitute.

References: [Messenger](https://messenger.abeto.co/) and the
[author's Communication Arts interview](https://www.commarts.com/webpicks/messenger).
The author describes continuous small-planet exploration and automatic camera
centring. No original models, code, textures or audio were extracted. Browser
inspection of our first compact screenshots motivated only the final cottage
placement and overview correction; this is not a claim to reproduce Messenger.

## Coherent geometry and save recovery

Schema 11 adds `planets.radius`. A consistent v10 backup precedes migration.
Owned/built/currently occupied/history-bearing or previously visited worlds are excluded from resizing.
A saved spacecraft near an otherwise blank enlarged garden keeps that garden at
10 m; one inside the enlarged harbour clearance aborts and rolls back the entire
migration, rather than moving the craft or silently changing a save.

Shared radial fields translate the immutable terrain kit's 10 m reference.
Terrain vertices, water, normals, metre-sized foundations, collision, placement,
previews, flight clearance, departure and landing use the same radius. Host
adapters correct shader altitude and the empty atmosphere shell. Vendor files
remain untouched. Physics version 2 fences old movement clients and recovers old
standing states on return. Blueprint documents, object anchors and history rows
are not rewritten. Radius is not a client-writable editing field.

## Verification and evidence

- TypeScript, ESLint and production Vite build passed.
- 57 targeted checks passed across 12 files: geometry/terrain, pole and reversal
  motion, collision, migration, flight, boarding, state, ownership, save rollback,
  presence/synchronisation and both supplied HTTP course checks.
- Initial test failures were stale radius/schema fixtures, an incorrect internal
  claim call in a new test, a strict floating-point comparison, and a prototype
  Colony fixture missing the existing shadow helper. Corrected and rerun.
- Real Chrome 154.0.8037.98 completed the concentrated journey in about two minutes:
  copied v10 identity recovery, same coat/quest/position/ship, public pickup/delivery,
  real keyboard flight/landing to 11 m and 12 m worlds, owner construction,
  doorway/interior walking, refresh and 390×844 touch control. No page errors or
  rejected moves. Test identities used normal owner APIs for building fixtures.
- Focused subsequent framing checks rewalked the affected public route after moving
  the two cottages; close/overview screenshots at 1440×900 and 390×844 were inspected.

See [journey report](../evidence/compact-worlds/result.json),
[final framing report](../evidence/compact-worlds/final-framing.json),
[before close](../evidence/compact-worlds/before-hub-close.png),
[final close](../evidence/compact-worlds/final-hub-1440-close.png),
[final overview](../evidence/compact-worlds/final-hub-1440-overview.png), and
[12 m private interior](../evidence/compact-worlds/radius-12-cabin-inside.png).
The before/after harbour views use the same saved spawn and heading. Cameras and
geometry intentionally differ; these are comparable viewpoints, not pixel-matched
camera matrices. Earlier compact framing captures remain alongside the final ones.

The concentrated journey measured 140 main-scene draw calls in the public close
view, 102 in each single-cabin private close view, and 94 at phone dimensions.
2.5-second stationary rAF samples had p95 around 16.7–16.8 ms; submission CPU medians
were 1.4–1.9 ms. These are desktop Chrome timings, not GPU timing or a physical-phone
benchmark. Final framing measurements are recorded separately. This small-scene
check does not retest or solve the earlier 845-call full-capacity result.

No push, Fly deployment, public Crit8 change or submission is part of this milestone.
The newly requested Shift sprint and Space jump follow in a separate local commit.

Before rollout, a fresh read-only-source backup of the real v10 database migrated
successfully in isolation: all original values across 12 tables were equal except
planned blank-planet revision increments. This includes 200 players, 35 placed
objects, 21 library rows, 12 ships and 57 visits. All 78 owned gardens retain10 m.
The resulting distribution is 80 gardens at10 m, two at11 m, two at12 m, and the
public harbour at14 m. Integrity and foreign-key checks passed.
