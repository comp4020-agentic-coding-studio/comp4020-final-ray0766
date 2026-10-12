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

- a moon gate two cells wide;
- a stone dais 12 cm high;
- a plaster ring with a timber rim;
- a glowing membrane;
- two posts under a tiled cap.

It mounts on a cell, spans one extra cell along local +X like the wide doors,
and needs ground-floor support under both cells. Its colliders enclose every
mesh vertex at all three LODs:

- dais and tread are walkable;
- ring and cap are solid.

The interaction point is 0.55 m in front of the gate. The arrival point is
1.45 m in front, on the forecourt (`STATION_POINTS`).

**Composition.** "Town · Teleport station" (`teleport-station` in
`planet-plan/compositions.ts`) is a 2 × 2 m plan:

- the gate on paving;
- a paved forecourt;
- flower pots on both sides.

The workshop lists 66 parts. The village examples gain this composition
(63 in total), so players can load and edit the same blueprint the harbour
and their home use.

**Harbour.** The plan places the station as a plaza lot on Arrival Square,
at bearing 255°. That is the gap between Post Lane, Market Street and
Harbour Way.

- Its forecourt faces the square.
- The arrival point is 5.1 m from the spawn point and 20 m from the dock.
- The main planet ledger is now v13: 57 structures and 153 objects, with
  the same 17 plan warnings and no errors.
- The hub scene revision becomes 1013. `HUB_PHYSICS_VERSION` stays 9.

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
