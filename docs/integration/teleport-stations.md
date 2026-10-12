# Teleport stations

A teleport station stands on the harbour's arrival square and on every home.
Standing at its gate opens a list of destinations:

- your home and the harbour, always;
- any other planet you have flown to and landed on.

The server checks the gate, the mark and the destination before it moves anyone.
I built this on the planned-main-planet branch as a local candidate. The
decision record is [ADR 0007](../adr/0007-teleport-stations.md).

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

## Marks

Schema 16 adds three tables. Opening an older database makes the usual
`VACUUM INTO` backup first.

| Table | Holds |
|---|---|
| `teleport_marks` | player, planet, source, time |
| `teleport_requests` | each player's last request id |
| `home_stations` | the placement receipt |

A mark is written only by `navigation.land`, inside the landing transaction.
Fly-bys, checkpoints near a planet, atlas bearings and known planet ids never
write one. Teleports, and building or removing a station, never write one
either.

**Old saves.** The only reliable record of a landing is a player whose saved
flight says `mode: ground`, `journey > 0` and `targetId` equal to the planet
they stand on. Those players get one `history` mark.

The `visits` table is not used:

- it has no time or kind;
- the retired atlas visit route also wrote it.

On a read-only copy of the 8098 database, this added 7 history marks for
207 players.

## The route

`POST /api/teleport` takes `{planetId, requestId, visitEpoch}`. In order:

1. Strict fields and a UUID request id.
2. The same request id again replays as a no-op if it already arrived. This
   covers a double click or a lost response.
3. Outside the home, with the current visit epoch.
4. On the ground, not in flight.
5. Grounded, with the saved position within 1.65 m of a gate's interaction
   point on the current planet.
6. The destination exists ("That planet could not be found.").
7. The destination is not the current planet.
8. The destination is the hub, your own home, or marked ("Fly to this planet
   and land there once before teleporting to it.").

A refusal changes nothing. The traveller stays where they stood.

**Arrival point.**

- The hub and your own home: their first gate's arrival point.
- Any other planet: its landing pad.

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
  resident prompt is hidden.
- E checks in this order: home door, boarding gate, station, then residents.
- The list highlights your home and the harbour. The current planet shows
  "You are here", disabled.
- Owners are labels: you, everyone, a neighbour, or nobody. The game has no
  player names, and identities must not be exposed.
- A click locks every button and Escape until the server answers.
- After a network failure, a second click reuses the same request id.
- The teleport uses the existing visit change, so presence fencing, the world
  reload and camera rebasing are those of landing.
- The traveller arrives facing the gate they used. Facing away put the
  follow camera inside the ring and hid the avatar. The camera code is
  unchanged.
- All new strings have Chinese entries, including the server's refusals.

## Compatibility and rollback

- Older servers refuse schema 16. To roll back, serve the previous build
  with the `.v15-….backup.sqlite` written before migration.
- Marks and receipts are additive tables. No existing row changes on open.
- Stations on homes are ordinary objects. An owner can remove theirs, and a
  rollback leaves them in place as content.
- Blueprints with `station.teleport` do not decode in older code.

## Checks run

**Static checks**

- `pnpm typecheck` passes.
- `vite build` passes. It writes to a separate folder so the earlier 8140
  preview keeps its files.
- ESLint is clean on every file I added or changed. In `src/client/main.ts`,
  the remaining errors are the imported camera lines.

**`spec/teleport-station.test.ts`** (9 tests). Each test was seen failing with
its bug injected; ten injections in all. The tests cover:

- landing unlock, and fly-by refusal;
- refusing unmarked, missing and current destinations;
- marks across a restart;
- the round trip home → harbour → marked planet → home, with safe arrivals;
- the repeated request;
- dismantle and rebuild;
- older-home placement only while the owner is there;
- a full home's receipt;
- old-save back-fill.

**Related specs** (33 files):

- They ran against an integrated test server. I updated tests whose stated
  invariants changed:
  - schema 16;
  - 66 parts and 63 examples;
  - ledger v13;
  - generated homes now listed with their station;
  - claiming a planet now places its station.
- The two HTTP tests that need the legacy contract pass on a `TEST_LEGACY_WORLD`
  server: 4 files, 24 tests.

**Real Chrome 154 on an Apple M3, headless, against an isolated copy**

- Two passes: desktop 1920×1080 in English, and phone 390×844 in Chinese.
- The prompt appears at the home gate.
- The list is correct.
- Two quick activations send one request.
- Arrival at the harbour and back home is exactly on the station arrival
  point, standing on its paving.
- A refused destination shows the translated reason and leaves the traveller
  in place.
- Removing the home gate brings the notice and the menu item. Previewing and
  building a site restores it without adding marks.

## Limits

- An older home gets its gate the first time its owner is there. A visitor
  who arrives earlier finds no gate on that planet and must fly.
- With several gates on one home, arrival uses the first.
- There is no teleport animation or sound. Travel uses the existing scene
  loading overlay.
- I have not hand-tested walk feel, camera or reading on a physical phone.
