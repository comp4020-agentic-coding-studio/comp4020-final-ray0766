# LOD R4 — bounded local integration

2026-10-06 UTC, `final/workshop-v1`, after `0409605`. This is factual engineering
evidence. No student reflection, new system, deployment or broad optimisation was added.

## Source and scope

The independent source workspace was clean at
`e7a6b4d59ef31d2250564634c9dbce1982a86d89`. Its four commits after `a4546bb` were
`b10a3cb`, `3b06de4`, `aa9609e` and `e7a6b4d`. Inspection of the actual source diff
and `docs/INTEGRATION.md` §9 confirmed exactly three production files changed:

- `style/geometry.ts`: bolt heads have the same visible side surfaces and top
  area with no hidden bottom, 16 triangles instead of 24. `minChamfer` defaults
  to zero; builders outside the building kit keep their original bevel policy.
- `blueprint/parts/kit.ts`: the medium kit turns chamfers below 5 mm into hard
  edges. High keeps chamfers; low already omits them. Interior lining receives
  shadows but no longer casts redundant shadows; low's shared-material case is
  deliberately excluded from that cast-shadow adjustment.
- `blueprint/model3d.ts`: applies the lining shadow policy to assembled buildings.

These files were copied byte-for-byte from the committed source. The manifest's
base `commit` remains `a4546bb120d969774776f1fbe2cb1c990a7c3e66`; `fileCommits`
explicitly records **59 files at that base and these three at e7a6b4d**, with each
file's actual SHA-256. All 62 were checked against their recorded commit blobs.
Textures, HDRI, transcoders, versioned resource URLs, source art and remaining
vendored code were unchanged. The main adapters, client behaviour, physics,
server routes and database schema were also unchanged.

Representative source comparison images were actually inspected in
`/Users/ray/Desktop/Study/ANU-Master/For-ai/planet-modules-lod-r4/`:
`compare-3-walk-1m.png` and `compare-7-phone-overview-medium.png`. Door/window/stair
forms and overall composition remained recognisable in those views. Source §9
reports its own showcase medium result of 251,369/224 → 218,053/222
(triangles/calls), seven focused browser checks, and low's 109/120-call budget.
Those are **source-workspace reports**, not main-world measurements below. No new
low draw-call optimisation or repeat of that showcase suite was attempted here.

## Contract finding: one small exception to the source description

Before replacement, a Node fixture captured all 21 catalogue parts, two assembled
buildings and three starter ships across high/medium/low: **78 entries**.
[Before geometry](before-geometry.json), [after geometry](after-geometry.json).
It records metadata, triangles, material calls, bounds, fitting emitters, part
sockets, ship exhaust frames and ship solid bounds/radius.

The first targeted run passed 14/15 tests; an exact-bound assertion caught a
**0.000794679 m** increase on the medium window wall's +Z render bound. The same
window appears in the two measured buildings, so some of their X/Z bounds also
change by 0.000794649 m. This is not literally an unchanged mesh envelope.
The cause is the 4 mm bevel on the window's sun hood, rotated 0.2 radians:
removing the bevel restores its corner by `sin(0.2) × 0.004 ≈ 0.000794677 m`.
[Finding and changed axes](bounds-finding.json).

Only those three medium fixtures differ; all other measured bounds match within
0.000001 m, including door, floor and stair pieces. Ship solid bounds, radii,
exhaust frames, all metadata, fitting emitters and sockets are exactly unchanged.
The original strict comparison was replaced with an explicit expected offset
only for those known window-hood axes, rather than a blanket relaxed tolerance.
No source fix or geometry rescaling was applied. The collision contract remains
independently authored in `src/shared/physics/parts.ts`; it does not extract mesh
bounds. Door/stair behaviour was then checked in tests and the real browser.

| Medium fixture (geometry only, not a rendered frame) | Before triangles | After triangles |
| --- | ---: | ---: |
| Industrial cabin | 16,652 | 12,892 |
| Survey post | 41,460 | 32,388 |
| Starter ship 0 | 14,073 | 13,233 |
| Starter ship 1 | 11,432 | 10,792 |
| Starter ship 2 | 10,518 | 10,006 |

All low fixture triangle counts and all fixture material draw-call counts remain
unchanged. The source's small-bevel rule reaches main scenery emitted through
`makeKit`; ship builders retain the zero default and only lose bolt bottoms.

