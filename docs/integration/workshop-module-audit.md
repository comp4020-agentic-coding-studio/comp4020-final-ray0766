# Player workshop inventory and proposed next art modules

Observed 2026-10-07 in host base `7dc0b01`, vendored resource snapshot `5a73b228`. This is an inventory and proposal, not a record of work commissioned from Claude. No independent Claude checkout was changed or external agent contacted.

## Actual exposed resources

`src/client/workshop.ts` adds **all 21 `PART_IDS`** to its tool picker. There are no hidden members of this structural catalogue.

| Category | Count | Existing IDs |
| --- | ---: | --- |
| Floor | 2 | `floor.deck`, `floor.grate` |
| Wall / openings | 6 | `wall.solid`, `wall.door`, `wall.window`, `wall.louvre`, `wall.corrugated`, `wall.door.open` |
| Structure | 3 | `structure.column`, `stair.straight`, `rail.guard` |
| Roof | 4 | `roof.deck`, `roof.parapet`, `roof.slope`, `roof.plant` |
| Street | 6 | `street.paving`, `street.road`, `street.kerb`, `street.pipes`, `service.light`, `pad.quarter` |

Village appearance maps these same IDs to plaster walls, shuttered windows, tiled pitched roofs, timber posts, picket fences, stone paving, low hedges and lanterns. `roof.plant` means an air-conditioning unit, **not vegetation**. Open doors, windows, stairs and pitched roofs already exist and should not be commissioned again as missing basics.

The separate quick-build palette exposes **6 complete props**: `cottage`, `tree`, `path`, `flowers`, `bench`, `lamp` (`src/shared/planets.ts`, `src/client/build-art.ts`). Trees, benches and flower pots thus have existing geometry, but they are **not blueprint part IDs** and cannot currently be composed inside a blueprint. Host `shared-assets.ts` also has `service.pipe` and `pad.tile` helpers outside `PART_IDS`; the host helper named `service.light` is a different 2.23 m prop from the real 3.42 m blueprint part. Do not treat those helper names as proof of workshop compatibility.

Existing blueprint capability: 5×5 one-metre cells, 3 levels at 2.2 m, quarter-turn parts, cell/edge/vertex mounts, support and overlap validation, grouping, copy, undo/redo, roof and stair clearance, JSON codec/content hash, material batching and three LODs. World placement uses actual footprint, spherical ground fitting, maximum 0.6 m foundation, object spacing and server validation. Owner limits remain 64 placed objects, including at most 8 custom structures. There are no animated/openable doors, sitting behaviour, item storage or merchant interactions in the construction kit.

## Concrete gaps encountered in this density pass

A lane is a straight tile: there are no dedicated corner/T/crossing or changing-width connections. Curved hand-drawn ribbons would bypass the player's construction system and have been removed from the candidate. Wide flat plots also need honest foundation/entry-height treatment on a radius-14 sphere.

One straight stair spans a full floor; there is no short entrance stair or ramp for varied plinth edges. The existing house palette can produce joined streets and loft silhouettes, but window/roof silhouette diversity is limited. Furniture and plants exist in quick-build form but cannot be arranged together with walls/floors inside the blueprint grid. These are more useful gaps to address than adding more copies of the same cottage.

## Suggested next module work, in priority order

