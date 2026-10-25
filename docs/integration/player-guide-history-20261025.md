# Historical player-guide snapshot — 25 October 2026

Frozen before the local functional close-out. This mixed prototype account includes later patched paragraphs; it is preserved for provenance, not current controls or new verification. Use [the current player guide](../player-guide.md).

---

# Little Worlds — current player guide

This section describes the current integrated app and the local Final candidate.
The dated evidence and the older implementation account below remain historical
records. Release status is in the root [README](../README.md); the current bug
inventory and its limits are in the [Chinese bug summary](BUG-SUMMARY.zh-CN.md).

English is the default on first visit and when no valid language preference is saved.
Use the language selector to choose Chinese; explicit choices survive refreshes.

## Start with the identity you have

- In the new local integrated candidate, a new browser identity begins at the
  main village while its own home is prepared in the background. The welcome
  card offers picture quality; the optional guide follows Mica → Sol → the
  village gate → your front door. Confirm the nearby action at each step.
  Home preparation failures offer Retry and resume after a server restart.
  Skip the guide or reopen Pause → Village guide without resetting progress.
  After owning a planet, Pause → Build on my planet / Open workshop is optional.
  Keep this browser's cookies. Check README for published release status;
  the current local candidate contains additional, unpublished changes.
- An old identity without a home keeps its saved location and progress. At the
  harbour gate the bilingual message explains why it cannot return home yet.
  Use Guide → Find ship, board at the saved gate, choose an unclaimed world and Depart.
  The ship takes off and lands automatically. Then use Pause → Make this my planet.
- An existing owner whose home has no gate is a different case. Return by ship;
  station preparation can follow on the owner's visit. If there is no suitable
  site, use Pause → Place a teleport station. Saved buildings are not moved to
  make room. A dismantled station is not automatically rebuilt.
- Owning a planet and having an enterable room are separate. An older owner
  without a room can use Set up my home to bind a doorway or confirm a cottage.

## Save, travel and visit

Walk with WASD/arrows, hold Shift to sprint, and E or a nearby
button to interact. On desktop, click the scene or the look control, then move
the mouse without holding a button. Movement follows the camera; Esc, menus and
focus loss release the cursor. Click again to resume. Touch devices retain drag,
the movement stick and action buttons; browsers without mouse capture retain
manual dragging. Any outdoor teleport gate can return you to the main planet or your own home. At a neighbour's gate, **E / Go to the main planet** returns to the harbour; **Return to my home** goes directly home. Without a home, the harbour remains available. If your home has no gate, you arrive at its landing pad. Gates do not grant permission to build or enter a neighbour's private room. Other exploration uses flight. Board beside the saved port position and choose your destination.
Choose a destination. Takeoff, flight and landing are automatic. Drag to look around. Click a planet to confirm a new destination. Skip waits for preparation; Cancel returns to departure. Planet names can be changed only by their owners; the server rejects normalized duplicate names.
Bounded nearby-world preparation continues in the background. Progress and Retry remain real; it does not preload
the entire universe.

All room entry and restoration use the same fixed 2.5D view. There is no indoor
3D/follow-view switch. Entering releases mouse capture; leaving restores the outdoor
view. Room walking, furniture editing, door actions and fixed-angle photos with
zoom remain available under the existing permissions.

The opening screen keeps the approved device notice visible before modules load.
Try Smooth if loading or movement struggles; a stronger computer may help, while
network or browser settings can also cause failures. No particular GPU is a
validated minimum. The main-planet welcome image does not load a second world.

Ground and flight movement save periodically. The status distinguishes pending,
saving and acknowledged movement; a refresh restores the last acknowledged
checkpoint, including flight mode. A slow or interrupted request can leave later
movement unsaved. Blueprint library saves, placement/apply, ship designs and room
layouts each require their own explicit action. Save blueprint does not place it.

