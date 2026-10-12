# Teleport stations

A teleport station stands on the harbour's arrival square and on every home.
It links exactly two places for each player:

- at your own home's gate, the one action is **Go to the main planet**;
- at the harbour's gate, the one action is **Return to my home**, to the
  home the server finds for your identity.

A neighbour's gate shows visitors no action, and the server refuses it too.
I built this on the planned-main-planet branch as a local candidate. The
decision record is [ADR 0007](../adr/0007-teleport-stations.md).

An earlier version this round listed other planets you had landed on, with
marks written at landing and back-filled for old saves. The user withdrew it;
see "Marks" below for what remains of it.

## The station

**Part.** `station.teleport` is an appended host part in `src/shared/village-kit`:
a wormhole-style ring that the user asked to be much larger and easier to find.

- The ring is 4.7 m across, with its top at 5.2 m, about three times the
  courier's height.
- It has an iron band, a stone outer rim and a white inner rim.
- Nine stone chevrons each carry a lit lamp.
- The membrane is a teal disc with three white spiral arms and a glowing
  core, on both faces.
- It stands in a cradle on a 22 cm stone dais with a front step.

The part mounts on a cell and spans five cells along local +X. The rule
proxies for wide doors now cover any number of cells, so the editor's overlap,
support and footprint checks see the whole width. It needs ground-floor
support under all five cells.

Its colliders enclose every mesh vertex at all three LODs:

- the dais and the step are walkable;
- the ring with its membrane is solid.

It stays inside the per-part budget at every LOD:

| LOD | Triangles | Limit |
|---|---|---|
| low | 408 | 500 |
| medium | 1608 | 1800 |
| high | 2616 | 4000 |

**Where to stand.** A lit ring 0.95 m in radius is set into the forecourt,
centred 1.35 m in front of the ring. It is exactly the zone where the prompt
appears:

- the server accepts within 1.05 m of its centre (`STATION_REACH`);
- the client prompts within 0.93 m.

A waist-high console with a slanted lit screen stands beside the pad. The
console is solid; the pad is a 2.5 cm walkable support. The arrival point is
0.4 m behind the pad's centre, inside the ring, so a traveller who arrives
already sees the prompt (`STATION_POINTS`).

With the pad and console the part is 496 / 1736 / 2744 triangles (low /
medium / high), still within budget.

**Redefinition.** The earlier small moon gate used the same ID. It was
redefined in place because it had never been saved:

- the hand-test candidate database had no placed station;
- no teleport had been made in it.

**Composition.** "Town · Teleport station" (`teleport-station` in
`planet-plan/compositions.ts`) is a 5 × 3 m plan:

- the portal on paving;
- two paved rows in front;
- flower pots at the front corners.

The workshop lists 66 parts. The village examples gain this composition
(63 in total), so players can load and edit the same blueprint the harbour
and their home use.

**Harbour.** The plan places the station as a plaza lot on Arrival Square,
at bearing 270° with a 0.4 m setback towards the square. That is the gap
between Market Street and Harbour Way.

- Its forecourt faces the square.
- The arrival point is 5.4 m from the spawn point.
- At bearing 255° the larger portal displaced a Market Street frontage lot.
  Bearings 265° to 280° give no errors.
- The main planet ledger has 57 structures and 153 objects, with the same
  17 plan warnings and no errors.
- One frontage lot beside it, `harbour-way-l1-1`, now takes a shop instead
  of a two-storey town house.
- The pad and console change the part's collision, and the harbour console
  is new, so the ledger is v15 (hub scene revision 1015). The plan is
  unchanged. `HUB_PHYSICS_VERSION` stays 9.

## Finding the boarding gate and the portal

The harbour's boarding gate used to be an unmarked spot on the quay, and the
portal was hard to find. On a 21.6 m planet a 15 m tower is still hidden
behind the post office from the spawn point, so there are two markers.

**Starport terminal** (`src/shared/starport-terminal.ts`). A control tower
stands 4.6 m north-west of the boarding gate. It is 3 m clear of Harbour
Way's edge, 2.4 m from the nearest building and 8 m from the craft.