| Proposed family | Existing reuse / actual missing element | Claude art deliverable | Main-project integration needed |
| --- | --- | --- | --- |
| Lane junctions and edge transitions | Reuse `street.road`/`paving`; add corner, T, crossing and end-cap variants | Metre-cell emitters, continuous seams at each legal quarter turn | Catalogue IDs, grid occupancy, walkable surface proxies; no free-form spline editor |
| Low entrance steps / ramp | Full-storey straight stair already exists; low transitions are missing | 0.1/0.2 m steps and one-cell ramp with measured slopes | New support/collision semantics and step/sprint/jump tests; not art-only |
| Porch / awning / beam units | Posts and floors exist; independent canopy/beam joining does not | Edge-mounted canopy, beam and corner connection with exact anchors | Mount/support/clearance rules, roof collision, camera obstruction |
| Roof ends and turns | Gable slopes exist; hip/corner/valley and tidy independent ends are missing | Compatible ridge/eave heights and roof corner pieces | Occupancy and support metadata; accurate roof bounds/camera proxies |
| Wall and opening variants | Existing solid/window/open and closed door must stay | Alternate window proportions, half-height wall and open arch using declared footprint | Existing role reuse where exact; new opening collision only where needed |
| Furniture in blueprints | Quick-build bench already exists; chair/table/crate/barrel are missing, bench needs exposure | Reuse bench geometry; a small set of cell-sized original furnishings | Register equipment IDs, ground/deck support and solid proxies; no sitting/storage behaviour |
| Planters and vegetation in blueprints | Quick-build tree/flower pot and straight hedge exist | Reuse pots; shrub, hedge end/corner and compact planter units | New IDs/footprints and consistent collision; no scaling workaround |
| Placeable wayfinding details | Current special public signs are not valid player parts | Blank signboard, mailbox shape, simple fence gate/end-post units | Real catalogue registration; text editing/mail/open-close interactions require separate feature scope |

Keep new items small and composable. Geometry can be authored by Claude, but a new emitter alone does not complete a usable part: every new ID also needs codec acceptance, catalogue exposure, role/mount/support data, host physics and tests. Do not silently widen budgets or edit existing saved IDs to mean new shapes.

## Delivery interface for a future Claude task

Provide a separate committed resource revision with provenance and a manifest of stable new IDs, dimensions, pivot, +Y up / +Z exterior, cell/edge/vertex anchors, valid rotations, connection edges, support requirements, collision bounds and materials. Existing 1 m cells, 2.2 m storeys, quarter-turn part rotations, placement/codec compatibility and three LODs remain contractual. Use the established palette and shared material library. Include a legal sample blueprint for each family, decode/encode and layout checks, and per-part/assembled triangle and draw-call measurements against the existing budgets. Keep geometry and placement deterministic.

The current host should integrate only a reviewed committed snapshot; preserve existing public/private saves and the pinned older release resources. Geometry-only variations within an unchanged envelope are lower-risk. Ramps, new mount roles, movable doors or interactions need explicit host-side work, and should not be bundled into an art-only task.

More modules are **not necessary for a coherent first playable village**. They are necessary for materially richer architectural and everyday-life variation without repeating one house. Current density work remains on the existing catalogue while this recommendation is reviewed.

## Full product inventory for comparison with other building games

