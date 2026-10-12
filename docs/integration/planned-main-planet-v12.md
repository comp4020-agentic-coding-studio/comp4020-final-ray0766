# Planned main planet (v12)

The public hub at radius 21.6 m is now generated from one authored plan instead of hand-tuned coordinates spread over a dozen files. I redid the street network, the building kit and the layout together; building count was not a target.

## What changed

**Plan → ledger → scene.** `src/shared/planet-plan/main-planet.plan.json` holds the plan: nodes, districts, streets (main / branch / lane), plazas, explicit lots, frontage runs, planted areas and residents. `node scripts/planet-plan.ts build` generates the frozen ledger (`main-planet.ledger.json`) that server, client and tests load. Generation takes about 6 s. Every random choice is seeded from the plan, so the same plan always gives the same ledger, and a test regenerates it to prove that.

**Streets are surfaces, not objects.** The 271 placed deck packs of v11 are gone. `town-road-surfaces.ts` drapes continuous meshes on the natural ground the walker stands on:

- main streets: 2.6 m lane, dressed-stone edge bands and a 6 cm chamfered kerb;
- branches: 2.0 m staggered flagstones;
- lanes: 1.2 m;
- door paths;
- junctions with filleted corners and kerbs that turn the corner;
- fan-and-ring plazas and a flagged quay.

Kerbs drop where a door path crosses them. The drawn terrain is graded under the paving and flora keeps off it; this changes rendering only, so walking and saved heights still use the natural field. Kerbs are real walkable supports in the hub's collision.

**Parameters live in one file.** `params.ts` holds:

- road profiles and setbacks;
- clearances: building gap, eaves to street, props to paving;
- reserves: spawn, dock, craft, Mica, Sol;
- plaza and lamp spacing.

**Footprints are measured, not guessed.** Placement uses each composition's real collider footprint below 2 m and its whole eave/awning outline. The generator checks the following on the sphere and reports any failure with a position:

- street, eave, plaza, reserve and gap conflicts;
- door path crossings;
- entrance heights.

The shared player placement contract (`createPublicTownPlacementCheck`) also passes for every object.

**Views.**

- `node scripts/planet-plan.ts svg out.svg` draws both hemispheres: streets, footprints, eaves, setbacks, entrances, props, residents and conflicts.
- `?plan=1` in the game draws the same plan on the live hub, through roofs.
- `tools/kit-gallery.html` and `tools/road-debug.html` are dev-only Vite pages for parts, compositions and street surfaces.

## Layout

Six districts:

- **Arrival square and harbour:** the spawn square, Harbour Way over the pole to the quay and parked craft, the post office facing Mica and the glasshouse facing Sol.
- **Market Street:** shop fronts facing each other, plus a market square with stalls.
- **Garden homes:** lanes of houses with front gardens and walls round a small green.
- **Workshop yards:** sheds and stores round a work court behind the harbour.
- **Tea pavilion gardens:** tea house, pavilion and a planted garden court.
- **Lookout orchards:** the south hemisphere, mostly orchard, with lanes and walks climbing to a lookout terrace and its tower at the south pole.

A ring street links the districts.

The ledger has:

- 56 buildings from 19 compositions;
- 96 props: lamps, trees, benches, flowers;
- 20 streets (553 m of centreline), 12 junctions and 6 plazas;
- 79 navigation routes: every street both ways, every door path, and the three task walks.

## New and redone parts (17, appended)

The new parts are host parts in `src/shared/village-kit`, registered after the three wide parts. Old IDs and old geometry are unchanged.

| Group | Parts |
|---|---|
| Facades | `wall.door.hooded`, `wall.shopfront` (noren above 1.63 m), `wall.window.box` |
| Garden boundaries | `garden.wall`, `garden.gate`, `garden.fence`, `garden.hedge`, `garden.lawn` (a floor that carries trees, benches and walls) |
| Roads | `road.paving`, `road.paving.curve`, `road.edge`, `road.kerb.low`, `road.apron`, `road.plaza`; they share `village-kit/style.ts` with the street meshes |
| Roof | `roof.slope.long` (a two-cell kawara pitch, proxied one cell back like the wide parts), `roof.verge.long.left/right` |

