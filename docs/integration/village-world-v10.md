# Village world v10

This local branch defaults to a continuous town on a 21.6 m-radius public planet. Markets, workshops, residential porches, waterfronts, reading and tea gardens, and a communal meal court use different plans. Northern roof variations preserve existing entrances and sealed roofs. Grass verges and harbour turning clearance remain. Public buildings stay in the exterior world; only the existing private owner home enters a separate interior.

The town has 273 objects: 144 building ledger entries, 106 road objects and 23 site objects, across 18 places and 12 rendering districts. Its 168 entrance approaches and 227 navigation routes describe authored coverage, not a claim that every route is continuously paved or every facade unique.

## Shared parts and residents

Three appended IDs—`wall.door-wide`, `wall.door-wide.open` and `step.entry-wide`—bring the shared catalogue from 45 to 48 parts without replacing old IDs. The residential doorway has a 2 m outer width and 1.384 m clear opening. Four continuous two-cell stair treads remove the raised centre seam. Public construction and player workshops share Chinese/English metadata, codecs, thumbnails and collision logic.

Blueprint limits remain 5×5 cells, three storeys and 120 parts; private worlds retain 64 objects and eight structures. The authored public limit is 512 objects, 320 structures and 12 districts, separate from performance limits.

Mica and Sol retain existing delivery roles. Ada, Ivo, Nell and Pax add delivery-aware conversations, alongside 12 ambient residents and four short patrols. No economy or additional quest system was introduced. Offline checks cover all 18 bodies, simultaneous patrols, fixtures and dialogue definitions; actual Nell dialogue is readable in both languages.

## Engineering and actual-play evidence

R3 passes typecheck, production build and course evidence checks. Lint reports zero errors/warnings across 425 files; fresh regression passes **510/510 tests in 90 files**. Production 60 Hz movement passes all 227 routes in both directions, connecting 1,390 nodes, 1,402 edges and all authored entrance approaches.

Representative wide-entry checks cover 141 bodies and walking/carrying animation sweeps. Five additional special entrances complete **5,216 local controller/actual-mesh ticks**, with zero body or clothing blockage, unresolved mesh ticks or upper-body/parcel contact. One shoe/sill tick per mode records approximately **1.058 mm** contact. This is not mathematical zero contact, dynamic-door testing or proof that every entrance received individual mesh testing.

The final actual-control run completes 16 desktop/390px-touch actions. Six additional sites complete all **220 original named stops**. Workcourt and meal-court completion each combines a preserved failed segment with an ordinary-reload continuation, using unchanged targets and the original 0.08 m height guard; neither is presented as an uninterrupted success.

Independent visual acceptance covers **14 globe originals and 348 ground originals**: 218 formal-action frames, 121 site/continuation frames and nine southlane recovery frames. The southlane supplement demonstrates turn-away and actual backtracking into a readable lane. Camera limits remain: some wall-facing headings hide the courier or route, foreground roofs obscure legs, and the courier can occlude Nell during conversation. Recovery and readable dialogue are documented; every-angle full-body visibility and continuous-video review are not claimed.

## Performance and resource limits

On an Apple M3 Mac with installed Chrome 154.0.8037.99, all 16 named actions and 16 approaches meet the predeclared local scheduling criterion: ≥5 seconds, ≥300 frame intervals, zero idle padding, p50 ≤20 ms, p95 ≤33.4 ms, p99 ≤50 ms, over-50-ms intervals ≤1%, and maximum ≤250 ms. The largest observed interval is 31.4 ms; none exceeds 50 ms. These are rAF scheduling measurements under capture, not GPU timing or guaranteed FPS.

Every action's sampled maximum exceeds the historical **250 draw-call / 250,000-triangle references**; overall maxima reach 480 calls and 722,057 triangles. A frame-target pass does not satisfy those references. Cached medium chunks stay within eight; lifecycle profiling passes eight return cycles and disposal checks.

Sampled maxima reach 121,881,816 town-buffer bytes and 358,763,086 used JS-heap bytes. Observations have gaps up to 327 ms and exclude complete process/GPU peaks. Readiness upper bounds are 6.076–6.204 seconds; completed entries at readiness report 2.30–2.33 MB transferred. These cached localhost observations establish neither physical-phone nor cold-device/WAN performance. The complete build is 218 files / 37,134,633 bytes, not initial download.

## Workshop, saves and local release

The retained 219-r1 actual workflow saved, installed, traversed, reloaded and picked up a 16-part wide-entry blueprint. R3 retains 270/272 identical component files; only whitespace and public capacity differ. The additional existing-north hub check could not open the workshop under the unchanged private-owner UI rule, so no R3 catalogue/reopen pass is claimed.

A verified read-only backup observes 207 players and protects every table/schema, including private worlds, ownership, names, groups, hashes, ships, tasks and history. Integrity checks and actual restore on a closed disposable copy pass with matching restored digests; the live database remains unchanged.

Local release targets localhost:8098. The procedure binds the commit to 393 frozen files and four local verification files, rebuilds into an isolated directory, compares all 218 output files, then switches code/dist with database-writer guards. Verification checks every static resource, five availability rounds over at least 40 seconds, and a read-only full-table save comparison. Rollback never replaces the live database. This describes the release method, not a completed cutover.

[Whole-globe evidence](../evidence/village-world/v10-final-r3/manifest.json) and [selected street evidence](../evidence/village-world/v10-final-r3/street-manifest.json) record exact version and image hashes. Original failures and camera limits remain preserved. No public push, deployment, Claude modification or Library upload is included; protected untracked outputs and tests remain intact.