Only the owner may build, edit furniture, enter the private room or read private
history. A nearby visitor can operate the shared exterior door, which does not
permit room entry. Open the door before entering or leaving. Unsaved room layouts
now request the browser's native leave/reload confirmation, including while a
save is pending or has failed. Save successfully or explicitly cancel to clear
that guard; it is not automatic draft persistence after a browser crash.

The local Final candidate records business actions using observation-only aliases,
with bounded journals beside SQLite and stdout, as described in [ADR 0009](adr/0009-business-observation.md).
This does not create accounts or cross-device recovery. Two classmates' URL-only
Crit 10 session and user judgement of the visuals remain separate from automated checks.

---

## Earlier implementation account — historical snapshot

The rest of this file preserves earlier prototype directions, first-visit flow,
local ports and verification limits. Its statements about an industrial harbour,
empty new homes, fixed landing distances, running 8098 and unfinished C10 logging
are historical, not current instructions or new evidence of a regression.


A constellation made together: fly to a blank planet, make it your home, and shape
it with a small building kit. Everyone can visit every planet, while only its
owner can change it. Sunseed Harbour is an original industrial starport district
with a walkable arrival street, service buildings, a boarding apron and an optional
courier delivery. Existing coats, delivery progress and locations survive the move
to this multi-planet prototype.

### First visit: a home, one object, then back to your ship

1. Walk to **STARPORT / 01** or your parked ship. Guide → Find ship points there.
   Press **E / Board your ship**, choose a named destination, and **Depart**.
2. Enjoy the automatic flight and landing. Drag to orbit the view. **Skip journey**
   waits for destination preparation and confirmation; **Cancel · return to departure**
   changes the trip back to its origin. A click on a visible planet opens confirmation;
   cancelling that dialog keeps the current destination. There is no manual driving.
3. On the blank world, open **Pause → Make this my planet**. Wait for the
   ownership controls to update. One browser identity can own one world; keep
   this browser’s data to retain access. A neighbour’s world is read-only.
4. Choose **Build on my planet**. Pick an object, tap clear ground, optionally
   **Rotate**, then **Place object**. The preview alone is not saved. If placement
   is blocked, read the placement message and choose another spot. **Cancel**
   drops the preview. Wait for the saved object before moving on.
5. **Done building** returns to walking; confirm discarding only if you want to
   lose an unsaved preview. Open **Guide → Find ship**, follow the direction to
   your landing point and walk beside the return beacon. **Board your ship** is
   available there. Use **Launch ship** to leave, or **Stay here** to
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

### Current design brief

The user authorised an original direction beyond the Messenger learning
prototype: many worlds, one home per browser identity, and shared exploration
without editing someone else’s work. The main loop is walk to a real gate, board,
fly, land, claim, build and revisit. Follow the blue-lit street from the public
arrival point to STARPORT / 01. Only near the terminal does the E / touch boarding
prompt appear. The server checks the saved walking position, current planet and
journey before taking off. Cancel either transition to stay where you are.

Exploration shows the world, a small location/status line and contextual actions.
Press Tab in the game scene, or click Menu (Tab), for Atlas, help, appearance and planet controls. Inside menus, Tab / Shift+Tab navigate controls. Esc only releases mouse capture; use Close or Resume to return, then click the scene or Click to look to recapture.
M opens the Atlas. Planet management and building appear only when requested.
On other worlds, a temporary return beacon and parked craft mark the landing point.
They are travel infrastructure, not objects belonging to the planet owner; new
private worlds have zero placed objects. Guide → Find ship gives an optional
ground route. Landing disembarks beside this safe return point; refreshing
on the ground restores the last saved walking position.