## Main-world Chrome measurements

Installed **Chrome 154.0.8037.98**, headed, on **Apple M3 / ANGLE Metal**; DPR 1,
1920×1080 desktop and 390×844 emulated touch viewport. Production builds were
served at `http://127.0.0.1:8098`. These are the actual Little world 47 save and
its original cabin, stairs and saved Hauler, not the source showcase.

Before/after use identical saved feet, radius, camera heading and pitch, freshly
loaded with reduced motion. Each view samples the existing main canvas counters
12 times, 100 ms apart after settling; every sample agrees. These are
`renderer.info.render` frame submissions, including the renderer's shadow work,
not just unique model triangles. Frustum and viewport affect the totals.
[Before browser](before-browser.json), [after browser](after-browser.json),
[comparison](comparison.json).

| Main-world view | Before triangles / calls | After triangles / calls | Triangle reduction |
| --- | ---: | ---: | ---: |
| Desktop, beside cabin | 65,222 / 114 | 54,374 / 113 | 16.63% |
| Phone viewport, same save | 53,398 / 97 | 43,190 / 96 | 19.12% |

The practical-light pool still has two spots and two points with zero shadow
slots; it assigns the same two active ceiling/door fittings in both builds.
The exterior sunlight shadow remains visible. Lining cast/receive flags and
exterior cast flags were separately asserted for individual and assembled
buildings at medium/high. Visual inspection of main screenshots found no missing
walls, door frame, stair surface, ship part or unintended dark region.

- Building: [before](before-building.png) / [after](after-building.png).
- Saved ship close view: [before](before-ship.png) / [after](after-ship.png).
- Phone: [before](before-phone.png) / [after](after-phone.png).
- [Inside the open door](after-door-inside.png) shows the warm fitting and lining.
- [Upper floor after refresh](after-stair-refresh.png) shows the staircase,
  saved height and parked custom ship.

The after-browser journey passed in 29.1 s (32.3 s including runner startup):
actual keyboard traversal through the existing rotated door, back outside and up
the existing staircase; refresh retained the upper-floor position at 2.2 m.
Opening, closing and reopening the blueprint workshop worked. The saved planet
record, all original building transforms and ship design were unchanged. There
were no page errors and no phone-width horizontal overflow. This round did not
repeat the full flight/history/terrain journey or physical-phone interactions.

## Verification and failures

`pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm check:evidence` passed.
The final bounded command passed **15/15 in four files**:

```sh
APP_URL=http://127.0.0.1:8098 pnpm exec vitest run \
  spec/lod-r4.test.ts spec/r3.test.ts spec/physics.test.ts spec/invariants.test.ts
```

The four R4 tests cover the 78 baseline contracts, visible bolt surfaces/default
non-kit chamfers, lining/exterior shadow flags, and shared-resource lifetime.
A disposed model releases its owned geometry/materials/textures once, while a
sibling building and ship retain shared resources; library disposal releases
those resources once at the end. Existing fitting/resource/asset tests, six
physics cases and the two course HTTP invariants also pass. The build has no
chunk-size warning; its largest chunk is 397.85 kB. No budget was raised.

The local server from the previous turn had exited before the first baseline
attempt, which failed with connection refused ([record](server-start-failure.json)).
It was restarted. The next attempt hit the cabin because the driver's inside
check included a point just outside its corner ([record](baseline-route-failure.json),
[image](baseline-route-failure.png)). The driver was narrowed and given an actual
outside-corner route; baseline capture then passed in 13.7 s. Product movement
code was not changed. The exact-bound test failure is separately recorded above.
The final after-browser attempt passed on its first run.

No full 393-test source suite, full browser suite, long-session leak/stress test,
GPU-time measurement, frame-rate improvement claim, public load or physical-phone
benchmark was performed. The measured counts apply to these views only. Low's
source showcase call margin remains tight and was not changed by this integration.

The independent Claude source remains clean at e7a6b4d. Published main remains
`09233d9f0b8dac873d0d15e8367eec90e8b532e3` with no tracked edits, and its 100
pre-existing untracked copies were preserved. Crit 7, Crit 8 reflection/PROCESS and
previous evidence were not edited. Test Chrome contexts were closed; only one
8098 local preview remains. No push, deployment, paid action or submission occurred.