The long roof is what lets four-deep houses carry a real ridge instead of a flat top.

Every part has:

- Chinese and English names;
- an envelope, colliders and bounds;
- a collider that encloses every mesh vertex at all LODs (`spec/village-physics.test.ts`).

The workshop palette lists all 65 parts. The workshop's village examples append the 19 public compositions after the original 43, so players can load, edit and place the buildings the town is made of.

## Compatibility

- No database schema change.
- `PUBLIC_TOWN_VERSION` is 12 (hub scene revision 1012). `HUB_PHYSICS_VERSION` is 9.
- Valid hub poses saved at physics 8 are kept. Covered ones are moved by the existing `recover()`.

**Read-only copy of the 8098 database (207 players, 179 on the hub):**

| Outcome | Players |
|---|---|
| Kept in place | 169 |
| Moved, at most 0.5 m | 10 |
| Sent to spawn | 0 |

Private planets do not use the public ledger.

**Rollback.** Serve the previous build; no data migration needs undoing. Hub poses saved at physics 9 are re-validated by the old server. Blueprints that already use the new part IDs would not decode in the old code. Check this before rolling back:

```sql
SELECT count(*) FROM blueprint_contents
WHERE content LIKE '%"road.%'
   OR content LIKE '%"garden.wall%'
   OR content LIKE '%"garden.gate%'
   OR content LIKE '%"garden.fence%'
   OR content LIKE '%"garden.hedge%'
   OR content LIKE '%"garden.lawn%'
   OR content LIKE '%roof.slope.long%'
   OR content LIKE '%roof.verge.long%'
   OR content LIKE '%wall.door.hooded%'
   OR content LIKE '%wall.shopfront%'
   OR content LIKE '%wall.window.box%';
```

`publicTownV11()` still returns the archived v11 ledger for comparison. v11's street packs are no longer registered as workshop blueprints.

## Editing the plan

1. Edit `main-planet.plan.json`. Lots front a road (`road`, `at` in metres along it, `side`) or a plaza (`plaza`, `at` as a bearing); frontage runs fill a stretch of road in order.
2. `node scripts/planet-plan.ts check` (exits non-zero on errors), then `svg out.svg` to look.
3. `node scripts/planet-plan.ts build`, then `pnpm build` and restart the server.

`node scripts/planet-plan.ts save` rewrites the JSON in canonical form. `spec/public-town-layout.test.ts` fails if the ledger is stale.

## Checks run

**Static checks**

- `pnpm typecheck` and `pnpm build` pass.
- ESLint is clean on every file this work added or changed.
- The full `pnpm lint` still reports errors in the imported camera work (`src/client/main.ts` and seven `spec/camera-*` / `spec/ground-camera-*` files). I did not touch those files.

**Tests**

- 23 related spec files, 186 tests, against an integrated test server.
- `spec/blueprints.test.ts` and `spec/api.test.ts` (7 tests) against a `TEST_LEGACY_WORLD` server, which their HTTP contract needs.
- Each new sentinel was seen failing with its bug injected.

**Real Chrome 154 on an Apple M3, headless, against the local preview**

- Desktop 1920×1080 and phone 390×844 street and globe views. Screenshots are kept outside the repository.
- Street views: 230–450 draw calls and 216k–425k triangles. The v11 baseline at the same spots measured 322–492 calls and 530k–705k triangles.
- Globe view: 280 calls and 465k triangles (v11: 268 and 968k).
- These are renderer counters from headless runs, not frame timings or physical-phone performance.

## Limits

- I tuned district density by plan iteration. Some frontage runs stay empty where real conflicts block them. Several areas place fewer trees than asked because of the shared circle-spacing rule.
- Seventeen plan warnings remain:
  - setbacks 0.3–0.7 m where a stall or the tea house meets a curving street;
  - short planting areas;
  - residents near props.
- Public building interiors are shells as before.
- The quay shows one harbour store.
- I did not do a walk-feel or camera review; that is the user's call.