The tower:

- a stone plinth;
- a plaster shaft with timber bands, a teal door and slit windows;
- a "STARPORT / 登机口 · BOARDING" board on both faces;
- an octagonal glass cab with a lit band;
- a tiled cone;
- a beacon mast reaching 14.6 m.

It is travel-system scenery like the parked craft, not a workshop blueprint.
At 14.6 m it is taller than the blueprint grid allows. It uses the kit
materials through the same part builder.

Both server and client use one definition:

- a round walking body;
- boxes for the camera;
- a walkable plinth and step.

Every mesh vertex lies inside those boxes. The tower is 384 triangles at
low LOD and 748 at medium and high.

**Light columns** (`src/client/landmark-beams.ts`). These are drawing only,
on the planned harbour. Each starts above head and camera height, has no
collision and is not saved.

- An amber column rises from the terminal's beacon.
- A violet column rises from the portal's top.

From the spawn point the amber column shows above the post office. From
Market Street and the quay the violet one marks the portal.

**Boarding ring and console.** Both kinds of boarding gate draw a lit ring
1.5 m in radius on the ground. It matches where "Board your ship" appears
(within `BOARD_RADIUS` − 0.12 = 1.53 m; the server allows 1.65 m). The ring
is drawing only.

At the harbour a boarding console stands on the ring's edge, 1.25 m from the
gate on the terminal's side. Its screen reads "BOARD / 站进光圈登机" (stand in
the ring to board), and it is solid.

**Home terminal.** Every home planet above 20 m now has a slim version of the
tower beside its landing pad:

- a 0.3 m shaft;
- the same cab and beacon at 14.6 m;
- one STARPORT board facing the pad;
- a lit boarding screen at chest height on the shaft.

It stands 0.6 m due south of the pad centre, behind every generated route
(they all leave the pad northwards). Saved objects keep 1 m from the pad, so
the tower stays inside that clear disc and never needs a player's ground. The
pad centre, where flights land, stays free.

Checked on a read-only copy of the 8098 database, all 87 large gardens have:

- no saved object near the tower (smallest gap 0.92 m, counting the plinth
  as a square);
- no saved player standing inside it.

Small legacy gardens keep the low post. The old "RETURN / GATE" post and its
board are gone from large homes.

**Physics version.** The tower has collision, so `PHYSICS_VERSION` (every
planet except the hub) is now 8. Ground rows saved at 7 or 8 are kept when
still valid, as before. There are no light columns on homes. The garden
beacon's existing note keeps them out of walking views.

**Homes.** New homes get the station in the same transaction that creates
the home.

Existing homes get one placement attempt the first time their owner reads the
universe while standing on that home, on the ground and outside. The attempt
is recorded in `home_stations`. A station the owner later removes is never
placed again automatically.

The search is deterministic. Candidate sites, in order:

1. rings round the landing pad at 4.5 to 13.5 m, 16 bearings each;
2. then 96 points over the whole sphere.

A site is skipped if any of these hold:

- it fails the ordinary placement rules (saved objects, door approaches,
  landing circle, terrain seating, ground fit);
- it is within station radius + 0.4 m of any saved body, including
  disconnected ones;
- it is within station radius + 3.6 m of the ground point under the
  parked craft.

The forecourt is turned to face the pad.

A home at its 64-object or 8-structure limit, or with no free level ground,
gets a `needs-site` receipt with the reason. Its owner sees a notice. The pause
menu then offers **Place a teleport station**:

1. it previews up to three free sites as ghosts;
2. it builds the chosen one through the ordinary create path;
3. or it explains what to free first.

The station is an ordinary owner object:

- it counts against the private capacity;
- it gets a library entry when the library has room;
- it is the one blueprint that can be placed without a library slot.

## Marks (withdrawn)

Schema 16 adds three tables. Opening an older database makes the usual
`VACUUM INTO` backup first.

| Table | Holds |
|---|---|
| `teleport_marks` | kept for compatibility; no longer written or read |
| `teleport_requests` | each player's last request id |
| `home_stations` | the placement receipt |

