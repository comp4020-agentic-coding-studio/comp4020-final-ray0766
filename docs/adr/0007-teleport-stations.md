# 0007 — Teleport stations between landed worlds

Date: 2026-10-12. Local candidate decision; nothing is deployed.

ADR 0004 retired instant travel. The atlas marks a bearing only, and
`/api/planets/visit` answers 410. This round's request adds interstellar
teleport stations, so the retirement is narrowed, not reversed:

- A teleport starts only from a station gate the traveller is standing at.
  The server checks this from the saved position.
- It goes only to:
  - the public harbour;
  - the traveller's own home;
  - a planet that this browser identity has flown to and landed on.
- A mark is written only by a completed flight landing, in the same
  transaction as the landing. Fly-bys, sightings, atlas bearings and known
  planet IDs never add one.
- Flight stays the way to reach a world for the first time. The atlas
  still marks bearings only, and `/api/planets/visit` still answers 410.

The station is a workshop part. One composition built from it stands on the
harbour's arrival square and on every home, so the public scene and the homes
share one asset.

On a home the station is an ordinary owner object. The owner can move it,
remove it or place it again, and doing so never changes any marks.

Older homes get one automatic placement attempt the first time their owner is
home after this update, not when the database opens. Opening a database
therefore stays free of content changes, as the integration migration audit
requires. A receipt records the attempt, so a station the owner removes is
never put back behind them.

See [the teleport station record](../integration/teleport-stations.md).
