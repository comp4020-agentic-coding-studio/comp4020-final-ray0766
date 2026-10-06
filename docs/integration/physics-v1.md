# Ground physics milestone

This local milestone follows workshop commit `3392d67`. Claude owns geometry,
materials and lighting; the main project owns movement and collision. The 31
vendored source files remain the unchanged `db79d7350decb4167d12e1a980a293cdb77cea83`
snapshot. No collider is extracted from a render mesh.

## Contract

`src/shared/physics/parts.ts` maps every stable part ID to local box proxies in
metres: +Y up, +Z exterior. It uses the existing cell/edge/vertex anchor, grid pivot,
quarter-turn placement, 2.2 m storey and terrain-fit base radius. A structure's saved
radial normal, yaw and immutable blueprint hash retain their meaning.

| Parts | Physical treatment |
| --- | --- |
| Decks, grates, flat roofs, paving and pad | Solid slab; top supports feet |
| Solid/window/louvre/corrugated walls | Solid wall envelope |
| Open door | Separate jambs, lintel, low threshold and folded leaf; opening is traversable |
| Closed door | Same frame plus solid closed leaf; no door animation in this milestone |
| Columns, guards and parapets | Solid barriers; no automatic climb over them |
| Straight stair | Eleven 0.20 m risers, solid treads and side rails; conservative filled underside |
| Sloped roofs, roof plant, pipes and lights | Conservative solid proxies; no walking up a sloped roof |
| Existing cottage/tree/bench/lamp | Previous round obstacle footprint |

The radial capsule is 1.60 m tall and 0.18 m in radius. Movement advances at 60 Hz
with horizontal substeps no longer than 0.035 m. Contact normals slide tangential
movement along walls. Reachable support can raise feet by at most 0.26 m; floor
normals steeper than 45 degrees to gravity are not supports. Support probing includes
one substep of edge tolerance so a riser is selected before its vertical face blocks
the capsule. Gravity is radial at 12 m/s², capped at 10 m/s falling speed. No jump,
crouch, dynamic rigid bodies or player-to-player pushing is included.

The unit `position` still locates a character on the sphere. A separate ground
state holds foot radius, downward speed and grounded status. This distinguishes
floors at the same surface direction. Private-planet walking speed compensates
for height; the public harbour projection and its existing movement are unchanged.
The follow camera clips against collision proxies, including ceilings, and shortens
inside rooms. This changes camera obstruction behavior, not art or light settings.

## Saving and validation

Schema 6 adds `ground_states`; it does not alter existing tables or reinterpret
saved normals, blueprints or flight coordinates. A consistent schema-5 backup was
made first, and the migration was exercised on a separate copy before starting the
working database. Disk migrations also make their own `VACUUM INTO` backup.

Private-planet `/api/move` requests send at most 28 direction/time samples, a sequence
number and final direction, inside the existing 2 KiB limit. Sample time is bounded
to 0.05 s. The server checks unit finite directions, physical walking speed, elapsed
server time with at most 2 s of accumulated allowance, sequence and final-point
agreement. It replays the shared collision rules against the server's saved scene;
height and grounded status are computed by the server. Unknown movement fields are
rejected. Repeating an identical acknowledged sequence is idempotent; conflicting
or stale requests are rejected. The old direction-only API is swept through static
geometry and cannot choose a floor or bypass a wall.

This is server validation/replay of client checkpoints, not a fully server-authoritative
input simulation or a general rigid-body engine. Presence shares only the validated
foot radius alongside its existing public ephemeral visitor state. Ownership and
blueprint permissions are unchanged.

Geometry revisions invalidate cached collision worlds. A removed floor starts a
fall from the saved height. A moved wall that encloses a saved character triggers a
bounded local search for a free position, with the protected landing point as a
fallback. Takeoff clears ground height; landing starts from the landing surface.
Changing tabs or losing connectivity reconnects to an acknowledged state.

## Local use

```sh
cd /Users/ray/Desktop/Study/ANU-Master/8020/final-workshop-v1
pnpm install --frozen-lockfile
pnpm build
HOST=127.0.0.1 PORT=8098 pnpm start
```

Open <http://127.0.0.1:8098>. Walk with WASD/arrows or the touch stick. Drag the world
to turn the camera. The workshop's Industrial cabin has an open door. Build a supported
stair and upper landing to reach another floor; a tall foundation on steep ground
still needs an accessible entry within the step limit.

Do not run schema-5 code against this database. To roll back locally, stop the server
and restore the matching pre-physics SQLite backup, retaining the current database
as a separate recovery copy. These backups and test cookies remain private in `.data/`.
Publishing and production migration require separate user approval; no push or
deployment is part of this milestone.
