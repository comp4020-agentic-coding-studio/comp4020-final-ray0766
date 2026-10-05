# 0004 — Flying between fixed worlds

Date: 2026-10-05. Local prototype decision; no deployed result is claimed.

The user asked for controllable travel through a coherent 3D universe instead
of clicking a world to arrive immediately. Keep the existing spherical walking,
one-home ownership, owner-only building, saved scenes and read-only visiting.

Each planet now has a persistent integer slot. A deterministic square spiral maps
slots to fixed 3D centres, at least 90 metres apart. This is a bounded constellation
(up to 256 worlds and a 5,000 metre navigation radius), not an infinite universe.
An atlas button marks a bearing only. The production instant-visit endpoint is
retired with HTTP 410. The harbour remains the optional delivery location.

Space navigation is arcade flight, with capped speed and turn rate, thrust, drag,
braking, pitch limits and swept sphere collision. It does not simulate orbital
mechanics. A separate Three scene shares the renderer with the existing surface
scene. The ship is original procedural work. Orbital lunar textures are separately
credited NASA SVS public-domain assets; no game-reference asset is extracted.
A chase camera follows heading without using radial surface-up in space. Landing
returns to the saved surface walking position (or the reserved initial spot).

The browser predicts motion and sends serialized checkpoints approximately every
350 ms. The server validates finite bounded coordinates, speed/acceleration/turn
budgets, swept planet clearance, the current journey and checkpoint sequence.
Landing requires the last acknowledged ship position to be within 20 metres of
the planet centre and speed at most 6 m/s. The collision hull stays 13 metres from
centres. A collision stop is allowed without applying the normal brake budget.
Ground movement and NPC actions are rejected while in space. This is bounded
client prediction with server validation, not a fully authoritative physics server.

Journey numbers fence takeoff and landing replays; checkpoint sequence numbers
fence competing tabs. Exact retries are idempotent. SQLite v4 adds slot and flight
state fields after a consistent v3 backup, keeping all previous data. Refresh
restores the acknowledged mode, heading, position, speed and target. Unacknowledged
motion can be lost; a network error freezes inputs and reconnects to saved state.
The browser's offline flag also prevents a late successful response resuming flight.

A launch and landing confirmation allows cancelling before a persisted transition.
Keyboard, drag steering and touch stick/pedals use the same motion rules. Atlas and
other modal dialogs pause simulation. This is intentional for a local arcade
prototype and does not establish synchronized multiplayer flight.

The browser regression operates ordinary keyboard/touch controls using visible
cockpit instruments; it does not set player positions or call a teleport endpoint.
Separate tests exercise invalid requests, retries, actual database reopen and
migration preservation. Shared-avatar multiplayer, physical phones, heavy network
load and public deployment remain outside this iteration.