Landing no longer writes a mark, and opening the database no longer
back-fills one. The candidate database already reached schema 16 with 7
back-filled rows. The schema is not rolled back, and those rows, `visits` and
all player data stay as they are.

## The route

`POST /api/teleport` takes `{planetId, requestId, visitEpoch}`. In order:

1. Strict fields and a UUID request id.
2. The same request id again replays as a no-op if it already arrived. This
   covers a double click or a lost response.
3. Outside the home, with the current visit epoch.
4. On the ground, not in flight.
5. Grounded, with the saved position within 1.65 m of a gate's interaction
   point on the current planet.
6. The current planet is the harbour or your own home ("This teleport
   station belongs to another home. Only its owner can use it.").
7. You have a home ("You have no home planet to return to yet.").
8. `planetId` equals the one destination the server derives: the harbour
   from your home, your home from the harbour. Anything else, including a
   third planet, a missing ID or the current planet, is refused ("Teleport
   stations only link your own home and the main planet.").

A refusal changes nothing. The traveller stays where they stood.

**Arrival point.**

- The destination's first gate's arrival point.
- The landing pad, if your home has no gate yet.

The point goes through the ground world's `recover`, so it never starts
inside a body or below the support.

**Write.** One transaction:

- the departure is stored in `visits`, as a landing does;
- the player moves and their revision bumps;
- the ground row is cleared, so the existing fence re-seats it;
- the request id is recorded;
- the home location epoch advances.

The server then drops the player's presence entry, like takeoff and landing
do.

**Client.**

- The prompt is its own element, so it also shows on gardens, where the
  resident prompt is hidden. It appears only at your own home's gate or the
  harbour's gate, with the one action for that place.
- E checks in this order: home door, boarding gate, station, then residents.
- An activation locks the button ("Opening the gate…") until the server
  answers. After a network failure, the next activation reuses the same
  request id.
- The teleport uses the existing visit change, so presence fencing, the world
  reload and camera rebasing are those of landing.
- The traveller arrives facing the gate they used. Facing away put the
  follow camera inside the ring and hid the avatar. The camera code is
  unchanged.
- All new strings have Chinese entries, including the server's refusals.

## Compatibility and rollback

- Older servers refuse schema 16. To roll back, serve the previous build
  with the `.v15-….backup.sqlite` written before migration.
- The station tables are additive. No existing row changes on open.
- Stations on homes are ordinary objects. An owner can remove theirs, and a
  rollback leaves them in place as content.
- Blueprints with `station.teleport` do not decode in older code.

## Checks run

**First version (with marks).** Typecheck and build passed, and the related
specs and two real-Chrome passes ran. That evidence is in the git history of
this file.

**This narrowing.** I ran only the three checks the user asked for:

- `pnpm typecheck` passes, and ESLint is clean on every changed file.
- `vite build` passes. It writes to a separate folder, so the earlier 8140
  preview keeps its files.
- `spec/teleport-station.test.ts`:
  - home → harbour → home, and another player from the harbour to their own
    home, each arriving beside the station;
  - a submitted third planet refused from both gates, leaving the traveller
    in place;
  - a visitor refused at a neighbour's gate.

  Each of the three failed with its check removed (an injected bug). The
  file's other four tests (repeat request, rebuild, older-home placement,
  full home) are kept but were not re-run this round.
- Real Chrome 154 on an Apple M3, headless, against an isolated database copy.
  Two passes: desktop 1920×1080 in English, and phone 390×844 in Chinese.
  Run again after the larger portal, with the same results.
  - The home gate shows only "Go to the main planet".
  - Two quick activations send one request.
  - Arrival on the harbour is exactly on its station's arrival point, on
    paving.
  - The harbour gate shows only "Return to my home", and arrival is on the
    player's own home station.
  - At a neighbour's gate there is no prompt, and E sends nothing.

## Limits

- An older home gets its gate the first time its owner is there. Until
  then, the owner teleporting home from the harbour arrives at the landing
  pad.
- With several gates on one home, arrival uses the first.
- There is no teleport animation or sound. Travel uses the existing scene
  loading overlay.
- I have not hand-tested walk feel, camera or reading on a physical phone.
