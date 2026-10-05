# Shared Sunseed assets and the editor boundary

The current user instruction divides ownership explicitly: this project owns
models, material appearance, lighting, the public sample and the smallest adapter
to existing placement. Claude owns snapping, assembly editing, undo and blueprint
persistence. No second editor, blueprint document format, timeline, ecology or
spacecraft workshop is introduced here.

## Resource source and safe reuse

The independent workspace is `/Users/ray/Desktop/Study/ANU-Master/8020/planet-claude-modules`.
Its blueprint model/placement/demo, adapters and integration notes had uncommitted
changes when inspected. Those files were not copied or modified. The integration
notes still used main-project baseline `a76575a` and did not establish compatibility
with this round's current application by themselves.

The pure geometry emitter and its dependencies were available in committed
`ea279fd34fce3a054faaea622378181ce2d8dc9a`. Before copying, `git diff --quiet` confirmed
that the 13 selected resource files matched that commit. Only those files were
copied into `src/assets/claude-geometry/`, byte for byte. The source commit and
SHA-256 of every file are recorded in `shared-geometry-source.json`.
`shared-asset-catalogue.json` records measured local bounds, triangle counts and
material draw calls for all 14 source parts at three geometry tiers. Its three
additional service/pad entries are metadata, not measured geometry reports. No working-tree
editor/server changes, external process or other repository was altered.

## Callable asset contract

`src/client/shared-assets.ts` exports:

- `SHARED_ASSET_VERSION = 'sunseed-structure/1'` and `SHARED_ASSETS`.
- `sharedParts(instances, lod)` returns a Three.js Group, with geometry merged by
  material. `lod` is `high`, `medium` or `low`; the default reduces fine detail on
  compact viewports.
- An instance is `{part, position: [x,y,z], yaw?}` in local **metres**. +Y is up,
  +Z is the exterior/front, +X is right; yaw is radians around +Y. There is no
  global scene, input listener, server request or persistence in this factory.
- `assetConnections(part)` supplies local connection hints. These are art metadata,
  not authority for placement, support or ownership. Existing Claude mount/occupancy
  rules remain the editor's responsibility.
- `HABITAT_CABIN` is an inspectable array of floor, wall, doorway, window, louvre,
  roof and service-pipe instances. `habitatCabin()` assembles that definition.
  It is a sample assembly, not an opaque imported building mesh.

The 14 committed parts are deck, grate, solid/door/window/louvre/corrugated walls,
column, straight stair, guardrail, roof deck, parapet, sloped roof and roof plant.
Three original additions expose a service pipe, service light and illuminated pad
panel. Wall panels occupy one-metre edges; the existing source kit uses a 2.2 m
storey with a 0.16 m slab. Cell-piece origin is the top of its floor slab; edge
piece origin is the lower edge. The output's named `asset:<index>:<part>` sockets
retain per-part transforms after geometry batching.

`src/client/harbour-materials.ts` is the shared original Sunseed appearance profile:
painted/bare metal, concrete, glass, copper, restrained amber/cyan emission and
procedural surface variation. No commercial game imagery is a texture. The palette
is bounded and shared for the page lifetime; `disposeGeometry()` frees model
geometry without invalidating the shared material/texture resources.

The public near buildings use the same doorway/window/pipe emitters, public service
kiosks call `habitatCabin()`, and the apron uses the shared pad panel. The skyline
uses a cheaper facade representation and merged structural masses. Decorative
urban layout and skyline are not copied into saved owner objects.

## Existing playable adapter

`builtObject()` maps the **same six saved kinds** onto improved art:

| Saved kind | Appearance now |
| --- | --- |
| cottage | Shared panelled habitat assembly |
| path | Shared metal floor/deck panel |
| lamp | Shared shielded service light |
| bench | Metal frame and warm metal slats |
| tree | PBR trunk and layered foliage |
| flowers | Metal planter and plants |

The existing player UI can place, rotate, move and remove these objects; objects
retain their previous IDs, positions, versions and ownership. One-second visitors
receive the same saved kinds and render the same assets. There is no schema change
or new write endpoint. Existing saved objects immediately receive the updated art.
The player can combine the available cabin/deck/light props now. Individual wall,
stair and multi-level assembly editing is exported for Claude's integration and is
**not claimed to be playable in the current six-kind UI**.

For later integration, call this resource factory from the editor's own approved
part placements, and keep the current server as the authority for saved writes.
An arbitrary part list is not currently accepted by `/api/objects/create`.
Do not treat this resource handoff as integration of blueprint storage or its
migration. The v4 save preservation evidence is under `docs/evidence/round-6/`.