The finite survey starts with 33 worlds in Harbour Belt, Lantern Reach and Outer
Drift; it can replenish blank plots up to a hard 256-world limit. Existing planet
slots and coordinates never move. The Atlas shows regions and distances and only
selects a destination, with confirmation before changing an active trip. Nearby hops remain short; outer routes take longer. The public
hub presents a human-scale industrial district on a much gentler display curve,
while preserving its original saved spherical coordinates. Drag the ground scene left or right to turn the view and smoothly turn your
character, including while standing still. Drag vertically to tilt only the camera.
W/Up moves forward, S/Down walks backward, and A/D or Left/Right strafe in the
horizontal view direction. The touch stick uses the same movement frame. A short departure shot rises over
the same district before the existing orbital flight begins. Private worlds remain available for their owners’ construction.

Choose a destination. Takeoff, flight and landing are automatic. Drag to look around. Click a planet to confirm a new destination. Skip waits for preparation; Cancel returns to departure. Planet names can be changed only by their owners; the server rejects normalized duplicate names.
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

### Ownership, persistence and visitors

A random HttpOnly, SameSite browser cookie identifies a server session. SQLite
stores ownership, object transforms, task state, current walking position, visit records and
flight mode/position/heading/speed. Refresh resumes the last acknowledged state.
Server journey and sequence checks reject old flight writes; distance, turn,
acceleration and collision checks bound ordinary navigation. Automatic arrivals use
a separate, versioned trip receipt and prepared destination, without weakening those
checks. Offline flight freezes; reconnect/refresh offers Resume, Skip or Return.
Pause → Name my planet changes only the owned planet. Names use 1–32 characters;
trimmed, NFKC-normalized case-insensitive duplicates are rejected in a SQLite
transaction. Stable IDs, permissions and saved objects are unchanged.
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

### Original work and references

[Messenger by abeto](https://messenger.abeto.co/) informed spherical movement and
camera exploration; its [authors’ interview](https://www.commarts.com/webpicks/messenger)
provided technical context. The live experience was also inspected in Chrome.
Characters, city arrangement, ship geometry and interface are procedural work in
this repository. A fixed set of user-owned Claude geometry resources is reused for
the shared structural kit, with file hashes and attribution in the asset credits.
Orbital surfaces also use NASA SVS public-domain lunar maps; [asset credits](/credits/)
record their sources and terms. No game assets or source were extracted. Rendering uses
[Three.js](https://threejs.org/docs/), with Node’s SQLite for persistence.

### Run and verify

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

Characters walk and use stairs/ramps; jumping is disabled indoors and outdoors. If stuck on an old saved ledge, open Pause → Return to safe ground and confirm. Only your character returns to the current planet’s landing area; buildings and inventory stay unchanged. Inside a home, use Exit to return outside first.

## Sprout: nearby help and walking directions

Space or Guide opens a small scene-anchored conversation. Use Close or Close and walk to dismiss it; Esc only releases mouse capture. Choose a stop to show ground arrows, then close and walk yourself; Sprout does not walk ahead. Clear route cancels navigation. Indoors, fixed help is available and outdoor directions resume after leaving. Typed questions match local fixed help only; AI is disabled.

## Your traveller

On your first visit with a new browser identity, character creation opens automatically after the world loads. Choose three face shapes (Soft, Oval, Round), three haircuts (Side sweep, Short crop, Soft bob), five skin tones, three eye colours and three coat palettes. **Save and explore** stores your look and lets you enter the world. **Back to welcome** saves nothing and offers Continue creating or a link out to About; you can also leave and return later in the same browser. Returning to the editor within that page keeps its draft. Refresh before saving starts an unsaved draft again, while still requiring creation. Failed saves keep the current draft for retry.

After creation, open **Pause → Your traveller** to edit. Drag the preview or use arrow keys to turn it and +/− to zoom. Save appearance publishes your look to nearby players; Cancel discards later edits. If another tab saved first, use the explicit reload action to accept that saved look. Existing players keep their progress and already-saved new appearance; those without one see a compatible default traveller. The original courier and model-switch/comparison entry are retired.

Identity is the existing anonymous browser cookie, not a login account. Keeping that cookie lets you return without repeating creation; clearing it or using a fresh browser profile creates another identity. No account/login system was added.
