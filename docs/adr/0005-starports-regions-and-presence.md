# 0005 — Physical starports, finite regions and scoped ground presence

Status: implemented locally; no deployment authorised.

The user asked for a less dashboard-like world, physical travel entry, a richer
public hub, a larger connected universe and visible other visitors. The four
separately assigned Claude modules remain outside this implementation.

The hub keeps radius 10 and existing courier coordinates, but now has an industrial
street, a public gate, parked craft, connected service circuit and observatory.
Short walks retain the original spherical controls. The public gate is at a fixed
normal; private worlds reuse the previously protected landing normal. Their return
beacons and hovering craft are disposable scenery, not saved owner buildings.
No world objects, ownership or existing slots are overwritten.

Takeoff requires the server's saved walking point within 1.65 metres of the gate,
current ground mode, matching planet and journey. Position writes remain bounded.
The client reveals E/touch boarding slightly inside that radius and flushes walking
before confirming. Cancelling leaves the surface unchanged. Landing writes the
port normal so a visitor always has a clear return route; refresh without travel
still restores current saved walking position. Older per-planet visit rows remain
intact, but landing no longer restores a remote old walking spot. No schema change
is needed. Failed saves/offline state freeze controls and restore acknowledged state.

The survey seeds at least 33 worlds: fixed slots 0–8 are Harbour Belt, 9–24 Lantern
Reach, and 25–255 Outer Drift. Existing deterministic centres stay unchanged. New
plots replenish to six available blanks within the existing total limit of 256.
Atlas selection filters regions and marks bearings only. Orbit rendering allocates
at most eight detailed planets, 24 visible solid models and one batched distant
beacon layer; at most five near labels plus the selected target are shown.

A one-second presence heartbeat carries only expected planet and a unit facing
vector. The server derives identity, mode, position and suit from existing saves,
validates tangent facing and returns same-planet people under fresh public UUIDs.
Cookie tokens and database identity hashes never leave the server. Presence is
memory-only, bounded to 256 entries, expires in six seconds and clears on takeoff
or landing. A server restart naturally resets presence, without affecting saves.
Each response selects at most 16 nearest visitors; rendering uses at most four
full suits and simpler silhouettes for the rest. Position/facing interpolation is
cosmetic and never grants movement, quest or editing authority. Lost presence alone
does not mark durable player saves offline.

This scope includes ground people only. Remote spacecraft, chat, voice, accounts,
large-scale hosting and the external workshop modules are deferred. Four independent
browser clients and bounded server fixtures are the executed local coverage; that
is not a production concurrency claim. See round-5 evidence for executed results.

## User-selected game reference qualities

These are design directions explicitly supplied by the user, not a claim to
reproduce those games or to have inspected their implementations.

| Reference quality | Implemented in this iteration | Deliberate remaining gap |
| --- | --- | --- |
| No Man's Sky: explore, land, build, visit | Physical flight, landing/return, one owned world, read-only visits | No resource/survival/progression system; finite small-world survey |
| Star Citizen: walk to a port and board, with spatial scale | Public streets/gate, physical parked ship, server-checked boarding, restrained flight view | Boarding is a confirmed transition; no walkable ship interior or realistic city scale |
| Space Engineers: credible modular/structural form | Original mechanical hull, vents, frames, struts and material hierarchy | Craft is a fixed procedural asset; no functional modular ship/building workshop |
| Astroneer: direct actions in the scene and fewer menus | Nearby E/touch prompts, world-click placement, optional management in Pause | Current placement still uses draft/save controls; no direct grab/drag or magnetic snapping |

The current `ColonyBridge` is exported for a future UI adapter. Its actual API,
validation rules and unimplemented extensions are documented in
`docs/integration/workshop-adapter.md`. No external module was integrated. These
references did not add resource collection, survival, combat or an economy.
