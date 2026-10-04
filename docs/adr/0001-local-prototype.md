# ADR 0001: Local spherical courier prototype

Status: implemented locally, pending student review. Date: 2026-10-05 (Canberra).

## Context

The authorised C8 milestone needs a playable core and server persistence. The
course template is stack-neutral, but fixes one 256 MB machine and one /data
volume. Existing Final remote contained only initial commit 07b2f35. An independent
clone and branch preserve that lineage without touching Crit7 or resurrecting the
cancelled implementation.

## Decision

Use TypeScript and Three.js on the client, Vite for bundling, Node 24 HTTP and
built-in SQLite for the server. The native SQLite API avoids native-addon build
steps. The server can execute erasable TypeScript directly. Browser identity is a
random HttpOnly cookie; only its hash is kept as the database key. State is small:
coat, quest phase, delivery count, position, revision and last movement timestamp.
SQLite uses WAL and FULL synchronous mode; writes are synchronous and the two
quest changes are individual atomic statements.

The controller rotates a unit radial vector along a great circle and transports
its tangent frame with the same quaternion. It never derives heading from a
latitude/longitude pole. Camera orientation follows that transported frame with
exponential damping; screen directions remain consistent. Character heading is
smoothed independently, so changing direction does not swing the camera around.

## Alternatives and costs

A React UI or game engine would add architecture before the first interaction
needs it. The small DOM interface currently needs neither. JSON file persistence
would require extra transaction/recovery work; SQLite supplies it. node:sqlite is
still runtime-version-sensitive, so Node 24 is required and its experimental
status must be revisited before production. This single-process design is for the
course's single-machine shape; it does not implement multiplayer replication.

Movement is client-rendered with bounded server checkpoint validation. This is
not a competitive anti-cheat system. Saved proximity is authoritative for quest
transitions, but decorative collision is currently client-side. A retained cookie
restores a visit; losing it loses access to that identity. No login or recovery UI
is in scope.

## Validation boundary

Local tests and screenshots are listed in ../evidence/verification.md. Fly volume,
TLS cookie behaviour behind its proxy, deployed cold starts and memory under a
real multiplayer load remain unverified until authorised deployment work.
