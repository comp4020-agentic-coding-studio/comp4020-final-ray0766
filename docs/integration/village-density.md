# Public village built from the player catalogue

Local continuation of `7dc0b01`, 7 October 2026. The user requested more actual
public-world content, then explicitly required the same pieces and rules available
to players. Published Crit 8 `09233d9`, its reflection, the independent Claude
workspace, private construction and all capacity limits remain outside this change.

## Result and source contract

The radius remains 14 m. Eight placed blueprint plots contain sixteen ground-floor
rooms: post lanes around the landing plaza, garden courts to the west/back, and two
port plots. Two plots include a second-storey silhouette. Existing NPC, arrival,
boarding and parked-ship anchors are retained. The central paired houses have an
open passage between them; parcel routes connect through that passage/plaza.

There are **64 catalogue objects**: 8 structures, 20 trees, 22 path tiles, 4 benches,
8 flower pots and 2 boarding lamps. The structures contain another 8 blueprint
lanterns, paving, fences/hedges and walls/roofs. This fits the existing 64-object /
8-structure limits without an exception. Counts distinguish complete objects from
parts inside blueprints; they must not be added as if they were the same measure.

| Public content | Player source and placement |
| --- | --- |
| Garden paired houses | `public/examples/village/garden.json`, 55 existing parts |
| Loft paired houses | `public/examples/village/loft.json`, 71 existing parts |
| Port paired houses | `public/examples/village/port.json`, 55 existing parts |
| Walls, doors, roofs, columns, hedge/fence, paving/lane, tall lamps | Existing `PART_IDS`, ordinary blueprint grid/support/overlap/budget validation, `buildBlueprintModel`, `structureFit`, `placedTransform` and `GroundWorld.structure` |
| Trees, path tiles, benches, flower pots, boarding lamps | Existing quick-build `CATALOGUE` and `builtObject`, exact dimensions and ordinary placement/collision proxies |
| Sphere, NPC avatars/beacons, courier, parked ship | Existing natural base, character and travel systems; not claimed as construction parts |

`src/shared/public-village.ts` supplies the same authored objects to renderer and
server/client collision. Every footprint passes the ordinary placement validator;
rotations are legal, and the three canonical blueprint hashes match the server's
normal save API. No new part IDs, privately scaled models or custom ribbon roads
are introduced. Public structures use the same ground-fit algorithm with the hub's
existing flat sphere field. Private terrain continues to use its own saved field.
Static public geometry is merged by shared material after ordinary model creation;
this preserves the source geometry's dimensions and its independent shared physics.
The public world remains system-owned, not visitor-editable.

The initial 24-house candidate used manually positioned parts and special roads.
It was superseded when the user clarified the source contract; its screenshots are
retained under `superseded-draft/`, not presented as the delivered layout. The final
16-house layout prioritises legal reproducibility and navigable plots. Existing
parts still limit varied roof/road/furniture forms; see the complete
[workshop inventory](workshop-module-audit.md). No new Claude work was commissioned.

## Physics and persistence

An off-centre room exposed a pre-existing radial-ascent problem: rising along the
sphere's normal can enter a flat side wall, but ascent clipping only treated steep
ceiling normals. A rejected frame could retain positive vertical speed indefinitely.
Version 4 clips any inward radial ascent. The same fix applies to public and private
rooms; normal walk/sprint limits, jump height and shared collision parts are unchanged.
All sixteen room entries and wall-adjacent ceiling jumps are exercised in unit tests.

There is no schema migration; SQLite remains version 12. Old movement batches are
rejected with the existing reload instruction. A valid private v3 saved pose retains
position, radius, velocity, grounded state and jump latch during the lazy version
upgrade; sequence/version/revision metadata fence older clients. Changed public
geometry may require safe standing recovery. No building, blueprint, ship, terrain
or history row is rewritten for this scene.

A read-only backup of the actual 8098 database was opened by new code in isolation:
205 player records were read, including 28 private-world visits. All non-revision
private player fields and all ten construction/history/ship/planet/visit tables
remained identical. There were no private v3 ground rows in that real copy, so the
additional airborne-v3 fixture separately verifies preservation of those fields.
See `docs/evidence/village-density/copied-save-recovery.json`.

## Evidence and limits

`before-*.png` and `before.json` were captured at base `7dc0b01`. `after-*.png` and
`after.json` use the same spawn/camera, 1440×900 and 390×844, Chrome 154 on this Mac.
The main renderer is measured for 2.5 seconds per view. 390px emulates a phone
viewport; it is not physical-phone performance. CPU time is submission time, not
GPU-synchronised time. Public scene measurements do not resolve the previously
recorded private capacity-scene 845/722 draw-call budget failure.

The `keyboard-driver-overshoot/` attempt overshot a narrow waypoint at a plinth edge.
The driver now pulses actual keys near doors and waits for momentum/telemetry.
The `unclassified-move-rejection/` replay completed the journey but recorded two
409s without error text, so it is retained as failed. Subsequent runs log error
messages and are assessed independently; earlier failures are not counted as passes.

The Messenger official site and the authors' Communication Arts image were viewed
as references. The official live app only reached a loading screen in this run;
no claim is made that its gameplay was exercised. No reference geometry, textures
or source code were extracted. Sources: [official app](https://messenger.abeto.co/),
[authors' article](https://www.commarts.com/webpicks/messenger).

Final verification: typecheck, lint, build and evidence checks pass. Across the
thirteen targeted files, 68 distinct tests pass; the remaining old blueprint-v4
migration fixture increments untouched planet revisions after artificially
lowering `user_version`, also recorded on the unchanged bilingual base. It is not
counted as passing. The updated task-store fixture now walks collision-resolved
samples instead of legacy straight checkpoints through the new centre buildings.
The final focused test report and Chrome `journey.json` are retained alongside
same-camera measurements; the final Chrome run reports no page errors or rejected
moves and confirms the additional 390px touch trip to the port.

| Same spawn view | Calls before → after | Triangles after | CPU submission median / p95 |
| --- | ---: | ---: | ---: |
| Desktop close | 142 → 136 | 117,344 | 0.810 / 0.903 ms |
| Desktop overview | 147 → 139 | 117,452 | 0.860 / 1.083 ms |
| 390px close | 131 → 130 | 116,864 | 0.747 / 0.760 ms |
| 390px overview | 147 → 139 | 117,452 | 1.017 / 1.067 ms |

These observations are below the unchanged medium scene ceilings of 250 calls /
250,000 triangles. They are not an FPS guarantee or a claim that the old capacity
scene is fixed. Stationary before/after pose differences are recorded in
`comparison.json`; CPU timings vary with browser scheduling and machine load.
