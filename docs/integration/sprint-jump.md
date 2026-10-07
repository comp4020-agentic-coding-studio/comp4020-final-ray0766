# Sprint and jump — local movement milestone

The user explicitly requested hold-Shift sprint and Space jump while preserving
compact worlds, existing building physics, server validation, save recovery and
phone controls. This continues the scale milestone `c7fe9dd`; no map expansion,
new art pack, stamina system or double jump was added.

## Behaviour

Walking remains 3 m/s; holding Shift raises the tangent speed limit to 4.8 m/s.
Diagonal input is normalised and releasing Shift restores the walking limit.
Space applies a 5.2 m/s outward impulse with 12 m/s² inward radial gravity,
producing about 1.13 m of free jump height. A stored press latch prevents held-key
bouncing and midair repeats. One-tick input buffering preserves very short taps.
Blur, hidden pages and open panels clear controls; form editing and flight do not
consume ground shortcuts. Existing phone joystick controls are unchanged.

Client and server replay the same fixed-step capsule movement, with swept ceiling
checks using the existing collision shapes. Doorways, walls, stairs and supported
flat roofs retain their metre dimensions. Public village cabins, trees, gate and
ship now share authoritative collision anchors with rendering. They are transient
public infrastructure, not owner objects or extra saved building/history rows.
The small contact-shadow blob is hidden while airborne; normal rendered shadows
remain. Camera clipping and a compact airborne pose use the same standing state.

Ground batches carry bounded sprint/jump flags, never a client-selected height or
velocity. The server validates time, speed, collision, sequence and physics version.
Boarding is denied while airborne. Presence uses validated position/height and
interpolates snapshots every 250 ms so a short jump is visible to another visitor.
This is still bounded local presence, not a new multiplayer architecture.

## Persistence

Schema 12 backs up v11 before rebuilding the ground-state constraint to permit
positive jump velocity and adds the held-jump latch. All previous stored columns
are copied exactly. Physics version 3 fences stale clients and lazily recovers old
standing rows. An interrupted airborne visit resumes its acknowledged height and
vertical velocity on return, rather than accepting arbitrary client coordinates.
World radii, ownership, blueprints, placed anchors, task state, ships and history
are unchanged by this migration. The 64-object / 8-structure caps remain intact.

A fresh real-v11 copy passed migration and a comparison of every old column/row
across all 12 tables: 201 players, 35 placed objects, 22 library entries, 13 ships
and 57 visits. Integrity and foreign-key checks passed. The distribution remained
81 gardens at 10 m, two at 11 m, two at 12 m, and the public harbour at 14 m. These
counts describe that preflight snapshot, not a fixed limit or a user census.

## Verification

- 70 targeted tests passed: 52 physics/state/migration checks across 10 files plus
  18 HTTP, course, terrain and presence checks across 6 files. New cases cover both
  poles on all four radii, held/repeated jump suppression, rotated ceilings, jumping
  wall collision, stairs/roof landing, sprint bounds, forged flags, retry fencing,
  saved upward velocity, visitor height and v11 backup/recovery.
- TypeScript, ESLint, Vite production build and the evidence checker passed.
- Chrome 154.0.8037.98 completed the final real-control journey in 55.4 seconds with
  no page errors or rejected movement requests. Verified two visible identities,
  held/repeated Space, Shift travel, blur reset, modal typing, real flight/landing,
  sprinting jump on a 12 m planet, cabin ceiling, stairs/roof, airborne reload and
  390×844 touch descent. The blur handler was dispatched explicitly; the other
  movement inputs used real browser keyboard/touch events.
- The first recovery test run passed all 52 tests but found a test-local type
  annotation and two lint declarations; these were fixed. An earlier Mac disconnect
  lost session 91753, so no result was claimed from it.
- The first browser journey was deliberately interrupted after the test neglected
  the existing confirmation for discarding an edited fixture ship name. The corrected
  driver accepts that fixture-only dialog. Its incomplete report is retained.
- Screenshot inspection identified the airborne contact blob; its visibility was
  corrected and a separate short Chrome jump/landing captured the final rendering.

Evidence: [completed journey](../evidence/sprint-jump/browser-result.json),
[interrupted driver](../evidence/sprint-jump/initial-interrupted.json),
[final visual check](../evidence/sprint-jump/final-visual.json),
[final jump](../evidence/sprint-jump/final-airborne.png),
[roof jump](../evidence/sprint-jump/roof-jump.png), and
[phone descent](../evidence/sprint-jump/phone-stair-return.png).
The public free-jump peak was 1.125 m; the cabin ceiling limited ascent to about
0.414 m, and the roof jump landed at its original standing radius. A second
identity visibly reached a received radius above 15 m on the 14 m harbour.

Phone dimensions are desktop Chrome emulation, not a physical-phone test.
Full-capacity graphics performance was not rerun; this does not resolve or replace
the earlier 845-draw capacity measurement. No push, public Crit8 update, Fly deployment,
student reflection or submission occurred. Existing open pages must reload after
an update to the walking protocol.
