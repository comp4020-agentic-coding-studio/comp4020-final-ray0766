# Cross-module stability — local verification

2026-10-06, branch `final/workshop-v1`, following terrain `7315137` and private
history `a695ed4`. This records engineering actions and observations, not the
student's reflection. No new gameplay system, schema change or deployment was added.

## Measured loading change

[Before](before-load.json) and [after](after-load.json) record Vite output chunks,
static/dynamic import edges, rendered module contributions and Chrome resource
entries. Both used the normal Vite configuration and the same existing owned-world
browser identity. A fresh Chrome 154.0.8037.98 context at 1440×900 captured resource
entries one second after scene status became Live. Build inspection used Vite's
`build({build:{write:false}})` API; gzip estimates use Node `gzipSync` defaults.
They are estimates, not measured HTTP compression. The initial JS total includes
**every transitively static imported chunk**, not just the entry file.

| Measure | Before | After |
| --- | ---: | ---: |
| Initial JS, raw bytes | 1,036,472 | 917,895 |
| Initial JS, summed gzip estimate | 295,346 | 266,050 |
| Initial static JS chunks | 2 | 6 |
| Largest JS chunk, raw bytes | 785,920 | 397,311 |
| Observed non-API resources, decoded bytes | 1,924,887 | 1,796,403 |

Initial JS decreased **118,577 bytes (11.44%)**. This trades four extra first-screen
JS requests for less code. All observed texture/media paths and pinned versions
are identical. The existing 650 kB chunk warning disappeared without changing
Vite's warning threshold, assets, texture pipeline, lighting or LOD.
The finite resource snapshot is not a page-speed, GPU or network benchmark.

The four optional interfaces now import on demand. Gameplay model construction,
terrain rendering and shared renderer dependencies remain available immediately
because saved buildings, terrain and ships can appear in the first scene.
The after-build entry is 94,388 bytes; presenting that alone as initial JS would
omit 823,507 bytes of required shared code.

| Deferred interface | Own JS bytes | Shared deferred dependencies | First opening JS bytes* |
| --- | ---: | --- | ---: |
| Blueprint workshop | 27,998 | Stage | 104,004 |
| Shipyard | 5,626 | Stage | 81,632 |
| Private history | 7,259 | Stage + planet preview | 84,600 |
| Terrain preview | 6,299 | Stage + planet preview | 83,640 |

*Excludes already-loaded static chunks. Stage is 76,006 bytes and planet preview
1,335 bytes; later interfaces reuse them. Interface CSS also loads on demand.
The optional KTX2 loader was already deferred and is unchanged. The tested default
WebP path did not request it. Browser-only imports remain in client adapters;
no server/shared import path was changed to load a DOM or WebGL interface.

## User-visible fixes

- Loading an optional interface leaves Pause usable. A failed import presents a
  recoverable message and a Reload page button; closing Pause while loading does
  not subsequently open a stale interface. Successful instances are reused.
- The real browser cached a deliberately failed dynamic import. Retrying after
  reconnecting was insufficient in that run; the explicit Reload page action
  recovered the saved world and then opened terrain preview. This is not a claim
  of full offline operation or guaranteed retry without reload.
- The first complete replay exposed a real workshop lifecycle bug: close and
  reopen caused `StyleLibrary has been disposed.` The source view subscribes to
  its editor for its lifetime. The integration now retires the editor with the
  disposed view and creates a new editor/callback for the next opening. Source
  modules, assembly rules and part snapping are unchanged.
- Dirty building placement/rotation now prompts before exit, changing selection
  or changing catalogue item; cancelling the prompt retains the draft. Page
  unload also protects a positioned draft. Server-authoritative world changes
  still clear obsolete local editing state.
- Input fields do not trigger the building R shortcut. The desktop and phone
  editor checks confirmed text entry left the live character's feet unchanged.
- Terrain Apply explains replacement, building re-seating and the absence of
  undo, then asks for explicit confirmation. Dirty close reads Discard preview.
  Cancelling application or closing preview leaves live terrain unchanged.
  No undo, restore, audit log or automatic old-world terrain migration was added.

## Bounded checks