| Domain | Present, exposed to players | Present in resource code but not exposed by the host UI | Genuinely absent / separate feature work | Source |
| --- | --- | --- | --- | --- |
| Buildings | All 21 structural parts above; new/cabin starter/copy, grid placement, 90° turns, level changes, multi-select/groups, move/remove, undo/redo, 24 private saved blueprints, world placement/move/rotation/removal | Resource codecs support JSON import/export; host workshop has no import/export buttons. Other sample blueprints exist but host provides only Cabin starter. Industrial look exists; host deliberately uses village look | Curved/diagonal/half-cell walls, terrain-following roads, multi-cell variable shapes, parametric dimensions; roofs/corners/porches and richer opening variants as discussed above | `src/client/workshop.ts`, `src/client/colony.ts`, `src/shared/blueprints.ts`; vendor `blueprint/model.ts`, `codec.ts`, `samples.ts` |
| Ground, geology, water | 4 style choices: ocean, desert, ice, temperate; uint32 seed, orbit preview, reload saved and apply; real ground fit keeps old buildings dry/supported, clear landing area | Environment model also has relief/roughness/vegetation/waterLevel; 2 extra parameters per style (archipelago/stacks, wind/mesas, crevasses/spires, outcrops/woodland), and 4 palette override slots. Host exposes style + seed only | Local sculpt/paint brushes, digging/caves/voxels, player water editing, flatten tool, terrain undo/history UI | `src/client/terrain-workshop.ts`, `src/shared/terrain.ts`; vendor `terrain/env.ts`, `field.ts`, `styles/*`, `policy.ts` |
| Natural dressing | Quick-build tree and flower pot; generated terrain has style-dependent flora/rocks, water/ice and landforms derived from environment | Generator flora geometry is not a player prop catalogue; do not claim every generated tree/rock is individually placeable | Selectable tree species, shrubs/rocks/grass patches/garden-bed units, growth/harvest/crop behaviour; extracting generator meshes into a catalogue needs IDs/footprints/collisions | `src/client/build-art.ts`; vendor `terrain/flora.ts`, `planet.ts`, `styles/*` |
| Everyday furniture and decoration | Quick-build bench, flower pot, lantern; shutters and window flower boxes are part of `wall.window`; fence/hedge/roof air unit inside blueprint set | Bench/tree/flowers exist outside blueprint `PART_IDS`, so they need proper equipment integration to compose inside a blueprint | Chair/table/bed/shelf/crate/barrel/market-stall units, editable signs; sitting, storage, crafting, trading and inventories are not art modules | `src/shared/planets.ts`, `src/client/build-art.ts`; vendor `blueprint/parts/village/*` |
| Facilities and infrastructure | Walkable paving/lane/kerb, 2×2 pad quarters, lantern, fence/hedge, stairs, two NPC delivery interactions, boarding/launch/land and directional guide | Public-specific gate/sign/lectern geometry exists in archived/old renderer but is not a workshop catalogue asset; it must not be passed off as buildable | Road junction kit, short stairs/ramps, bridges with valid supports, configurable portals; utility networks/electricity/pipes/production/logistics require behaviour systems | `src/shared/ports.ts`, `src/client/harbour-city.ts`, `src/client/scene.ts`; vendor structural catalogue |
| Ships / vehicles | **6 slots × 3 choices = 18 selectable options**, including `dorsal:none` (17 non-empty designs). Hull: slim-courier/boxy-hauler/wedge-interceptor; cockpit: faceted-canopy/slit-visor/raised-bridge; wings: swept/delta/stub-pylon; engines: twin-nacelle/single-heavy/pod-cluster; tail: single-fin/twin-fin/v-tail; dorsal: none/sensor-mast/comms-dish. 3 starters, 3 paint zones × 10 palette choices, 4 glow choices, name and registration, saved current ship, preview and actual flight | Resource JSON design codec exists; host has no ship JSON import/export UI. All 6 slot catalogues are exposed; no hidden extra hull set | Freely positioned ship blocks, new sockets, wheels/boats/ground vehicles, interiors/passengers, cargo/fuel/damage/weapons/autopilot; visual part selection does not confer different flight stats | `src/client/shipyard.ts`, `src/shared/ships.ts`; vendor `ship/spec.ts`, `ship/design.ts`, `style/tokens.ts` |
| World editing and persistence | Owner-only building/terrain changes, selection/ghost fit checks, clone/move/rotate/remove, revision/conflict validation, private blueprint library, owner history playback, snapshots/events, character and quest persistence, Chinese/English UI | Resource history/document machinery is broader than the host's user-facing controls; history replay is read-only | Permissions sharing/co-editing, visitors editing hub, prefab marketplace, general mod/plugin system, bulk area edit; these are product/data/auth tasks | `src/client/colony.ts`, `src/client/history.ts`, `src/server/planets.ts`, `src/server/history.ts`, `src/server/store.ts` |

Ship sockets use **−Z forward**, unlike buildings' **+Z exterior**; do not mix their frames. The ship has a fixed 2.4 m envelope; new modular art must retain or explicitly revise this integration contract. There are 729 slot combinations before paint, including the empty dorsal choice. These are combinatorial configurations, not 729 authored vehicles.

External game comparison should therefore map each observed feature to one of four outcomes: existing exposed component, existing resource that needs UI/catalogue integration, new geometry that can reuse existing roles, or a new behaviour/data system. The latter must not be presented as something Claude can complete by drawing a mesh. None of this inventory authorizes a new survival/crafting/city-simulation system.
