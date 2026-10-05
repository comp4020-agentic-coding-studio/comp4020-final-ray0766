# Little Worlds

A constellation made together: fly to a blank planet, make it your home, and shape
it with a small building kit. Everyone can visit every planet, while only its
owner can change it. Sunseed Harbour is an original industrial starport district with a connected
service loop, an observatory landmark and an optional courier delivery. Existing coats, delivery progress and locations survive
the move to this multi-planet prototype.

## Current design brief

The user authorised an original direction beyond the Messenger learning
prototype: many worlds, one home per browser identity, and shared exploration
without editing someone else’s work. The main loop is walk to a real gate, board,
fly, land, claim, build and revisit. Follow the blue-lit street from the public
arrival point to STARPORT / 01. Only near the terminal does the E / touch boarding
prompt appear. The server checks the saved walking position, current planet and
journey before taking off. Cancel either transition to stay where you are.

Exploration shows the world, a small location/status line and contextual actions.
Open Pause / Escape for Atlas, help, optional delivery, suit and planet controls.
M opens the Atlas. Planet management and building appear only when requested.
On other worlds, a temporary return beacon and parked craft mark the landing point.
They are travel infrastructure, not objects belonging to the planet owner; new
private worlds have zero placed objects. Pause → Find my ship gives an optional
walking direction. Landing disembarks beside this safe return point; refreshing
on the ground restores the last saved walking position.

The finite survey starts with 33 worlds in Harbour Belt, Lantern Reach and Outer
Drift; it can replenish blank plots up to a hard 256-world limit. Existing planet
slots and coordinates never move. The Atlas shows regions and distances and only
marks a bearing. Nearby hops remain short; outer routes take longer. The public
hub is still a walkable small sphere, with connected places rather than an enlarged
empty surface. Private worlds remain available for their owners’ construction.

In space, hold W to thrust, A/D to turn, arrows up/down to climb or dive, and S or
Space to brake. You can drag to steer; phones have a stick and thrust/brake pedals.
Approach within 20 metres of a planet’s centre and slow below 6 m/s to land.
An original industrial craft, mechanical suits, public buildings, PBR materials
and restrained instruments establish the visual direction. The existing six-piece
building catalogue remains a prototype kit; no external workshop module is integrated.

The catalogue contains cottages, trees, path stones, flowers, benches and lamps.
Enter Build mode, choose an object, tap an open ground position, rotate if needed,
and save. Select an existing object on the planet or from the accessible object
list to move, rotate or remove it. Leave Build mode to walk elsewhere. Placement
reserves the landing spot, separates objects and limits each planet to 64 objects;
path stones may overlap one another to form continuous routes.

This describes the implemented, agreed brief. The student’s own argument about
quality, audience and research still needs to be written and reviewed. It is not
an authored academic position or a substitute for the required reflection.

## Ownership, persistence and visitors

A random HttpOnly, SameSite browser cookie identifies a server session. SQLite
stores ownership, object transforms, task state, current walking position, visit records and
flight mode/position/heading/speed. Refresh resumes the last acknowledged state.
Server journey and sequence checks reject old flight writes; distance, turn,
acceleration and collision checks bound navigation. Landing checks saved proximity
and speed. Offline flight freezes until a saved state is restored.
The database enforces one owner per planet and one planet per identity. Claim
transactions resolve races. Every building write checks server-derived ownership;
client owner IDs or hidden buttons cannot grant permission. Requests validate
models, coordinates, rotation, overlap and capacity. Version checks reject stale
edits, duplicate operations do not multiply objects, and deletion tombstones
prevent an old create request from resurrecting an object.

Visitors see saved scene changes through one-second polling while their page is
visible. Visible ground visitors also exchange one-second presence heartbeats.
Positions come from validated server saves; facing is checked against the surface.
Responses contain random ephemeral public IDs, suit, position and facing, never
cookies or session hashes. Only people on the same planet are returned. Departure
removes presence and a missing heartbeat expires after six seconds. Smooth local
interpolation draws at most 16 nearby people, with at most four detailed suits.
Presence does not change ownership, saved objects or quest state. Multiple tabs of
one identity share one visit and one presence record. There are no remote ships,
chat, voice, social accounts or trading. This is a bounded shared-world prototype,
not an unlimited MMO.

Orbit rendering loads at most eight detailed planets and shows at most 24 solid
planet models; distant worlds use one batched beacon layer. Only nearby/selected
world labels are displayed. Each planet remains limited to 64 saved objects.

An anonymous identity is not a real-world person. New browser profiles can create
new identities. Clearing cookies loses access to the owned planet, which remains
visitable. There is no login, cross-device identity or recovery flow. The Atlas
explains this before claiming. These limits need revisiting before public release.

## Original work and references

[Messenger by abeto](https://messenger.abeto.co/) informed spherical movement and
camera exploration; its [authors’ interview](https://www.commarts.com/webpicks/messenger)
provided technical context. The live experience was also inspected in Chrome.
Characters, buildings, ship geometry and interface are original procedural work.
Orbital surfaces also use NASA SVS public-domain lunar maps; [asset credits](/credits/)
record their sources and terms. No game assets or source were extracted. Rendering uses
[Three.js](https://threejs.org/docs/), with Node’s SQLite for persistence.

## Run and verify

The active workspace is `/Users/ray/Desktop/Study/ANU-Master/8020/comp4020-final-ray0766`.
Use Node 24 and pnpm 11: `pnpm install`, `pnpm build`, then `pnpm start`.
Open http://localhost:8080 or `/readme/`. With the server running, use `pnpm lint`,
`pnpm check`, `pnpm test:browser` and `pnpm check:evidence`.

SQLite defaults to `.data/little-post.sqlite`. Upgrades create consistent backup
files before transactional migration. Recovery instructions and actual test
results are in `docs/evidence/round-5/verification.md`. Desktop and phone-size
Chrome checks cover walking to gates, flight/return, independent owners, visitor
presence, touch controls and persistence;
physical phones and public hosting remain unverified.

The constellation is capped at 256 worlds. Flight uses arcade steering, not orbital
physics. Local prediction can lose motion that was not yet acknowledged.

This is local work. Student writing, C10 logging and deployed validation remain
unfinished. Push, public visibility, Fly costs/deployment and submission require
separate approval.

The user-selected game reference qualities, what is implemented and what remains
absent are compared in `docs/adr/0005-starports-regions-and-presence.md`. The existing
`ColonyBridge` is exported for later UI adapters; `docs/integration/workshop-adapter.md`
describes the current server endpoints and validation boundary. The separately
assigned modules have not been integrated.