`pnpm typecheck`, `pnpm lint` and `pnpm build` passed. The production build includes
the workshop lifecycle fix. Typecheck/lint also passed after the final driver
changes. `APP_URL=http://127.0.0.1:8098 pnpm exec vitest run spec/invariants.test.ts
spec/history.test.ts spec/blueprints.test.ts` passed **13/13 in three files**.
`pnpm check:evidence` passed. Server code did not change; this round did not rerun
the 393-case source suite, a long stress run or the complete prior terrain suite.
Previous terrain, history and ship evidence remains available in adjacent folders.

`APP_URL=http://127.0.0.1:8098 pnpm exec playwright test
 tests/e2e/stability.spec.ts --headed` passed **1/1**, about one minute for the
journey, in installed Chrome 154.0.8037.98. [Machine-readable result](smoke-result.json).
The single bounded journey checked:

1. Existing owner save, deferred-resource absence and failed-import recovery.
2. Terrain preview, rejected Apply confirmation and unchanged legacy environment.
3. Blueprint text input, cancel/accept draft discard, close/reopen, save and place;
   rejecting exit after a temporary rotation preserved the draft and stored object.
4. Actual keyboard movement through the original rotated cabin doorway and up the
   original stairs to the saved 2.2 m floor. No teleport or player-position rewrite.
5. Earlier/latest private history and close returning to the same live floor;
   replay did not restore or modify live objects.
6. Saved custom Hauler, protected ship draft, real stair descent and walk to port,
   launch, return flight, landing and refresh preserving ship/buildings/terrain.
7. A 390×844 touch viewport: lazy ship/history/terrain panels, text-input isolation,
   draft discard, preview cancel, touch-stick movement and exact saved position
   after refresh. No horizontal overflow was observed.
8. Independent visitor at the public hub: owner interfaces hidden; both history
   endpoints returned 403 when targeting the owner planet; the blueprint endpoint
   returned that visitor's empty library despite an owner query; deleting an owner
   building returned 403. This round did not fly that visitor to the owner planet.

No page errors occurred in the successful owner desktop/phone journey.
Screenshots: [door entry](door-entry.png), [history](history.png),
[return approach](return-flight.png), [cancelled terrain](terrain-preview-cancel.png),
[phone history](phone-history.png), [phone preview](phone-preview.png),
[phone return](phone-return.png). Door/history/phone images were visually inspected.

## Failed attempts retained

The first driver used an unavailable Playwright matcher; it was corrected to a
supported value assertion ([result](driver-matcher-failure.json),
[image](driver-matcher-failure.png)). The next run exposed the real disposed-library
bug above ([result](workshop-reopen-failure.json), [image](workshop-reopen-failure.png)).
Two later runs stopped on driver route assumptions: movement overshot a narrow
entrance ([result](door-approach-failure.json), [image](door-approach-failure.png));
then the persisted starting point was inside the cabin, requiring a doorway exit
before routing outside ([result](saved-indoor-route-failure.json),
[image](saved-indoor-route-failure.png)). The shared test helper now uses shorter
near-target movement pulses and a tighter stopping tolerance, and the journey
handles an indoor saved start. Product collision, speed and physics were unchanged.
The final successful run follows those corrections; failed evidence was not erased.

Only the newly created temporary floor fixture was removed during cleanup. The
original cabin and stairs were compared exactly against their initial records and
retained. Saved test blueprints, custom ship and real building events remain in
the test identity's private state. Cookies and databases stay ignored in `.data/`.
The temporary-object recovery file is absent after success. The SQLite integrity
check is `ok`, schema remains 9, Little world 47 still has its two original objects
and null environment, and only the previously opted-in Little world 68 has terrain.

## Preservation and remaining limits

All 62 vendored TypeScript files still match Claude source bytes and manifest
hashes at `a4546bb120d969774776f1fbe2cb1c990a7c3e66`; that source workspace is clean.
The published repository remains at `09233d9f0b8dac873d0d15e8367eec90e8b532e3`
without tracked changes. Its 100 existing untracked copies were untouched.
Crit 7, Crit 8 reflection/PROCESS/release evidence and previous integration evidence
were not rewritten. No push, paid service, deployment or submission occurred.

Initial JS is still about 918 kB uncompressed and WebGL remains substantial work.
A cached module-fetch failure can require the visible reload action. Full offline
play, physical phones, public load and repeated long sessions were not benchmarked.
Terrain has no undo; prior water/decoration/conservative flight-sphere limits remain.
Identity remains the anonymous browser cookie, without account recovery.
All test Chrome contexts were closed; one local server remains at port 8098.
