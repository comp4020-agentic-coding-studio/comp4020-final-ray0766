# Private building history — local verification

2026-10-06, branch `final/workshop-v1`, after ships `da022ef` and assessment
`c2b28e8`. This is engineering evidence, not a student reflection.

## Behavior and storage

The owner's pause menu opens My building history. A separate medium-detail Stage
renders snapshots, with an event selector, sequence slider, previous/next, baseline,
latest and play controls. The live scene and its colliders are never handed to the
preview. Closing releases models and the preview WebGL context.

Schema 8 adds heads, append-only events and immutable snapshots. Existing worlds
are imported at sequence zero with the actual integration timestamp and a visible
notice that earlier actions were not recorded. There are no fabricated creation
events for old buildings. New create/move/rotate/delete events are recorded inside
the existing authoritative `planet_objects` transaction. A move plus rotation makes
two events; unchanged writes, retries and repeated deletes make none. Snapshots are
written every 16 events, so snapshot reconstruction replays at most 15 events.
Claude's unchanged codec and existing pure decision/replay functions are reused.

The private GET endpoints are `/api/history?planetId=…&after=…&limit=…` and
`/api/history/snapshot?planetId=…&sequence=…`. Both derive ownership from the server
session and reject visitors, including reads of old/deleted structures. There is
no history-write/restore route. The public event actor is the label `owner`, never
the raw cookie or session hash. Historical blueprint parts are returned only with
an authorised snapshot that references them; library names/groups are omitted.
Pages default to 50 and cap at 100; responses cap at 1 MiB. The underlying blueprint
content now also has immutable update/delete triggers.

## Checks

- `.data/before-history-v7.sqlite` and a separate migration probe were created with
  SQLite's backup API before changes to the active DB. The probe migrated to schema
  8 with **all original nine tables row-for-row unchanged**, including ships, coats,
  flights, blueprints, placed objects and ground states; integrity was `ok`.
- The real server then produced its own consistent v7 `VACUUM INTO` backup during
  migration. Existing non-UUID object count was zero; no saved IDs were rewritten.
- Typecheck, lint and build passed. Main bundle is 701.70 kB / 198.36 kB gzip;
  the existing 650 kB warning remains (no threshold was raised).
- Focused main-project checks cover history, ships, planets, blueprints and physics.
  Five history cases include rejected visitor reads, bounded pagination, replay
  hashes, periodic snapshot reconstruction, immutable rows, no-event baseline,
  idempotency and forced transaction failure. The late-failure case aborts the
  second event of move+rotate and proves the first event, head and building all roll
  back. Course evidence checking also passes; old Crit 8 materials are unchanged.
- Headed installed Chrome passed the complete history test in 7.4 s. Real building
  controls created a temporary lamp, moved/rotated it, then deleted it. Four events
  appeared; the original saved objects remained exactly as before. Baseline, slider,
  playback, an already-deleted object's preview, refresh persistence and WebGL
  disposal were checked. 390×844 touch controls and two independent visitor API
  refusals passed with no page errors. The test Chrome contexts were closed.

[Browser result](browser-result.json), [desktop replay](desktop-replay.png),
[import baseline](imported-baseline.png), [phone replay](phone-replay.png).
Screenshots were visually inspected. This is phone viewport emulation, not a claim
about physical phone performance. Only the local 8098 preview remains; no push,
deployment or submission took place. Terrain changes are the next separate stage.
