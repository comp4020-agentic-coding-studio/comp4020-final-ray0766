# ADR 0003: Owned worlds with shared read-only visits

Date: 2026-10-05 (Canberra). Status: implemented locally.

## Scope and identity

The user explicitly authorised a multi-planet building loop. Keep the courier
prototype's scene quality, controller and stored delivery, while making the star
map and personal building the primary experience. No chat, economy, OAuth, email
collection or public deployment is part of this change.

The existing 256-bit random HttpOnly cookie identifies an anonymous session; only
its hash is stored. A cookie is a bearer credential, not proof of a real person.
New profiles and cleared cookies create separate identities. Losing the cookie
loses access to an owned planet; no transfer/recovery is implemented. Owner hashes
are not exposed in public planet data.

## State and authorisation

`planets.id` is unique; `owner_id` is unique and references a player. An immediate
SQLite transaction reads and updates a claim. Two callers cannot own the same
row; one identity cannot own two rows. The public harbour cannot be claimed.
The server keeps six unclaimed worlds available as claims are made.

The server authorises every object create, update and delete before applying its
payload. No client-supplied owner parameter grants authority. JSON writes retain
the existing same-origin check and per-session rate limit. Positions must be
finite unit vectors, rotation bounded, models from the fixed catalogue, and
placements outside the landing clearance and other footprints. Each planet has
64 object slots. Path stones may overlap only other path stones.

Object IDs make repeated creation idempotent. Deletion writes a tombstone in the
same transaction so a delayed creation replay cannot resurrect it. Versions
reject stale moves/rotations/deletes. Repeating an applied transform or delete
is harmless. Scene revision increments accompany mutations.

Each identity stores one active visit and positions per planet. Visits and
movement are serialized by the client; movement includes its expected planet so
a stale tab cannot overwrite a newly visited planet's position. Multiple tabs
sharing a cookie share that visit; separate profiles represent separate people.

## Synchronisation and interface

Visible clients poll saved scene state every second. This suits the small local
prototype without a WebSocket service. It does not stream other players' movement
or render their avatars. Hidden pages pause polling and refresh on return. No
production load or latency guarantee is claimed.

The star map labels blank, owned and neighbour planets. Only an owner sees the
editor, but the server independently enforces that rule. The editor uses ground
picking, a preview, explicit save, direct object picking and an accessible saved-
object selector. Character input pauses during building and modal map use. A
visitor already inside a newly placed obstacle can walk outward.

## Migration and rollback

Schema v1 is backed up with VACUUM INTO before the transactional v2 migration.
The development v2 schema receives a backup before v3 adds tombstones. Fresh
databases go directly to v3; higher unknown schemas are refused. No old player
columns are dropped or rewritten. See the round-three verification for actual
backup paths and the preservation comparison.

To review rollback without losing newer worlds, stop the current process and
retain the current database. Use a separate checkout of `b98e0ce`, copy the v1
backup to a new database filename, and set DATABASE_PATH to that copy. Do not run
the old application against the current v3 file or against the only backup.
