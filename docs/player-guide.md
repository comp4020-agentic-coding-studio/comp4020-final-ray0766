# Little Worlds — player and implementation guide

A constellation made together: fly to a blank planet, make it your home, and shape
it with a small building kit. Everyone can visit every planet, while only its
owner can change it. Sunseed Harbour is an original industrial starport district
with a walkable arrival street, service buildings, a boarding apron and an optional
courier delivery. Existing coats, delivery progress and locations survive the move
to this multi-planet prototype.

## First visit: a home, one object, then back to your ship

1. At Sunseed Harbour, close the suit chooser and walk along the street to
   **STARPORT / 01**. **Pause → Find my ship** shows a walking direction. At the
   gate, press **E** or **Board your ship**, then **Launch ship**. **Stay here** or
   **Escape** cancels the confirmation and keeps you on the ground.
2. Open **Atlas** with **M** or from Pause. Choose a nearby **Blank · unclaimed**
   world and **Mark bearing**. This only points the way. Fly within 20 m of its
   centre and brake below 6 m/s, then choose the landing action and **Land and
   explore**. On touch, use the steering stick and **Thrust / Brake**.
3. On the blank world, open **Pause → Make this my planet**. Wait for the
   ownership controls to update. One browser identity can own one world; keep
   this browser’s data to retain access. A neighbour’s world is read-only.
4. Choose **Build on my planet**. Pick an object, tap clear ground, optionally
   **Rotate**, then **Place object**. The preview alone is not saved. If placement
   is blocked, read the placement message and choose another spot. **Cancel**
   drops the preview. Wait for the saved object before moving on.
5. **Done building** returns to walking; confirm discarding only if you want to
   lose an unsaved preview. Open **Pause → Find my ship**, follow the direction to
   your landing point and walk beside the return beacon. **Board your ship** is
   available there. Use **Launch ship** to leave, or **Stay here / Escape** to
   cancel. To revisit the public starport, mark **Sunseed Harbour** in Atlas and
   fly back; claiming and building do not move you there automatically.

Short first-visit tips follow this route beside the relevant controls. **Skip tips**
hides them without cancelling a build or moving the player. Reopen them
with **Pause → How to play → Show first-visit tips**. They finish after a saved
first object and a later takeoff. The preference is local to this browser;
existing builders start without tips unless they choose to show them. Tips hide
while a save connection is unavailable and while a separate workshop or modal is
open. Build tips sit after the existing controls in the scrollable build panel.

**Open workshop** is optional for the first object. It edits private named/grouped
blueprints; saving a blueprint to the library is separate from placing its
structure on your planet. The ready-made kit is available directly through
**Build on my planet**.

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
hub presents a human-scale industrial district on a much gentler display curve,
while preserving its original saved spherical coordinates. Drag the ground scene left or right to turn the view and smoothly turn your
character, including while standing still. Drag vertically to tilt only the camera.
W/Up moves forward, S/Down walks backward, and A/D or Left/Right strafe in the
horizontal view direction. The touch stick uses the same movement frame. A short departure shot rises over
the same district before the existing orbital flight begins. Private worlds remain available for their owners’ construction.

In space, hold W to thrust, A/D to turn, arrows up/down to climb or dive, and S or
Space to brake. You can drag to steer; phones have a stick and thrust/brake pedals.
Approach within 20 metres of a planet’s centre and slow below 6 m/s to land.
An original industrial craft, mechanical suits, public buildings, PBR materials
and restrained instruments establish the visual direction. The existing six-kind
player catalogue now uses the same high-quality material and structural resource
layer as the public district. Shared pure geometry is reused from a fixed committed
Claude resource snapshot. The integrated workshop also saves private blueprints
and places immutable structures on an owned planet.

The catalogue retains its saved cottage, tree, path, flowers, bench and lamp kinds.
They now render as panelled service cabins, foliage, metal deck tiles, planters,
metal benches and shielded lights. The cabin, floor and light share the public
district asset factory.
Enter Build mode, choose an object, tap an open ground position, rotate if needed,
and save. Select an existing object on the planet or from the accessible object
list to move, rotate or remove it. Leave Build mode to walk elsewhere. Placement
reserves the landing spot, separates objects and limits each planet to 64 objects;
path stones may overlap one another to form continuous routes.

This guide describes the implemented interaction and its limits. The current
quality argument and release status are in the root README. The Crit 8 writing
records the student's decisions with AI assistance; release evidence is separate.

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
Characters, city arrangement, ship geometry and interface are procedural work in
this repository. A fixed set of user-owned Claude geometry resources is reused for
the shared structural kit, with file hashes and attribution in the asset credits.
Orbital surfaces also use NASA SVS public-domain lunar maps; [asset credits](/credits/)
record their sources and terms. No game assets or source were extracted. Rendering uses
[Three.js](https://threejs.org/docs/), with Node’s SQLite for persistence.

## Run and verify

Use Node 24 and pnpm 11: `pnpm install`, `pnpm build`, then `pnpm start`.
Open http://localhost:8080 or `/readme/`. With the server running, use `pnpm lint`,
`pnpm check`, `pnpm test:browser` and `pnpm check:evidence`.

SQLite defaults to `.data/little-post.sqlite`. Upgrades create consistent backup
files before transactional migration. Recovery instructions and actual test
results are in `docs/evidence/round-6/verification.md`. Desktop and phone-size
Chrome checks cover walking to gates, flight/return, independent owners, visitor
presence, touch controls and persistence;
physical phones and public hosting remain unverified.

The constellation is capped at 256 worlds. Flight uses arcade steering, not orbital
physics. Local prediction can lose motion that was not yet acknowledged.

This guide describes the local candidate. The current release status is in the root
README. C10 logging and hosted validation remain unfinished.

The user-selected game reference qualities, what is implemented and what remains
absent are compared in `docs/adr/0005-starports-regions-and-presence.md`. The existing
`ColonyBridge` is exported for later UI adapters; `docs/integration/workshop-adapter.md`
describes the current server endpoints and validation boundary. The integrated
building workshop is optional; saved library blueprints remain
separate from their placed copies on a planet.

The current art/resource contract and editor division are documented in
`docs/integration/shared-assets.md`; display scale and reference decisions are in
`docs/adr/0006-shared-city-assets-and-display-scale.md`. Wall/stair/level assembly
uses the integrated Claude editor; the ready-made kit continues to place the six
compatible saved kinds. No commercial Star Citizen asset was imported.
