# 0007 — Teleport stations between home and harbour

Date: 2026-10-12. Local candidate decision; nothing is deployed.

ADR 0004 retired instant travel. The atlas marks a bearing only, and
`/api/planets/visit` answers 410. This round's request adds teleport stations,
so the retirement is narrowed, not reversed:

- A station links exactly two places for each player: their own home and the
  public harbour (the main planet). From your home's gate you can only go to the
  harbour. From the harbour's gate you can only return to your own home, which
  the server chooses from your identity.
- A neighbour's gate offers visitors nothing.
- The server derives the one allowed destination itself. It refuses a submitted
  third planet ID and a request from a visitor at another home's gate.
- Flight stays the only way to reach any other world. The atlas still marks
  bearings only, and `/api/planets/visit` still answers 410.

An earlier version of this round also unlocked other planets through landing
marks and listed them as destinations. The user withdrew that. Schema 16 keeps
the `teleport_marks` table and its existing rows so that migrated databases stay
compatible, but nothing writes or reads it any more.

The station is a workshop part. One composition built from it stands on the
harbour's arrival square and on every home, so the public scene and the homes
share one asset. On a home the station is an ordinary owner object.

Older homes get one automatic placement attempt the first time their owner is
home, not when the database opens. Opening a database therefore stays free of
content changes. A receipt records the attempt, so a removed station is never
put back behind its owner.

See [the teleport station record](../integration/teleport-stations.md).
